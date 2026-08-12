#!/usr/bin/env sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 </opt/ams-platform/ams-content-factory/releases/[release]>" >&2
  exit 64
fi

release_directory="$(realpath "$1")"
releases_root="/opt/ams-platform/ams-content-factory/releases"
current_link="/opt/ams-platform/ams-content-factory/current"

case "$release_directory" in
  "$releases_root"/*) ;;
  *)
    echo "Release must be located inside $releases_root" >&2
    exit 65
    ;;
esac

test -f "$release_directory/release.json"
test -f "$release_directory/app/apps/web/.next/standalone/apps/web/server.js"
test -f "$release_directory/app/apps/worker/dist/worker.mjs"
test -f "$release_directory/app/packages/core/src/seed.ts"
test -x "$release_directory/app/node_modules/.bin/tsx"

release_sha="$(sed -n 's/.*"releaseSha":"\([0-9a-f][0-9a-f]*\)".*/\1/p' "$release_directory/release.json")"
if ! printf '%s' "$release_sha" | grep -Eq '^[0-9a-f]{40}$'; then
  echo "release.json must contain a full lowercase Git SHA" >&2
  exit 66
fi

release_kind="$(sed -n 's/.*"releaseKind":"\([a-z][a-z]*\)".*/\1/p' "$release_directory/release.json")"
if [ "$release_kind" != "production" ]; then
  echo "Only a production artifact from origin/main can be activated" >&2
  exit 67
fi

temporary_link="${current_link}.next"
rm -f "$temporary_link"
ln -s "$release_directory" "$temporary_link"
mv -Tf "$temporary_link" "$current_link"
