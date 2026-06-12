#!/usr/bin/env bash
# iptables-setup.sh — Network-level SSRF backstop for the Suzaku Telegram bot
#
# Blocks outbound traffic from the br-suzaku Docker bridge to private/loopback/link-local
# address ranges. This is a defense-in-depth layer that defeats DNS rebinding attacks
# regardless of application-level URL validation bugs.
#
# Prerequisites:
#   - Docker Compose must have created the br-suzaku bridge (run `docker compose up` first)
#   - Must be run as root (or with sudo)
#
# Usage:
#   sudo bash iptables-setup.sh
#
# To verify:
#   iptables -L DOCKER-USER -v -n | grep br-suzaku
#
# To remove:
#   iptables -D DOCKER-USER -i br-suzaku -d 10.0.0.0/8 -j DROP
#   iptables -D DOCKER-USER -i br-suzaku -d 172.16.0.0/12 -j DROP
#   iptables -D DOCKER-USER -i br-suzaku -d 192.168.0.0/16 -j DROP
#   iptables -D DOCKER-USER -i br-suzaku -d 169.254.0.0/16 -j DROP
#   iptables -D DOCKER-USER -i br-suzaku -d 127.0.0.0/8 -j DROP

set -euo pipefail

BRIDGE="br-suzaku"

if ! ip link show "$BRIDGE" &>/dev/null; then
  echo "Error: Bridge '$BRIDGE' does not exist. Run 'docker compose up' first." >&2
  exit 1
fi

echo "Installing DOCKER-USER chain rules for bridge: $BRIDGE"

# RFC 1918 private ranges
iptables -I DOCKER-USER -i "$BRIDGE" -d 10.0.0.0/8 -j DROP
iptables -I DOCKER-USER -i "$BRIDGE" -d 172.16.0.0/12 -j DROP
iptables -I DOCKER-USER -i "$BRIDGE" -d 192.168.0.0/16 -j DROP

# Link-local (AWS/cloud metadata)
iptables -I DOCKER-USER -i "$BRIDGE" -d 169.254.0.0/16 -j DROP

# Loopback
iptables -I DOCKER-USER -i "$BRIDGE" -d 127.0.0.0/8 -j DROP

echo "Done. Verify with: iptables -L DOCKER-USER -v -n | grep $BRIDGE"
