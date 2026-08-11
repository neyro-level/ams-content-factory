# Архитектура приложения и маршрутов

Текущий маршрут: `/` — operational foundation.

Планируемые защищённые разделы: `/dashboard`, `/brands`, `/knowledge`, `/research`,
`/opportunities`, `/content`, `/video`, `/publishing`, `/analytics`, `/costs`, `/settings`.
API routes ограничены health, OAuth callbacks, webhooks и внешними интеграциями; mutations
внутри приложения идут через application services и Server Actions.
