#!/bin/sh
set -e

mkdir -p /app/data

# Bind mounts of a host path created by Docker are often root:root.
# Prefer HOST_UID/HOST_GID (host user) so ./data stays writable for `npm run dev`.
# Fallback: nextjs (1001) from the image.
APP_UID="${HOST_UID:-1001}"
APP_GID="${HOST_GID:-1001}"

if [ "$(id -u)" = "0" ]; then
  chown -R "${APP_UID}:${APP_GID}" /app/data
  exec su-exec "${APP_UID}:${APP_GID}" "$0" "$@"
fi

echo "Running database migrations..."
node scripts/migrate.mjs

export PR_FLOW_GH_LOG_DIR="${PR_FLOW_GH_LOG_DIR:-/tmp/pr-flow/logs}"
mkdir -p "$PR_FLOW_GH_LOG_DIR"

echo "Starting pr-flow on port ${PORT:-3847}..."
exec node server.js
