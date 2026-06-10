# MCP Architecture Review — June 2026

Scope: the `@suzaku-network/mcp` package after rebasing the `mcp` branch onto CLI v1.1.1 (50 upstream commits), with the Dexalot mainnet deployment as the primary target and the OpenClaw Telegram bot as the primary delivery channel. Anchored on two real Dexalot maintainer incidents (`examples-issues.md`): the epoch-workflow uncertainty and the epoch-35 `claim-undistributed` confusion.

## 1. What changed in this pass

### Rebase + compatibility audit

The MCP was written against a February 2026 CLI; main moved 50 commits (v1.0.3 → v1.1.1). A systematic audit (174 tool-invocation checks, every finding adversarially verified) confirmed **58 real breakages**:

- **All 22 `staking_vault_*` tools** — vault address moved from positional arg to `--staking-vault-address`, and all seven `*-info` subcommands were renamed `info-*`.
- **All 9 `kite_*` tools** — same positional→flag migration (`--staking-manager-address`) plus changed positionals on `complete-delegator-*`.
- Renames: `weight-watcher` → `weight-sync`, `account-info` → `info-account`, `kitetestnet` → `kiteaitestnet` (+ new `kiteai` mainnet).
- `l1-registry register` lost a positional (balancer now derived on-chain); two stale `poa` flags (`--add-node-tx`, `--skip-wait-api`).
- Three vault read tools crashed when `account` was omitted (CLI falls back to a signer that the MCP never injects) — `account` is now required on read tools.
- **Cross-cutting:** the CLI now writes its `--json` error payload to **stderr**, which the runner never parsed (all structured error reporting was lost); `PK_PCHAIN` env was injected by the runner but was never read by any CLI version — see the known limitation below.

All 58 are fixed. The only CLI-side changes kept in scope are additive `logger.addData` calls so the affected commands emit machine-readable `--json` output (info-account, balancer security modules, validator NotRegistered status, vault active-stake reads, opt-in checks, uptime/vault-manager/operator reads).

Two CLI behavior changes were identified but deliberately left OUT of this branch (proposed separately as upstream issues):

1. **`PK_PCHAIN` env support** — until the CLI honors it, `SUZAKU_PCHAIN_PK` is a no-op: the CLI's `--pchain-tx-private-key` falls back to the main signing key. Two-phase `complete_*` tools therefore sign P-Chain transactions with the main key. The MCP keeps injecting `PK_PCHAIN` (forward-compatible, harmless today).
2. **`bigintReplacer` precision** — the CLI's `--json` mode converts bigints with `Number()`, so values above 2^53 (all wei amounts) lose precision (e.g. `1.132030442034929e+25`). Fields the MCP relies on are emitted via `.toString()` and are unaffected; raw `receipt.result` values are not exact.

### Verification performed

- 102 unit tests green, both packages typecheck clean.
- **Live mainnet**: 11/11 read tools against the Dexalot deployment via real MCP stdio (composites included: `epoch_status`, `epoch_rewards_report`, `operator_dashboard`, `discover_network`).
- **Anvil mainnet fork**: write path proven — `operator_registry_register`, `opt_in_l1`, `opt_in_vault` executed with mined receipts and decoded events; `vault_deposit` and `rewards_distribute` surfaced correct contract reverts (`Vault__NotWhitelistedDepositor`, `AccessControlUnauthorizedAccount`) as structured errors. Two operational facts learned: the Dexalot vault is whitelist-gated (users go through the LSTWrapper), and the CLI's default `--wait 2` hangs on instant-mining chains (now overridable via `SUZAKU_MCP_WAIT`).

### New surface (36 tools → 121 total, 65R/56W)

