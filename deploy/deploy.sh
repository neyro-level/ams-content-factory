#!/usr/bin/env sh
set -eu

test -f .env || { echo '.env is required and must not be committed.' >&2; exit 1; }

docker compose --env-file .env -f docker-compose.prod.yml build
sh deploy/migrate.sh
sh deploy/seed.sh
docker compose --env-file .env -f docker-compose.prod.yml up -d --remove-orphans postgres web worker nginx
docker compose --env-file .env -f docker-compose.prod.yml ps
