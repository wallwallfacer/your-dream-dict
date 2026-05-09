#!/usr/bin/env bash
# Print the current Tailscale Funnel public URL.
#
# Usage:
#   scripts/tunnel-url.sh         # print URL to stdout
#   scripts/tunnel-url.sh -c      # also copy to clipboard (macOS pbcopy)
#   scripts/tunnel-url.sh start   # start funnel in background
#   scripts/tunnel-url.sh stop    # stop funnel
#   scripts/tunnel-url.sh status  # show funnel status
set -euo pipefail

case "${1:-url}" in
  start)
    tailscale funnel --bg 3000
    ;;
  stop)
    tailscale funnel --https=443 off
    ;;
  status)
    tailscale funnel status
    ;;
  url|-c)
    dns_name=$(tailscale status --json | python3 -c "import sys,json; print(json.load(sys.stdin)['Self']['DNSName'].rstrip('.'))")
    if [[ -z "$dns_name" ]]; then
      echo "tailscale not connected" >&2
      exit 1
    fi
    url="https://${dns_name}"

    if [[ "${1:-}" == "-c" ]]; then
      printf '%s' "$url" | pbcopy
      echo "$url  (copied)"
    else
      echo "$url"
    fi
    ;;
  *)
    echo "usage: $0 [url|-c|start|stop|status]" >&2
    exit 2
    ;;
esac
