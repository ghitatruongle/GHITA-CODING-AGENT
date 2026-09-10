//! ghita-retrieval — Text splitters for chunking
//! Replaces ingest/src/splitters.ts with native Rust implementations.
//! Provides markdown-aware, code-aware, and fixed-size splitting strategies.
//! Std-only core; the addon exposes napi bindings.

/// A chunk of text with metadata about its position in the source.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Chunk {
    pub id: u32,
    pub text: String,
    /// Byte offset in the original document.
    pub start_offset: usize,
    /// End byte offset in the original document.
    pub end_offset: usize,
}

/// UTF-16 code-unit width of a char — JS `String.length` semantics.
fn utf16_width(c: char) -> usize {
    if (c as u32) > 0xFFFF {
        2
    } else {
        1
    }
}

/// Split markdown by headings (H1-H3), mirroring the JS reference in
/// `packages/ingest/src/splitters.ts`: headings are re-wrapped as `## `,
/// oversized sections fall back to fixed windows with `overlap`.
pub fn split_markdown(text: &str, max_chunk_size: usize, overlap: usize) -> Vec<Chunk> {
    if text.is_empty() {
        return Vec::new();
    }
    // `heading` is Some(_) iff the JS regex matched (capture may be empty
    // after trim — JS still starts a new section); truthiness checks below
    // mirror JS `current.heading` (empty string is falsy).
    let mut sections: Vec<(Option<String>, Vec<&str>)> = Vec::new();
    let mut cur_head: Option<String> = None;
    let mut cur_body: Vec<&str> = Vec::new();
    let head_truthy = |h: &Option<String>| h.as_ref().is_some_and(|s| !s.is_empty());
    for line in text.split('\n') {
        if let Some(h) = markdown_heading(line) {
            if !cur_body.is_empty() || head_truthy(&cur_head) {
                sections.push((cur_head.take(), std::mem::take(&mut cur_body)));
            }
            cur_head = Some(h);
        } else {
            cur_body.push(line);
        }
    }
    if !cur_body.is_empty() || head_truthy(&cur_head) {
        sections.push((cur_head, cur_body));
    }

    let mut chunks: Vec<Chunk> = Vec::new();
    let mut id = 0u32;
    for (heading, body) in sections {
        let body_str = body.join("\n").trim().to_string();
        let has_head = heading.as_ref().is_some_and(|s| !s.is_empty());
        if body_str.is_empty() {
            if has_head {
                chunks.push(Chunk {
                    id,
                    text: format!("## {}", heading.unwrap_or_default()),
                    start_offset: 0,
                    end_offset: 0,
                });
                id += 1;
            }
            continue;
        }
        let wrapped = match heading {
            Some(h) if !h.is_empty() => format!("## {h}\n\n{body_str}"),
            _ => body_str,
        };
        let units: usize = wrapped.chars().map(utf16_width).sum();
        if units <= max_chunk_size {
            chunks.push(Chunk {
                id,
                text: wrapped,
                start_offset: 0,
                end_offset: 0,
            });
            id += 1;
        } else {
            for s in fixed_split(&wrapped, max_chunk_size, overlap) {
                chunks.push(Chunk {
                    id,
                    text: s,
                    start_offset: 0,
                    end_offset: 0,
                });
                id += 1;
            }
        }
    }
    chunks.retain(|c| !c.text.trim().is_empty());
    chunks
}

/// JS parity for `/^(#{1,3})\s+(.+)$/` + `.trim()` on the capture.
fn markdown_heading(line: &str) -> Option<String> {
    let hashes = line.chars().take_while(|&c| c == '#').count();
    if hashes == 0 || hashes > 3 {
        return None;
    }
    let rest = &line[hashes..];
    let trimmed = rest.trim_start();
    if trimmed.len() == rest.len() {
        return None; // `\s+` requires at least one whitespace after the hashes
    }
    let h = trimmed.trim();
    // Regex matched (`.+` consumed ≥1 char); capture may trim to empty —
    // JS still treats this as a heading match with a falsy ('') heading.
    Some(h.to_string())
}

