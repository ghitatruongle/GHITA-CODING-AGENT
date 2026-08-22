// ==============================================================================
// ghita-codegraph — PageRank, Traversal, Cycles & Blast Radius + AST (v1.1.5-beta2)
// ==============================================================================
// Flat CSR Graph computations in native Rust:
// - PageRank (power iteration with dangling mass distribution)
// - Callers / Callees BFS graph traversal
// - Blast Radius transitive impact analysis
// - Tarjan's Strongly Connected Components (SCC) for Cycle Detection
// - Tree-sitter AST symbol & import parsing
// ==============================================================================

pub mod ast;

#[cfg(feature = "addon")]
mod napi;

use std::collections::{HashSet, VecDeque};

/// CSR graph: flat edge arrays (index-aligned).
#[derive(Debug, Clone)]
pub struct CsrGraph {
    pub from: Vec<u32>,
    pub to: Vec<u32>,
    pub weight: Vec<f32>,
}

/// Blast radius result containing directly and transitively impacted nodes.
#[derive(Debug, Clone, PartialEq)]
pub struct BlastRadiusResult {
    pub direct_dependents: Vec<u32>,
    pub transitive_dependents: Vec<u32>,
    pub total_impacted_count: usize,
    pub impact_score: f32,
}

/// PageRank (power iteration) with dangling-mass distribution.
pub fn pagerank(
    n: usize,
    edges: &CsrGraph,
    damping: f32,
    iterations: usize,
) -> Vec<f32> {
    if n == 0 {
        return Vec::new();
    }
    let mut out_weight = vec![0.0f32; n];
    for (i, &from) in edges.from.iter().enumerate() {
        if (from as usize) < n {
            out_weight[from as usize] += edges.weight.get(i).copied().unwrap_or(1.0);
        }
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
            if from < n && to < n {
                let w = edges.weight.get(i).copied().unwrap_or(1.0);
                let out = out_weight[from].max(1e-9);
                next[to] += damping * rank[from] * w / out;
            }
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

/// Find all callers (reverse dependencies) of a given node via BFS.
/// An edge `from -> to` means `from` calls/depends on `to`.
/// Callers of `target` are nodes that have paths leading to `target`.
pub fn callers(target: u32, edges: &CsrGraph, max_depth: usize) -> Vec<u32> {
    // Build reverse adjacency list: to -> Vec<from>
    let mut rev_adj: std::collections::HashMap<u32, Vec<u32>> = std::collections::HashMap::new();
    for i in 0..edges.from.len() {
        let from = edges.from[i];
        let to = edges.to[i];
        rev_adj.entry(to).or_default().push(from);
    }

    let mut visited: HashSet<u32> = HashSet::new();
    let mut queue: VecDeque<(u32, usize)> = VecDeque::new();

    visited.insert(target);
    queue.push_back((target, 0));

    let mut result: Vec<u32> = Vec::new();

    while let Some((node, depth)) = queue.pop_front() {
        if depth >= max_depth {
            continue;
        }
        if let Some(parents) = rev_adj.get(&node) {
            for &p in parents {
                if visited.insert(p) {
                    result.push(p);
                    queue.push_back((p, depth + 1));
                }
            }
        }
    }

    result
}

/// Find all callees (forward dependencies) of a given node via BFS.
/// Callees of `source` are nodes reachable from `source`.
pub fn callees(source: u32, edges: &CsrGraph, max_depth: usize) -> Vec<u32> {
    // Build forward adjacency list: from -> Vec<to>
    let mut fwd_adj: std::collections::HashMap<u32, Vec<u32>> = std::collections::HashMap::new();
    for i in 0..edges.from.len() {
        let from = edges.from[i];
        let to = edges.to[i];
        fwd_adj.entry(from).or_default().push(to);
    }

    let mut visited: HashSet<u32> = HashSet::new();
    let mut queue: VecDeque<(u32, usize)> = VecDeque::new();

    visited.insert(source);
    queue.push_back((source, 0));

    let mut result: Vec<u32> = Vec::new();

    while let Some((node, depth)) = queue.pop_front() {
        if depth >= max_depth {
            continue;
        }
        if let Some(children) = fwd_adj.get(&node) {
            for &c in children {
                if visited.insert(c) {
                    result.push(c);
                    queue.push_back((c, depth + 1));
                }
            }
        }
    }

    result
}

/// Compute blast radius (transitive caller impact) for a set of modified nodes.
pub fn blast_radius(
    modified: &[u32],
    edges: &CsrGraph,
    total_nodes: usize,
    max_depth: usize,
) -> BlastRadiusResult {
    let mut direct_set: HashSet<u32> = HashSet::new();
    let mut all_impacted_set: HashSet<u32> = HashSet::new();

    for &mod_node in modified {
        let direct = callers(mod_node, edges, 1);
        for d in direct {
            if !modified.contains(&d) {
                direct_set.insert(d);
            }
        }

        let all_callers = callers(mod_node, edges, max_depth);
        for c in all_callers {
            if !modified.contains(&c) {
                all_impacted_set.insert(c);
            }
        }
    }

    let mut direct_dependents: Vec<u32> = direct_set.into_iter().collect();
    direct_dependents.sort_unstable();

    let mut transitive_dependents: Vec<u32> = all_impacted_set
        .iter()
        .filter(|id| !direct_dependents.contains(id))
        .copied()
        .collect();
    transitive_dependents.sort_unstable();

    let total_impacted_count = direct_dependents.len() + transitive_dependents.len();
    let impact_score = if total_nodes > 0 {
        (total_impacted_count as f32) / (total_nodes as f32)
    } else {
        0.0
    };

    BlastRadiusResult {
        direct_dependents,
        transitive_dependents,
        total_impacted_count,
        impact_score,
    }
}

/// Tarjan's algorithm for finding Strongly Connected Components (cycles) in a directed graph.
pub fn find_cycles(n: usize, edges: &CsrGraph) -> Vec<Vec<u32>> {
    let mut adj: Vec<Vec<u32>> = vec![Vec::new(); n];
    for i in 0..edges.from.len() {
        let from = edges.from[i] as usize;
        let to = edges.to[i];
        if from < n {
            adj[from].push(to);
        }
    }

    struct TarjanContext<'a> {
        adj: &'a [Vec<u32>],
        indices: Vec<i32>,
        lowlinks: Vec<i32>,
        on_stack: Vec<bool>,
        stack: Vec<u32>,
        index: i32,
        sccs: Vec<Vec<u32>>,
    }

    fn strongconnect(u: u32, ctx: &mut TarjanContext) {
        let u_idx = u as usize;
        ctx.indices[u_idx] = ctx.index;
        ctx.lowlinks[u_idx] = ctx.index;
        ctx.index += 1;
        ctx.stack.push(u);
        ctx.on_stack[u_idx] = true;

        for &v in &ctx.adj[u_idx] {
            let v_idx = v as usize;
            if v_idx >= ctx.indices.len() {
                continue;
            }
            if ctx.indices[v_idx] == -1 {
                strongconnect(v, ctx);
                ctx.lowlinks[u_idx] = ctx.lowlinks[u_idx].min(ctx.lowlinks[v_idx]);
            } else if ctx.on_stack[v_idx] {
                ctx.lowlinks[u_idx] = ctx.lowlinks[u_idx].min(ctx.indices[v_idx]);
            }
        }

        if ctx.lowlinks[u_idx] == ctx.indices[u_idx] {
            let mut scc = Vec::new();
            while let Some(w) = ctx.stack.pop() {
                let w_idx = w as usize;
                ctx.on_stack[w_idx] = false;
                scc.push(w);
                if w == u {
                    break;
                }
            }
            // An SCC is a cycle if it has >1 node, or a single node with self-loop.
            if scc.len() > 1 || (scc.len() == 1 && ctx.adj[u_idx].contains(&u)) {
                scc.reverse();
                ctx.sccs.push(scc);
            }
        }
    }

    let mut ctx = TarjanContext {
        adj: &adj,
        indices: vec![-1; n],
        lowlinks: vec![-1; n],
        on_stack: vec![false; n],
        stack: Vec::new(),
        index: 0,
        sccs: Vec::new(),
    };

    for i in 0..n {
        if ctx.indices[i] == -1 {
            strongconnect(i as u32, &mut ctx);
        }
    }

    ctx.sccs
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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
    fn callers_and_callees_traversal() {
        // 2 calls 1, 1 calls 0
        let edges = CsrGraph {
            from: vec![2, 1],
            to: vec![1, 0],
            weight: vec![1.0, 1.0],
        };

        // Callers of 0: [1, 2]
        let c0 = callers(0, &edges, 5);
        assert_eq!(c0, vec![1, 2]);

        // Callees of 2: [1, 0]
        let c2 = callees(2, &edges, 5);
        assert_eq!(c2, vec![1, 0]);
    }

    #[test]
    fn blast_radius_calculation() {
        let edges = CsrGraph {
            from: vec![2, 1, 3],
            to: vec![1, 0, 1],
            weight: vec![1.0, 1.0, 1.0],
        };

        let res = blast_radius(&[0], &edges, 4, 5);
        // Direct caller of 0 is 1. Transitive callers of 0 are 2, 3.
        assert_eq!(res.direct_dependents, vec![1]);
        assert_eq!(res.transitive_dependents, vec![2, 3]);
        assert_eq!(res.total_impacted_count, 3);
        assert_eq!(res.impact_score, 0.75);
    }

    #[test]
    fn tarjan_cycle_detection() {
        // 0 -> 1 -> 2 -> 0 (cycle of 3)
        let edges = CsrGraph {
            from: vec![0, 1, 2],
            to: vec![1, 2, 0],
            weight: vec![1.0, 1.0, 1.0],
        };

        let cycles = find_cycles(3, &edges);
        assert_eq!(cycles.len(), 1);
        assert_eq!(cycles[0], vec![0, 1, 2]);
    }
}
