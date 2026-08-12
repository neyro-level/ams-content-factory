# Build Status

## Current verified checkpoint

- **Current plan:** `docs/MASTER_IMPLEMENTATION_PLAN.md`.
- **Current task:** W6.1 — knowledge document list (`DONE`); next: W6.2 text/URL/file intake.
- **Last verification:** 2026-08-12: Prisma validation, lint, formatting, typecheck, 26 unit tests,
  30 integration contracts, 7 browser E2E flows and production build passed.
- **FOUNDATION:** multi-tenant model, repositories, services, provider contracts, worker/queue base,
  health endpoints, CI, immutable artifact/runbook templates, fail-closed QC persistence, suspended-
  organization denial, server-bound n8n webhook credentials, scoped tenant-owned write APIs and a
  PostgreSQL + pgvector integration gate in SourceCraft CI exist.
- **NOT_IMPLEMENTED:** knowledge intake, retry and hybrid search UI; real product workflows, live provider
  runtime, durable scheduling, end-to-end content operations and release-gate proof.
- **Remote:** private SourceCraft repository `integrator-p/ams-content-factory` is canonical `origin`;
  protected `main` and `verify` CI are active. GitHub is a non-canonical legacy mirror.

## Production boundary

```text
APPLICATION: NOT_IMPLEMENTED
DEPLOYMENT_PACKAGE: FOUNDATION
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

The AMS Server artifact pipeline is a `FOUNDATION`: it has not been built from a merged main commit or
installed on the server. It intentionally does not bypass the missing `vector` SQL object, runtime
environment file, server capacity expansion, systemd/Nginx/TLS activation or release-gate proof.

## Verification note

`docker compose config --quiet` passes. Two local Docker image builds reached the pinned Node base and package installation but were interrupted by transient npm-registry socket resets inside Docker; this is an external network condition, not a code failure. Re-run the image build in a network-stable release environment before the first deployment.
