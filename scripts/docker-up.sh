#!/usr/bin/env bash
# Production-style compose with host UID so ./data stays writable for npm run dev.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

export DOCKER_UID="$(id -u)"
export DOCKER_GID="$(id -g)"

if [[ $# -eq 0 ]]; then
  set -- up --build
fi

exec docker compose "$@"
