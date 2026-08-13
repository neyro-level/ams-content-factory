# Portable Production Compose Boundary

## Status

`docker-compose.prod.yml` is a verified portable release package, not the deployment topology for AMS Server.
AMS Server uses the immutable SourceCraft-main artifact, host Nginx and systemd described in
`docs/AMS_SERVER_DEPLOY_RUNBOOK.md`.

## Long-lived services

| Service  | Network exposure                            | Responsibility                                                                     |
| -------- | ------------------------------------------- | ---------------------------------------------------------------------------------- |
| `web`    | Internal only, port 3000 exposed to `nginx` | Generated Next standalone server; liveness and database-backed readiness.          |
| `worker` | Loopback-only internal readiness on 3205    | Durable pg-boss processing; healthy only after bootstrap and handler registration. |
| `nginx`  | The sole public Compose port                | Reverse proxy for `web`; no database or application secrets.                       |

## Maintenance profiles

`migrate`, `seed`, `backup` and `restore` are one-shot clients in the `maintenance` profile. They are never
started by the normal `up -d web worker nginx` release path. Migrations use `prisma migrate deploy`; the package
contains no `db push` path.

## External boundaries

- PostgreSQL 16 + pgvector is Timeweb Cloud DBaaS. There is no PostgreSQL service, data volume or database hostname
  owned by the Compose topology.
- S3/media storage is an external provider configured only by `S3_*` runtime variables. There is no local object-store
  service or fallback that could create a false production success.
- The sole Compose network is internal. `web` has no host port, and `worker` has no public port.

## Verification

Use a secured environment file outside Git and validate the rendered plan before any authorized portable use:

```sh
docker compose --env-file .env -f docker-compose.prod.yml config
docker compose --env-file .env -f docker-compose.prod.yml config --services
```

Expected normal services are `web`, `worker`, `nginx`; explicit `--profile maintenance` is required to render the
one-shot database clients. This verification does not authorize production deployment.
