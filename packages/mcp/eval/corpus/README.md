# Eval calibration corpus

`inventory.json` is a compact, sanitized inventory of local, ignored result reports.
It records corpus/checksum totals, exclusion reasons, per-question counts, and only
the hashes/metadata for samples that can advance to review. It deliberately excludes
raw answers, prompts, traces, source filenames, and provider/model names.

The inventory is conservative:

- `UNSCORABLE` means a report cannot be tied to an exact question snapshot or lacks
  enough frozen evidence. It must not be graded against today's live chain state.
- `REVIEW_REQUIRED` means only the old fact summary survives. A human must decide
  whether that summary is enough before the answer enters the gold corpus.
- `READY_FOR_SANITIZATION` means prompt and policy evidence are frozen, but the raw
  answer still needs secret/sensitive-data review before it can be committed.

Current inventory: 173 samples, of which 172 are `UNSCORABLE`, one is
`REVIEW_REQUIRED`, and none has a human-confirmed gold label. This is an explicit
calibration blocker, not a reason to reuse the old evaluator verdicts.

Regenerate the summary with:

```sh
node eval/replay-corpus-cli.mjs --write
```

To create a local labelling packet, omit `--write` and add `--include-answers`.
That output is sensitive and must remain under the ignored results area. Old
evaluator verdicts are recorded only for auditing; they are never imported as gold
labels.

Gold labels in `labels.json` require `CORRECT`, `PARTIAL`, or `WRONG`, a critical
flag, criteria met/missed, a reason, labeler provenance, and confirmed
adjudication. A `REVIEW_REQUIRED` sample also needs an explicit
`evidenceReview: "SUFFICIENT"` decision.

`predictions.json` stores only versioned scorer/judge predictions. Each system
must include a SHA-256 identifier for its frozen implementation or judge protocol.
Run:

```sh
node eval/calibrate-corpus.mjs
```

The command reports confusion matrices, coverage, disagreements, and the core
zero-critical-false-pass/zero-correct-hard-fail gate. It exits 1 with `BLOCKED`
while gold labels or predictions are absent.

For fresh current-suite runs, generate the human page with:

```sh
pnpm eval:review -- --input eval/results/RESULT.json
```

The generated page and data stay under ignored `eval/results/reviews/`. The page
shows the frozen evidence and answer but hides the model and evaluator verdict.
Every decision starts blank. After a human fills the adjacent decisions JSON,
validate it with:

```sh
pnpm eval:review:finalize -- \
  --packet eval/results/reviews/review-ID.json \
  --decisions eval/results/reviews/review-ID-decisions.json
```

Add `--write` only after the review is confirmed. That records sanitized sample
provenance in `review-samples.json`, human decisions in `labels.json`, and the
versioned evaluator result in `predictions.json`. It never parses the Markdown or
infers a label from answer wording.
