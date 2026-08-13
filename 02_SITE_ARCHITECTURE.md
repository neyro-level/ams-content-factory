# Архитектура приложения и маршрутов

Текущий маршрут: `/` — operational foundation. Пользовательский V0.1 workflow описан в
`docs/V0_1_USER_TEST_PLAN.md`.

Защищённый workspace доступен в `/app`. Рабочая точка V0.1 — brand dashboard
`/app/organizations/[organizationId]/brands/[brandId]`: он показывает текущие организацию и бренд,
последние content projects, безопасные переходы к Brand Context, Knowledge и Content, а также честные
статусы модулей.

Рабочие brand-scoped routes V0.1: `/settings` (Brand Context), `/knowledge`, `/research` и `/content`.
Страница `/content/[contentProjectId]` ведёт редакционный цикл: безопасная генерация, immutable versions,
fact-check, review, approve, ручной перевод в READY и copy текста. AI provider без credential отображается
как ограниченная возможность без технического статуса.

Будущие разделы остаются видимы в единой навигации по группам «Работа с контентом», «Производство»,
«Дистрибуция», «Аналитика», «Автоматизация» и «Настройки». В V0.1 `/media`, `/calendar`,
`/social-accounts` и `/analytics` направляют к компактной безопасной странице product-state; routes
`/planned/[featureKey]` не создают объектов и не запускают provider operations.
API routes ограничены health, OAuth callbacks, webhooks и внешними интеграциями; mutations
внутри приложения идут через application services и Server Actions.
