#!/usr/bin/env bash
# Dual-purpose:
#   1. No args (or `run`) → exec `next start` — what com.dream-dict.server
#      LaunchAgent calls. Requires `deploy` to have produced a `.next/` build.
#   2. `deploy`            → build to .next-staging, atomic swap into .next,
#                            restart the LaunchAgent. Old server keeps serving
#                            during the build; only the restart is brief downtime.
#   3. `dev`               → run `next dev` interactively (NOT under LaunchAgent).
#                            For occasional iterative UI work. Stop with Ctrl-C.
#   4. Other args          → restart / status / start / stop / logs (LaunchAgent ops).
set -euo pipefail

cd "$(cd "$(dirname "$0")/.." && pwd)"
# ~/.local/bin holds per-user CLI tools (e.g. the `claude` binary used by
# lib/ai/providers/claude.ts). Keep it ahead so providers can spawn unqualified.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

LABEL="com.dream-dict.server"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
TARGET="gui/$(id -u)/${LABEL}"
LOG_DIR="$HOME/Library/Logs/dream-dict"

NPM=/opt/homebrew/bin/npm
NEXT_BIN="$(pwd)/node_modules/.bin/next"

# Public-tunnel knobs. The wstunnel client LaunchAgent terminates the WSS
# uplink to the Azure VPS; the VPS Caddy fronts TLS and proxies through the
# tunnel back to localhost:3000. Both are independent of the prod server.
TUNNEL_URL="https://app.xingchendahai.org/dict"
TUNNEL_LABEL="com.shared.wstunnel"
TUNNEL_TARGET="gui/$(id -u)/${TUNNEL_LABEL}"
AZ_RG="DREAM-DICT-TUNNEL"
AZ_VM="tunnel-vm"

# Wait up to $1 seconds for the public URL to return any 2xx/3xx. The auth
# proxy returns 307 → /login for unauthenticated requests; that counts as up.
probe_tunnel() {
  local deadline=$(( $(date +%s) + $1 ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if curl -sS -o /dev/null -m 5 -w '%{http_code}' "$TUNNEL_URL" 2>/dev/null \
        | grep -qE '^[23][0-9][0-9]$'; then
      return 0
    fi
    sleep 5
  done
  return 1
}

# Kick the local wstunnel client; if the public URL is still unreachable,
# restart the Azure VM (the OS-level wedge we've hit before — Azure still
# reports VM running but no process answers). Idempotent and safe to call
# even when the tunnel is healthy: a kick is a few seconds of jitter.
refresh_tunnel() {
  echo "[tunnel] kicking wstunnel client (${TUNNEL_LABEL}) ..."
  launchctl kickstart -k "$TUNNEL_TARGET" 2>/dev/null \
    || launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/${TUNNEL_LABEL}.plist" 2>/dev/null \
    || echo "[tunnel] WARN: could not kick ${TUNNEL_LABEL} — is the LaunchAgent installed?" >&2

  if probe_tunnel 30; then
    echo "[tunnel] ${TUNNEL_URL} reachable"
    return 0
  fi

  if ! command -v az >/dev/null 2>&1; then
    echo "[tunnel] WARN: ${TUNNEL_URL} unreachable and 'az' CLI not installed — manual VPS restart required" >&2
    return 1
  fi

  echo "[tunnel] still unreachable — restarting Azure VM ${AZ_RG}/${AZ_VM} (~3-5 min) ..."
  if ! az vm restart -g "$AZ_RG" -n "$AZ_VM" --no-wait >/dev/null 2>&1; then
    echo "[tunnel] az vm restart failed — check 'az account show'" >&2
    return 1
  fi

  # Boot + service autostart + WSS re-establish. Generous ceiling.
  if ! probe_tunnel 360; then
    echo "[tunnel] WARN: ${TUNNEL_URL} still unreachable after VPS restart — check Azure portal / wstunnel logs" >&2
    return 1
  fi

  # VPS is back; re-kick the client to drop any stale WS frames buffered
  # against the pre-reboot Caddy.
  launchctl kickstart -k "$TUNNEL_TARGET" 2>/dev/null || true
  echo "[tunnel] ${TUNNEL_URL} reachable after VPS restart"
}

case "${1:-run}" in
  run)
    # Production mode. Reads from .next/ (last deploy). Much faster per-request
    # than `next dev` because everything is pre-built; trade-off is no HMR.
    # Code changes require `scripts/run-server.sh deploy` to take effect.
    if [ ! -d .next ]; then
      echo "[run-server] .next/ not found. Run 'scripts/run-server.sh deploy' first." >&2
      exit 1
    fi
    exec "$NPM" run start -- -p 3000 -H 0.0.0.0
    ;;

  deploy)
    # Atomic-ish swap: build to .next-staging while old .next/ keeps serving,
    # then mv into place and kick the LaunchAgent. Build failure ⇒ no restart,
    # old server keeps running untouched.
    echo "[deploy] building → .next-staging ..."
    rm -rf .next-staging
    NEXT_BUILD_STAGING=1 "$NEXT_BIN" build
    if [ ! -d .next-staging ]; then
      echo "[deploy] build did not produce .next-staging — aborting" >&2
      exit 1
    fi
    # `next start` reads .next/ which is the previous deploy. Swap atomically:
    #   .next       → .next-old   (kept until next deploy; rm next time)
    #   .next-staging → .next
    rm -rf .next-old
    if [ -d .next ]; then mv .next .next-old; fi
    mv .next-staging .next
    echo "[deploy] swap done, kicking LaunchAgent..."
    launchctl kickstart -k "$TARGET" || launchctl bootstrap "gui/$(id -u)" "$PLIST"
    # Wait for the new process to bind 3000. Any HTTP response counts as up;
    # the auth proxy responds with 307→/login which is healthy.
    local_up=0
    for i in $(seq 1 25); do
      if curl -s -o /dev/null -m 1 -w '%{http_code}' http://127.0.0.1:3000/ | grep -qE '^[2-5]'; then
        echo "[deploy] up after ${i}s"
        local_up=1
        break
      fi
      sleep 1
    done
    if [ "$local_up" != 1 ]; then
      echo "[deploy] server didn't respond within 25s — check logs" >&2
      exit 1
    fi
    refresh_tunnel \
      || echo "[deploy] WARN: tunnel refresh did not converge — local server healthy, public URL may still be down" >&2
    exit 0
    ;;

  dev)
    echo "[dev] starting next dev (NOT under LaunchAgent). Stop the LaunchAgent first to free port 3000:"
    echo "      scripts/run-server.sh stop"
    exec "$NPM" run dev -- -p 3000 -H 0.0.0.0
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
    echo "usage: $0 [run|deploy|dev|restart|status|start|stop|logs]" >&2
    exit 2
    ;;
esac
