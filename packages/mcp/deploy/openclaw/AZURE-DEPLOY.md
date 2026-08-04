# Production runbook — Suzaku Kimi monitor

This runbook deploys only the read-only `suzaku-bot` to the existing VM.
Safe-proposer and public-cache write profiles are absent from this release; do not
install their tokens, Anthropic key, signer keys, or Safe credentials.

## Release identity

Supply the reviewed commit externally; never edit this document with a release SHA:

```bash
export DEPLOY_SHA=<reviewed-mcp-commit>
test -n "$DEPLOY_SHA"
```

The release uses:

- `moonshot/kimi-k3` as primary;
- `SUZAKU_ENABLE_ANTHROPIC_FALLBACK=false` by default;
- pinned OpenClaw and Moonshot provider `2026.7.1`;
- direct read-only Suzaku MCP (`--read-only`, 69 tools);
- the separate `openclaw-codex.json` only as an inactive option.

With fallback disabled, a Moonshot outage can stop replies and scheduled
heartbeats. Recovery is an operator decision: install an Anthropic key, set
`SUZAKU_ENABLE_ANTHROPIC_FALLBACK=true`, validate, and restart. This release does
not add a second outage monitor.

## 1. Release gates on the development host

After PR #79 has passed and merged, bind the candidate to the fetched remote:

```bash
git fetch origin mcp
export DEPLOY_SHA="$(git rev-parse origin/mcp)"
test "$(git rev-parse HEAD)" = "$DEPLOY_SHA"
git verify-commit "$DEPLOY_SHA"
git status --short

pnpm build
pnpm --dir packages/mcp test
pnpm --dir packages/mcp exec tsc --noEmit
pnpm --dir packages/mcp eval -- --tier 1
```

Build and validate the pinned image without opening Telegram polling:

```bash
cd packages/mcp/deploy/openclaw
docker compose build suzaku-bot

docker run --rm \
  -e SUZAKU_VALIDATE_ONLY=true \
  -e MOONSHOT_API_KEY=validation-moonshot \
  -e TELEGRAM_BOT_TOKEN=validation-telegram \
  -e TELEGRAM_ADMIN_USER_ID=1001 \
  -e TELEGRAM_GROUP_ID=-100123 \
  -e OPENCLAW_GATEWAY_TOKEN=validation-gateway \
  -e SUZAKU_ENABLE_ANTHROPIC_FALLBACK=false \
  -v "$PWD/openclaw.json:/home/node/.openclaw/openclaw.json.tpl:ro" \
  suzaku-monitor:local

docker run --rm \
  -e SUZAKU_VALIDATE_ONLY=true \
  -e MOONSHOT_API_KEY=validation-moonshot \
  -e ANTHROPIC_API_KEY=validation-anthropic \
  -e TELEGRAM_BOT_TOKEN=validation-telegram \
  -e TELEGRAM_ADMIN_USER_ID=1001 \
  -e TELEGRAM_GROUP_ID=-100123 \
  -e OPENCLAW_GATEWAY_TOKEN=validation-gateway \
  -e SUZAKU_ENABLE_ANTHROPIC_FALLBACK=true \
  -v "$PWD/openclaw.json:/home/node/.openclaw/openclaw.json.tpl:ro" \
  suzaku-monitor:local

docker run --rm \
  -e SUZAKU_VALIDATE_ONLY=true \
  -e TELEGRAM_BOT_TOKEN=validation-telegram \
  -e TELEGRAM_ADMIN_USER_ID=1001 \
  -e TELEGRAM_GROUP_ID=-100123 \
  -e OPENCLAW_GATEWAY_TOKEN=validation-gateway \
  -e SUZAKU_ENABLE_ANTHROPIC_FALLBACK=false \
  -v "$PWD/openclaw-codex.json:/home/node/.openclaw/openclaw.json.tpl:ro" \
  suzaku-monitor:local

test "$(MOONSHOT_API_KEY=validation-moonshot \
  TELEGRAM_BOT_TOKEN=validation-telegram \
  TELEGRAM_ADMIN_USER_ID=1001 \
  TELEGRAM_GROUP_ID=-100123 \
  OPENCLAW_GATEWAY_TOKEN=validation-gateway \
  docker compose --env-file /dev/null config --services)" = "suzaku-bot"
```

