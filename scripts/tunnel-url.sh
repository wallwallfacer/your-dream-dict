#!/usr/bin/env bash
# Manage the shared wstunnel LaunchAgent that exposes both dream-dict and
# papers-cool through the Azure VPS via WebSocket over HTTPS.
#
# Usage:
#   scripts/tunnel-url.sh         # print public URL
#   scripts/tunnel-url.sh -c      # copy URL to clipboard
#   scripts/tunnel-url.sh start   # start tunnel LaunchAgent
#   scripts/tunnel-url.sh stop    # stop tunnel LaunchAgent
#   scripts/tunnel-url.sh status  # show tunnel status
set -euo pipefail

PUBLIC_URL="https://app.xingchendahai.org/dict"
LABEL="com.shared.wstunnel"
TARGET="gui/$(id -u)/${LABEL}"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"

case "${1:-url}" in
  start)
    launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || launchctl kickstart "$TARGET"
    sleep 2
    "$0" status
    ;;
  stop)
    launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null && echo "tunnel stopped" || echo "tunnel not running"
    ;;
  restart)
    launchctl kickstart -k "$TARGET"
    sleep 2
    "$0" status
    ;;
  status)
    launchctl print "$TARGET" 2>/dev/null | grep -E "state|pid" | head -3 || echo "not loaded"
    ;;
  url|-c)
    if [[ "${1:-}" == "-c" ]]; then
      printf '%s' "$PUBLIC_URL" | pbcopy
      echo "$PUBLIC_URL  (copied)"
    else
      echo "$PUBLIC_URL"
    fi
    ;;
  *)
    echo "usage: $0 [url|-c|start|stop|restart|status]" >&2
    exit 2
    ;;
esac
