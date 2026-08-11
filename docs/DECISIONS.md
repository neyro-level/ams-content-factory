# Architectural decisions

## ADR-001 — Product identity and delayed remote inception

- **Context:** The approved product was initially called AMS Content OS and the workspace has no Git remote.
- **Decision:** Product and future private repository are named **AMS Content Factory** / `ams-content-factory`. Preserve Master Plan contents, but use the new product name in implementation artifacts. Create SourceCraft only after green W3.
- **Consequences:** Waves 0–3 retain local Git commits. W3.5 establishes the private SourceCraft `origin`, CI verify and protected main before external research work grows.

## ADR-002 — Documentation topology

- **Context:** Master Plan requires a technical `docs/` tree; AMS project protocol requires root navigation docs.
- **Decision:** Root documents route readers to detailed `docs/` technical canon. Neither layer duplicates implementation details.
- **Consequences:** Every substantive change updates `WORKLOG.md`, `BUILD_STATUS.md` and the relevant technical source.

## ADR-003 — Design-system boundary

- **Context:** The only present design document belongs to another product.
- **Decision:** Do not reuse it. Maintain the neutral accessible operational UI as the current baseline
  while the dedicated AMS Content Factory design system remains `DESIGN_SYSTEM_PENDING`.
- **Consequences:** Wave 14 closed the responsive/a11y implementation of this baseline; future visual
  work must update `03_DESIGN_SYSTEM.md` rather than inherit tokens or scenarios from the other product.

## ADR-004 — Local development database

- **Context:** Docker is installed; native `psql` is absent.
- **Decision:** Use a local Docker Compose PostgreSQL 16 image with pgvector for development and tests.
- **Consequences:** No native PostgreSQL install is required; production configuration remains separate.

## ADR-005 — Node baseline

- **Context:** pg-boss supports Node 22.12+, but the pinned pnpm 11.5 runtime requires Node 22.13+.
- **Decision:** Pin the project to Node 22.13+ and below Node 23.
- **Consequences:** The system Node 24 is not the project runtime; `fnm` supplies the compatible local version.

## ADR-006 — Timeweb Cloud production packaging

- **Context:** The approved Master Plan requires managed PostgreSQL and the owner selected Timeweb Cloud DBaaS before the production database exists.
- **Decision:** Timeweb Cloud DBaaS is the only production PostgreSQL + pgvector runtime. `docker-compose.prod.yml` contains web, worker, Nginx and one-shot maintenance clients only; it never creates a PostgreSQL server or persistent database volume. Local Docker PostgreSQL remains development/test-only. Install pinned pnpm through npm rather than Corepack and apply schema only with `prisma migrate deploy`.
- **Consequences:** Timeweb operates the database runtime, availability and native backups; the application retains migrations, least-privilege database access and a tested logical backup/restore client. Cluster creation, pgvector activation, credentials, TLS settings and production release remain explicit external operations.

## ADR-007 — AMS Server runtime profile and production domain

- **Context:** The owner assigned AMS Content Factory to the existing AMS Server and registered
  `fabrika.ams24.ru`. That server already uses host Nginx, Certbot, systemd and release/current layouts
  for Next.js services; it has a constrained resource budget and existing public services.
- **Decision:** Use the AMS Server canonical profile: immutable application releases under
  `/opt/ams-platform/ams-content-factory`, a systemd web service on an internally bound port, host Nginx
  and Certbot for `fabrika.ams24.ru`, and Timeweb Cloud DBaaS as the only production PostgreSQL runtime.
  Keep `docker-compose.prod.yml` as the tested portable/CI package, not as a second production proxy or
  database topology on AMS Server.
- **Consequences:** The application will not bind public ports or start a Docker Nginx container. An exact
  SourceCraft-main artifact, server env file, verified DBaaS connection, `pgvector`, TLS certificate and
  health smoke are mandatory before activating `current`. The initial source snapshot is staging only and
  is not a deploy proof.
