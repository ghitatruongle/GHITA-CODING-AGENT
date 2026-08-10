// ==============================================================================
// ghita-retrieval — inverted-index BM25 core (v1.1.0 Track 8 A8/A9)
// ==============================================================================
// Fixes the JS hot path (BM25 DF was O(N²) per query: 4.2s @ 10k chunks) with
// an inverted index built once: token -> {df, postings}. Query = one pass over
// the postings of query terms. Std-only (HashMap + Vec) so `cargo test` runs
// offline; the addon (feature "addon") exposes napi bindings.
// ==============================================================================

#[cfg(feature = "addon")]
mod napi;

use std::collections::HashMap;

/// A document chunk fed into the index.
#[derive(Debug, Clone)]
pub struct Chunk {
    pub id: u32,
    pub text: String,
}

struct Posting {
    chunk: u32,
    tf: u32,
}

struct TermEntry {
    df: u32,
    postings: Vec<Posting>,
}

pub struct BM25Index {
    index: HashMap<String, TermEntry>,
    lengths: Vec<usize>,
    avg_len: f64,
    n: usize,
    k1: f64,
    b: f64,
}

impl BM25Index {
    /// Build the inverted index in one pass over the corpus.
    pub fn build(chunks: &[Chunk], k1: f64, b: f64) -> Self {
        let n = chunks.len();
        let lengths: Vec<usize> = chunks.iter().map(|c| c.text.len()).collect();
        let total: usize = lengths.iter().sum();
        let avg_len = total as f64 / n.max(1) as f64;
        let mut index: HashMap<String, TermEntry> = HashMap::new();

        for (ci, chunk) in chunks.iter().enumerate() {
            let mut seen: HashMap<String, u32> = HashMap::new();
            for token in tokenize(&chunk.text) {
                *seen.entry(token).or_insert(0) += 1;
            }
            for (token, tf) in seen {
                let entry = index.entry(token).or_insert(TermEntry {
                    df: 0,
                    postings: Vec::new(),
                });
                entry.df += 1;
                entry.postings.push(Posting {
                    chunk: ci as u32,
                    tf,
                });
            }
        }

        BM25Index {
            index,
            lengths,
            avg_len,
            n,
            k1,
            b,
        }
    }

    /// Score every chunk once per query term (DF precomputed).
    pub fn query(&self, query: &str) -> Vec<(u32, f64)> {
        let mut scores: HashMap<u32, f64> = HashMap::new();
        for term in tokenize(query) {
            let Some(entry) = self.index.get(&term) else {
                continue;
            };
            let idf = (1.0 + (self.n as f64 - entry.df as f64 + 0.5) / (entry.df as f64 + 0.5)).ln();
            for posting in &entry.postings {
                let chunk_idx = posting.chunk as usize;
                let len = self.lengths[chunk_idx] as f64;
                let tf_norm = (posting.tf as f64 * (self.k1 + 1.0))
                    / (posting.tf as f64 + self.k1 * (1.0 - self.b + self.b * (len / self.avg_len)));
                *scores.entry(posting.chunk).or_insert(0.0) += idf * tf_norm;
            }
        }
        let mut ranked: Vec<(u32, f64)> = scores.into_iter().collect();
        ranked.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        ranked
    }

    pub fn size(&self) -> usize {
        self.index.len()
    }
}

/// Tokenizer: Unicode-lite (std-only). The addon swaps this for
/// `unicode-segmentation` + lowercase folding.
fn tokenize(text: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    for ch in text.chars() {
        if ch.is_alphanumeric() {
            current.push(ch.to_ascii_lowercase());
        } else if !current.is_empty() {
            tokens.push(std::mem::take(&mut current));
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    tokens
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chunks() -> Vec<Chunk> {
        vec![
            Chunk { id: 0, text: "the red fox jumps over the dog".into() },
            Chunk { id: 1, text: "the blue sky is clear today".into() },
            Chunk { id: 2, text: "foxes and dogs run fast in the park".into() },
        ]
    }

    #[test]
    fn ranks_relevant_chunks_first() {
        let index = BM25Index::build(&chunks(), 1.5, 0.75);
        let ranked = index.query("fox jumps");
        assert_eq!(ranked[0].0, 0);
    }

    #[test]
    fn df_is_precomputed() {
        let index = BM25Index::build(&chunks(), 1.5, 0.75);
        assert!(index.size() > 0);
        // "the" appears in all three chunks.
        let ranked = index.query("the");
        assert_eq!(ranked.len(), 3);
    }

    #[test]
    fn unknown_terms_score_nothing() {
        let index = BM25Index::build(&chunks(), 1.5, 0.75);
        assert!(index.query("zzzznope").is_empty());
    }

    #[test]
    fn empty_corpus_is_safe() {
        let index = BM25Index::build(&[], 1.5, 0.75);
        assert!(index.query("fox").is_empty());
    }
}
