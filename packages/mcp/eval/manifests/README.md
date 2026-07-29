# Eval batch manifests

Every argument-valid tier-2 attempt writes a compact local manifest to the gitignored
`eval/results/manifests/<runId>.json`, including attempts that fail during build, setup,
canary execution, model execution, or epoch validation. Argument-validation failures and
tier-1 runs do not create manifests.

A commit-ready `--benchmark` batch also writes byte-identical JSON here at
`eval/manifests/<runId>.json`. Commit that canonical manifest with its benchmark rows.
Infrastructure validity requires complete target scheduling and usage with no setup,
ground-truth call/parse/resolution defect (including every `deep-global+...` route),
timeout, auth, run, drift, abort, or completeness failure.

Suite v5 remains draft. `PENDING_HUMAN` answers and informational-only tool traces
are not commit-ready, so current unreviewed Tier-2 runs stay local even when their
infrastructure succeeds. There is no canonical v5 row until semantic decisions and
trace policy are fully reviewable.

Each manifest records the exact revision and eval-input hashes, requested engines/models,
canary/setup failures, per-question hard-gate and semantic verdicts, fact evidence,
nullable latency/token aggregates, epoch, and hashes of the local reports. Missing
usage remains `null`. A manifest intentionally does not contain full model answers
or secrets.
