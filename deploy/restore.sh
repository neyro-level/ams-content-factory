#!/usr/bin/env sh
set -eu

test -f .env || { echo '.env is required and must not be committed.' >&2; exit 1; }
backup_file=${1:?Usage: sh deploy/restore.sh backups/file.dump}
test -f "$backup_file" || { echo 'Backup file does not exist.' >&2; exit 1; }
backup_dir=$(CDPATH= cd -- "$(dirname -- "$backup_file")" && pwd)
backup_name=$(basename -- "$backup_file")
absolute_backup_file="$backup_dir/$backup_name"

docker compose --env-file .env -f docker-compose.prod.yml stop web worker nginx
RESTORE_FILE="$absolute_backup_file" docker compose --env-file .env -f docker-compose.prod.yml run --rm restore
sh deploy/migrate.sh
docker compose --env-file .env -f docker-compose.prod.yml up -d web worker nginx
