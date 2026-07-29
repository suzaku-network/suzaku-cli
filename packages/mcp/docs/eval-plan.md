# Monitor-bot evaluation protocol

This document describes the evaluator in `packages/mcp/eval/`, what its results
mean, and which gates must pass before spending money on a model comparison.

## Current status

The suite is **v5-draft**, not a benchmark-ready release.

- Free Tier 1 currently validates 16 questions against live Dexalot ground truth.
- Tier 2 contains 22 model questions; `--fast` selects 20.
- Free-form answer meaning is not graded by phrase matching. A clean but unreviewed
  Tier-2 answer is `PENDING_HUMAN`, never `PASS`.
- There are no canonical v5 benchmark rows.
- Historical v1/v2 rows are preserved as legacy evidence. V3/v4 and Cursor/Composer
  artifacts are exploratory and are not valid model comparisons.
- No current evidence establishes that Claude, Codex, or Composer conclusively
  outperforms another.

The next blocking evidence is a human-labelled reference corpus. Until it exists,
do not run the paid pilot or full comparison.

## What the evaluator can decide

| Layer | Decision | Failure behavior |
|---|---|---|
| Infrastructure | setup, child exit, provider/auth errors, timeout, usage, live epoch stability, complete scheduling | hard `FAIL`; stop later calls |
| Ground-truth oracle | successful parse, resolved/sane facts, trusted paths | hard `FAIL`; stop later calls |
| Tool trace | expected tools and argument subsets, forbidden tools, call budget | hard `FAIL` |
| Exact policy | known secret/deployment-pin leaks and question-specific unexplained addresses | hard `FAIL` |
| Output structure | Telegram-safe length and supported formatting | hard `FAIL` |
| Objective answer evidence | exact known values appearing in the answer | reviewer evidence only |
| Answer meaning | correctness, epoch/entity association, useful action, honest uncertainty, refusal meaning | human or calibrated semantic judge |

An exact value appearing somewhere in prose does not prove that the model used it
correctly. That is why deterministic fact matches no longer produce a semantic
`PASS`.

The two Tier-2 verdicts have separate purposes:

- `gateVerdict` is the machine-checkable wiring/policy result. A canary may use it
  to decide whether later calls are safe to schedule.
- `verdict` is answer quality. Without an attached human or calibrated-judge
  decision, a hard-gate-clean answer remains `PENDING_HUMAN`.

Any `PENDING_HUMAN` result makes a batch ineligible for a canonical manifest.
Codex traces are currently informational, so Codex runs are also ineligible for a
canonical comparison until that asymmetry is resolved.

## Evidence-backed question contracts

`eval/question-contracts.json` states, for every retained question:

- the real user purpose;
- the expected outcome in plain English;
- required and prohibited behavior;
- authoritative evidence;
- objective checks versus semantic criteria;
- conditions that invalidate the question.

`eval/evidence/dexalot-mainnet-2026-07-29.json` pins the deployment-specific
evidence behind two previously incorrect expectations:

- the selected deployment has no initialized slasher and the relevant slash paths
  are unimplemented, so the slashing item is a false-premise support question;
- another valid rewards set-amount call accumulates into the epoch total rather
  than overwriting it, so “already funded” alone does not imply a revert.

These are evaluator truth-contract corrections. Bot instruction files have not
been changed. Any future instruction correction requires a separate, bounded,
blind A/B evaluation.

## Safe commands

From `packages/mcp`:

```bash
# Full build and test suite; no model calls
pnpm test

# Free live ground-truth validation; no model calls or Tier-2 manifest
pnpm eval -- --tier 1

# No-side-effect Tier-2 call/cost plan; no provider key required
pnpm eval -- --tier 2 --fast --dry-run

# Rebuild the sanitized legacy-results inventory
node eval/replay-corpus-cli.mjs --write

# Print the calibration gate. It deliberately exits 1 while labels are absent.
pnpm eval:calibrate
```

Do not copy a paid command from old handoff notes. Metered Anthropic execution
requires both `--confirm-paid` and a positive `--max-cost-usd`; canonical
`--benchmark` additionally requires `--canary`. Those guards prevent accidental
spend, but they are not approval to run the pilot. The user must approve the exact
dry-run call count and cost ceiling first.

The parser rejects unknown, duplicated, missing-value, and incompatible flags
before build, MCP startup, provider construction, or manifest creation. A value
flag cannot consume the next `--flag` as its value.

## Runner behavior

The importable state machine is in `eval/runner.mjs`; the executable wrapper and
engine adapters remain in `eval/run-evals.mjs`.

- Target setup must be complete before the first model call.
- `--canary` executes the `operators` wiring check once per target.
- `--canary-only` runs exactly that check and stops.
- Canary results are separate from benchmark repetitions. A hard-gate canary
  failure aborts the batch; semantic uncertainty does not masquerade as a canary
  `PASS`.
- Production scheduling is interleaved as repeat → question → target.
- Oracle failure, auth failure, timeout, child death, missing usage, or epoch drift
  aborts subsequent production calls.
- A genuine quality/policy failure with otherwise complete infrastructure is
  recorded; it does not erase later questions needed to measure quality.
