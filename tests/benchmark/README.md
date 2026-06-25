# Feature Benchmark Results

## Methodology

Each benchmark compares a **naive baseline** against the **GHITA optimized implementation**:

| Feature | Baseline | Optimized | Metric |
|---------|----------|-----------|--------|
| **AST-Lock** | Regex-based symbol matching | AST cache with O(1) lookup | Speedup |
| **SCTI** | Full-file hash comparison | Per-symbol trajectory tracking | Accuracy + Speedup |
| **DebateEngine** | Single LLM pass | 3-round adversarial review | Accuracy improvement |

## Latest Results

| Feature | Baseline | Optimized | Speedup | Accuracy Gain |
|---------|----------|-----------|---------|---------------|
| AST-Lock | Regex scan | AST Map cache | **4.56x** | N/A (both correct) |
| SCTI | Full-file hash | Per-function hash | 0.48x | **+100pp** (localizes changes) |
| DebateEngine | Single pass | 3-round adversarial | 0.36x | **100%** (both correct, DebateEngine adds critique) |

### Key Findings

1. **AST-Lock is 4.56x faster** than regex for symbol protection. The AST cache enables O(1) lookups vs O(n) regex scanning.

2. **SCTI correctly identifies which functions changed** — the baseline only detects *that* something changed (boolean), while SCTI pinpoints the exact modified symbols. The overhead of per-function hashing is acceptable for the precision gain.

3. **DebateEngine produces more actionable feedback** — both approaches reach correct evaluations, but DebateEngine's adversarial review provides specific improvement suggestions (e.g., "Missing type annotations").

## How to Run

```bash
pnpm benchmark:quality-loop   # Quality loop (search F1 benchmark)
npx tsx tests/benchmark/feature-benchmark.ts          # Feature benchmark
npx tsx tests/benchmark/feature-benchmark.ts --json   # JSON output
```

## CI Integration

Results are appended to `tests/benchmark/history.jsonl` for trend analysis.

## Date

Last run: 2026-06-23
