// ==============================================================================
// ghita-codegraph — napi bindings (v1.1.0 Track 8 A11)
// ==============================================================================
// PageRank over CSR arrays passed from JS (zero copy into Vec), result as
// Float32Array. tree-sitter parsing lands in a future layer.
// ==============================================================================
// Exports here are N-API ABI entry points consumed by the JS addon loader at
// runtime (see @ghita/native-bridge). Within the crate they are unreferenced,
// so treat dead-code as expected for this module.
#![expect(dead_code)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use crate::{pagerank as core_pagerank, CsrGraph};

/// PageRank over CSR edge arrays. `from`/`to` are index-aligned.
#[napi]
pub fn pagerank(
  n: u32,
  from: Uint32Array,
  to: Uint32Array,
  weight: Float32Array,
  damping: Option<f64>,
  iterations: Option<u32>,
) -> Float32Array {
  let mut w = Vec::with_capacity(from.len());
  for i in 0..from.len() {
    w.push(weight.get(i).copied().unwrap_or(1.0));
  }
  let graph = CsrGraph {
    from: from.to_vec(),
    to: to.to_vec(),
    weight: w,
  };
  core_pagerank(
    n as usize,
    &graph,
    damping.unwrap_or(0.85) as f32,
    iterations.unwrap_or(30) as usize,
  )
  .into()
}
