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

## Preconditions for activation

1. Owner confirms the production release window and adequate AMS Server capacity.
2. Exact commit is merged into SourceCraft `main` and has green `verify` or equivalent operator gates.
3. Timeweb DBaaS connection is supplied securely. From AMS Server verify the TLS connection,
   least-privilege database user and installed `vector` SQL object (not merely an available package)
   without printing the connection string. On a managed cluster, `CREATE EXTENSION vector` can require a
   provider-controlled database owner; do not compensate by granting superuser to the application role.
4. Create the root-owned env file from `.env.example`; set `APP_URL` to
   `https://fabrika.ams24.ru`, restrict file permissions and never copy it into Git or a release.
5. Build and audit an immutable Linux artifact for the exact main SHA; do not build from a feature branch.
6. Create systemd units, an Nginx vhost and a Certbot certificate only after the previous checks pass.

## Activation and proof

1. Run `prisma migrate deploy` and idempotent seed against the verified DBaaS.
2. Start the worker and web service; web must bind only to localhost.
3. Validate Nginx configuration, then enable the vhost and issue or renew TLS.
4. Switch `current` atomically, reload Nginx and run post-release proof:
   - `GET /api/health/live` returns 200;
   - `GET /api/health/ready` returns 200 and confirms database readiness;
   - homepage, CSS and static assets return 200 through HTTPS;
   - deployed release SHA and time are written to `WORKLOG.md`.

## Rollback

Do not undo Prisma migrations automatically. Stop traffic, create a logical backup, point `current` to the
previous verified release, restart only this project's services, reload validated Nginx and repeat smoke
checks. Restore Timeweb DBaaS only through `docs/BACKUP_RESTORE.md` when schema compatibility requires it.
