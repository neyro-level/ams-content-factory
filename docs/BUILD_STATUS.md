# Build Status

## Current verified checkpoint

- **Current Wave:** 16 — Production package complete.
- **Last verification:** 2026-08-11 on a fresh temporary PostgreSQL 16 + pgvector database: all 18 migrations applied, idempotent seed completed, then Prisma validation, lint, formatting, typecheck, 4 unit tests, 18 integration contracts, 2 responsive E2E contracts and production build passed.
- **Completed Waves:** Waves 0, 2, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 and 16. Wave 1 foundation is implemented; its final gate remains deferred by owner direction.
- **Deployment package:** `Dockerfile`, `docker-compose.prod.yml`, Nginx configuration, idempotent migration/seed scripts, backup/restore scripts, health endpoints and runbooks are ready.
- **Remote:** private SourceCraft repository `integrator-p/ams-content-factory` is canonical `origin`; protected `main` and `verify` CI are active.

## Production boundary

```text
APPLICATION: READY
DEPLOYMENT_PACKAGE: READY
PRODUCTION_DEPLOYMENT: BLOCKED_EXTERNAL
```

Required inputs not present in this workspace: server IP/hostname, SSH user and port, server OS/Docker confirmation, final domain/TLS arrangement, production `DATABASE_URL` and SSL policy, S3 endpoint/bucket/credentials, Instagram and VK app credentials, and live OpenAI/HeyGen/Motion credentials. Production deployment additionally requires explicit infrastructure confirmation from the owner.

## Verification note

`docker compose config --quiet` passes. Two local Docker image builds reached the pinned Node base and package installation but were interrupted by transient npm-registry socket resets inside Docker; this is an external network condition, not a code failure. Re-run the image build in a network-stable release environment before the first deployment.
