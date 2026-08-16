// ==============================================================================
// ghita-codegraph — napi bindings (v1.1.0 Track 8 A11; v1.1.1 tree-sitter)
// ==============================================================================
// PageRank over CSR arrays passed from JS (zero copy into Vec), result as
// Float32Array; plus `parse_files` — parallel tree-sitter AST extraction
// mirroring the JS ast-parser.ts contract (symbols/imports/edges).
// ==============================================================================
// Exports here are N-API ABI entry points consumed by the JS addon loader at
// runtime (see @ghita/native-bridge). Within the crate they are unreferenced,
// so treat dead-code as expected for this module.
#![expect(dead_code)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use rayon::prelude::*;

use crate::ast::{parse_file as core_parse_file, FileParse, SymbolInfo};
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

// ---------------------------------------------------------------------------
// tree-sitter AST extraction (v1.1.1)
// ---------------------------------------------------------------------------

#[napi(object)]
pub struct SymbolSpec {
  pub kind: String,
  pub name: String,
  pub qualified_name: String,
  pub start_line: u32,
  pub end_line: u32,
  pub excerpt: String,
  pub exported: bool,
  pub parameters: Vec<String>,
  pub return_type: Option<String>,
  /// Qualified name of the containing class (methods/properties only).
  pub parent: Option<String>,
}

#[napi(object)]
pub struct ImportSpec {
  pub module_specifier: String,
  pub named_imports: Vec<String>,
  pub default_import: Option<String>,
  pub namespace_import: Option<String>,
  pub is_type_only: bool,
  pub line: u32,
}

#[napi(object)]
pub struct EdgeSpecRecord {
  pub from: String,
  pub to: String,
  pub kind: String,
  pub weight: f64,
  pub line: u32,
}

#[napi(object)]
pub struct FileSpec {
  /// Absolute file path — extension selects the grammar (ts/tsx/js/py).
  pub file_path: String,
  pub content: String,
}

#[napi(object)]
pub struct FileParseResult {
  pub file_path: String,
  pub symbols: Vec<SymbolSpec>,
  pub imports: Vec<ImportSpec>,
  pub edges: Vec<EdgeSpecRecord>,
}

fn to_specs(out: &FileParse) -> (Vec<SymbolSpec>, Vec<ImportSpec>, Vec<EdgeSpecRecord>) {
  let symbols = out
    .symbols
    .iter()
    .map(|s: &SymbolInfo| SymbolSpec {
      kind: s.kind.as_str().to_string(),
      name: s.name.clone(),
      qualified_name: s.qualified_name.clone(),
      start_line: s.start_line,
      end_line: s.end_line,
      excerpt: s.excerpt.clone(),
      exported: s.exported,
      parameters: s.parameters.clone(),
      return_type: s.return_type.clone(),
      parent: s.parent.clone(),
    })
    .collect();
  let imports = out
    .imports
    .iter()
    .map(|i| ImportSpec {
      module_specifier: i.module_specifier.clone(),
      named_imports: i.named_imports.clone(),
      default_import: i.default_import.clone(),
      namespace_import: i.namespace_import.clone(),
      is_type_only: i.is_type_only,
      line: i.line,
    })
    .collect();
  let edges = out
    .edges
    .iter()
    .map(|e| EdgeSpecRecord {
      from: e.from.clone(),
      to: e.to.clone(),
      kind: e.kind.as_str().to_string(),
      weight: e.weight,
      line: e.line,
    })
    .collect();
  (symbols, imports, edges)
}

fn parse_one(spec: &FileSpec) -> FileParseResult {
  let parsed = core_parse_file(&spec.file_path, &spec.content);
  let (symbols, imports, edges) = to_specs(&parsed);
  FileParseResult {
    file_path: parsed.file_path,
    symbols,
    imports,
    edges,
  }
}

/// Parse many files in parallel (rayon). Unsupported extensions yield empty
/// results — the JS wrapper keeps its TS-API fallback for those.
#[napi]
pub fn parse_files(files: Vec<FileSpec>) -> Vec<FileParseResult> {
  files.par_iter().map(parse_one).collect()
}