| Group | Added | Why |
|---|---|---|
| rewards | 7 reads + `set_amount`, `claim_undistributed` + **`rewards_epoch_diagnosis`** | The entire Dexalot rewards lifecycle was unreachable. The diagnosis composite answers "why is claim-undistributed weird for epoch N" directly. |
| lst-wrapper (new) | 6 reads + deposit/redeem/**harvest** | wsALOT is the actual user flow (vault deposits are whitelisted); harvest is step 5 of the weekly workflow. |
| vault-helper (new) | 4 reads | Pending withdrawals + claimable rewards — the questions stakers actually ask. |
| uptime (new) | report-validator, compute-operator-uptime, get-validation-uptime-message | Steps 1–2 of the weekly workflow. |
| middleware / opt-in / vault / kite | info, used-stake-per-epoch, check-opt-in ×2, active-stake ×2, total-supply-at-epoch, kite info ×3 | Coverage of v1.1.1 additions ("for dexalot" commands included). |

Plus a new CLI command, **`rewards get-amount-set-events <rewardsAddress> <epoch> --middleware <addr>`**, which chunk-scans `RewardsAmountSet` logs and attributes every set-amount tx to the epoch. Validated live against the real incident — it returned exactly the three txs the team found manually on Snowscan (`0xf631…`, `0x75ab…`, `0xb68a…`, summing to 27,914.8), and `rewards_epoch_diagnosis` now reports: *"3 set-amount transactions affect epoch 35 and their amounts accumulate on-chain…"*.

A fourth MCP prompt, **`epoch-rewards-runbook`**, encodes the weekly sequence (uptime → compute → **diagnose first** → set-amount → distribute → harvest) with the accumulation warning built in — the guided workflow whose absence caused both incidents.

### Runner reliability fixes

- Structured error payloads recovered from stderr (`tryParseJsonBlock`).
- `kiteai` would have auto-executed writes (testnet was defined as "anything ≠ mainnet"); now an explicit testnet allowlist `{fuji, anvil, kiteaitestnet}` — unknown networks get mainnet-safe handling.
- Timeouts now say "timed out after Xms" instead of "exited with code null".
- Writes no longer populate the dedup cache.
- Redaction narrowed: exact configured secrets (`SUZAKU_PK`/`SUZAKU_PCHAIN_PK`) + bare 64-hex only — tx hashes, role hashes, and validation IDs are no longer destroyed in error messages.

## 2. Architecture assessment

The core design is sound and worth keeping: subprocess-wrapping the CLI gives one canonical implementation of signing, ABI validation, and Safe support; the five-layer write guard with mainnet-suggest-by-default is the right safety posture for an LLM-facing surface; the composite tools are what make the server useful to non-experts.

The structural weakness exposed by this rebase: **the tool surface is hand-synchronized with a fast-moving CLI and nothing detects drift.** 50 CLI commits silently broke 36% of the tools; only a manual audit found them.

## 3. Recommendations (not yet implemented)

### High priority

1. **CLI-drift regression test** — a `test:cli-compat` suite that extracts every tool's command path and runs `node bin/cli.js <path> --help` (offline, seconds), asserting exit 0 and that every flag the tool passes appears in the help text. This single test would have caught ~50 of the 58 breakages at CI time. The natural follow-up is generating the arg tables from one declarative source.
2. **Composite-tool result mapping** — `middleware.ts` composites slice flat `Promise.all` arrays by hand-computed offsets (17 sites). One added read shifts every index. Replace with named-key maps (`promiseMap({activeNodes: …, available: …})`). Same files: under concurrency saturation, fan-out sub-calls beyond `MAX_CONCURRENT` fail into `_warnings` and produce silently partial dashboards — queue (semaphore) instead of reject, and add a top-level `_degraded: true` flag.
3. **SDK posture** — `elicitInput` and `sendLoggingMessage` are reached through `as unknown as` casts into SDK internals; a minor SDK bump can silently turn mainnet confirmations into failures and drop all logging. Add fail-fast startup assertions now; plan the SDK upgrade (current pin 1.12.0) to get typed elicitation, `outputSchema` (currently `structuredContent` is emitted without one, which strict clients may ignore), resource templates, and completions.
4. **Unbounded subprocess buffers** — stdout/stderr accumulate without cap; a runaway composite can OOM the server. Cap at a few MB with truncation markers.

### Medium

- **Units everywhere**: new tools state units explicitly; older read tools still return bare wei strings with no annotation. Adopt `_units` fields (or `… (raw wei, 18 decimals)` descriptions) uniformly — SOUL.md's "format nicely" instruction makes the LLM guess.
- **Discoverability of auxiliary contracts**: UptimeTracker and Rewards addresses aren't discoverable via `discover_network`; add them to the L1Registry metadata path or a static Dexalot address resource (SOUL.md should carry the address table for the bot).
- **Param validation hardening**: P-Chain owner address arrays and `SUZAKU_SECRET_NAME`/`SUZAKU_SAFE_ADDRESS` env values are interpolated into args without format validation (no shell, but Commander option-injection is possible) — validate as address/`^[\w-]+$`.
- **Write boilerplate**: the requireSigner/guard/runCli/formatResult quartet repeats 56×; a `runWrite()` helper makes the next guard layer a one-line change.
- **Truncation visibility**: `MAX_OPERATORS` truncation should set `_truncated: true` (and eventually a cursor), not just a buried warning string.
- **Dedup cache** assumes a single-operator deployment (no signer identity in the key) — document, or key by signer hash.

### Low

- Network-enum completions; `z.enum` in prompt args; shell-quoting the suggest-mode command string; `openWorldHint: false` on local EVM writes; optional StreamableHTTP transport for multi-client setups.

## 4. OpenClaw deployment (researched June 2026, primary sources)

Applied:

- **Image pinned** `ghcr.io/openclaw/openclaw:2026.6.5@sha256:037f49…` (was `:latest`). This is a security floor, not housekeeping: CVE-2026-28466 (approval bypass, fixed 2026.2.14), CVE-2026-43584 (env denylist, 2026.4.10), the "Claw Chain" sandbox advisories (2026.4.22), and a 10-advisory May batch all landed since the config was written. `mcporter` pinned to 0.12.0. Build stage bumped to node:24-slim (matches upstream runtime).
- **`contextVisibility: "allowlist"`** on the Telegram channel (added 2026.4.5) — quoted/thread context from non-allowlisted group members no longer reaches the model; the single highest-value prompt-injection reduction available.
- **`cron.enabled: true`** + README recipe for scheduled epoch alerts to the group (`openclaw cron create … --channel telegram`) — proactive epoch-boundary reminders fit the Dexalot workflow directly.
- README: upgrade procedure (staging test, `doctor`, re-verify `requireMention` after restarts — known upstream persistence bug, closed "not planned").

Explicitly *not* adopted after verification: native `mcp.servers` config (does not exist in core — mcporter remains the correct bridge), native env-var interpolation in `openclaw.json` (unconfirmed; the `sed` entrypoint stays), `read_only: true` container guidance (refuted upstream). Model `anthropic/claude-sonnet-4-6` remains current and appropriate.

## 5. Open questions for the team

- Should `middleware_epoch_rewards_report` absorb the diagnosis logic (one tool fewer), or stay separate (report vs. forensics)? Current choice: separate.
- `uptime_report_validator` accepts private L1 RPC URLs (deliberate carve-out from the SSRF blocklist, since L1 RPCs are often internal). Confirm this is acceptable for the bot deployment, or gate the carve-out behind an env flag.
- The event-scan command's default block range is epoch−2 → latest (~10 days, ~200 chunked `eth_getLogs`). Fine on api.avax.network today; if it becomes slow, add a Snowscan-API fast path like `middleware node-logs` uses.
