// ==============================================================================
// ghita-docloader — document text extraction core (v1.1.5-beta1 Track 6.4/8.1)
// ==============================================================================
// Std-only core for extracting text from documents (PDF, DOCX, HTML, plain text).
// The addon (feature "addon") exposes napi bindings for async JS interop.
//
// This core provides:
//   - MIME type detection from file extension / magic bytes
//   - Plain-text extraction (always available)
//   - HTML tag stripping → readable text
//   - Stub extractors for PDF/DOCX that return metadata when full parsing
//     libraries are not linked (the JS fallback handles those formats)
// ==============================================================================

#[cfg(feature = "addon")]
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
/// For binary formats (PDF, DOCX), returns a placeholder — the JS fallback handles those.
pub fn extract_text(data: &[u8], mime: &str) -> String {
    match mime {
        "text/plain" | "text/markdown" | "application/json" | "text/csv" | "application/xml" => {
            String::from_utf8_lossy(data).to_string()
        }
        "text/html" => strip_html_tags(data),
        "application/pdf" => format!(
            "[PDF document: {} bytes — native PDF extraction requires addon or JS fallback]",
            data.len()
        ),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        | "application/msword" => format!(
            "[DOCX document: {} bytes — native DOCX extraction requires addon or JS fallback]",
            data.len()
        ),
        _ => {
            // Try UTF-8; if valid, return it; otherwise report binary
            match std::str::from_utf8(data) {
                Ok(s) => s.to_string(),
                Err(_) => format!(
                    "[Binary content: {} bytes, MIME {}]",
                    data.len(),
                    mime
                ),
            }
        }
    }
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
        assert_eq!(detect_mime("letter.docx"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
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
    fn pdf_returns_placeholder() {
        let data = b"%PDF-1.4 fake content";
        let text = extract_text(data, "application/pdf");
        assert!(text.contains("PDF document"));
        assert!(text.contains("bytes"));
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
}

