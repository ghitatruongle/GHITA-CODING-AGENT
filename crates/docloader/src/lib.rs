//! ghita-docloader — document text extraction core
//! Std-only core for extracting text from documents (PDF, DOCX, HTML, plain text).
//! The addon (feature "addon") exposes napi bindings for async JS interop.
//!
//! This core provides:
//! - MIME type detection from file extension / magic bytes
//! - Plain-text extraction (always available)
//! - HTML tag stripping → readable text
//! - Stub extractors for PDF/DOCX that return metadata when full parsing
//!   libraries are not linked (the JS fallback handles those formats)

#[cfg(feature = "addon")]
// napi entry points are only referenced by the generated addon registration,
// which the test harness does not link — silence dead_code there.
#[cfg_attr(test, allow(dead_code))]
mod napi;

/// Result of loading a document.
#[derive(Debug, Clone)]
pub struct DocLoadResult {
    pub content: String,
    pub mime_type: String,
    pub size_bytes: usize,
    pub source: &'static str,
}

/// Detect MIME type from a file path extension.
pub fn detect_mime(path: &str) -> &'static str {
    let lower = path.to_ascii_lowercase();
    if lower.ends_with(".pdf") {
        "application/pdf"
    } else if lower.ends_with(".docx") {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    } else if lower.ends_with(".doc") {
        "application/msword"
    } else if lower.ends_with(".html") || lower.ends_with(".htm") {
        "text/html"
    } else if lower.ends_with(".md") {
        "text/markdown"
    } else if lower.ends_with(".txt") {
        "text/plain"
    } else if lower.ends_with(".json") {
        "application/json"
    } else if lower.ends_with(".csv") {
        "text/csv"
    } else if lower.ends_with(".xml") {
        "application/xml"
    } else if lower.ends_with(".rtf") {
        "application/rtf"
    } else {
        "application/octet-stream"
    }
}

/// Extract text content from raw bytes given a MIME type.
/// For HTML, strips tags. For plain text / markdown / JSON / CSV / XML, returns as-is.
/// DOCX and PDF are extracted natively when their opt-in features are on (the
/// addon enables both); without them the placeholders tell JS to take over.
pub fn extract_text(data: &[u8], mime: &str) -> String {
    match mime {
        "text/plain" | "text/markdown" | "application/json" | "text/csv" | "application/xml" => {
            String::from_utf8_lossy(data).to_string()
        }
        "text/html" => strip_html_tags(data),
        "application/pdf" => {
            #[cfg(feature = "pdf")]
            {
                match extract_pdf(data) {
                    Ok(text) => text,
                    Err(e) => format!("[PDF extraction failed: {e}]"),
                }
            }
            #[cfg(not(feature = "pdf"))]
            {
                format!(
                    "[PDF document: {} bytes — native PDF extraction requires addon or JS fallback]",
                    data.len()
                )
            }
        }
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        | "application/msword" => {
            #[cfg(feature = "docx")]
            {
                match extract_docx(data) {
                    Ok(text) => text,
                    Err(e) => format!("[DOCX extraction failed: {e}]"),
                }
            }
            #[cfg(not(feature = "docx"))]
            {
                format!(
                    "[DOCX document: {} bytes — native DOCX extraction requires addon or JS fallback]",
                    data.len()
                )
            }
        }
        _ => {
            // Try UTF-8; if valid, return it; otherwise report binary
            match std::str::from_utf8(data) {
                Ok(s) => s.to_string(),
                Err(_) => format!("[Binary content: {} bytes, MIME {}]", data.len(), mime),
            }
        }
    }
}

