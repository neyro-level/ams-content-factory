#!/usr/bin/env sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <artifact-image> <empty-output-directory>" >&2
  exit 64
fi

image="$1"
output_directory="$2"

if [ -e "$output_directory" ] && [ "$(find "$output_directory" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
  echo "Output directory must be empty: $output_directory" >&2
  exit 65
fi

mkdir -p "$output_directory"
container_id="$(docker create "$image")"
cleanup() {
  docker rm -f "$container_id" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker cp "$container_id:/release/." "$output_directory"
test -f "$output_directory/release.json"
test -f "$output_directory/app/apps/web/.next/standalone/apps/web/server.js"
test -f "$output_directory/app/apps/worker/dist/worker.mjs"
test -f "$output_directory/app/packages/core/src/seed.ts"
test -x "$output_directory/app/node_modules/.bin/tsx"