These commands validate Kimi-only, opt-in Kimi+Anthropic, and the separate Codex
template with inert placeholder credentials. They do not start a gateway or open
Telegram polling. Do not substitute the production Telegram token here.

Required results: clean tracked state, good signature, exact remote equality,
all free tests green, pinned image built, three monitor configurations accepted,
and plain Compose selecting only `suzaku-bot`.

## 2. Local Telegram acceptance

Use fresh test credentials and pinned OpenClaw 2026.7.1. Stop any other consumer
of the test Telegram token first.

1. Ask a normal operator-count question and confirm a real `suzaku__*` call.
2. Ask it to return `**test**` and `<code>**keep**</code>`. Confirm bold is
   converted outside code and remains literal inside code.
3. Ask it to repeat `KEY=/run/secrets/example`. Confirm the internal path is
   redacted.
4. Confirm logs contain `suzaku-output-guard: transformed outbound message` and
   no Telegram HTML/delivery error.
5. Ask it to run `uname -a`; confirm refusal and no shell/process call.

Stop the local bot afterward. Any failure returns to development; do not patch the
VM or loosen the guard.

## 3. Prepare the VM

Allow SSH in the Azure NSG only from the administrator CIDR. Do not publish port
18789. Install Docker from its signed Ubuntu repository:

```bash
sudo apt-get update
sudo apt-get upgrade -y
sudo apt-get install -y ca-certificates curl git gnupg ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw --force enable

sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

Create a restricted service account and fetch the exact release:

```bash
id suzaku >/dev/null 2>&1 || sudo useradd --create-home --shell /bin/bash suzaku
sudo usermod -aG docker suzaku
sudo install -d -o suzaku -g suzaku /opt/suzaku

if [ ! -d /opt/suzaku/.git ]; then
  sudo -u suzaku git clone https://github.com/suzaku-network/suzaku-cli /opt/suzaku
fi
sudo -u suzaku git -C /opt/suzaku fetch origin mcp
test "$DEPLOY_SHA" = "$(sudo -u suzaku git -C /opt/suzaku rev-parse origin/mcp)"
sudo -u suzaku git -C /opt/suzaku checkout --detach "$DEPLOY_SHA"
test "$DEPLOY_SHA" = "$(sudo -u suzaku git -C /opt/suzaku rev-parse HEAD)"
sudo -u suzaku git -C /opt/suzaku verify-commit "$DEPLOY_SHA"
```

## 4. Create fresh production configuration

Do not copy a development `.env`. Rotate the Moonshot, Telegram, gateway, and
explorer credentials before production. The explorer token previously pasted in
chat must not be reused.

```bash
cd /opt/suzaku/packages/mcp/deploy/openclaw
sudo -u suzaku install -m 0600 env.example .env
sudo -u suzaku editor .env
test "$(stat -c '%a' .env)" = "600"
```

Populate only:

- fresh `MOONSHOT_API_KEY`;
- fresh monitor `TELEGRAM_BOT_TOKEN`;
- `TELEGRAM_ADMIN_USER_ID`, `TELEGRAM_GROUP_ID`, optional `TELEGRAM_TOPIC_ID`
  (identifiers, not secrets);
- fresh `OPENCLAW_GATEWAY_TOKEN` from `openssl rand -hex 24`;
- optional rotated `ETHERSCAN_API_KEY`, or leave empty for public RPC;
- `SUZAKU_ENABLE_ANTHROPIC_FALLBACK=false`;
- `SUZAKU_MONITOR_CONFIG=./openclaw.json`;
- `SUZAKU_BOT_IMAGE=suzaku-monitor:${DEPLOY_SHA}`.

Leave `ANTHROPIC_API_KEY` and `SNOWSCAN_API_KEY` empty. Do not create a local
`secrets/` directory for this monitor release.

Build and validate without starting the gateway:

```bash
test "$(sed -n 's/^SUZAKU_BOT_IMAGE=//p' .env)" = "suzaku-monitor:${DEPLOY_SHA}"
sudo -u suzaku docker compose build suzaku-bot
sudo -u suzaku docker image inspect "suzaku-monitor:${DEPLOY_SHA}" --format '{{.Id}}'
sudo -u suzaku docker compose run --rm --no-deps -e SUZAKU_VALIDATE_ONLY=true suzaku-bot
test "$(sudo -u suzaku docker compose config --services)" = "suzaku-bot"
```

Record `DEPLOY_SHA` and the image ID in the external deployment record.

## 5. Stop the previous poller

Telegram permits one long-polling consumer per bot token. Record the old host,
service/container identity, stop it, and preserve the command output. If the old
poller cannot be identified and proven stopped, the new scheduler must remain
disabled.

Example checks on the old host:

```bash
sudo systemctl disable --now suzaku-monitor.service 2>/dev/null || true
docker ps --format '{{.Names}} {{.Status}}' | grep -i suzaku || true
```

Do not reuse its state volume. This deployment uses the fresh
`suzaku-monitor-kimi-state-v1` volume.

## 6. Install persistent startup and firewall

The unit creates the network/container, installs the egress firewall, then starts
the monitor with Compose `--wait` against `/readyz`:

```bash
cd /opt/suzaku/packages/mcp/deploy/openclaw
sudo install -m 0644 suzaku-monitor.service /etc/systemd/system/suzaku-monitor.service
sudo systemctl daemon-reload
sudo systemctl enable --now suzaku-monitor.service
sudo systemctl status --no-pager suzaku-monitor.service

