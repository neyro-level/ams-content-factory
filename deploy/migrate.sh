#!/usr/bin/env sh
set -eu

docker compose --env-file .env -f docker-compose.prod.yml run --rm migrate
