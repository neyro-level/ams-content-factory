# Архитектура приложения и маршрутов

Текущий маршрут: `/` — operational foundation.

Защищённый workspace доступен в `/app`; календарь бренда в
`/app/organizations/[organizationId]/brands/[brandId]/calendar` показывает план, черновики и только
безопасные операционные сигналы `FAILED`, `OUTCOME_UNKNOWN`, `EXPIRED` и `ERROR` в границах активного бренда.

Защищённый аналитический просмотр: `/app/organizations/[organizationId]/brands/[brandId]/analytics`.
Он показывает только нормализованные и сохранённые snapshots активного бренда, без provider credentials и raw responses.
Планируемые защищённые разделы: `/dashboard`, `/brands`, `/knowledge`, `/research`,
`/opportunities`, `/content`, `/video`, `/publishing`, `/costs`, `/settings`.
API routes ограничены health, OAuth callbacks, webhooks и внешними интеграциями; mutations
внутри приложения идут через application services и Server Actions.
