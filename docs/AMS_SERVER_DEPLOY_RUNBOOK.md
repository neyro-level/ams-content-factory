# AMS Server deploy runbook

## Scope

This runbook is the canonical production procedure for AMS Content Factory on AMS Server.
It targets `https://fabrika.ams24.ru`, uses SourceCraft `main` as the only code source and keeps
Timeweb Cloud DBaaS as the only production PostgreSQL + pgvector runtime.

## Verified preparation

- DNS: `fabrika.ams24.ru` resolves to `5.42.100.161`.
- Server layout: `/opt/ams-platform/ams-content-factory/{releases,shared}` and
  `/var/log/ams-platform/ams-content-factory`.
- Source snapshot: inactive `20260811-ce7e9f7-source`, checksum verified during transfer.
- Existing server services and host Nginx are not modified by this preparation.

The snapshot is not an active release and must not be linked as `current`: it has no Linux production
artifact, no server env and no verified database schema.

## Runtime contract

```text
/opt/ams-platform/ams-content-factory/
  releases/[immutable-release]/
  shared/
  current -> releases/[immutable-release]

/etc/ams-platform/ams-content-factory.env
/var/log/ams-platform/ams-content-factory/

systemd web: 127.0.0.1:[reserved-port]
systemd worker: no public port
Nginx: fabrika.ams24.ru -> systemd web
```

The final internal port is reserved only after checking `ss -tlnp` immediately before creating the
systemd unit. Never bind the app, Docker or a development server directly to ports 80/443.

## Immutable Linux artifact

Docker builds the artifact on a trusted Linux-capable builder only; it is not a production runtime on
AMS Server. `deploy/ams-server/Dockerfile` builds the exact workspace with Node 22.13, Prisma Client,
the Next standalone web output and the bundled Node 22 worker. It retains the Prisma CLI, schema and
migrations so `migrate deploy` and the idempotent seed run from that same immutable release.

Only after a SourceCraft `main` commit is green, use a clean checkout of that exact `origin/main` commit:

```sh
git fetch origin
git switch --detach origin/main
ARTIFACT_IMAGE=ams-content-factory:[full-main-sha] pnpm release:artifact:build
sh deploy/ams-server/extract-artifact.sh ams-content-factory:[full-main-sha] ./release-[full-main-sha]
tar -C ./release-[full-main-sha] -czf ams-content-factory-[full-main-sha].tar.gz .
sha256sum ams-content-factory-[full-main-sha].tar.gz
```

On AMS Server, extract the archive under `/opt/ams-platform/ams-content-factory/releases/[full-main-sha]`.
It must contain `release.json`, `app/apps/web/.next/standalone/apps/web/server.js`,
`app/apps/worker/dist/worker.mjs` and the checked-in idempotent seed plus its explicit runtime. Development-only
dependencies are pruned after the build; `prisma` and `tsx` remain solely for controlled migration/seed
operations. `activate-release.sh` switches the `current` link atomically, but never starts services or changes Nginx.

The current verified release payload is approximately 861 MB before archive compression. Confirm adequate
free disk space for the incoming release and rollback release before transfer; do not let inactive releases
consume capacity reserved for the running services and database recovery artifacts.

The systemd templates use internal port `3204`. Reconfirm it with `ss -tlnp` at activation time; if it is
occupied, change the port consistently in both unit and Nginx templates through a normal SourceCraft PR
before creating server files.

For local builder diagnostics only, `ALLOW_DIRTY_ARTIFACT_TEST=1` produces a `releaseKind: test` manifest.
`activate-release.sh` rejects it, so a dirty tree or feature branch cannot accidentally reach production.

## Preconditions for activation

1. Owner confirms the production release window and adequate AMS Server capacity.
2. Exact commit is merged into SourceCraft `main` and has green `verify` or equivalent operator gates.
3. Timeweb DBaaS connection is supplied securely. From AMS Server verify the TLS connection,
   least-privilege database user and installed `vector` SQL object (not merely an available package)
   without printing the connection string. On a managed cluster, `CREATE EXTENSION vector` can require a
   provider-controlled database owner; do not compensate by granting superuser to the application role.
4. Create the root-owned env file from `.env.example`; set `APP_URL` to
   `https://fabrika.ams24.ru`, restrict file permissions and never copy it into Git or a release.
5. Build, checksum and audit the immutable Linux artifact for the exact main SHA; do not build or activate
   a feature branch.
6. Create the root-owned env file and copy reviewed systemd/Nginx templates. Install the bootstrap HTTP
   vhost, obtain the certificate through its ACME webroot, then install the HTTPS vhost. Validate every
   Nginx change before reload.

## Activation and proof

1. With the new release directory as the argument, run `deploy/ams-server/migrate-release.sh` and then
   `deploy/ams-server/seed-release.sh` against the verified DBaaS. Do not use `db push`.
2. Use `deploy/ams-server/activate-release.sh` for the atomic `current` switch, then start the worker and
   web service; web must bind only to localhost.
3. Validate Nginx configuration, then enable the HTTPS vhost and reload Nginx.
4. Run post-release proof:
   - `GET /api/health/live` returns 200;
   - `GET /api/health/ready` returns 200 and confirms database readiness;
   - homepage, CSS and static assets return 200 through HTTPS;
   - deployed release SHA and time are written to `WORKLOG.md`.

## Rollback

Do not undo Prisma migrations automatically. Stop traffic, create a logical backup, point `current` to the
previous verified release, restart only this project's services, reload validated Nginx and repeat smoke
checks. Restore Timeweb DBaaS only through `docs/BACKUP_RESTORE.md` when schema compatibility requires it.
