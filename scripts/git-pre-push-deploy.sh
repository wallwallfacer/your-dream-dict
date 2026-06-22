#!/usr/bin/env bash
# git pre-push hook: deploy on push to master.
#
# Install:  ln -sf ../../scripts/git-pre-push-deploy.sh .git/hooks/pre-push
# Skip once: git push --no-verify
#
# Only fires when pushing master to `origin`. Build failure ⇒ push is aborted,
# old server keeps running (deploy script swaps atomically).
set -euo pipefail

REMOTE="${1:-}"
[ "$REMOTE" = "origin" ] || exit 0

while read -r local_ref _ remote_ref _; do
  case "$remote_ref" in
    refs/heads/master) ;;
    *) continue ;;
  esac
  # Only deploy if the commits being pushed are the current HEAD.
  HEAD_SHA="$(git rev-parse HEAD)"
  PUSH_SHA="$(git rev-parse "$local_ref")"
  [ "$HEAD_SHA" = "$PUSH_SHA" ] || continue

  REPO_ROOT="$(git rev-parse --show-toplevel)"
  echo "[pre-push] deploying via scripts/run-server.sh deploy ..."
  exec "$REPO_ROOT/scripts/run-server.sh" deploy
done
