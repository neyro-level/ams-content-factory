# Паспорт AMS Content Factory

- **Продукт:** AMS Content Factory.
- **Тип:** внутренняя multi-tenant content operations platform.
- **Стек:** Next.js 16, React 19, TypeScript, Prisma 7, PostgreSQL/pgvector, pg-boss, pnpm.
- **Source of truth:** `docs/MASTER_DEVELOPMENT_PLAN.md`.
- **Remote:** private SourceCraft repository `integrator-p/ams-content-factory` is canonical `origin`.
- **GitHub mirror:** private `neyro-level/ams-content-factory` as `github-legacy`; it is never a merge or deploy gate and updates only on owner request.
- **Deploy:** Timeweb Cloud: отдельный application server/domain и отдельный managed PostgreSQL DBaaS с pgvector. Production deploy допускается только после Wave 16 и отдельного подтверждения инфраструктуры.
