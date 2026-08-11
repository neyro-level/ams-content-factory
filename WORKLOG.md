# Worklog

## 2026-08-11 — Wave 1.1 completed; Wave 1.2 started

- Prisma 7 configured through `prisma.config.ts` with the PostgreSQL driver adapter; generated client remains a local build artifact.
- Applied the initial migration `20260811105046_init_identity_foundation`: pgvector, Better Auth tables, organization/brand access foundation and audit log.
- Better Auth is instantiated lazily on the first authentication request, so `next build` does not require a live database connection.
- Integration tests confirm the pgvector extension, tenant foundation tables and the Better Auth `ok` contract.
- Registration, login and session retrieval are covered through the real Better Auth route contract; W1.2 is complete.
- Tenant repositories and the server-only RBAC context now reject cross-organization brands and permission-denied operations; W1.3 is complete and W1.4 is in progress.

## 2026-08-11 — Wave 0 started

- Зафиксировано название продукта: **AMS Content Factory**.
- Подтверждён docs-first execution order и delayed private SourceCraft inception после W3.
- Начата сборка pnpm workspace, web foundation, tests и local PostgreSQL.
- Завершены W0.1–W0.3: документация, toolchain, Next.js health contracts, unit/integration/E2E tests и production build зелёные.
- W0.4 заблокирована локально: Docker Desktop daemon не запущен, а текущая Windows-сессия не может запустить сервис `com.docker.service`.
- Инициализирован локальный Git `main`; remote отсутствует намеренно до W3.5.
- Восстановлен Docker Desktop через установку WSL 2, PostgreSQL 16 + pgvector поднята и прошла readiness check.
- Wave 0 quality gate green: lint, formatting, typecheck, unit, integration, E2E и production build.
- Создан local checkpoint `0319e32` (`wave-00: establish engineering foundation`).
