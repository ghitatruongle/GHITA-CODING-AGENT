//! Track 5 P5.1 micro-benchmark — proves the vocab-rebuild elimination.
//!
//! Times the OLD behavior (construct the o200k BPE on every call — what
//! `count_tokens` did before the OnceLock fix) against the NEW behavior
//! (one-time init into a static, then reuse) over the same corpus.
//!
//! Run: cargo run -p ghita-tokenizer --features addon --release --example bench_vocab

#[cfg(feature = "addon")]
fn main() {
    use std::sync::OnceLock;
    use std::time::Instant;
    use tiktoken_rs::o200k_base;

    let corpus: Vec<String> = (0..200)
        .map(|i| {
            format!(
                "Message {i}: review the diff in src/lib.rs and summarize token usage for session {i}."
            )
        })
        .collect();

    // OLD: per-call vocabulary construction (one full merge per cache miss).
    let t0 = Instant::now();
    let mut total_old = 0usize;
    for text in &corpus {
        let bpe = o200k_base().expect("failed to load o200k vocab");
        total_old += bpe.encode_with_special_tokens(text.as_str()).len();
    }
    let old_ms = t0.elapsed().as_millis();

    // NEW: single one-time init into a process-lifetime static.
    let init_start = Instant::now();
    static BPE: OnceLock<tiktoken_rs::CoreBPE> = OnceLock::new();
    let bpe = BPE.get_or_init(|| o200k_base().expect("failed to load o200k vocab"));
    let init_ms = init_start.elapsed().as_millis();

    let t2 = Instant::now();
    let mut total_new = 0usize;
    for text in &corpus {
        total_new += bpe.encode_with_special_tokens(text.as_str()).len();
    }
    let new_ms = t2.elapsed().as_millis();

    assert_eq!(total_old, total_new, "both paths must agree on counts");

    println!(
        "corpus             : {} texts (unique, all cache misses)",
        corpus.len()
    );
    println!("OLD per-call vocab : {old_ms:>6} ms");
    println!("NEW one-time init  : {init_ms:>6} ms");
    println!("NEW steady-state   : {new_ms:>6} ms");
    println!("token totals match : {total_old} == {total_new}");
    println!(
        "steady-state speedup: {:.0}x",
        old_ms as f64 / new_ms.max(1) as f64
    );
}

#[cfg(not(feature = "addon"))]
fn main() {
    eprintln!("run with --features addon");
}