/// Extract text from a DOCX (Office Open XML) buffer: unzip
/// `word/document.xml`, concatenate `<w:t>` runs, and insert newlines at
/// paragraph boundaries. Replaces the JS latin1+regex path, which only worked
/// on STORED (uncompressed) zip entries — real documents are DEFLATE-compressed.
#[cfg(feature = "docx")]
pub fn extract_docx(data: &[u8]) -> Result<String, String> {
    use std::io::Read;

    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(data))
        .map_err(|e| format!("invalid docx (zip): {e}"))?;
    let mut xml = String::new();
    {
        let mut entry = archive
            .by_name("word/document.xml")
            .map_err(|e| format!("docx missing word/document.xml: {e}"))?;
        entry
            .read_to_string(&mut xml)
            .map_err(|e| format!("docx xml read error: {e}"))?;
    }

    let mut out = String::new();
    let mut in_text_run = false;
    let mut reader = quick_xml::Reader::from_str(&xml);
    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(quick_xml::events::Event::Start(e)) => match e.name().as_ref() {
                b"w:t" => in_text_run = true,
                b"w:p" if !out.is_empty() && !out.ends_with('\n') => out.push('\n'),
                _ => {}
            },
            Ok(quick_xml::events::Event::End(e)) => {
                if e.name().as_ref() == b"w:t" {
                    in_text_run = false;
                }
            }
            Ok(quick_xml::events::Event::Text(t)) => {
                if in_text_run {
                    let decoded = t
                        .unescape()
                        .map_err(|e| format!("docx xml unescape error: {e}"))?;
                    out.push_str(&decoded);
                }
            }
            Ok(quick_xml::events::Event::Eof) => break,
            Err(e) => return Err(format!("docx xml parse error: {e}")),
            _ => {}
        }
        buf.clear();
    }

    Ok(out.trim().to_string())
}

/// Extract text from a PDF buffer via `pdf-extract` (lopdf-based parser).
/// Handles the common case: uncompressed and Flate-compressed content streams
/// with simple text operators. Encrypted or heavily-encoded PDFs surface a
/// descriptive error that callers turn into a skip/fallback signal.
#[cfg(feature = "pdf")]
pub fn extract_pdf(data: &[u8]) -> Result<String, String> {
    pdf_extract::extract_text_from_mem(data).map_err(|e| format!("pdf extraction error: {e}"))
}

/// Load a document from bytes + path, returning a full result.
pub fn load_document(path: &str, data: &[u8]) -> DocLoadResult {
    let mime = detect_mime(path);
    let content = extract_text(data, mime);
    DocLoadResult {
        content,
        mime_type: mime.to_string(),
        size_bytes: data.len(),
        source: "native",
    }
}

