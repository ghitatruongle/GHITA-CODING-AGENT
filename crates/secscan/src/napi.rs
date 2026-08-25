//! ghita-secscan — napi bindings
//! Compiled only with `--features addon` (via @napi-rs/cli). Exposes
//! `scanFast` returning findings as Uint32Array (lines + rule indices) +
//! evidence strings — zero JSON string intermediates.
//! Strategy: ONE combined regex with named capture groups (r0..rn) scanned once
//! over the whole buffer (regex crate is fast on long input); line numbers are
//! tracked with memchr between matches.
//! Exports here are N-API ABI entry points consumed by the JS addon loader at
//! runtime (see @ghita/native-bridge). Within the crate they are unreferenced,
//! so treat dead-code as expected for this module.
#![expect(dead_code)]

use napi::bindgen_prelude::*;
use napi_derive::napi;
use regex::Regex;

/// A scanner rule passed from JS (pattern sources compile with the regex crate).
#[napi(object)]
pub struct NativeRule {
    pub id: String,
    pub pattern: String,
    pub negative: Option<String>,
}

#[napi(object)]
pub struct ScanResult {
    /// 1-based line numbers (Uint32Array).
    pub lines: Uint32Array,
    /// Indices into the input `rules` array (Uint32Array).
    pub rule_indices: Uint32Array,
    /// Matched evidence strings (parallel to lines/rule_indices).
    pub evidence: Vec<String>,
    /// UTF-8 byte offsets where each match starts (parallel arrays). Additive
    /// in 1.1.5 — lets callers redact exact ranges without re-matching.
    pub match_starts: Uint32Array,
    /// UTF-8 byte offsets one past each match end.
    pub match_ends: Uint32Array,
}

/// Scan `content` with regex rules; returns findings as typed arrays.
/// Span arrays (`match_starts`/`match_ends`) are only populated when
/// `with_spans` is true — the hot scan path skips the extra allocations.
#[napi]
pub fn scan_fast(
    content: String,
    rules: Vec<NativeRule>,
    with_spans: Option<bool>,
) -> napi::Result<ScanResult> {
    // 1. Compile ONE combined regex: (?<r0>p0)|(?<r1>p1)|...
    let mut combined = String::from("(?:");
    for (i, r) in rules.iter().enumerate() {
        if i > 0 {
            combined.push('|');
        }
        combined.push_str("(?<r");
        combined.push_str(&i.to_string());
        combined.push('>');
        combined.push_str(&r.pattern);
        combined.push(')');
    }
    combined.push(')');
    let combined_re = match Regex::new(&combined) {
        Ok(re) => re,
        Err(e) => {
            // regex crate lacks look-around support: surface the error so the JS fallback takes over.
            return Err(napi::Error::from_reason(format!(
                "secscan: pattern unsupported ({e})"
            )));
        }
    };
    // 2. Compile negative patterns (per rule).
    let negatives: Vec<Option<Regex>> = rules
        .iter()
        .map(|r| r.negative.as_ref().and_then(|n| Regex::new(n).ok()))
        .collect();

    let mut lines_out: Vec<u32> = Vec::new();
    let mut idx_out: Vec<u32> = Vec::new();
    let mut evidence_out: Vec<String> = Vec::new();
    let mut starts_out: Vec<u32> = Vec::new();
    let mut ends_out: Vec<u32> = Vec::new();

    let bytes = content.as_bytes();
    let mut last = 0usize;
    let mut line_no = 1u32;

    for caps in combined_re.captures_iter(&content) {
        let m = caps.get(0).unwrap();
        // Count newlines between the previous match and this one.
        line_no += count_newlines(bytes, last, m.start());
        last = m.start();

        // Which rule matched? Find the named group.
        for (i, neg) in negatives.iter().enumerate() {
            let group_name = format!("r{i}");
            if caps.name(&group_name).is_none() {
                continue;
            }
            // Line end (memchr) for negative-pattern semantics + length guard.
            let line_end = memchr::memchr(b'\n', &bytes[m.start()..])
                .map(|rel| m.start() + rel)
                .unwrap_or(content.len());
            let line = &content[m.start()..line_end];
            if line.len() > 2000 {
                break; // minified/generated line — skip
            }
            if let Some(neg_re) = neg {
                if neg_re.is_match(line) {
                    break;
                }
            }
            let evidence = m.as_str().trim().chars().take(200).collect::<String>();
            lines_out.push(line_no);
            idx_out.push(i as u32);
            evidence_out.push(evidence);
            if with_spans.unwrap_or(false) {
                starts_out.push(m.start() as u32);
                ends_out.push(m.end() as u32);
            }
            break;
        }
    }

    napi::Result::Ok(ScanResult {
        lines: lines_out.into(),
        rule_indices: idx_out.into(),
        evidence: evidence_out,
        match_starts: starts_out.into(),
        match_ends: ends_out.into(),
    })
}

fn count_newlines(bytes: &[u8], start: usize, end: usize) -> u32 {
    let mut count = 0u32;
    let mut pos = start;
    while pos < end {
        match memchr::memchr(b'\n', &bytes[pos..end]) {
            Some(rel) => {
                count += 1;
                pos += rel + 1;
            }
            None => break,
        }
    }
    count
}

fn empty_result() -> ScanResult {
    ScanResult {
        lines: Uint32Array::new(Vec::<u32>::new()),
        rule_indices: Uint32Array::new(Vec::<u32>::new()),
        evidence: Vec::new(),
        match_starts: Uint32Array::new(Vec::<u32>::new()),
        match_ends: Uint32Array::new(Vec::<u32>::new()),
    }
}
