#!/usr/bin/env bash
# Hot-reload PR Flow in Docker (same .env / ./data as production compose).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

# bash treats UID as readonly; use DOCKER_* for compose interpolation.
export DOCKER_UID="$(id -u)"
export DOCKER_GID="$(id -g)"

if [[ $# -eq 0 ]]; then
  set -- up --build
fi

exec docker compose -f docker-compose.dev.yml "$@"
