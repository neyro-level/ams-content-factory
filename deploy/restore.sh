#!/usr/bin/env sh
set -eu

test -f .env || { echo '.env is required and must not be committed.' >&2; exit 1; }
backup_file=${1:?Usage: sh deploy/restore.sh backups/file.dump}
test -f "$backup_file" || { echo 'Backup file does not exist.' >&2; exit 1; }
set -a
. ./.env
set +a

docker compose --env-file .env -f docker-compose.prod.yml stop web worker nginx
docker compose --env-file .env -f docker-compose.prod.yml exec -T postgres \
  pg_restore --clean --if-exists --no-owner --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  < "$backup_file"
sh deploy/migrate.sh
docker compose --env-file .env -f docker-compose.prod.yml up -d web worker nginx
