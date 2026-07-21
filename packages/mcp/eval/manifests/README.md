# Eval batch manifests

Every argument-valid tier-2 attempt writes a compact local manifest to the gitignored
`eval/results/manifests/<runId>.json`, including attempts that fail during build, setup,
canary execution, model execution, or epoch validation. Argument-validation failures and
tier-1 runs do not create manifests.

A commit-ready `--benchmark` batch also writes byte-identical JSON here at
`eval/manifests/<runId>.json`. Commit that canonical manifest with its benchmark rows. A
batch may be commit-ready even when genuine answers score PARTIAL or FAIL: infrastructure
validity requires complete scheduling and usage with no setup, timeout, auth, run, drift,
abort, or completeness failure; it does not require quality PASSes.

Each manifest records the exact revision and eval-input hashes, requested engines/models,
canary/setup failures, per-question verdicts/fact checks, nullable latency/token aggregates,
epoch, and hashes of the local reports. Missing usage remains `null`. A manifest intentionally
does not contain full model answers or secrets.
