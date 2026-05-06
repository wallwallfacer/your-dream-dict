#!/usr/bin/env bash
# Dual-purpose:
#   1. No args  → exec `npm run dev` (this is what com.dream-dict.server LaunchAgent calls).
#   2. With arg → manage that LaunchAgent (restart / status / stop / start / logs).
set -euo pipefail

cd "$(cd "$(dirname "$0")/.." && pwd)"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

LABEL="com.dream-dict.server"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
TARGET="gui/$(id -u)/${LABEL}"
LOG_DIR="$HOME/Library/Logs/dream-dict"

case "${1:-run}" in
  run)
    # Dev mode keeps HMR on — edit code, save, the running server picks it up
    # without a rebuild or LaunchAgent restart. Higher memory than `next start`,
    # but matches the iterative workflow.
    exec /opt/homebrew/bin/npm run dev -- -p 3000 -H 0.0.0.0
    ;;
  restart)
    launchctl kickstart -k "$TARGET"
    sleep 2
    launchctl print "$TARGET" | grep -E "state|pid" | head -3
    ;;
  status)
    launchctl print "$TARGET" | grep -E "state|pid" | head -3
    ;;
  start)
    launchctl bootstrap "gui/$(id -u)" "$PLIST"
    ;;
  stop)
    launchctl bootout "gui/$(id -u)" "$PLIST"
    ;;
  logs)
    exec tail -f "$LOG_DIR/server.log" "$LOG_DIR/server.err.log"
    ;;
  *)
    echo "usage: $0 [run|restart|status|start|stop|logs]" >&2
    exit 2
    ;;
esac
