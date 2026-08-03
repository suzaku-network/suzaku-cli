# Evaluator continuation handoff

This is the short, tracked continuation order for the monitor-bot evaluator. It
exists so a later session does not restart the scorer-hardening loop or skip the
human/model evidence gates.

## Current state

- Suite 5 remains **draft**.
- The custom Cursor/Composer runner is retired.
- Free-form English is not scored with phrases or regular expressions.
- Machine-checkable failures still fail closed.
- A clean answer remains `PENDING_HUMAN` until a person records a decision.
- Historical answer inventory: 173 samples; 172 unscorable and one requiring
  evidence review. Old verdicts were not imported as truth.
- Twelve fresh pilot answers now have confirmed human labels: 6 correct, 4
  partial, and 2 wrong. The deterministic system abstains on all 12 and passes
  the calibration safety gate with zero semantic automation.
- One exploratory paid Kimi K3 run exists (22 questions plus canary, about $1.06
  total). Nineteen answers require human review and three hit mechanical gates;
  the run predates follow-up fixes and is not a canonical benchmark.
- The bounded Kimi release acceptance is complete for candidate `09e7dd7`: the
  final six-question run passed every deterministic gate and manual semantic
  review, and the pinned OpenClaw Telegram smoke passed. The sanitized costs,
  decisions, and local-artifact hashes are recorded in
  `docs/kimi-release-evidence-2026-08-03.md`. VM acceptance remains outstanding.
- Deterministic heartbeat instructions were corrected separately so dates,
  countdowns, and uptime status come from tool output. Further instruction edits
  still require bounded evidence.
- No canonical v5 benchmark exists.

The detailed design and stop conditions are in `docs/eval-plan.md`. The original
planning note may exist locally, but this file and `docs/eval-plan.md` are the
tracked continuation source.

## What the review page is

`eval/make-review-page.mjs` converts a fresh result file into three ignored local
files under `eval/results/reviews/`:

1. a Markdown page containing the question, expected outcome, frozen
   ground-truth values, tool calls, criteria, and answer;
2. a decisions JSON in which every criterion and verdict starts blank;
3. a checksummed data packet from which the page was generated; the decisions
   remain bound to that exact underlying evidence and answer.

The page omits provider/model identity and the evaluator's predicted verdict. It
does not match words, calculate correctness, or modify the scorer.

`eval/finalize-review.mjs` accepts only explicit, complete human decisions. It
rejects missing criteria, contradictory overall verdicts, changed packet
checksums, and conflicting existing labels. With `--write`, it stores only
sanitized hashes/provenance, labels, and the evaluator prediction; raw answers
remain ignored.

## Next phase: review or bounded post-fix recheck

Kimi K3 is the active production candidate for operational testing; that is not a
claim that it won a benchmark. Do not silently turn one exploratory run into a
cross-model conclusion.

Available routes:

- Moonshot API: isolated evaluator MCP process; use `--engine kimi --model
  kimi-k3`, export `MOONSHOT_API_KEY`, and require explicit spend approval.
- Anthropic API: isolated evaluator MCP process; requires
  `ANTHROPIC_API_KEY` exported in the executing shell and explicit spend approval.
- Codex subscription: drives the live OpenClaw bot; no per-call API charge, but it
  touches production resources and requires a maintenance-window decision.

Before any call, show the user:

- route and exact model identifier;
- selected questions;
- repetitions and total model calls;
- configured prices or subscription status;
- maximum approved spend;
- whether production infrastructure is touched.

A release acceptance run—not authorization—uses exactly these six questions:

- `operators`
- `deployment-state`
- `weekly-todo`
- `can-set-rewards`
- `future-epoch-not-started`
- `network-scope-fuji-no-mainnet-leak`

Run one Kimi repetition, then human-review all six immediately:

```bash
pnpm eval -- --tier 2 --engine kimi --model kimi-k3 \
  --only operators,deployment-state,weekly-todo,can-set-rewards,future-epoch-not-started,network-scope-fuji-no-mainnet-leak \
  --repeat 1 --confirm-paid --max-cost-usd 1.00
```

If any answer is genuinely wrong, stop. If all six pass human review, run the
same command once more with `--max-cost-usd` set to `$1.00 minus repeat-1 actual
cost`. Do not add `--benchmark` or rerun afterward unless executable code,
prompts, model configuration, or MCP behavior changes.

## Review and calibration

For each generated repetition result:

```bash
pnpm eval:review -- --input eval/results/RESULT.json
```

Open the printed `eval/results/reviews/review-….md`, or present its sections in
chat. A human reviews the answer without seeing the provider/model or evaluator
verdict and records:

- every criterion as `MET` or `MISSED`;
- overall `CORRECT`, `PARTIAL`, or `WRONG`;
- whether the error is critical;
- one plain reason;
- confirmation that the answer contains no sensitive material before sanitized
  hashes/labels are tracked.

Validate without writing:

```bash
pnpm eval:review:finalize -- \
  --packet eval/results/reviews/review-….json \
  --decisions eval/results/reviews/review-…-decisions.json
```

After explicit confirmation, repeat with `--write`, inspect the three tracked
corpus files, then commit them. Finally run:

```bash
pnpm eval:calibrate
```

Interpretation:

- human `WRONG` + semantic predictor `PASS` = false pass;
- human `CORRECT` + semantic predictor `FAIL` = semantic false rejection;
- semantic predictor `PENDING_HUMAN` = safe but manual;
- trace/format/policy delivery failures are reported separately and still make
  the product answer ineligible, without being mislabelled as semantic errors;
- human labels themselves measure model answer quality.

Gate:

- zero critical false passes;
- zero correct-answer semantic failures;
- no infrastructure-invalid sample;
- every label has frozen evidence and explicit human provenance.

Low automatic coverage is acceptable. Do not add phrase rules to increase it.

## After the pilot

1. If the review/calibration gate fails, fix only the responsible hard-check or
   evidence defect and add that exact reviewed case as a regression.
2. If a bot instruction appears factually wrong, run a separate blind A/B on the
   affected question and nearby regressions. One revision maximum; do not edit
   prompts merely to make a score pass.
3. Freeze suite 5 only after the review protocol and question contracts pass.
   Record hashes in the freeze commit. Any later semantic rule change becomes v6.
4. With a separate approved budget, run the supported-model comparison with at
   least three interleaved repetitions per model and the same human protocol.
5. Add canonical manifests/benchmark rows only for complete comparable batches.
6. Update PR text, push, and confirm CI only with user authorization.

## Never do

- Never reuse old evaluator verdicts as human truth.
- Never compare an old answer with today's chain state.
- Never add answer-specific semantic phrases or regexes.
- Never choose a model, API key, production route, or spend cap implicitly.
- Never claim model superiority from the exploratory Cursor artifacts or one
  pilot.
- Never convert `PENDING_HUMAN` into `PASS` merely to produce a benchmark row.
