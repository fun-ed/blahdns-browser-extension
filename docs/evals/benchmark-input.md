# Evaluation input: compiler cost

Date: 2026-11-09.

Compare the actual workload with the cost of adding another engine. Use the pinned bundled HaGeZi Light and Content Farm Terminator domain lists. Warm the compiler once, run 20 iterations, and record median and p95 wall time, input bytes, DNR rule count, JSON bytes, and full-process RSS. Run with `mise exec -- bun run benchmark`.

This evaluation measures Bun executing JavaScript list compilation. Browser-native DNR owns request matching. It does not compare Rust, WASM, Node.js, or browser JavaScript execution speed. Node.js was considered only as development tooling and was replaced by Bun at the owner's request.

Accept a JavaScript compiler if the measured cost is reasonable for explicit settings updates and background startup. Do not add Rust/WASM solely because it is faster on unrelated workloads. Add it only when a repeatable profile identifies a bottleneck and a browser benchmark shows that the extra engine improves that bottleneck without violating MV3 constraints.

Package size is recorded by `mise exec -- bun run build`. Browser startup and per-request latency need separate measurements. No performance claim can be inferred from the compiler test alone.
