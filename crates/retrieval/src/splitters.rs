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

/// Split markdown by headings (## level). Each chunk starts at a heading.
pub fn split_markdown(text: &str, max_chunk_size: usize) -> Vec<Chunk> {
    if text.is_empty() {
        return Vec::new();
    }
    let mut chunks = Vec::new();
    let mut current_start = 0usize;
    let mut current_text = String::new();
    let mut id = 0u32;

    for line in text.lines() {
        let is_heading = line.starts_with("## ");

        if is_heading && !current_text.is_empty() {
            // Flush previous chunk
            if current_text.len() > max_chunk_size {
                for sub in fixed_split(&current_text, max_chunk_size) {
                    let sub_len = sub.len();
                    chunks.push(Chunk {
                        id,
                        text: sub,
                        start_offset: current_start,
                        end_offset: current_start + sub_len,
                    });
                    id += 1;
                    current_start += sub_len;
                }
            } else {
                chunks.push(Chunk {
                    id,
                    text: current_text.clone(),
                    start_offset: current_start,
                    end_offset: current_start + current_text.len(),
                });
                id += 1;
                current_start += current_text.len();
            }
            current_text.clear();
        }

        if !current_text.is_empty() {
            current_text.push('\n');
        }
        current_text.push_str(line);
    }

    // Flush remaining
    if !current_text.is_empty() {
        if current_text.len() > max_chunk_size {
            for sub in fixed_split(&current_text, max_chunk_size) {
                let sub_len = sub.len();
                chunks.push(Chunk {
                    id,
                    text: sub,
                    start_offset: current_start,
                    end_offset: current_start + sub_len,
                });
                id += 1;
                current_start += sub_len;
            }
        } else {
            chunks.push(Chunk {
                id,
                text: current_text,
                start_offset: current_start,
                end_offset: text.len(),
            });
        }
    }

    chunks
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

/// Split text into fixed-size chunks with configurable overlap.
pub fn split_fixed(text: &str, chunk_size: usize, overlap: usize) -> Vec<Chunk> {
    if text.is_empty() || chunk_size == 0 {
        return Vec::new();
    }
    let mut chunks = Vec::new();
    let mut id = 0u32;
    let mut start = 0usize;

    while start < text.len() {
        let end = (start + chunk_size).min(text.len());
        let chunk_text = &text[start..end];
        chunks.push(Chunk {
            id,
            text: chunk_text.to_string(),
            start_offset: start,
            end_offset: end,
        });
        id += 1;
        let step = if chunk_size > overlap {
            chunk_size - overlap
        } else {
            1
        };
        start += step;
        if start >= text.len() {
            break;
        }
    }

    chunks
}

/// Internal helper: split text into fixed-size pieces.
fn fixed_split(text: &str, max_size: usize) -> Vec<String> {
    let mut parts = Vec::new();
    let mut start = 0;
    while start < text.len() {
        let end = (start + max_size).min(text.len());
        parts.push(text[start..end].to_string());
        start = end;
    }
    parts
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn markdown_splits_by_headings() {
        let md = "## Section A\nContent A\n\n## Section B\nContent B\n";
        let chunks = split_markdown(md, 1000);
        assert_eq!(chunks.len(), 2);
        assert!(chunks[0].text.contains("Section A"));
        assert!(chunks[1].text.contains("Section B"));
    }

    #[test]
    fn markdown_oversized_chunks_are_split() {
        let long = format!("## Big\n{}", "x".repeat(2000));
        let chunks = split_markdown(&long, 500);
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
        let text = "abcdefghij";
        let chunks = split_fixed(text, 5, 2);
        assert_eq!(chunks.len(), 4); // [abcde, defgh, ghi, j]
        assert_eq!(chunks[0].text, "abcde");
        assert_eq!(chunks[1].text, "defgh");
    }

    #[test]
    fn empty_input_returns_empty() {
        assert!(split_markdown("", 100).is_empty());
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
}
