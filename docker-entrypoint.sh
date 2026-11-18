#!/bin/sh
set -e

mkdir -p /app/data

# Bind mounts of a host path created by Docker are often root:root.
# Start as root, fix ownership, then drop to nextjs before migrations/app.
if [ "$(id -u)" = "0" ]; then
  chown -R nextjs:nodejs /app/data
  exec su-exec nextjs:nodejs "$0" "$@"
fi

echo "Running database migrations..."
node scripts/migrate.mjs

export PR_FLOW_GH_LOG_DIR="${PR_FLOW_GH_LOG_DIR:-/tmp/pr-flow/logs}"
mkdir -p "$PR_FLOW_GH_LOG_DIR"

echo "Starting pr-flow on port ${PORT:-3847}..."
exec node server.js
