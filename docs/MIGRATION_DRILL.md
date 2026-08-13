# Clean Database Migration Drill

## Purpose

`pnpm db:migration-drill` proves the W19.2 sequence on a disposable local `pgvector/pgvector:pg16` database:

```text
fresh PostgreSQL + pgvector
→ prisma migrate deploy
→ idempotent seed
→ production web build/start
→ /api/health/ready = 200
→ remove web process and disposable database volume
```

The drill never reads `.env`, never uses Timeweb, and never starts the production Compose stack. The local database
is bound only to `127.0.0.1:55432` by default; the disposable web process uses `127.0.0.1:55433`.

## Run

Use the project Node 22.13 runtime:

```powershell
$nodeDir='C:\Users\Юлия Скрицкая\AppData\Roaming\fnm\node-versions\v22.13.0\installation'
& "$nodeDir\corepack.cmd" pnpm db:migration-drill
```

`MIGRATION_DRILL_PORT` and `MIGRATION_DRILL_WEB_PORT` can change the two loopback ports. They must be valid and
different. The script creates only the named `ams-content-factory-migration-drill` Compose project and always removes
its containers and volume in a `finally` cleanup path.

## Evidence and boundary

- It runs only `prisma migrate deploy`, never `db push`.
- The seed is the checked-in idempotent production seed; no demo tenant or provider mutation is made.
- Readiness validates the actual runtime contract and the temporary PostgreSQL connection, not a mocked response.
- A successful local drill is not Timeweb validation, backup proof, restore proof, TLS proof or authorization to
  deploy. Those gates remain separately required by W19.3–W19.6 and the Release Gate.
