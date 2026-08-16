// ==============================================================================
// ghita-codegraph — PageRank over CSR graphs + tree-sitter AST (v1.1.1)
// ==============================================================================
// The JS hot paths (repo-map computePageRank, TS-compiler-API ast-parser) are
// rebuilt native: CSR PageRank on flat TypedArrays, and tree-sitter symbol/
// import extraction (see `ast`). Both keep a JS fallback through
// @ghita/native-bridge. The core is std-only (offline cargo test); the napi
// bindings (and rayon for parallel parse) live behind the `addon` feature.
// ==============================================================================

pub mod ast;

#[cfg(feature = "addon")]
mod napi;

/// CSR graph: flat edge arrays (index-aligned).
pub struct CsrGraph {
    pub from: Vec<u32>,
    pub to: Vec<u32>,
    pub weight: Vec<f32>,
}

/// PageRank (power iteration) with dangling-mass distribution.
pub fn pagerank(
    n: usize,
    edges: &CsrGraph,
    damping: f32,
    iterations: usize,
) -> Vec<f32> {
    let mut out_weight = vec![0.0f32; n];
    for (i, &from) in edges.from.iter().enumerate() {
        out_weight[from as usize] += edges.weight.get(i).copied().unwrap_or(1.0);
    }

    let base = (1.0 - damping) / n as f32;
    let mut rank = vec![1.0 / n as f32; n];
    let mut next = vec![0.0f32; n];

    for _ in 0..iterations {
        next.fill(base);
        // Dangling mass → distributed uniformly.
        let mut dangling_mass = 0.0f32;
        for i in 0..n {
            if out_weight[i] == 0.0 {
                dangling_mass += rank[i];
            }
        }
        let dangling_share = (damping * dangling_mass) / n as f32;

        for i in 0..edges.from.len() {
            let from = edges.from[i] as usize;
            let to = edges.to[i] as usize;
            let w = edges.weight.get(i).copied().unwrap_or(1.0);
            let out = out_weight[from].max(1e-9);
            next[to] += damping * rank[from] * w / out;
        }
        if dangling_share > 0.0 {
            for next_rank in next.iter_mut() {
                *next_rank += dangling_share;
            }
        }
        rank.copy_from_slice(&next);
    }
    rank
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chain_graph(n: usize) -> CsrGraph {
        let mut from = Vec::new();
        let mut to = Vec::new();
        let mut weight = Vec::new();
        for i in 1..n {
            from.push(i as u32);
            to.push((i - 1) as u32);
            weight.push(1.0);
        }
        CsrGraph { from, to, weight }
    }

    #[test]
    fn ranks_sum_to_one() {
        let n = 1000;
        let edges = chain_graph(n);
        let rank = pagerank(n, &edges, 0.85, 30);
        let sum: f32 = rank.iter().sum();
        assert!((sum - 1.0).abs() < 0.01, "sum={sum}");
    }

    #[test]
    fn single_node_graph() {
        let rank = pagerank(1, &CsrGraph { from: vec![], to: vec![], weight: vec![] }, 0.85, 10);
        assert_eq!(rank.len(), 1);
        assert!((rank[0] - 1.0).abs() < 1e-6);
    }

    #[test]
    fn empty_graph_is_safe() {
        let rank = pagerank(0, &CsrGraph { from: vec![], to: vec![], weight: vec![] }, 0.85, 5);
        assert!(rank.is_empty());
    }

    #[test]
    fn converges_like_js_version() {
        // Chain: node 0 (root, referenced by all) must out-rank the leaf.
        let n = 200;
        let edges = chain_graph(n);
        let rank = pagerank(n, &edges, 0.85, 30);
        let mut max_idx = 0;
        for (i, v) in rank.iter().enumerate() {
            if v > &rank[max_idx] {
                max_idx = i;
            }
        }
        assert_eq!(max_idx, 0, "root node should rank highest");
    }
}