- Missing usage and cost remain `null`/`unknown`, never zero.
- Epoch drift aborts exploratory and benchmark runs alike.

Every argument-valid Tier-2 attempt writes an ignored local manifest under
`eval/results/manifests/`. A canonical copy under `eval/manifests/` is written only
when the whole requested benchmark is commit-ready. Argument errors and Tier 1
write no Tier-2 manifest.

## MCP stdio transport

The evaluator, both smoke scripts, and the profile integration tests share
`eval/stdio-bridge.mjs`.

On the project’s Node 22 runtime, a direct Node-to-Node child pipe dropped early
SDK handshake bytes. The bridge therefore retains native `tee` processes as
zero-storage pipe shims, wrapped with Bash `pipefail`, a Node relay, and a dedicated
process group. Tests prove that:

- a child exit code such as 7 reaches the caller as 7;
- a child signal remains a signal;
- terminating the transport kills the managed process group;
- the four MCP profiles still list/call tools over real stdio.

This is a compatibility constraint, not a second evaluator protocol.

## Human reference corpus and calibration

`eval/replay-corpus-cli.mjs` inventories ignored legacy reports without trusting
their old verdicts. The tracked inventory currently contains:

- 173 answer samples;
- 172 `UNSCORABLE` samples because the exact question snapshot or sufficient
  frozen ground truth is unavailable;
- 1 `REVIEW_REQUIRED` sample with only an old fact summary;
- 0 human-confirmed gold labels.

Raw answers, provider identities, and source filenames are excluded from the
tracked inventory. A local labelling packet can be generated with
`--include-answers`, but it is sensitive and must stay under the ignored results
area.

`eval/calibrate-corpus.mjs` compares human-confirmed labels with versioned
scorer/judge predictions. It reports:

- a full gold-versus-predicted confusion matrix;
- automation coverage, with `PENDING_HUMAN` excluded;
- exact agreement;
- critical false passes and correct-answer hard failures;
- every changed verdict across systems.

The calibration gate permits low automation coverage but permits zero critical
false passes and zero correct-answer hard failures. With no labels or predictions,
it returns `BLOCKED`; it never imports a historical evaluator verdict as gold.

Fresh, current-suite answers use the tracked procedure in
`docs/eval-continuation.md`. `eval/make-review-page.mjs` creates an anonymous,
evidence-filled Markdown page plus blank decisions; it never assigns a label.
`eval/finalize-review.mjs` accepts only explicit completed human decisions and
stores sanitized provenance. Raw answers stay ignored.

An optional LLM judge can be considered only after a useful human corpus exists.
It must be evaluated once on a held-out split with at least 90% exact agreement,
per-class metrics, and zero critical false passes. Judge calls are paid and require
their own dry run, cap, and approval.

## Reproducibility and artifacts

Canonical manifests record the revision, requested targets, suite status/version,
question/contract/evidence/prompt/scorer/runner/transport hashes, live epoch,
canaries, repetitions, nullable usage/cost, and report hashes.

Raw result reports remain ignored. Historical rows in `eval/benchmarks.md` are not
rewritten or silently rescored. Exploratory Cursor manifests are archived locally
with checksums and remain excluded from comparisons.

## Required path to a paid comparison

1. Review and sanitize eligible historical samples, then create human gold labels.
2. Run the offline calibration report and adjudicate every disagreement.
3. If a factual bot-instruction change is proposed, evaluate current versus
   corrected wording in a small blind A/B with nearby regression questions.
4. Freeze v5 inputs and hashes only after the semantic protocol passes review.
5. With explicit user approval, run a small paid pilot: one model, 4–6 questions,
   two repetitions, canary, and a fixed cap.
6. Human-review the pilot. Proceed to a three-repeat comparison only if there are
   no infrastructure-invalid runs or critical false passes.

A failure returns to the responsible layer. It does not trigger another round of
answer-specific regexes or unlimited prompt editing.

The exact continuation commands, proposed pilot questions, model-choice boundary,
and review/freeze sequence are preserved in `docs/eval-continuation.md`.

## Current offline verification

On 2026-07-29:

- all evaluator commits through the orchestration work have valid GPG signatures;
- the root and MCP builds completed and the full MCP suite passed 349/349;
- free Tier 1 passed 16/16 at epoch 52;
- the Tier-2 dry run selected 20 questions/20 calls and made no provider call;
- the calibration command correctly reported `BLOCKED` with zero labels and zero
  versioned predictions;
- no Tier-2/model call or canonical manifest was produced;
- active custom Cursor/Composer execution code is removed.

Run the full suite again after any evaluator change and report the measured count;
do not copy old PR counts.

## Live-bot audit analytics

The separate `scripts/audit-summary.mjs` analyzes production MCP audit JSONL. It is
observability, not model-quality grading:

```bash
docker compose -f packages/mcp/deploy/openclaw/docker-compose.yml exec suzaku-bot \
  cat /data/audit/mcp-audit.log |
  node packages/mcp/scripts/audit-summary.mjs --since 7d
```

Codex/OpenClaw evaluations use the live subscription bot and can consume container
resources even without per-token API billing. Treat them as maintenance-window
activities, not a free CI backend.
