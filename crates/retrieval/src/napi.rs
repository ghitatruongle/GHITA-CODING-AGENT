// ==============================================================================
// ghita-retrieval — napi bindings (v1.1.5-beta2)
// ==============================================================================
// Exposes inverted-index BM25, RRF fusion, vector search, and splitters to JS.
// ==============================================================================

use napi::bindgen_prelude::*;
use napi_derive::napi;
use crate::{
    BM25Index as CoreBM25Index,
    Chunk as CoreChunk,
    rrf_fuse as core_rrf_fuse,
    vector_search as core_vector_search,
    splitters as core_splitters,
};

#[napi(object)]
pub struct ChunkSpec {
    pub id: u32,
    pub text: String,
}

#[napi(object)]
pub struct QueryResult {
    /// Chunk ids (parallel arrays).
    pub ids: Uint32Array,
    /// BM25 / RRF scores.
    pub scores: Float32Array,
}

#[napi(object)]
pub struct SplitChunkResult {
    pub id: u32,
    pub text: String,
    pub start_offset: u32,
    pub end_offset: u32,
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

/// Reciprocal Rank Fusion of multiple ID lists into one ranked output.
#[napi]
pub fn rrf_fuse(
    ranked_lists: Vec<Vec<u32>>,
    weights: Option<Vec<f64>>,
    k: Option<f64>,
    top_k: Option<u32>,
) -> QueryResult {
    let result = core_rrf_fuse(
        &ranked_lists,
        weights.as_deref(),
        k.unwrap_or(60.0),
        top_k.unwrap_or(20) as usize,
    );
    let ids: Vec<u32> = result.iter().map(|(id, _)| *id).collect();
    let scores: Vec<f32> = result.iter().map(|(_, s)| *s as f32).collect();
    QueryResult {
        ids: ids.into(),
        scores: scores.into(),
    }
}

/// Vector cosine search top-K.
#[napi]
pub fn vector_search(
    query: Float32Array,
    corpus_ids: Uint32Array,
    corpus_flat: Float32Array,
    dim: u32,
    top_k: Option<u32>,
) -> QueryResult {
    let query_slice: &[f32] = &query;
    let corpus_ids_slice: &[u32] = &corpus_ids;
    let d = dim as usize;
    if d == 0 {
        return QueryResult {
            ids: Vec::new().into(),
            scores: Vec::new().into(),
        };
    }

    let num_vectors = corpus_flat.len() / d;
    let mut corpus_vectors = Vec::with_capacity(num_vectors);
    for i in 0..num_vectors {
        let start = i * d;
        let end = start + d;
        if end <= corpus_flat.len() {
            corpus_vectors.push(corpus_flat[start..end].to_vec());
        }
    }

    let results = core_vector_search(
        query_slice,
        corpus_ids_slice,
        &corpus_vectors,
        top_k.unwrap_or(10) as usize,
    );

    let ids: Vec<u32> = results.iter().map(|(id, _)| *id).collect();
    let scores: Vec<f32> = results.iter().map(|(_, s)| *s).collect();
    QueryResult {
        ids: ids.into(),
        scores: scores.into(),
    }
}

/// Split markdown text into chunks native.
#[napi]
pub fn split_markdown_native(text: String, max_chunk_size: Option<u32>) -> Vec<SplitChunkResult> {
    core_splitters::split_markdown(&text, max_chunk_size.unwrap_or(1000) as usize)
        .into_iter()
        .map(|c| SplitChunkResult {
            id: c.id,
            text: c.text,
            start_offset: c.start_offset as u32,
            end_offset: c.end_offset as u32,
        })
        .collect()
}

/// Split code text into function/declaration chunks native.
#[napi]
pub fn split_code_native(text: String, max_chunk_size: Option<u32>) -> Vec<SplitChunkResult> {
    core_splitters::split_code(&text, max_chunk_size.unwrap_or(1000) as usize)
        .into_iter()
        .map(|c| SplitChunkResult {
            id: c.id,
            text: c.text,
            start_offset: c.start_offset as u32,
            end_offset: c.end_offset as u32,
        })
        .collect()
}

/// Split fixed-size windows with overlap native.
#[napi]
pub fn split_fixed_native(text: String, chunk_size: Option<u32>, overlap: Option<u32>) -> Vec<SplitChunkResult> {
    core_splitters::split_fixed(&text, chunk_size.unwrap_or(1200) as usize, overlap.unwrap_or(100) as usize)
        .into_iter()
        .map(|c| SplitChunkResult {
            id: c.id,
            text: c.text,
            start_offset: c.start_offset as u32,
            end_offset: c.end_offset as u32,
        })
        .collect()
}
