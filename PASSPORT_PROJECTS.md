# Паспорт AMS Content Factory

- **Продукт:** AMS Content Factory.
- **Тип:** внутренняя multi-tenant content operations platform.
- **Стек:** Next.js 16, React 19, TypeScript, Prisma 7, PostgreSQL/pgvector, pg-boss, pnpm.
- **Source of truth:** `docs/MASTER_IMPLEMENTATION_PLAN.md`; `docs/MASTER_DEVELOPMENT_PLAN.md` сохранён как historical/reference.
- **Remote:** private SourceCraft repository `integrator-p/ams-content-factory` is canonical `origin`.
- **GitHub mirror:** private `neyro-level/ams-content-factory` as `github-legacy`; it is never a merge or deploy gate and updates only on owner request.
- **Production domain:** `https://fabrika.ams24.ru` (DNS A-record указывает на AMS Server; выпуск TLS и запуск приложения ожидают подключения Timeweb DBaaS).
- **Deploy:** AMS Server (`5.42.100.161`): host Nginx + systemd + immutable release; отдельный managed PostgreSQL DBaaS Timeweb Cloud с pgvector. `docker-compose.prod.yml` остаётся переносимым проверенным пакетом, но не является runtime-профилем AMS Server. Production deploy допускается только после Wave 19, полного release gate, готовности DBaaS и отдельного подтверждения инфраструктуры.
