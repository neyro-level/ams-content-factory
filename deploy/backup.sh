#!/usr/bin/env sh
set -eu

test -f .env || { echo '.env is required and must not be committed.' >&2; exit 1; }
backup_dir=${1:-backups}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_file="$backup_dir/ams-content-factory-$timestamp.dump"
umask 077
mkdir -p "$backup_dir"

docker compose --env-file .env -f docker-compose.prod.yml run --rm -T backup > "$backup_file"
test -s "$backup_file" || { rm -f "$backup_file"; echo 'Backup is empty.' >&2; exit 1; }
printf '%s\n' "$backup_file"
