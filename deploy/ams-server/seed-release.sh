#!/usr/bin/env sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 </opt/ams-platform/ams-content-factory/releases/[release]>" >&2
  exit 64
fi

release_directory="$(realpath "$1")/app"
test -f "$release_directory/packages/core/src/seed.ts"
test -x "$release_directory/node_modules/.bin/tsx"

if [ -z "${DATABASE_URL:-}" ]; then
  set -a
  . /etc/ams-platform/ams-content-factory.env
  set +a
fi

cd "$release_directory"
exec "$release_directory/node_modules/.bin/tsx" packages/core/src/seed.ts