/// Split code by function/class boundaries (heuristic: lines starting with
/// common declaration keywords or closing braces followed by blank lines).
pub fn split_code(text: &str, max_chunk_size: usize) -> Vec<Chunk> {
    if text.is_empty() {
        return Vec::new();
    }
    let mut chunks = Vec::new();
    let mut current_start = 0usize;
    let mut current_text = String::new();
    let mut id = 0u32;

    for line in text.lines() {
        let trimmed = line.trim();
        let is_boundary = trimmed.starts_with("fn ")
            || trimmed.starts_with("function ")
            || trimmed.starts_with("def ")
            || trimmed.starts_with("class ")
            || trimmed.starts_with("export ")
            || trimmed.starts_with("pub fn ")
            || trimmed.starts_with("async fn ")
            || trimmed.starts_with("impl ");

        if is_boundary && !current_text.is_empty() {
            chunks.push(Chunk {
                id,
                text: current_text.clone(),
                start_offset: current_start,
                end_offset: current_start + current_text.len(),
            });
            id += 1;
            current_start += current_text.len();
            current_text.clear();
        }

        if !current_text.is_empty() {
            current_text.push('\n');
        }
        current_text.push_str(line);

        // Hard limit: flush if too large
        if current_text.len() >= max_chunk_size {
            chunks.push(Chunk {
                id,
                text: current_text.clone(),
                start_offset: current_start,
                end_offset: current_start + current_text.len(),
            });
            id += 1;
            current_start += current_text.len();
            current_text.clear();
        }
    }

    if !current_text.is_empty() {
        chunks.push(Chunk {
            id,
            text: current_text,
            start_offset: current_start,
            end_offset: text.len(),
        });
    }

    chunks
}

/// Split text into fixed-size windows with overlap, mirroring the JS reference:
/// sizes are UTF-16 code units (JS `String.length`), `overlap` is clamped to
/// `chunk_size / 2`, and boundaries never split a UTF-8 char / surrogate pair.
pub fn split_fixed(text: &str, chunk_size: usize, overlap: usize) -> Vec<Chunk> {
    if text.is_empty() || chunk_size == 0 {
        return Vec::new();
    }
    let overlap = overlap.min(chunk_size / 2); // JS: Math.min(overlap, floor(chunkSize/2))
    let mut chunks = Vec::new();
    let mut id = 0u32;

    // ASCII fast path: UTF-16 units == bytes == chars — plain byte slicing.
    if text.is_ascii() {
        let len = text.len();
        let mut start = 0usize;
        while start < len {
            let end = (start + chunk_size).min(len);
            chunks.push(Chunk {
                id,
                text: text[start..end].to_string(),
                start_offset: start,
                end_offset: end,
            });
            id += 1;
            if end >= len {
                break;
            }
            start = end - overlap;
        }
        return chunks;
    }

    // Non-ASCII: stream char_indices, slice the source by byte offsets, and
    // keep only the current window's chars for the overlap rewind. No
    // whole-input Vec<char>.
    let mut window: Vec<(usize, usize)> = Vec::new(); // (byte_start, utf16_width)
    let mut chunk_start = 0usize;
    let mut units = 0usize;
    for (bi, c) in text.char_indices() {
        let w = utf16_width(c);
        if units + w > chunk_size && units > 0 {
            chunks.push(Chunk {
                id,
                text: text[chunk_start..bi].to_string(),
                start_offset: chunk_start,
                end_offset: bi,
            });
            id += 1;
            // Rewind: keep trailing chars whose widths sum to ≤ overlap.
            let mut kept_units = 0usize;
            let mut cut = window.len();
            while cut > 0 {
                let pw = window[cut - 1].1;
                if kept_units + pw > overlap {
                    break;
                }
                kept_units += pw;
                cut -= 1;
            }
            chunk_start = window.get(cut).map_or(bi, |&(b, _)| b);
            units = kept_units;
            window.drain(..cut);
        }
        window.push((bi, w));
        units += w;
    }
    if units > 0 {
        let end = text.len();
        chunks.push(Chunk {
            id,
            text: text[chunk_start..end].to_string(),
            start_offset: chunk_start,
            end_offset: end,
        });
    }
    chunks
}