sudo iptables --wait -C DOCKER-USER -i br-suzaku -j SUZAKU-EGRESS
sudo iptables --wait -S SUZAKU-EGRESS
sudo -u suzaku docker compose ps
sudo -u suzaku docker network inspect openclaw_suzaku-net --format '{{.EnableIPv6}}'
```

Stop immediately if the container is not healthy, the firewall jump is absent,
or IPv6 is enabled. `/readyz` proves gateway readiness, not Moonshot or Telegram.

## 7. Runtime acceptance

```bash
cd /opt/suzaku/packages/mcp/deploy/openclaw
sudo -u suzaku docker compose logs --tail 200 suzaku-bot
sudo -u suzaku docker compose exec suzaku-bot node openclaw.mjs config validate
sudo -u suzaku docker compose exec suzaku-bot node openclaw.mjs doctor --lint --severity-min error
sudo -u suzaku docker compose exec suzaku-bot node openclaw.mjs models status --json
sudo -u suzaku docker compose exec suzaku-bot node openclaw.mjs models status --probe --probe-provider moonshot --probe-max-tokens 8
sudo -u suzaku docker compose exec suzaku-bot node openclaw.mjs mcp probe suzaku --json
```

Acceptance requires Kimi K3 as primary, no active Anthropic fallback, 69 read-only
Suzaku tools, no write/propose/cache-write tools, no missing plugin, and no
published gateway port.

Repeat the local Telegram cases on the VM. Also confirm an unauthorized DM and an
unmentioned group message receive no reply. The live message and matching guard
log—not plugin registration alone—prove outbound protection.

Run the free Tier-1 evaluation on the exact VM checkout. It must not make model
calls.

## 8. Register exactly one scheduler job

Only after the old poller and runtime acceptance gates pass:

```bash
sudo -u suzaku docker compose exec suzaku-bot register-heartbeat-cron.sh
sudo -u suzaku docker compose exec -T suzaku-bot sh -c \
  'node openclaw.mjs cron list --json | node /usr/local/lib/suzaku/verify-heartbeat-cron.mjs'
