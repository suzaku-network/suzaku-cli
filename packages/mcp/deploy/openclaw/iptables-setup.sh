#!/usr/bin/env bash
# Network-level SSRF backstop for traffic leaving the Suzaku Docker bridge.

set -euo pipefail

BRIDGE="br-suzaku"
CHAIN="SUZAKU-EGRESS"
NEXT="${CHAIN}-NEXT"

render_rules() {
  cat <<EOF
*filter
-A ${NEXT} -d 0.0.0.0/8 -j DROP
-A ${NEXT} -d 10.0.0.0/8 -j DROP
-A ${NEXT} -d 100.64.0.0/10 -j DROP
-A ${NEXT} -d 127.0.0.0/8 -j DROP
-A ${NEXT} -d 169.254.0.0/16 -j DROP
-A ${NEXT} -d 172.16.0.0/12 -j DROP
-A ${NEXT} -d 192.0.0.0/24 -j DROP
-A ${NEXT} -d 192.0.2.0/24 -j DROP
-A ${NEXT} -d 192.88.99.0/24 -j DROP
-A ${NEXT} -d 192.168.0.0/16 -j DROP
-A ${NEXT} -d 198.18.0.0/15 -j DROP
-A ${NEXT} -d 198.51.100.0/24 -j DROP
-A ${NEXT} -d 203.0.113.0/24 -j DROP
-A ${NEXT} -d 224.0.0.0/4 -j DROP
-A ${NEXT} -d 240.0.0.0/4 -j DROP
-A ${NEXT} -j RETURN
COMMIT
EOF
}

if [[ "${1:-}" == "--render" ]]; then
  render_rules
  exit 0
fi

if ! ip link show "$BRIDGE" &>/dev/null; then
  echo "Error: bridge '$BRIDGE' does not exist; run 'docker compose create suzaku-bot' first" >&2
  exit 1
fi
if ! iptables --wait -n -L DOCKER-USER >/dev/null 2>&1; then
  echo "Error: Docker's DOCKER-USER chain is unavailable" >&2
  exit 1
fi

# Build a complete unreferenced replacement chain. A failed refresh leaves the
# currently referenced chain intact; the live path is switched only afterward.
if iptables --wait -n -L "$NEXT" >/dev/null 2>&1; then
  while iptables --wait -C DOCKER-USER -i "$BRIDGE" -j "$NEXT" >/dev/null 2>&1; do
    iptables --wait -D DOCKER-USER -i "$BRIDGE" -j "$NEXT"
  done
  iptables --wait -F "$NEXT"
  iptables --wait -X "$NEXT"
fi
iptables --wait -N "$NEXT"
render_rules | iptables-restore --wait --noflush

# Insert the complete replacement before removing the old jump: at worst both
# chains apply briefly, never neither. Renaming updates the live jump target.
iptables --wait -I DOCKER-USER 1 -i "$BRIDGE" -j "$NEXT"
while iptables --wait -C DOCKER-USER -i "$BRIDGE" -j "$CHAIN" >/dev/null 2>&1; do
  iptables --wait -D DOCKER-USER -i "$BRIDGE" -j "$CHAIN"
done
if iptables --wait -n -L "$CHAIN" >/dev/null 2>&1; then
  iptables --wait -F "$CHAIN"
  iptables --wait -X "$CHAIN"
fi
iptables --wait -E "$NEXT" "$CHAIN"

iptables --wait -C DOCKER-USER -i "$BRIDGE" -j "$CHAIN"
iptables --wait -S "$CHAIN" >/dev/null
echo "Suzaku egress firewall installed for $BRIDGE"
