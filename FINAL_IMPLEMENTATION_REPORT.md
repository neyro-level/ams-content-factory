# AMS Content Factory — implementation report

**Статус документа:** фактический снимок V0.1 на 2026-08-14. Текущая очередность и Definition of Done —
[`docs/V0_1_USER_TEST_PLAN.md`](docs/V0_1_USER_TEST_PLAN.md) и
[`docs/MASTER_IMPLEMENTATION_PLAN.md`](docs/MASTER_IMPLEMENTATION_PLAN.md).

## READY

- Authentication, Organizations и Brands: защищённый tenant-scoped пользовательский путь.
- Brand Context: profile, voice, offers и constraints сохраняются через application service с audit trail и не
  пересекают границы organization/brand.
- Knowledge: tenant-scoped добавление text/URL/file, retry и ограниченные готовые chunks в content context.
- Content: topic, goal, audience и неизменяемые brief/version; атомарный claim generation и выделение версий;
  ручное edit/rewrite, fact-check, review, approval, `READY` и gate копирования финального текста.
- SourceCraft verify включает PostgreSQL + pgvector, migrations, статические проверки, unit/integration suites,
  build и детерминированные critical browser flows.

## LIMITED

- Research — безопасное brand-scoped рабочее пространство. Provider-dependent поиск и извлечение страницы
  недоступны до настройки production provider.
- Реальная text generation требует безопасно настроенный `OPENAI_API_KEY`. Детерминированный provider строго
  test-only; поэтому V0.1 остаётся `NOT READY FOR USER TESTING` до одного реального owner generation smoke.

## PLANNED

- Media, Video, Calendar, Publishing, Social Accounts, Analytics, Automation и MCP/Integrations в V0.1 показывают
  только product-state страницы; их provider, storage и mutation entry points владельцу недоступны.

## BLOCKED_EXTERNAL

- Timeweb должен установить SQL object `vector` в production database или предоставить отдельное
  extension-capable operator connection.
- Для live AI, research, social and media adapters нужны официальные credentials/authorization внешних
  провайдеров.
- Production требует TLS/vhost, runtime secrets, backup policy и отдельное подтверждение владельца.

## Проверенная база

На 2026-08-14 в чистом SourceCraft окружении зелёными были Prisma validation/migrations, lint, formatting,
typecheck, 76 unit tests, 86 integration contracts, production build и critical browser flow Brand Context →
Knowledge → Content → Review → `READY` → Copy plus tenant isolation. Проверки не заменяют единственный
оставшийся live V0.1 proof: owner smoke с безопасно подключённым `OPENAI_API_KEY`.
