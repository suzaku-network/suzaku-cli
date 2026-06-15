# Public Stake-Cache Cache-Bot Plan

## Summary

Add a separate cache-bot service that can execute exactly one public, value-neutral cache write: `middleware calc-operator-cache`. Leave the existing group monitor bot read-only and keyless.

v1 intentionally excludes `calc-node-stakes` / `calcAndCacheNodeStakeForAllOperators`; that path has distinct failure modes and belongs in a later phase.

## Key Changes

- CLI guard:
  - Add `--public-call` only to `middleware calc-operator-cache`.
  - Enforce mainnet software-key policy from the resolved Commander action command, not raw argv matching.
  - Permit software-key mainnet execution only for resolved command `middleware calc-operator-cache` with parsed `--public-call`.
  - Keep every other mainnet write blocked, including `calc-node-stakes`.

- MCP surface:
  - Add profile `--public-write`, mutually exclusive with `--read-only` and `--propose-only`.
  - In `--public-write`, suppress the full write surface and register reads plus exactly one destructive tool: `middleware_cache_stakes`.
  - Register `middleware_cache_stakes` from a separate public-cache registration function.
  - Startup fails if `SUZAKU_MIDDLEWARE_ADDRESS` is unset or no signer is configured/readable.
  - `SUZAKU_MIDDLEWARE_NETWORK` defaults to `mainnet`; public-write calls may only use that non-custom network and must reject `rpcUrl`.

- `middleware_cache_stakes` behavior:
  - Inputs: `middlewareAddress`, `epoch`, `collateralClass`, `network`.
  - Reject if `middlewareAddress !== SUZAKU_MIDDLEWARE_ADDRESS`, if `network !== SUZAKU_MIDDLEWARE_NETWORK`, or if custom `rpcUrl` is provided.
  - Fresh-read `middleware get-cache-status --epoch <epoch>` with `skipDedup: true`.
  - Check `cacheByClass[collateralClass]`, not `allClassesCached`.
  - If already cached, return success without sending a tx.
  - If missing, run exact CLI args: `middleware calc-operator-cache <middleware> <epoch> <class> --public-call`.
  - Fresh-read post-state with `skipDedup: true`, report tx hash and updated class status.
  - Do not swallow reverts; surface them as errors/alerts.

- Deploy as a separate cache bot:
  - Add `SOUL-cache.md`, `openclaw-cache.json`, and `mcporter-cache.json`.
  - Add `suzaku-cache-bot` service under a `cache` compose profile.
  - Use Anthropic/mcporter-only runtime like the propose bot; do not edit the Codex-native read-only monitor registration.
  - Add `cache_pk` as a Docker file secret and pass `SUZAKU_PK_FILE=/run/secrets/cache_pk`.
  - Set `SUZAKU_MCP_ALLOW_TOOLS=middleware_cache_stakes`, tight rate limits, audit env, and pinned middleware/network env.
  - Pre-stage emergency off-switch with `SUZAKU_MCP_DENY_TOOLS=middleware_cache_stakes`; remove that value only when enabling.

- Docs and ops:
  - Leave existing `SOUL.md` read-only claims intact for the monitor bot.
  - `SOUL-cache.md` states the cache bot can only cache one `(epoch, class)` for the pinned middleware and cannot perform any other write/propose action.
  - Update `EPOCHS.md` to name `middleware_cache_stakes` / `calcAndCacheStakes`, not `middleware_init_stake_update`.
  - Update MCP docs: `bypassSuggest` has two Safe-propose sites plus one public-cache execution site; the latter broadcasts a real tx and is justified only by exact command/profile constraints.
  - Add a heartbeat cache-key C-Chain AVAX balance alert using `SUZAKU_CACHE_KEY_ADDRESS` and `SUZAKU_CACHE_KEY_MIN_AVAX`.
  - README requires Telegram admin-controlled group membership and mandatory unfunded dark launch before funding the cache key.

## Test Plan

- CLI guard tests:
  - `--public-call` accepted only on `middleware calc-operator-cache`.
  - Mainnet software key succeeds only for `calc-operator-cache --public-call`.
  - Mainnet software key remains blocked for `calc-node-stakes`, middleware writes, vault writes, rewards writes, and arbitrary commands.
  - Smuggling `--public-call` as another option value or positional argument does not relax the guard.
  - Unknown-option behavior rejects `--public-call` everywhere else.

- MCP/profile tests:
  - `--public-write` registers all reads plus exactly `middleware_cache_stakes`; no other destructive tool is registered.
  - `suppressWrites` includes `publicWrite`, preventing the full funded write surface from leaking.
  - Public-write startup fails without signer or `SUZAKU_MIDDLEWARE_ADDRESS`.
  - Tool rejects non-pinned middleware, wrong network, and any `rpcUrl`.
  - Tool checks `cacheByClass[collateralClass]`, skips already-cached class, executes exact CLI args for missing class, and post-verifies with fresh reads.
  - Reverts return errors, not “already done.”

- Deploy/docs tests:
  - `mcporter-cache.json` uses `--public-write`, `SUZAKU_PK_FILE`, pinned middleware/network, allowlist, denylist off-switch, audit env, and tight rate limits.
  - `docker-compose.yml` mounts `SOUL-cache.md`, `mcporter-cache.json.tpl`, and `cache_pk` only for `suzaku-cache-bot`.
  - Existing monitor bot remains read-only/keyless.
  - Existing propose bot remains DM-only/Safe-only.
  - Instruction census passes after adding `middleware_cache_stakes`.
  - Tests assert cache SOUL contains write boundary and group-input distrust rules.

## Assumptions

- The cache key is fresh, role-less, and funded with a deliberately small AVAX balance.
- The real spam ceiling is the key balance; rate limits are secondary.
- `calcAndCacheStakes` remains the only public-write v1 function.
- `calc-node-stakes`, manual node-cache processing, and broader “cache upkeep” automation are out of scope.