/// Strip HTML tags from raw bytes, returning readable text.
fn strip_html_tags(data: &[u8]) -> String {
    let html = String::from_utf8_lossy(data);
    let mut result = String::with_capacity(html.len());
    let mut in_tag = false;
    let mut last_was_space = false;

    for ch in html.chars() {
        if ch == '<' {
            in_tag = true;
            continue;
        }
        if ch == '>' {
            in_tag = false;
            // Replace tag boundary with a space (unless we just added one)
            if !last_was_space {
                result.push(' ');
                last_was_space = true;
            }
            continue;
        }
        if !in_tag {
            if ch.is_whitespace() {
                if !last_was_space {
                    result.push(' ');
                    last_was_space = true;
                }
            } else {
                result.push(ch);
                last_was_space = false;
            }
        }
    }

    result.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_common_mime_types() {
        assert_eq!(detect_mime("report.pdf"), "application/pdf");
        assert_eq!(detect_mime("README.md"), "text/markdown");
        assert_eq!(detect_mime("index.html"), "text/html");
        assert_eq!(detect_mime("data.json"), "application/json");
        assert_eq!(detect_mime("notes.txt"), "text/plain");
        assert_eq!(
            detect_mime("letter.docx"),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );
        assert_eq!(detect_mime("unknown.xyz"), "application/octet-stream");
    }

    #[test]
    fn extracts_plain_text_as_is() {
        let data = b"Hello world\nLine two";
        let text = extract_text(data, "text/plain");
        assert_eq!(text, "Hello world\nLine two");
    }

    #[test]
    fn strips_html_tags_to_readable_text() {
        let html = b"<html><body><h1>Title</h1><p>Hello <b>world</b></p></body></html>";
        let text = extract_text(html, "text/html");
        assert!(text.contains("Title"));
        assert!(text.contains("Hello"));
        assert!(text.contains("world"));
        assert!(!text.contains("<"));
        assert!(!text.contains(">"));
    }

    #[test]
    fn pdf_handling_matches_feature_set() {
        let data = b"%PDF-1.4 fake content";
        let text = extract_text(data, "application/pdf");
        if cfg!(feature = "pdf") {
            // Native parser is active: garbage input surfaces a descriptive
            // failure instead of a placeholder.
            assert!(text.starts_with("[PDF extraction failed:"), "was: {text}");
        } else {
            assert!(text.contains("PDF document"));
            assert!(text.contains("bytes"));
        }
    }

    #[test]
    fn load_document_returns_full_result() {
        let data = b"# Heading\nSome markdown content";
        let result = load_document("test.md", data);
        assert_eq!(result.mime_type, "text/markdown");
        assert_eq!(result.source, "native");
        assert_eq!(result.size_bytes, data.len());
        assert!(result.content.contains("Heading"));
    }

    #[test]
    fn empty_input_is_safe() {
        let result = load_document("empty.txt", b"");
        assert_eq!(result.content, "");
        assert_eq!(result.mime_type, "text/plain");
    }

    #[cfg(feature = "docx")]
    fn build_test_docx(document_xml: &[u8]) -> Vec<u8> {
        let mut cursor = std::io::Cursor::new(Vec::new());
        {
            let mut writer = zip::ZipWriter::new(&mut cursor);
            let options = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated);
            writer.start_file("word/document.xml", options).unwrap();
            use std::io::Write;
            writer.write_all(document_xml).unwrap();
            writer.finish().unwrap();
        }
        cursor.into_inner()
    }

    #[cfg(feature = "docx")]
    #[test]
    fn extract_docx_reads_deflated_runs_and_paragraphs() {
        let docx = build_test_docx(
            br#"<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t xml:space="preserve">Hello </w:t></w:r><w:r><w:t>native</w:t></w:r></w:p>
    <w:p><w:r><w:t>world from &lt;DOCX&gt;</w:t></w:r></w:p>
  </w:body>
</w:document>"#,
        );
        let text = extract_docx(&docx).unwrap();
        assert_eq!(text, "Hello native\nworld from <DOCX>");
    }

    #[cfg(feature = "docx")]
    #[test]
    fn extract_docx_rejects_non_zip_input() {
        assert!(extract_docx(b"not a zip").is_err());
    }

    #[cfg(all(feature = "docx", test))]
    #[test]
    fn extract_text_routes_docx_mime_to_native() {
        let docx = build_test_docx(
            br#"<w:document xmlns:w="u"><w:body><w:p><w:t>routed</w:t></w:p></w:body></w:document>"#,
        );
        let text = extract_text(
            &docx,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        );
        assert_eq!(text, "routed");
    }

    #[cfg(feature = "pdf")]
    /// Build a minimal single-page PDF with one text run. Object offsets are
    /// computed so the xref table is valid — pdf-extract parses the real
    /// structure, not a lenient fake.
    fn build_test_pdf(text: &str) -> Vec<u8> {
        let stream = format!("BT /F1 18 Tf 72 720 Td ({text}) Tj ET");
        let objects = [
            "<</Type/Catalog/Pages 2 0 R>>".to_string(),
            "<</Type/Pages/Kids[3 0 R]/Count 1>>".to_string(),
            "<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>".to_string(),
            format!("<</Length {}>>\nstream\n{stream}\nendstream", stream.len()),
            "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>".to_string(),
        ];

        let mut pdf = String::from("%PDF-1.4\n");
        let mut offsets = Vec::new();
        for (i, body) in objects.iter().enumerate() {
            offsets.push(pdf.len());
            pdf.push_str(&format!("{} 0 obj\n{}\nendobj\n", i + 1, body));
        }

        let xref_pos = pdf.len();
        let mut xref = format!("xref\n0 {}\n", objects.len() + 1);
        xref.push_str("0000000000 65535 f \n");
        for offset in &offsets {
            xref.push_str(&format!("{offset:010} 00000 n \n"));
        }
        xref.push_str(&format!(
            "trailer\n<</Size {} /Root 1 0 R>>\nstartxref\n{}\n%%EOF",
            objects.len() + 1,
            xref_pos
        ));
        pdf.push_str(&xref);
        pdf.into_bytes()
    }

    #[cfg(feature = "pdf")]
    #[test]
    fn extract_pdf_reads_generated_text_page() {
        let pdf = build_test_pdf("GHITA native PDF extraction");
        let text = extract_pdf(&pdf).unwrap();
        assert!(text.contains("GHITA"), "text was: {text:?}");
        assert!(text.contains("native"), "text was: {text:?}");
        assert!(text.contains("extraction"), "text was: {text:?}");
    }

    #[cfg(feature = "pdf")]
    #[test]
    fn extract_pdf_rejects_garbage_input() {
        assert!(extract_pdf(b"this is not a pdf at all").is_err());
    }
}
