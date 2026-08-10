// ==============================================================================
// ghita-retrieval — napi bindings (v1.1.0 Track 9 A9)
// ==============================================================================
// Exposes the inverted-index BM25 as a napi class: build once, query many —
// results as Uint32Array (ids) + Float32Array (scores), zero JSON churn.
// ==============================================================================

use napi::bindgen_prelude::*;
use napi_derive::napi;
use crate::{BM25Index as CoreBM25Index, Chunk as CoreChunk};

#[napi(object)]
pub struct ChunkSpec {
    pub id: u32,
    pub text: String,
}

#[napi(object)]
pub struct QueryResult {
    /// Chunk ids (parallel arrays).
    pub ids: Uint32Array,
    /// BM25 scores.
    pub scores: Float32Array,
}

/// Inverted-index BM25 (napi class wrapper around the std core).
#[napi]
pub struct Bm25Index {
    inner: CoreBM25Index,
}

#[napi]
impl Bm25Index {
    #[napi(constructor)]
    pub fn new(chunks: Vec<ChunkSpec>, k1: Option<f64>, b: Option<f64>) -> Self {
        let core_chunks: Vec<CoreChunk> = chunks
            .into_iter()
            .map(|c| CoreChunk { id: c.id, text: c.text })
            .collect();
        Bm25Index {
            inner: CoreBM25Index::build(&core_chunks, k1.unwrap_or(1.5), b.unwrap_or(0.75)),
        }
    }

    #[napi]
    pub fn query(&self, query: String, top_k: Option<u32>) -> QueryResult {
        let mut ranked = self.inner.query(&query);
        if let Some(k) = top_k {
            ranked.truncate(k as usize);
        }
        let ids: Vec<u32> = ranked.iter().map(|(id, _)| *id).collect();
        let scores: Vec<f32> = ranked.iter().map(|(_, s)| *s as f32).collect();
        QueryResult {
            ids: ids.into(),
            scores: scores.into(),
        }
    }

    #[napi(getter)]
    pub fn size(&self) -> u32 {
        self.inner.size() as u32
    }
}
