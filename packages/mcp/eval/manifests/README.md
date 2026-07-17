# Eval batch manifests

Tier-2 runs write one compact JSON manifest here. Commit manifests that support a
benchmark row; raw answers and traces remain in the gitignored `eval/results/` directory.

Each manifest records the exact revision and eval-input hashes, requested and resolved
models/service tiers, canary/setup failures, per-question verdicts/fact checks, latency/token
aggregates, pricing-verification state, boundary violations, epoch, and hashes of the raw
local reports. A manifest intentionally does not contain full model answers or secrets.
