#!/usr/bin/env bash
# Watchdog for the SHARED wstunnel client LaunchAgent (com.shared.wstunnel).
#
# Why this exists: the wstunnel client keeps its process alive even after its
# WebSocket uplink to the VPS dies (broken pipe / connection reset). The client
# plist's KeepAlive only relaunches on process exit, so a wedged-but-alive
# tunnel is never auto-recovered — the public URL just returns 502 until someone
# kicks the client by hand. This script, run periodically by launchd, detects
# that state and recovers it.
#
# Recovery is two-tier (matches scripts/run-server.sh refresh_tunnel):
#   1. Public URL down  -> kick the local client, re-probe. Fixes the common
#      "tunnel wedged but VPS healthy" case within one cycle.
#   2. Still down after FAIL_THRESHOLD consecutive checks -> restart the Azure
#      VM once (the rarer full-VPS wedge), then hold a cooldown so a background
#      job can't flap-restart the shared VM.
#
# Usage:
#   tunnel-healthcheck.sh            run one health check (what launchd calls)
#   tunnel-healthcheck.sh install    write the launchd plist, load it, run once
#   tunnel-healthcheck.sh uninstall  unload + remove the launchd plist
#
# NOTE: deliberately NOT `set -e` — a failing probe is normal control flow here,
# not a fatal error.
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# --- config -----------------------------------------------------------------
# Public health URL; /login is auth-exempt. Overridable via env for ad-hoc tests.
TUNNEL_URL="${TUNNEL_URL:-https://app.xingchendahai.org/dict/login}"
TUNNEL_LABEL="com.shared.wstunnel"
TUNNEL_TARGET="gui/$(id -u)/${TUNNEL_LABEL}"
AZ_RG="DREAM-DICT-TUNNEL"
AZ_VM="tunnel-vm"

FAIL_THRESHOLD=5    # consecutive failed checks before escalating to a VM restart
COOLDOWN_SEC=900    # minimum seconds between VM restarts (anti-flap)
GRACE_SEC=8         # wait after kicking the client before re-probing

HEALTH_LABEL="com.shared.wstunnel-health"
PLIST="$HOME/Library/LaunchAgents/${HEALTH_LABEL}.plist"
LOG_DIR="$HOME/Library/Logs/wstunnel-health"
STATE_DIR="$HOME/.dream-dict/tunnel-health"
FAILS_FILE="$STATE_DIR/fails"
LAST_RESTART_FILE="$STATE_DIR/last_restart"

ts()  { date '+%Y-%m-%dT%H:%M:%S%z'; }
log() { echo "[$(ts)] $*"; }

# Healthy = HTTP 2xx/3xx (a 307 -> /login redirect counts; /login itself is 200).
# 502 (tunnel down) and 000 (unreachable/timeout) both fail.
probe() {
  local code
  code=$(curl -sS -o /dev/null -m 8 -w '%{http_code}' "$TUNNEL_URL" 2>/dev/null)
  [[ "$code" =~ ^[23][0-9][0-9]$ ]]
}

# Read a non-negative integer from a state file, defaulting to 0 (and tolerating
# a missing file or any non-digit content).
read_int() {
  local v
  v=$(cat "$1" 2>/dev/null | tr -cd '0-9')
  echo "${v:-0}"
}

# --- one health-check cycle -------------------------------------------------
run_check() {
  mkdir -p "$STATE_DIR"

  if probe; then
    echo 0 > "$FAILS_FILE"
    exit 0    # healthy: stay silent so the log only holds incidents
  fi

  local fails
  fails=$(( $(read_int "$FAILS_FILE") + 1 ))
  echo "$fails" > "$FAILS_FILE"
  log "public URL DOWN (consecutive failures: $fails) — kicking $TUNNEL_LABEL"

  launchctl kickstart -k "$TUNNEL_TARGET" 2>/dev/null \
    || launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/${TUNNEL_LABEL}.plist" 2>/dev/null \
    || log "WARN: could not kick $TUNNEL_LABEL — is the LaunchAgent installed?"

  sleep "$GRACE_SEC"

  if probe; then
    log "recovered after client kick"
    echo 0 > "$FAILS_FILE"
    exit 0
  fi

  log "still down after client kick (failures: $fails)"

  # Escalate to a VM restart only after sustained failure, never inside cooldown.
  if (( fails < FAIL_THRESHOLD )); then
    log "below escalation threshold ($fails/$FAIL_THRESHOLD) — will retry next cycle"
    exit 0
  fi
  if ! command -v az >/dev/null 2>&1; then
    log "WARN: az CLI missing — cannot restart VM; manual intervention needed"
    exit 0
  fi

  local now last_restart
  now=$(date +%s)
  last_restart=$(read_int "$LAST_RESTART_FILE")
  if (( now - last_restart < COOLDOWN_SEC )); then
    log "in VM-restart cooldown ($((now - last_restart))s < ${COOLDOWN_SEC}s) — skipping restart"
    exit 0
  fi

  log "sustained outage ($fails consecutive) — restarting Azure VM ${AZ_RG}/${AZ_VM} (--no-wait)"
  if az vm restart -g "$AZ_RG" -n "$AZ_VM" --no-wait >/dev/null 2>&1; then
    echo "$now" > "$LAST_RESTART_FILE"
    log "az vm restart issued; cooldown started. VM boot + tunnel re-establish takes ~3-5 min."
  else
    log "WARN: az vm restart failed — check 'az account show'"
  fi
  exit 0
}

# --- install / uninstall ----------------------------------------------------
script_path() { cd "$(dirname "${BASH_SOURCE[0]}")" && pwd; }

install_agent() {
  mkdir -p "$LOG_DIR" "$STATE_DIR" "$(dirname "$PLIST")"
  local self="$(script_path)/$(basename "${BASH_SOURCE[0]}")"
  cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTD/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${HEALTH_LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${self}</string>
  </array>

  <key>StartInterval</key>
  <integer>60</integer>

  <key>RunAtLoad</key>
  <true/>

  <key>StandardOutPath</key>
  <string>${LOG_DIR}/health.log</string>

  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/health.err.log</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${HOME}</string>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
PLIST_EOF
  echo "[install] wrote $PLIST -> $self"
  launchctl bootout "gui/$(id -u)/${HEALTH_LABEL}" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
  echo "[install] loaded ${HEALTH_LABEL} (StartInterval=60s)"
}

uninstall_agent() {
  launchctl bootout "gui/$(id -u)/${HEALTH_LABEL}" 2>/dev/null || true
  rm -f "$PLIST"
  echo "[uninstall] removed ${HEALTH_LABEL}"
}

case "${1:-check}" in
  check)     run_check ;;
  install)   install_agent ;;
  uninstall) uninstall_agent ;;
  *) echo "usage: $0 [check|install|uninstall]" >&2; exit 2 ;;
esac
