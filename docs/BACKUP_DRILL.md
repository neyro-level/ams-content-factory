# Logical Backup Drill

## Purpose

`pnpm db:backup-drill` creates a real PostgreSQL custom-format archive from a disposable local pgvector database and
proves that `pg_restore --list` can read it. It validates more than an empty file:

```text
fresh pgvector database
→ migrate deploy
→ idempotent seed
→ pg_dump --format=custom --no-owner
→ non-empty archive
→ pg_restore --list
→ expected schema/seed entities present
→ remove temporary archive, database and volume
```

The archive is created under the operating-system temporary directory with mode `0600` on POSIX and is removed in the
script cleanup. It is not a production backup and is never written to the repository `backups/` directory.

## Run

```powershell
$nodeDir='C:\Users\Юлия Скрицкая\AppData\Roaming\fnm\node-versions\v22.13.0\installation'
& "$nodeDir\corepack.cmd" pnpm db:backup-drill
```

`BACKUP_DRILL_PORT` changes the loopback-only temporary database port (default `55442`). The drill uses its own
ephemeral Compose project and does not read `.env`, use Timeweb, invoke the portable production Compose stack or
call external providers.

## Boundary

This is W19.3 evidence only. It does not restore the archive, prove a Timeweb backup policy, create an off-server
retention copy or authorize a production release. W19.4 performs a separate restore/application-smoke drill.