/// Internal helper: split text into fixed-size pieces (delegates to the
/// boundary-safe `split_fixed`).
fn fixed_split(text: &str, max_size: usize, overlap: usize) -> Vec<String> {
    split_fixed(text, max_size, overlap)
        .into_iter()
        .map(|c| c.text)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn markdown_splits_by_headings() {
        let md = "## Section A\nContent A\n\n## Section B\nContent B\n";
        let chunks = split_markdown(md, 1000, 100);
        assert_eq!(chunks.len(), 2);
        assert!(chunks[0].text.contains("Section A"));
        assert!(chunks[1].text.contains("Section B"));
    }

    #[test]
    fn markdown_oversized_chunks_are_split() {
        let long = format!("## Big\n{}", "x".repeat(2000));
        let chunks = split_markdown(&long, 500, 100);
        assert!(chunks.len() >= 4);
    }

    #[test]
    fn code_splits_at_function_boundaries() {
        let code = "fn foo() {\n  bar();\n}\n\nfn baz() {\n  qux();\n}\n";
        let chunks = split_code(code, 50);
        assert!(chunks.len() >= 2);
    }

    #[test]
    fn fixed_split_with_overlap() {
        // JS parity: break when end reaches text end (no trailing partial step)
        let text = "abcdefghij";
        let chunks = split_fixed(text, 5, 2);
        assert_eq!(chunks.len(), 3); // [abcde, defgh, ghij]
        assert_eq!(chunks[0].text, "abcde");
        assert_eq!(chunks[1].text, "defgh");
        assert_eq!(chunks[2].text, "ghij");
    }

    #[test]
    fn empty_input_returns_empty() {
        assert!(split_markdown("", 100, 100).is_empty());
        assert!(split_code("", 100).is_empty());
        assert!(split_fixed("", 100, 0).is_empty());
    }

    #[test]
    fn chunk_offsets_are_correct() {
        let text = "Hello World";
        let chunks = split_fixed(text, 5, 0);
        assert_eq!(chunks[0].start_offset, 0);
        assert_eq!(chunks[0].end_offset, 5);
        assert_eq!(chunks[1].start_offset, 5);
        assert_eq!(chunks[1].end_offset, 10);
        assert_eq!(chunks[2].start_offset, 10);
        assert_eq!(chunks[2].end_offset, 11);
    }

    // ── BUG-001 (v1.2.0-demo1): UTF-8 boundary + JS-parity semantics ──────

    #[test]
    fn fixed_split_cjk_no_panic_and_respects_char_count() {
        let cjk = "中文测试：中文文本的中文分词与拆分处理。";
        let text = cjk.repeat(50);
        let chunks = split_fixed(&text, 40, 4);
        assert!(chunks.len() > 1);
        for c in &chunks {
            assert!(c.text.chars().count() <= 40, "chunk exceeds 40 chars");
        }
        assert!(chunks[0].text.starts_with("中文测试：中"));
    }

    #[test]
    fn fixed_split_overlap_clamped_to_half_like_js() {
        // JS: overlap = Math.min(overlap, floor(chunkSize / 2))
        let text = "x".repeat(100);
        let clamped = split_fixed(&text, 10, 100);
        let explicit = split_fixed(&text, 10, 5);
        assert_eq!(clamped.len(), explicit.len());
    }

    #[test]
    fn fixed_split_very_long_line_count_matches_js() {
        // JS: 'x'*10000, chunkSize 500, overlap 100 → 25 parts
        let text = "x".repeat(10_000);
        let chunks = split_fixed(&text, 500, 100);
        assert_eq!(chunks.len(), 25);
    }

    #[test]
    fn fixed_split_single_char() {
        let chunks = split_fixed("x", 1200, 100);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].text, "x");
    }

    // ── BUG-004 (v1.2.0-demo1): markdown must mirror JS H1-H3 + `## ` wrap ──

    #[test]
    fn markdown_h1_heading_wrapped_like_js() {
        let chunks = split_markdown("# Title\n\npara one\n\n## Sub\n\npara two", 1200, 100);
        assert!(
            chunks.iter().any(|c| c.text.starts_with("## Title")),
            "expected `## Title` wrap, got {:?}",
            chunks.iter().map(|c| &c.text).collect::<Vec<_>>()
        );
    }

    #[test]
    fn markdown_emoji_and_cjk_headings_intact() {
        let cjk = "中文测试：中文文本的中文分词与拆分处理。";
        let emoji = "🚀🔥💡 test with emoji mixed 中文字符 émojis 🎉";
        let md = format!("# 🚀 中文标题\n\n{cjk}\n\n## English Sub\n\n{emoji}");
        let chunks = split_markdown(&md, 1200, 100);
        assert!(chunks.iter().any(|c| c.text.contains("🚀 中文标题")));
        assert!(chunks.iter().any(|c| c.text.contains(emoji)));
    }

    #[test]
    fn markdown_h4_is_not_a_heading() {
        let chunks = split_markdown("#### not heading\nbody", 1200, 100);
        assert_eq!(chunks.len(), 1);
        assert!(chunks[0].text.starts_with("#### not heading"));
    }

    #[test]
    fn markdown_empty_body_keeps_heading_only_part() {
        let chunks = split_markdown("## Solo\n\n## Next\nbody", 1200, 100);
        assert!(chunks.iter().any(|c| c.text == "## Solo"));
    }

    #[test]
    fn markdown_single_char() {
        let chunks = split_markdown("x", 1200, 100);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].text, "x");
    }

    #[test]
    fn markdown_whitespace_only_heading_matches_js() {
        // '##   ' → JS regex matches with capture trimming to '' (falsy):
        // it starts a section but contributes no heading text.
        let chunks = split_markdown("##   \ncontent after empty heading", 1200, 100);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].text, "content after empty heading");
    }

    #[test]
    fn markdown_oversized_section_uses_overlap_step() {
        let body = "y".repeat(2500);
        let md = format!("## Big\n{body}");
        let chunks = split_markdown(&md, 1000, 100);
        // wrapped = "## Big\n" + 2500 y's = 2507 units → fixed split step 900
        assert!(chunks.len() >= 3);
        for c in &chunks {
            assert!(c.text.chars().count() <= 1000);
        }
    }
}
