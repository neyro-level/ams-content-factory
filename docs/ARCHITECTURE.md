# Архитектура

AMS Content Factory — modular monolith с `apps/web`, `apps/worker`, позднее `apps/mcp`.
`packages/core` содержит domain/application services; `packages/db` — Prisma, migrations и repositories;
`packages/providers` — внешние adapters; `packages/jobs` — pg-boss registry.

Зависимости: Web и Worker вызывают Core; Core получает repositories/provider interfaces;
только DB package знает Prisma/PostgreSQL. Provider adapter не содержит доменную логику.
