# Restore and Application Smoke Drill

## Purpose

`pnpm db:restore-drill` is the W19.4 proof that a logical archive can actually be restored and consumed by the
application. It uses two independent disposable local pgvector databases:

```text
source database → migrate deploy → seed → custom pg_dump
target clean database ← pg_restore --clean --if-exists --no-owner
→ check migrations + seeded recipes/suites
→ build/start standalone web against target
→ /api/health/ready = 200
→ remove archive, processes, containers and both volumes
```

The target database is clean before restore, so the check does not mistake source data for restored data.

## Run

```powershell
$nodeDir='C:\Users\Юлия Скрицкая\AppData\Roaming\fnm\node-versions\v22.13.0\installation'
& "$nodeDir\corepack.cmd" pnpm db:restore-drill
```

Default loopback-only ports are source PostgreSQL `55452`, target PostgreSQL `55453` and standalone web `55454`.
`RESTORE_DRILL_SOURCE_PORT`, `RESTORE_DRILL_TARGET_PORT` and `RESTORE_DRILL_WEB_PORT` can override them; they must
all be different.

## Boundary

This drill never reads `.env`, connects to Timeweb or starts production Compose. It uses disposable local credentials,
archives only in an OS temporary directory and removes its own Docker volumes. It is not permission to restore any
production database. Production restore remains a deliberate operational action governed by `docs/BACKUP_RESTORE.md`
and the Release Gate.
