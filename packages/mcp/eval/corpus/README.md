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

Regenerate the summary with:

```sh
node eval/replay-corpus-cli.mjs --write
```

To create a local labelling packet, omit `--write` and add `--include-answers`.
That output is sensitive and must remain under the ignored results area. Old
evaluator verdicts are recorded only for auditing; they are never imported as gold
labels.
