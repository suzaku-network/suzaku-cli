#!/bin/sh
set -eu

# Register one of the two idempotent, epoch-aligned weekly jobs. Invoke this
# script once for each slot so production mutations remain separately
# reviewable. Dexalot middleware epochs are 302400 seconds (3.5 days) and, as
# verified from the live contract on 2026-08-10, roll over Tuesday 14:00 UTC and
# Saturday 02:00 UTC. Each job runs ten minutes after its boundary.

: "${TELEGRAM_GROUP_ID:?TELEGRAM_GROUP_ID is required}"

case "${1:-}" in
  tuesday)
    cron_expr="10 14 * * 2"
    job_name="heartbeat-tuesday"
    display_name="Suzaku Tuesday epoch heartbeat"
    declaration_key="suzaku-monitor-heartbeat-tuesday-v1"
    ;;
  saturday)
    cron_expr="10 2 * * 6"
    job_name="heartbeat-saturday"
    display_name="Suzaku Saturday epoch heartbeat"
    declaration_key="suzaku-monitor-heartbeat-saturday-v1"
    ;;
  *)
    echo "usage: register-heartbeat-cron.sh tuesday|saturday" >&2
    exit 2
    ;;
esac

destination="Telegram chat ${TELEGRAM_GROUP_ID}"
thread_instruction=""
if [ -n "${TELEGRAM_TOPIC_ID:-}" ]; then
  destination="${destination}, message thread ${TELEGRAM_TOPIC_ID}"
  thread_instruction="Always pass messageThreadId=${TELEGRAM_TOPIC_ID} to the message tool."
fi

prompt="You are the scheduled Suzaku heartbeat worker. Read memory/heartbeat-digest-state.json if it exists. Call suzaku__deployment_heartbeat with mode=alerts, middlewareAddress=0x9411307279456450ABF9B5181aA7a02271f0DC34, rewardsAddress=0x0f388C7c6201014Ad836400e9e2ebD211BDBcB00, lstWrapperAddress=0xDc1c4428F3145286f262980d36C640285c0DA403, uptimeTrackerAddress=0xd6eCFF67596cCb2D03a5F5c8219F1C27f244CEaF, and network=mainnet. If the tool fails, do not send a message and return ERROR: deployment_heartbeat failed. If its epoch differs from the checkpoint (or no checkpoint exists), call the same tool again with mode=digest, send its humanLines once to ${destination}, then write memory/heartbeat-digest-state.json with that epoch only after the send succeeds. ${thread_instruction} If the epoch has not changed and alert humanLines is non-empty, send those lines once to ${destination}. If the epoch has not changed and alert humanLines is empty, send nothing. Never calculate dates, durations, uptime, or protocol state yourself; relay the deterministic tool output. Finish with exactly posted after a successful send, or OK when no send was needed."

exec node openclaw.mjs cron create \
  --cron "$cron_expr" \
  --tz UTC \
  --exact \
  --name "$job_name" \
  --display-name "$display_name" \
  --description "Deterministic epoch-boundary monitor; posts alerts and the new-epoch digest" \
  --declaration-key "$declaration_key" \
  --agent heartbeat \
  --session isolated \
  --thinking low \
  --tools "suzaku__deployment_heartbeat,read,write,message" \
  --message "$prompt" \
  --no-deliver \
  --timeout-seconds 600
