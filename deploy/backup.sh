#!/usr/bin/env sh
set -eu

test -f .env || { echo '.env is required and must not be committed.' >&2; exit 1; }
backup_dir=${1:-backups}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$backup_dir"
set -a
. ./.env
set +a

docker compose --env-file .env -f docker-compose.prod.yml exec -T postgres \
  pg_dump --format=custom --no-owner --username "$POSTGRES_USER" "$POSTGRES_DB" \
  > "$backup_dir/ams-content-factory-$timestamp.dump"