```

The only job must use declaration `suzaku-monitor-heartbeat-v1`, agent
`heartbeat`, cadence `10 */4 * * *` UTC, and `--no-deliver`. A quiet run sends
nothing. Delivery is at-least-once: a crash after Telegram accepts a message but
before checkpointing can duplicate one digest.

Review actual usage daily for seven days:

```bash
sudo -u suzaku docker compose exec suzaku-bot node openclaw.mjs gateway usage-cost --days 1 --json
sudo -u suzaku docker compose exec suzaku-bot node openclaw.mjs gateway usage-cost --days 7 --json
```

Kimi is the only default model cost. Six scheduled turns/day means roughly 180
turns/month; the old full-eval mean gives a deliberately conservative planning
estimate near `$8.50/month`, while the restricted heartbeat should be cheaper.
Interactive traffic is additional. Anthropic and Codex cost zero while inactive.
OpenClaw has no dollar ceiling, so use Moonshot-side prepaid credit/alerts.

## 9. Reboot acceptance

```bash
sudo reboot
# reconnect
sudo systemctl is-active suzaku-monitor.service
sudo iptables --wait -C DOCKER-USER -i br-suzaku -j SUZAKU-EGRESS
cd /opt/suzaku/packages/mcp/deploy/openclaw
sudo -u suzaku docker compose ps
sudo -u suzaku docker compose exec -T suzaku-bot sh -c \
  'node openclaw.mjs cron list --json | node /usr/local/lib/suzaku/verify-heartbeat-cron.mjs'
```

Send one normal DM after reboot and confirm the resolved model and MCP call.

## 10. Backup and rollback

Back up the fresh state/audit volumes with the service stopped:

```bash
sudo systemctl stop suzaku-monitor.service
sudo install -d -m 0700 /var/backups/suzaku
cd /opt/suzaku/packages/mcp/deploy/openclaw
release_image="$(sudo -u suzaku docker compose config --images)"
test "$(printf '%s\n' "$release_image" | wc -l)" -eq 1
sudo docker image inspect "$release_image" >/dev/null
sudo docker run --rm --user 0 --entrypoint tar \
  -v suzaku-monitor-kimi-state-v1:/state:ro \
  -v suzaku-monitor-audit:/audit:ro \
  -v /var/backups/suzaku:/backup \
  "$release_image" \
  -czf /backup/state-$(date -u +%Y%m%dT%H%M%SZ).tgz -C / state audit
sudo systemctl start suzaku-monitor.service
```

Encrypt and copy backups off-host. Back up `.env` separately in the approved
secret store; never put its plaintext in Git or the volume archive.

Rollback uses the previously recorded SHA/image, not live edits:

```bash
export PREVIOUS_DEPLOY_SHA=<recorded-working-sha>
sudo systemctl stop suzaku-monitor.service
sudo -u suzaku git -C /opt/suzaku fetch origin mcp
sudo -u suzaku git -C /opt/suzaku checkout --detach "$PREVIOUS_DEPLOY_SHA"
test "$PREVIOUS_DEPLOY_SHA" = "$(sudo -u suzaku git -C /opt/suzaku rev-parse HEAD)"
sudo -u suzaku git -C /opt/suzaku verify-commit "$PREVIOUS_DEPLOY_SHA"
cd /opt/suzaku/packages/mcp/deploy/openclaw
sudo -u suzaku sed -i \
  "s|^SUZAKU_BOT_IMAGE=.*|SUZAKU_BOT_IMAGE=suzaku-monitor:${PREVIOUS_DEPLOY_SHA}|" .env
test "$(sudo -u suzaku sed -n 's/^SUZAKU_BOT_IMAGE=//p' .env)" = \
  "suzaku-monitor:${PREVIOUS_DEPLOY_SHA}"
sudo -u suzaku docker compose build suzaku-bot
rollback_image="$(sudo -u suzaku docker compose config --images)"
test "$rollback_image" = "suzaku-monitor:${PREVIOUS_DEPLOY_SHA}"
sudo docker image inspect "$rollback_image" >/dev/null
sudo -u suzaku docker compose run --rm --no-deps -e SUZAKU_VALIDATE_ONLY=true suzaku-bot
sudo systemctl start suzaku-monitor.service
```

Restore state only for an explicit state-corruption/schema incident; do not copy
legacy Codex state over the Kimi volume.

## Failure protocol

At the first failed gate:

1. stop rollout progression;
2. capture the exact command, `systemctl status`, Compose status, and the last 200
   redacted log lines;
3. record the tested SHA/image and relevant Telegram guard lines;
4. diagnose and test in the development checkout;
5. produce a new signed candidate and restart from release gates.

Never patch the VM checkout, expose the gateway, add signer-bearing profiles, loosen
tool policy, disable the guard/firewall, edit paired-device state, or install an
unpinned plugin.
