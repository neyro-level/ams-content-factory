# Build Status

## Current verified checkpoint

- **Current Wave:** 16 — Production package complete.
- **Last verification:** 2026-08-11 on a fresh temporary PostgreSQL 16 + pgvector database: all 18 migrations applied, idempotent seed completed, then Prisma validation, lint, formatting, typecheck, 4 unit tests, 18 integration contracts, 2 responsive E2E contracts and production build passed.
- **Timeweb DBaaS package verification:** Compose syntax, POSIX shell syntax for deploy/backup/restore, Prisma validation, lint, formatting, typecheck, unit, integration, E2E and production build passed on 2026-08-11. No Timeweb cluster was provisioned or contacted.
- **Completed Waves:** Waves 0, 2, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 and 16. Wave 1 foundation is implemented; its final gate remains deferred by owner direction.
- **Deployment package:** `Dockerfile`, Timeweb DBaaS-compatible `docker-compose.prod.yml`, health endpoints and logical backup/restore clients are ready. The selected AMS Server profile also has a reproducible Node 22.13 Linux artifact builder, atomic release activation helper and reviewed systemd/Nginx templates. Docker remains a portable package and artifact builder only; production runtime is host Nginx + systemd releases.
- **Remote:** private SourceCraft repository `integrator-p/ams-content-factory` is canonical `origin`; protected `main` and `verify` CI are active. Private GitHub `neyro-level/ams-content-factory` is configured as non-canonical `github-legacy` mirror.

## Production boundary

```text
APPLICATION: READY
DEPLOYMENT_PACKAGE: READY
PRODUCTION_DEPLOYMENT: BLOCKED_EXTERNAL
```

Verified on 2026-08-11: `fabrika.ams24.ru` resolves to AMS Server `5.42.100.161`; the server has host Nginx,
active Certbot and Node 22.22.2. An exact `ce7e9f7` SourceCraft-main source snapshot is present in an
inactive staging release. Its existing TLS certificate does not cover the new hostname, so traffic is not
routed to the application.

Required inputs not present in this workspace: enabled `pgvector`, TLS policy/certificate settings and
database backup schedule; final server resource expansion, runtime env secrets, Nginx vhost/certificate
issuance, S3 endpoint/bucket/credentials, Instagram and VK app credentials, and live OpenAI/HeyGen/Motion
credentials. Production deployment additionally requires explicit infrastructure confirmation from the owner.

The supplied Fabrika DBaaS endpoint and runtime user were verified from AMS Server. `pgvector` is enabled
in the Timeweb instance configuration and the PostgreSQL package is available, but its SQL object is not
installed in `default_db`: the provider-controlled database owner retains that permission. The Timeweb API
has no separate extension-install action, so database schema deployment is specifically `BLOCKED_EXTERNAL`
until Timeweb installs `vector` or supplies an extension-capable operator connection.

The AMS Server artifact pipeline is implemented in the repository but has not been built from a merged
main commit or installed on the server. It intentionally does not bypass the missing `vector` SQL object,
runtime environment file, server capacity expansion, systemd/Nginx/TLS activation or release-gate proof.

## Verification note

`docker compose config --quiet` passes. Two local Docker image builds reached the pinned Node base and package installation but were interrupted by transient npm-registry socket resets inside Docker; this is an external network condition, not a code failure. Re-run the image build in a network-stable release environment before the first deployment.
