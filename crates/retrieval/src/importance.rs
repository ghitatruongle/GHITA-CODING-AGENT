//! ghita-retrieval — importance scoring shared-token counts (v1.2.0-demo1).
//!
//! Pure-compute core of `MemoryCompactor.scoreAll`: for every entry, count how
//! many OTHER entries share more than 30% of its tokens. JS keeps tokenize +
//! the float scoring formula; this function returns the integer per-entry
//! counts. Parity with the JS reference is exact:
//! - duplicate-id groups are skipped via `group` (same-id entries never count
//!   each other, mirroring `other.id === entry.id`),
//! - the threshold uses IEEE f64 division `shared/size > 0.3` (NOT integer
//!   cross-multiplication — rounding at the boundary would diverge from JS).

use std::collections::HashMap;

/// `tokens[i]` = sorted unique vocab-ids of entry i; `group[i]` = canonical
/// index of the first entry sharing entry i's id. Returns per-entry counts of
/// other-group entries whose token overlap exceeds 30% of entry i's tokens.
pub fn shared_counts(tokens: &[Vec<u32>], group: &[u32]) -> Vec<u32> {
    let n = tokens.len();
    // Defensive: JS must pass parallel arrays. A short `group` would OOB-panic
    // (`group[i]`) and abort the napi worker (panic=abort). Return zeros so
    // the JS fallback path (length check) can detect and recompute instead.
    if group.len() != n {
        return vec![0u32; n];
    }
    let mut out = vec![0u32; n];
    if n == 0 {
        return out;
    }

    // Vocabulary size + inverted index cost estimate Σ_t postings(t)².
    let mut max_id = 0u32;
    let mut postings: HashMap<u32, Vec<u32>> = HashMap::new();
    for (i, set) in tokens.iter().enumerate() {
        for &t in set {
            if t > max_id {
                max_id = t;
            }
            postings.entry(t).or_default().push(i as u32);
        }
    }
    let vocab = max_id as usize + 1;
    let words = vocab.div_ceil(32).max(1);
    let mut inv_cost = 0usize;
    for p in postings.values() {
        inv_cost += p.len() * p.len();
    }
    let bit_cost = n.saturating_mul(n).saturating_mul(words);

    if bit_cost <= inv_cost {
        // Dense / small-vocab: bitset popcount per pair.
        let mut bits: Vec<Vec<u32>> = Vec::with_capacity(n);
        for set in tokens {
            let mut b = vec![0u32; words];
            for &t in set {
                b[(t >> 5) as usize] |= 1 << (t & 31);
            }
            bits.push(b);
        }
        for i in 0..n {
            let size = tokens[i].len();
            if size == 0 {
                continue;
            }
            let gi = group[i];
            let mut count = 0u32;
            for j in 0..n {
                if group[j] == gi {
                    continue;
                }
                let mut shared = 0usize;
                for (bi, bj) in bits[i].iter().zip(bits[j].iter()) {
                    shared += (bi & bj).count_ones() as usize;
                }
                if (shared as f64) / (size as f64) > 0.3 {
                    count += 1;
                }
            }
            out[i] = count;
        }
    } else {
        // Sparse vocab: accumulate through postings lists.
        for i in 0..n {
            let size = tokens[i].len();
            if size == 0 {
                continue;
            }
            let gi = group[i];
            let mut counts = vec![0u32; n];
            for &t in &tokens[i] {
                if let Some(list) = postings.get(&t) {
                    for &o in list {
                        counts[o as usize] += 1;
                    }
                }
            }
            let mut count = 0u32;
            for j in 0..n {
                if group[j] != gi && (counts[j] as f64) / (size as f64) > 0.3 {
                    count += 1;
                }
            }
            out[i] = count;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_input() {
        assert_eq!(shared_counts(&[], &[]), Vec::<u32>::new());
    }

    #[test]
    fn no_tokens_counts_zero() {
        assert_eq!(shared_counts(&[vec![], vec![1, 2]], &[0, 1]), vec![0, 0]);
    }

    #[test]
    fn dense_bitset_path_counts_overlap() {
        // entries 0 and 1 share 2 of 4 tokens (0.5 > 0.3); entry 2 shares 1/4.
        let tokens = vec![vec![0u32, 1, 2, 3], vec![0, 1, 9, 8], vec![2, 3, 4, 5]];
        let group = vec![0u32, 1, 2];
        let out = shared_counts(&tokens, &group);
        assert_eq!(out[0], 2); // entry 1 (2/4) and entry 2 (2/4) both exceed
        assert_eq!(out[1], 1); // only entry 0
        assert_eq!(out[2], 1); // only entry 0 (2/4)
    }

    #[test]
    fn threshold_boundary_uses_float_semantics() {
        // shared/size exactly 0.3 must NOT count (strict >), matching JS.
        let e0: Vec<u32> = (0..10).collect(); // 10 tokens
        let mut e1: Vec<u32> = vec![0, 1, 2]; // shares exactly 3 → 0.3
        e1.extend(100..110);
        let out = shared_counts(&[e0, e1], &[0, 1]);
        assert_eq!(out[0], 0); // 3/10 == 0.3 → not >
        assert_eq!(out[1], 0); // 3/13 < 0.3
    }

    #[test]
    fn duplicate_group_skipped() {
        let tokens = vec![vec![0u32, 1], vec![0, 1], vec![0, 1]];
        let group = vec![0u32, 0, 2]; // entries 0 and 1 share an id
        let out = shared_counts(&tokens, &group);
        assert_eq!(out[0], 1); // counts entry 2 only, not entry 1
        assert_eq!(out[1], 1);
        assert_eq!(out[2], 2); // both others are in a different group
    }

    #[test]
    fn sparse_inverted_path_matches_bitset() {
        // Large vocab forces inverted path; cross-check against bitset by
        // comparing counts computed both ways on the same data.
        let n = 60usize;
        let tokens: Vec<Vec<u32>> = (0..n)
            .map(|i| {
                (0..30u32)
                    .map(|k| (i as u32 * 7 + k * 13) % 5000)
                    .collect::<Vec<_>>()
            })
            .map(|mut v| {
                v.sort_unstable();
                v.dedup();
                v
            })
            .collect();
        let group: Vec<u32> = (0..n as u32).collect();
        let out = shared_counts(&tokens, &group);
        // Brute-force oracle with the same float semantics.
        for i in 0..n {
            let mut expect = 0u32;
            for j in 0..n {
                if group[j] == group[i] {
                    continue;
                }
                let shared = tokens[i].iter().filter(|t| tokens[j].contains(t)).count();
                if (shared as f64) / (tokens[i].len() as f64) > 0.3 {
                    expect += 1;
                }
            }
            assert_eq!(out[i], expect, "entry {i}");
        }
    }
}
