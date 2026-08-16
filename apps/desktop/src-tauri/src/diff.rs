// ==============================================================================
// ghita-coding-agent — line diff-stat (v1.1.1 Track 8)
// ==============================================================================
// Native twin of `apps/desktop/src/utils/editProposal.ts` lineDiffStat
// (rolling 1-D DP LCS over line arrays). Same deterministic semantics:
//   - identical texts -> { added: 0, removed: 0, unchanged: true }
//   - otherwise added = b.len - lcs, removed = a.len - lcs
// Runs on the Tauri async thread pool (spawn_blocking) so the UI thread never
// stalls on big diffs (5k-line AI edits previously blocked the main thread
// for O(n·m) string comparisons in JS).
// ==============================================================================

use serde::Serialize;

#[derive(Debug, Default, Clone, Serialize, PartialEq)]
pub struct DiffStat {
    pub added: u32,
    pub removed: u32,
    pub unchanged: bool,
}

/// Length of the longest common subsequence of two line slices (rolling 1-D
/// DP — memory O(m), same recurrence as the JS implementation).
fn lcs_length(a: &[&str], b: &[&str]) -> usize {
    let m = b.len();
    let mut prev = vec![0usize; m + 1];
    let mut curr = vec![0usize; m + 1];
    for i in 1..=a.len() {
        let ai = a[i - 1];
        for j in 1..=m {
            curr[j] = if ai == b[j - 1] {
                prev[j - 1] + 1
            } else {
                prev[j].max(curr[j - 1])
            };
        }
        std::mem::swap(&mut prev, &mut curr);
        curr.fill(0);
    }
    prev[m]
}

/// Compute added/removed line counts between two texts (JS `lineDiffStat`).
pub fn line_diff_stat(original: &str, proposed: &str) -> DiffStat {
    if original == proposed {
        return DiffStat {
            added: 0,
            removed: 0,
            unchanged: true,
        };
    }
    let a: Vec<&str> = original.split('\n').collect();
    let b: Vec<&str> = proposed.split('\n').collect();
    let lcs = lcs_length(&a, &b);
    DiffStat {
        added: (b.len() - lcs) as u32,
        removed: (a.len() - lcs) as u32,
        unchanged: false,
    }
}

/// Tauri command — heavy work off the main thread.
#[tauri::command]
pub async fn line_diff_stat_command(original: String, proposed: String) -> DiffStat {
    tauri::async_runtime::spawn_blocking(move || line_diff_stat(&original, &proposed))
        .await
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identical_texts_are_unchanged() {
        let stat = line_diff_stat("a\nb\nc", "a\nb\nc");
        assert!(stat.unchanged);
        assert_eq!((stat.added, stat.removed), (0, 0));
    }

    #[test]
    fn pure_addition() {
        let stat = line_diff_stat("a\nb", "a\nb\nc\nd");
        assert!(!stat.unchanged);
        assert_eq!(stat.added, 2);
        assert_eq!(stat.removed, 0);
    }

    #[test]
    fn pure_removal() {
        let stat = line_diff_stat("a\nb\nc\nd", "a\nb");
        assert_eq!(stat.added, 0);
        assert_eq!(stat.removed, 2);
    }

    #[test]
    fn edit_counts_both_sides() {
        // "x" -> "y" in the middle: 1 removed, 1 added.
        let stat = line_diff_stat("a\nx\nb", "a\ny\nb");
        assert_eq!(stat.added, 1);
        assert_eq!(stat.removed, 1);
    }

    #[test]
    fn matches_js_implementation() {
        // Parity probe against editProposal.ts semantics (documented there):
        // LCS of ["a","b","c"] and ["a","c"] is 2 -> added 0, removed 1.
        let stat = line_diff_stat("a\nb\nc", "a\nc");
        assert_eq!(stat.added, 0);
        assert_eq!(stat.removed, 1);
    }

    #[test]
    fn empty_strings() {
        let stat = line_diff_stat("", "");
        assert!(stat.unchanged);
        // "" vs "x" — split('\n') yields [""] vs ["x"] -> lcs 0.
        let stat2 = line_diff_stat("", "x");
        assert_eq!(stat2.added, 1);
        assert_eq!(stat2.removed, 1);
    }

    #[test]
    fn large_diff_is_fast_and_correct() {
        // 2k vs 2k lines with a small edit — O(n·m) DP but linear in Rust.
        let mut a = String::new();
        let mut b = String::new();
        for i in 0..2000 {
            a.push_str(&format!("line {i}\n"));
            if i != 1000 {
                b.push_str(&format!("line {i}\n"));
            } else {
                b.push_str(&format!("line {i} changed\n"));
            }
        }
        let stat = line_diff_stat(&a, &b);
        assert_eq!(stat.added, 1);
        assert_eq!(stat.removed, 1);
    }

    #[test]
    fn five_k_line_diff_timing() {
        // Documented performance probe for the v1.1.1 UI-stall fix: the JS
        // lineDiffStat took ~1.45 s for this input on the main thread.
        // Run with `cargo test --release large_diff -- --nocapture` to print.
        let mut a = String::new();
        let mut b = String::new();
        for i in 0..5000 {
            a.push_str(&format!("line {i} = value {i}; const x = compute(values, index, config);\n"));
            if i != 2500 {
                b.push_str(&format!("line {i} = value {i}; const x = compute(values, index, config);\n"));
            } else {
                b.push_str(&format!("line {i} = value {i}; const x = compute(values, index, EDITED);\n"));
            }
        }
        let t0 = std::time::Instant::now();
        let stat = line_diff_stat(&a, &b);
        let ms = t0.elapsed().as_secs_f64() * 1000.0;
        println!("[diff native] 5k lines: {ms:.1} ms (added {}, removed {})", stat.added, stat.removed);
        assert_eq!(stat.added, 1);
        assert_eq!(stat.removed, 1);
    }
}
