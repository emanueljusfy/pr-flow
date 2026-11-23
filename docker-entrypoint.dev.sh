#!/bin/sh
set -e

mkdir -p /app/data /app/node_modules /app/.next

# Bind mounts and named volumes often arrive as root. Fix ownership, then drop to the
# host UID so ./data stays writable for both `docker compose` and local `npm run dev`.
HOST_UID="${HOST_UID:-1000}"
HOST_GID="${HOST_GID:-1000}"

if [ "$(id -u)" = "0" ]; then
  chown -R "${HOST_UID}:${HOST_GID}" /app/data /app/node_modules /app/.next
  exec su-exec "${HOST_UID}:${HOST_GID}" "$0" "$@"
fi

if [ ! -f node_modules/next/package.json ]; then
  echo "Installing dependencies (first boot)..."
  npm ci
fi

export PR_FLOW_GH_LOG_DIR="${PR_FLOW_GH_LOG_DIR:-/tmp/pr-flow/logs}"
mkdir -p "$PR_FLOW_GH_LOG_DIR"

echo "Starting pr-flow (dev) on port ${PORT:-3847}..."
exec "$@"
