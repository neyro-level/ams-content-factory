# AMS Content Factory — MASTER IMPLEMENTATION PLAN

**Проект:** `ams-content-factory`
**Статус документа:** основной план доработки проекта
**Рабочая модель:** solo owner + AI/Codex
**Целевая эксплуатация:** до 10 организаций, VK + Instagram
**Первый production-период:** обкатка на собственной организации и собственных аккаунтах
**Стратегия deployment:** production deployment только после завершения основной разработки и прохождения release gate

---

# 0. Назначение документа

Этот документ является главным планом реализации AMS Content Factory.

Он заменяет старую логику, при которой наличие модели данных, service layer, mock provider или контракта автоматически трактовалось как «модуль готов».

## Главное правило

**Документация — гипотеза. Код — истина.**

Модуль считается реализованным только тогда, когда:

1. существует рабочий пользовательский или системный entry point;
2. выполняется реальная бизнес-операция;
3. проверяется actor / tenant / brand / resource;
4. есть корректная state machine;
5. side effect устойчив к partial failure и retry;
6. есть негативные и recovery-тесты;
7. код входит в обязательный CI gate.

Mock provider, interface, Prisma model, README и unit test сами по себе не делают функцию готовой.

---

# 1. Исходное состояние

Текущий проект имеет хороший архитектурный фундамент:

- Next.js / React / TypeScript;
- Prisma + PostgreSQL;
- pgvector;
- pg-boss;
- modular monolith;
- отдельные `core`, `db`, `providers`, `jobs`;
- tenant-scoped repositories во многих критичных местах;
- state machines для content, media, publishing и jobs;
- encryption для social credentials;
- SSRF-safe URL ingestion;
- integration tests;
- private object storage abstraction;
- provider abstractions для publishing, video, analytics и embeddings.

Однако проект пока нельзя считать полноценным рабочим приложением.

## Основные фактические разрывы

- UI в основном является статической оболочкой.
- Большинство core services не подключено к реальным web entry points.
- Worker может отмечать workflow как успешный без выполнения полезной работы.
- QC может сохраняться как `PASSED` без фактического прохождения QC.
- Нет полноценного AI Text Generation Engine.
- Нет production research provider.
- Нет реального durable scheduler для публикаций.
- Нет завершённого automated analytics collection loop.
- Live VK / Instagram integration отсутствует.
- MCP пока является catalogue/contracts layer, а не полноценным runtime.
- Integration tests не являются обязательным CI gate.
- Observability практически отсутствует.

---

# 2. Целевая модель продукта

## 2.1. Масштаб

Первая целевая эксплуатация:

- один основной оператор;
- до 10 организаций;
- несколько брендов внутри организации допускаются архитектурно;
- две социальные сети:
  - VK;
  - Instagram;
- первый месяц — только собственная организация владельца;
- после обкатки — последовательное подключение клиентов.

## 2.2. Что НЕ требуется сейчас

Не строить до первых 10 организаций:

- микросервисную архитектуру;
- Kafka;
- Kubernetes;
- отдельный Redis только ради архитектурной «красоты»;
- сложный event bus;
- биллинг;
- тарифы;
- marketplace;
- white-label;
- realtime collaborative editing;
- мобильное приложение;
- десятки социальных сетей;
- сложную клиентскую RBAC-панель;
- полноценный multi-team workflow;
- автоматический self-service onboarding клиентов.

Существующий RBAC-фундамент сохраняется, но UI первой версии может быть owner-first.

---

# 3. Целевая архитектура

```text
Browser / Codex / MCP / n8n
            ↓
Application Entry Point
            ↓
Authentication
            ↓
Organization Membership
            ↓
Brand Scope
            ↓
Permission
            ↓
Resource Ownership / Relation Check
            ↓
Core Application Service
            ↓
Repository
            ↓
PostgreSQL
            ↓
External Side Effect / Queue / Provider
            ↓
Persist Result / Reconciliation / Audit
```

## 3.1. Главный write invariant

Для любого write-path:

```text
actor
→ authentication
→ organization
→ membership
→ brand
→ permission
→ concrete resource
→ valid state transition
→ persisted intent
→ side effect
→ persisted result
→ audit/reconciliation
```

Запрещено:

- доверять `organizationId` от клиента как источнику авторизации;
- доверять `brandId` без проверки принадлежности organization;
- принимать resource ID без проверки tenant/brand;
- считать UI/layout/middleware достаточной authorization boundary;
- выполнять внешний side effect раньше auth/resource validation;
- считать provider call успешным до фиксации результата;
- повторять uncertain external mutation без reconciliation.

---

# 4. Источники истины

## 4.1. Git

Канонический git-контур:

```text
SourceCraft → canonical origin / merge gate / future deploy path
GitHub → legacy mirror
```

Codex обязан работать с актуальным `main` канонического репозитория.

## 4.2. Документация

Основной документ после начала выполнения:

```text
docs/MASTER_IMPLEMENTATION_PLAN.md
```

Исторические отчёты не являются источником текущего статуса.

## 4.3. База данных

PostgreSQL — source of truth для:

- организаций;
- брендов;
- content projects;
- publication states;
- scheduled work;
- workflow runs;
- provider attempts;
- analytics;
- media metadata;
- audit.

Очередь — не source of truth.

---

# 5. Architectural Invariants

## INV-01. Tenant isolation

Любая tenant-owned сущность должна быть доступна только через:

```text
organizationId + brandId + resourceId
```

где это применимо.

## INV-02. Suspended tenant is denied

`Organization.status != ACTIVE` → deny независимо от membership.

## INV-03. Resource graph consistency

Связанные сущности должны принадлежать одному графу:

```text
Organization
└── Brand
    ├── Knowledge
    ├── Research
    ├── ContentProject
    │   ├── ContentVersion
    │   ├── Storyboard
    │   ├── VideoProduction
    │   ├── PlatformVariant
    │   └── Publication
    ├── MediaAsset
    └── SocialAccount
```

## INV-04. External mutation safety

Любой внешний mutation:

```text
persist intent
→ provider call
→ persist result
```

Если provider мог выполнить действие, а локальный результат неизвестен:

```text
OUTCOME_UNKNOWN
```

а не `FAILED`.

## INV-05. Idempotency

Retry не должен создавать:

- второй пост;
- второй video job;
- второй workflow;
- duplicate ContentVersion;
- duplicate ResearchItem;
- duplicate media object.

## INV-06. No mock success in production

Mock provider не может:

- включаться автоматически;
- подменять отсутствующий credential;
- возвращать production success.

Отсутствующая внешняя зависимость:

```text
BLOCKED_EXTERNAL
```

## INV-07. State machines are executable

Для каждого status:

- известен вход;
- известны допустимые выходы;
- известен recovery path;
- известен terminal status.

Недостижимые и тупиковые состояния запрещены.

## INV-08. Manual approval first

В первом production месяце:

```text
AI → DRAFT → HUMAN REVIEW → APPROVED → SCHEDULED → PUBLISHED
```

AI не переводит контент в `APPROVED`.

---

# 6. Выполнение Codex

## 6.1. Общий режим

Codex работает автономно.

Одна задача плана = один PR.

Каждый PR должен быть достаточно маленьким, чтобы:

- можно было понять diff;
- было понятно, какие инварианты меняются;
- тестами было доказано изменение.

## 6.2. Перед началом задачи

Codex обязан:

1. прочитать задачу;
2. открыть затрагиваемые файлы;
3. проверить фактический текущий код;
4. проверить связанные repository/service/tests;
5. сверить Prisma schema и миграции, если меняется БД;
6. не доверять старой документации без кода.

## 6.3. После задачи

Обязательно:

```text
lint
format check
typecheck
unit tests
integration tests
prisma validate
build
```

При UI-flow:

```text
e2e
```

При state machine:

```text
negative + recovery tests
```

При tenant/security:

```text
cross-tenant test
revoked/suspended test
```

При external provider:

```text
success
provider failure
timeout
outcome unknown
DB failure after provider success
duplicate request
parallel request
```

## 6.4. Запрещено Codex

Без отдельной задачи нельзя:

- менять стек;
- делать глобальный рефакторинг;
- переименовывать половину проекта;
- добавлять новую инфраструктуру «на будущее»;
- делать production deploy;
- включать реальные публикации;
- менять архитектурные инварианты.

---

# 7. Волна 0 — Reset source of truth

**Цель:** привести документацию и статус проекта в соответствие коду.

**Deployment:** запрещён.

---

## Статус исполнения

| Задача | Статус | Результат                                                                                       |
| ------ | ------ | ----------------------------------------------------------------------------------------------- |
| PR 0.1 | `DONE` | Текущий master plan добавлен, предыдущий план отмечен historical/reference.                     |
| PR 0.2 | `DONE` | Статусы проекта приведены к фактическим `FOUNDATION`, `NOT_IMPLEMENTED` и `BLOCKED_EXTERNAL`.   |
| PR 1.1 | `DONE` | QC fail-closed: типизированные секции и вычисляемый persisted status.                           |
| PR 1.2 | `DONE` | Tenant context отклоняет `SUSPENDED` organization до проверки membership.                       |
| PR 1.3 | `DONE` | n8n `keyId` server-bound к organization; per-org secrets encrypted и подписаны critical fields. |
| Next   | `W1.4` | Tenant-scope repository cleanup.                                                                |

---

## PR 0.1 — Создать новый master plan

### Файлы

```text
docs/MASTER_IMPLEMENTATION_PLAN.md
```

### Сделать

- добавить этот документ;
- обозначить его главным планом разработки;
- старые планы оставить как historical/reference;
- зафиксировать:
  - target architecture;
  - invariants;
  - waves;
  - release gate;
  - Codex execution contract.

### Приёмка

В репозитории есть один явно обозначенный текущий master plan.

---

## PR 0.2 — Убрать ложную готовность

### Файлы

```text
FINAL_IMPLEMENTATION_REPORT.md
README.md
apps/web/app/page.tsx
WORKLOG.md
```

### Сделать

Разделить статусы:

```text
FOUNDATION
IMPLEMENTED
BLOCKED_EXTERNAL
NOT_IMPLEMENTED
```

Не использовать `Готово`, если есть только:

- interface;
- repository;
- mock;
- schema;
- contract test.

### Приёмка

Ни один модуль не заявлен готовым без реального entry point и сквозного flow.

---

# 8. Волна 1 — Security invariants

**Цель:** закрыть самые опасные ложные гарантии до дальнейшего развития.

**Deployment:** запрещён.

---

## PR 1.1 — QC fail-closed

### Файлы

```text
packages/core/src/captions.ts
tests/unit/captions.test.ts
tests/integration/media-production.test.ts
```

### Сделать

`createQc()` обязан:

1. принимать типизированные QC sections;
2. вызвать `evaluateQc()`;
3. сохранять вычисленный `PASSED / WARNING / FAILED`.

Запрещено:

```ts
status: 'PASSED';
```

без вычисления результата.

### Тесты

- technical fail → FAILED;
- visual fail → FAILED;
- content fail → FAILED;
- compliance fail → FAILED;
- all pass → PASSED;
- warning scenario → WARNING.

### Приёмка

Нельзя сохранить `PASSED`, если required QC section failed.

---

## PR 1.2 — Suspended organization authorization

### Файлы

```text
packages/core/src/tenant-context.ts
packages/db/src/repositories/tenant.ts
tests/integration/tenant-context.test.ts
```

### Сделать

`resolveTenantContext()`:

```text
Organization ACTIVE
AND Membership ACTIVE
AND Brand ACTIVE
AND deletedAt IS NULL
```

### Тесты

- OWNER + SUSPENDED organization → denied;
- ADMIN + SUSPENDED organization → denied;
- ACTIVE org + SUSPENDED membership → denied;
- ARCHIVED brand → denied;
- deleted brand → denied.

### Приёмка

Organization status является fail-closed authorization boundary.

---

## PR 1.3 — Secure n8n tenant binding

### Файлы

```text
apps/web/app/api/v1/webhooks/n8n/[topic]/route.ts
packages/core/src/mcp-auth.ts или новый inbound-auth module
packages/db/src/repositories/*
packages/db/prisma/schema.prisma
новая миграция
tests/integration/*
```

### Новая сущность

Рекомендуемая модель:

```text
InboundWebhookCredential

id
organizationId
keyId
secretCiphertext
encryptionVersion
disabledAt
createdAt
updatedAt
```

### Request

```text
x-ams-key-id
x-ams-brand-id
x-ams-signature
idempotency-key
```

### Правила

- `organizationId` не читается из request header.
- Organization определяется сервером через `keyId`.
- Secret — per organization/integration.
- `brandId` валидируется UUID.
- `brandId` проверяется через organization.
- topic входит в signed request.
- idempotency key входит в signed request.

### Canonical signature payload

```text
HTTP method
topic
keyId
brandId
idempotencyKey
bodyHash
```

### Тесты

- unknown keyId → 401;
- wrong secret → 401;
- foreign brand → 404;
- malformed UUID → 400;
- tampered brandId → signature invalid;
- duplicate request → один WorkflowRun.

### Приёмка

Невозможно выбрать tenant изменением request headers.

---

## PR 1.4 — Tenant-scope repository cleanup

### Проверить минимум

```text
updateSocialAccountStatus
findBrandAccess
все updateMany / update / delete
```

### Правило

Tenant-owned write:

```text
organizationId + brandId + resourceId
```

### Приёмка

Не остаётся public repository method, способного изменить tenant-owned entity только по `id`.

---

# 9. Волна 2 — CI как реальный защитный барьер

**Цель:** дальнейший автономный Codex не может незаметно сломать tenant/security/data integrity.

**Deployment:** запрещён.

---

## PR 2.1 — Integration tests в SourceCraft CI

### Файлы

```text
.sourcecraft/ci.yaml
tests/vitest.integration.config.ts
при необходимости test compose
```

### Pipeline

```text
install
prisma generate
PostgreSQL + pgvector
prisma migrate deploy
seed
lint
format
typecheck
unit
integration
build
```

### Приёмка

Намеренная поломка tenant isolation делает pipeline red.

---

## PR 2.2 — Negative security tests

Добавить:

```text
foreign organization
foreign brand
foreign content project
foreign media
foreign social account
revoked membership
suspended organization
insufficient permission
```

### Приёмка

У каждого core write-path есть хотя бы один cross-tenant negative test.

---

## PR 2.3 — Concurrency/failure harness

Создать reusable test helpers:

```text
failing repository
failing storage
failing provider
delayed provider
counting provider
```

### Сценарии

```text
duplicate request
parallel same request
provider succeeds + DB fails
provider timeout
worker crash simulation
```

### Приёмка

Partial failure tests можно писать без реального API.

---

## PR 2.4 — Fail-fast configuration

### Новый модуль

```text
packages/config/src/env.ts
```

### Валидировать

Core:

```text
NODE_ENV
APP_URL
DATABASE_URL
BETTER_AUTH_SECRET
TOKEN_ENCRYPTION_KEY
```

Feature-specific:

```text
inbound webhook credentials
S3*
VK*
INSTAGRAM*
OPENAI*
HEYGEN*
```

### Правила

- production `APP_URL` обязателен;
- localhost fallback только dev;
- key length валидируется при старте;
- production process не стартует с невалидной конфигурацией.

### Приёмка

Невалидный production env → process fail before accepting traffic.

---

# 10. Волна 3 — Data integrity and state machines

**Deployment:** запрещён.

---

## PR 3.1 — Media pipeline

### Целевая последовательность

```text
authorize
→ resolve tenant/brand
→ validate metadata
→ generate storageKey server-side
→ create MediaAsset PENDING
→ storage.put
→ inspect actual bytes
→ persist detected metadata
→ READY
```

### При ошибке

```text
FAILED
+ cleanup/reconciliation
```

### Правила

- клиент не выбирает storage key;
- MIME не доверяется клиенту;
- размер ограничен;
- actual media type определяется из contents;
- object path безопасен;
- повтор key+checksum идемпотентен.

### Тесты

- no permission → storage untouched;
- foreign brand → storage untouched;
- fake mp4 → rejected;
- DB failure → no READY;
- storage failure → FAILED;
- duplicate retry → no duplicate.

---

## PR 3.2 — Research concurrency/retry

### Состояния

```text
NEW
PROCESSING
READY
FAILED
```

### Правила

Если duplicate request:

```text
READY      → return existing
PROCESSING → ResearchInProgressError
FAILED     → controlled retry
```

Запрещено возвращать `null` как норма…2105 tokens truncated…бности.

---

## PR 8.3 — AI execution model

Фиксировать:

```text
organizationId
brandId
contentProjectId
provider
model
operation
promptKey
promptVersion
status
startedAt
finishedAt
tokenUsage
estimatedCost
actualCost
errorCode
```

---

## PR 8.4 — Prompt versioning

Prompts пока хранятся в коде.

Набор:

```text
research-summary:v1
content-brief:v1
social-post:v1
reel-script:v1
vk-adaptation:v1
instagram-adaptation:v1
fact-check:v1
rewrite:v1
```

---

## PR 8.5 — Context assembler

Для генерации собирать только нужный context:

```text
BrandProfile
BrandVoice
ContentPillars
Knowledge retrieval
Research evidence
ContentProject brief
platform rules
```

Не отправлять весь tenant dump.

---

## PR 8.6 — Generate Content Draft

Pipeline:

```text
ContentProject
→ retrieve context
→ generate
→ ContentVersion(createdBy=AI)
→ DRAFT
```

Предыдущая версия не изменяется.

---

## PR 8.7 — Rewrite

Операции:

```text
shorten
stronger hook
rewrite CTA
change angle
make more expert
adapt VK
adapt Instagram
```

Каждая генерация = новая ContentVersion.

---

## PR 8.8 — Fact-check gate

Перед REVIEW:

```text
claims extraction
→ evidence check
→ unsupported claims surfaced
```

Не обязательно делать полностью автоматическое blocking в первой версии, но unsupported claim должен быть видим оператору.

---

## PR 8.9 — Content project UI

Экран:

```text
brief
research
evidence
versions
draft
script
VK variant
Instagram variant
review
status
```

---

# 16. Волна 9 — Editorial workflow

**Deployment:** запрещён.

---

## PR 9.1 — Content state UI

Поддержать реальный путь:

```text
IDEA
→ RESEARCHING
→ DRAFT
→ FACT_CHECK
→ REVIEW
→ APPROVED
```

Production/video statuses — позже.

---

## PR 9.2 — Review actions

```text
request review
approve
reject
return to draft
comment
```

---

## PR 9.3 — Manual approval invariant

Только user с `content:review` может:

```text
REVIEW → APPROVED
```

AI / worker не может сделать это самостоятельно.

---

# 17. Волна 10 — Media and Video

**Deployment:** запрещён.

---

## PR 10.1 — Media library UI

```text
upload
AI-generated
research
derived
```

---

## PR 10.2 — Storyboard generation

Из approved script:

```text
beats
narration
visual job
visual instruction
duration
```

---

## PR 10.3 — VideoProduction workflow

```text
PLANNED
SCRIPT_READY
STORYBOARD_READY
WAITING_APPROVAL
GENERATING
COMPOSING
QC
READY
```

---

## PR 10.4 — HeyGen runtime adapter

Существующий domain/provider boundary сохранить.

Реальный client реализовать отдельно.

---

## PR 10.5 — Render jobs

Все provider video calls идут через RenderJob.

---

## PR 10.6 — Transcription

Подключить реальный provider только после того, как video generation работает.

---

## PR 10.7 — Captions

```text
Transcript
→ CaptionTrack
→ SRT/ASS
```

---

## PR 10.8 — QC gate

VideoProduction:

```text
QC → READY
```

только при успешном QC.

---

# 18. Волна 11 — Social Accounts

**Deployment:** пока запрещён.

---

## PR 11.1 — Social accounts UI

Для brand:

```text
VK
Instagram
```

Statuses:

```text
CONNECTED
EXPIRED
DISCONNECTED
ERROR
```

---

## PR 11.2 — OAuth architecture

Provider-specific OAuth не должен жить в core.

---

## PR 11.3 — Token refresh strategy

Если provider поддерживает refresh:

```text
encrypted refresh token
expiresAt
controlled refresh
```

---

## PR 11.4 — Account audit

Audit events:

```text
social.connect
social.disconnect
social.refresh_failed
social.expired
```

---

# 19. Волна 12 — Calendar and Scheduling

**Deployment:** запрещён.

---

## PR 12.1 — Publication creation

Из approved ContentProject/PlatformVariant:

```text
DRAFT publication
```

---

## PR 12.2 — Calendar UI

Минимум:

```text
week
month
```

Day view можно позже.

---

## PR 12.3 — Schedule

```text
Publication.scheduledAt
Publication.status = QUEUED
```

---

## PR 12.4 — Durable scheduler

DB — source of truth.

Periodic worker ищет:

```text
QUEUED
scheduledAt <= now
not dispatched / requires retry
```

и создаёт dispatch job.

---

## PR 12.5 — Reschedule

Изменение времени не создаёт новую publication.

---

## PR 12.6 — Cancellation

До внешнего publish можно безопасно отменить.

---

# 20. Волна 13 — Real VK / Instagram Publishing

**Deployment:** всё ещё не обязателен до OAuth requirement.

---

## PR 13.1 — VK PublishingProviderClient

Реальный adapter.

---

## PR 13.2 — Instagram PublishingProviderClient

Реальный adapter.

---

## PR 13.3 — Publication dispatch worker

```text
scheduled publication
→ intent/attempt
→ provider
→ result
```

---

## PR 13.4 — Outcome investigation

Использовать существующую концепцию `investigate()`.

---

## PR 13.5 — Idempotency guarantees

Для одного publication dispatch:

```text
provider.publish called max once
```

пока outcome не reconciled.

---

## PR 13.6 — Provider failure UX

Оператор видит:

```text
FAILED
OUTCOME_UNKNOWN
EXPIRED ACCOUNT
PROVIDER ERROR
```

и понимает следующий шаг.

---

# 21. Волна 14 — Analytics

**Deployment:** запрещён до release wave.

---

## PR 14.1 — Analytics scheduling

После PUBLISHED:

```text
+24h
+72h
+168h
```

---

## PR 14.2 — VK analytics adapter

Normalized metrics.

---

## PR 14.3 — Instagram analytics adapter

Normalized metrics.

---

## PR 14.4 — Analytics worker

```text
analytics.collect
```

реально обрабатывается worker.

---

## PR 14.5 — Pagination

Все history lists:

```text
take
cursor
```

---

## PR 14.6 — Dashboard

Per brand:

```text
views/reach
engagement
clicks
followers delta
top content
worst content
platform comparison
pillar/topic comparison
```

---

## PR 14.7 — Learning insights

AI формирует:

```text
observation
hypothesis
recommendation
experiment
```

Но не меняет production prompt автоматически.

---

# 22. Волна 15 — MCP runtime

MCP реализуется после того, как business services реально работают через web.

**Deployment:** запрещён.

---

## PR 15.1 — McpAuthContext

Каждый handler получает authenticated context.

---

## PR 15.2 — Brand-in-organization check

Перед каждым brand tool.

---

## PR 15.3 — API key usage semantics

`markApiKeyUsed`:

- после успешной auth;
- scoped;
- не должен быть security side effect до authorization.

---

## PR 15.4 — MCP runtime entrypoint

Создать настоящий startable MCP application.

---

## PR 15.5 — Первый набор tools

```text
list_brands
get_brand
search_knowledge
add_research_item
list_content_opportunities
create_content_project
get_content_project
generate_content_draft
request_content_review
get_publication_calendar
get_analytics_summary
```

---

## PR 15.6 — MCP negative tests

```text
revoked key
wrong scope
foreign brand
expired key
unknown tool
```

---

# 23. Волна 16 — Observability and Audit

**Deployment:** запрещён.

---

## PR 16.1 — Structured logger

Минимальные fields:

```text
timestamp
level
event
requestId
organizationId
brandId
workflowRunId
contentProjectId
publicationId
provider
providerJobId
durationMs
errorCode
```

---

## PR 16.2 — Secret redaction

Нельзя логировать:

```text
password
session token
cookie
access token
refresh token
webhook secret
API key raw token
encryption key
```

---

## PR 16.3 — AuditLog expansion

Логировать:

```text
brand.create/archive
api_key.create/revoke
social.connect/disconnect
content.approve/reject
publication.schedule
publication.dispatch
publication.reconcile
critical access denied
```

---

## PR 16.4 — Error reporting

Подключить минимальный production error reporter либо infrastructure-compatible sink.

Не строить сложную observability platform.

---

# 24. Волна 17 — Performance hardening

**Deployment:** запрещён.

---

## PR 17.1 — Publishing query budget

Не загружать:

```text
all attempts
all credentials
all relations
```

на каждый transition.

---

## PR 17.2 — Analytics pagination

Обязательно.

---

## PR 17.3 — ContentProject bounded relations

Versions/approvals/comments:

```text
pagination / take
```

---

## PR 17.4 — Index audit

Проверить реальные запросы.

Добавлять индекс только под доказанный query pattern.

---

# 25. Волна 18 — Production hardening

Это последняя волна перед deployment.

---

## PR 18.1 — Real readiness

### Web

```text
config valid
DB reachable
```

### Worker

```text
config valid
DB reachable
pg-boss reachable
handlers registered
```

---

## PR 18.2 — Rate limiting

Минимум:

```text
auth
inbound webhook
MCP
AI generation
expensive provider calls
```

---

## PR 18.3 — Outbound webhook SSRF

Configurable outbound webhook URLs должны проходить тот же класс safe URL validation, что knowledge URLs.

---

## PR 18.4 — Docker hardening

Текущий runtime должен быть заменён на:

```text
multi-stage build
non-root user
minimal runtime
no dev dependencies at runtime
```

---

## PR 18.5 — Dependency hygiene

Выполнить:

```text
pnpm why
pnpm audit
unused dependency check
```

Подозрительные/неиспользуемые зависимости удалить.

---

## PR 18.6 — Security headers

Проверить:

```text
nosniff
frame policy
referrer policy
permissions policy
CSP where practical
```

---

# 26. Волна 19 — Release package

Только здесь начинается серьёзная production инфраструктура.

---

## PR 19.1 — Final production compose

Проверить только необходимые services:

```text
web
worker
nginx/reverse proxy
external managed PostgreSQL
external S3
```

---

## PR 19.2 — Database migration drill

На чистой staging DB:

```text
prisma migrate deploy
seed
application start
```

---

## PR 19.3 — Backup

Создать настоящий backup.

---

## PR 19.4 — Restore drill

Не ограничиваться успешным `pg_dump`.

Обязательно:

```text
backup
→ новая DB
→ restore
→ application smoke
→ verify critical entities
```

---

## PR 19.5 — TLS/domain

Нужен в первую очередь для:

- OAuth callbacks;
- production cookies;
- social integrations.

---

## PR 19.6 — Release smoke suite

```text
login
organization
brand
knowledge
research
generate content
approve
schedule
worker
publication sandbox
analytics sandbox
```

---

# 27. Release Gate

Production deployment разрешён только если одновременно:

- [ ] master plan актуален;
- [ ] CI green;
- [ ] integration tests green;
- [ ] E2E critical flow green;
- [ ] cross-tenant tests green;
- [ ] concurrency tests green;
- [ ] provider partial-failure tests green;
- [ ] migrations проверены на clean DB;
- [ ] backup создан;
- [ ] restore реально проверен;
- [ ] production env fail-fast работает;
- [ ] readiness real;
- [ ] worker выполняет реальные handlers;
- [ ] mock providers не используются production runtime;
- [ ] structured errors видимы;
- [ ] social tokens encrypted;
- [ ] manual approval gate включён;
- [ ] live auto-publishing по умолчанию выключен;
- [ ] owner дал отдельное подтверждение deployment.

---

# 28. Первый production deployment

Первый deployment выполняется **один раз после Release Gate**, а не после каждой волны.

## Initial flags

```text
external publishing: OFF
automatic publishing: OFF
manual approval: ON
```

## Подключить только

```text
ваша organization
ваш brand
ваш VK
ваш Instagram
```

---

# 29. Первый месяц эксплуатации

## Этап A — Контент без autopublish

```text
Knowledge
→ Research
→ AI Draft
→ Rewrite
→ Review
→ Manual Publish
```

Цель:

- проверить качество AI;
- наполнить BrandVoice;
- отточить prompts;
- увидеть hallucination patterns.

---

## Этап B — Scheduled publishing

Подключить:

```text
APPROVED
→ Calendar
→ Scheduler
→ VK / Instagram
```

Каждый пост проходит manual approval.

---

## Этап C — Analytics

Включить:

```text
24h
72h
168h
```

и проверить consistency данных.

---

## Этап D — Learning loop

AI даёт рекомендации, но ничего автоматически не меняет.

---

# 30. Подключение клиентов

Не подключать сразу 10.

Рекомендуемая последовательность:

```text
1 собственная organization
→ 2–3 организации
→ 5
→ 10
```

На каждом этапе проверить:

- tenant isolation;
- queue latency;
- provider limits;
- costs;
- analytics volume;
- UX переключения организаций.

---

# 31. Definition of Done продукта v1

Первая версия считается рабочей, когда существует реальный end-to-end flow:

```text
Login
↓
Organization
↓
Brand
↓
Knowledge
↓
Research
↓
ContentProject
↓
AI Draft
↓
Human Edit
↓
Fact Check
↓
Review
↓
Approved
↓
Optional Video Production
↓
QC
↓
VK / Instagram Variant
↓
Calendar
↓
Scheduled Publication
↓
Worker Dispatch
↓
Provider Publish
↓
Analytics
↓
Learning Recommendation
```

Любой шаг, существующий только как:

```text
Prisma model
interface
mock
README
TODO
test-only contract
```

не считается реализованным.

---

# 32. Приоритет PR в одном списке

Codex должен идти сверху вниз, если фактический код не изменился.

1. QC fail-closed.
2. Suspended organization deny.
3. Secure n8n tenant binding.
4. Tenant-scope repository cleanup.
5. Integration tests → SourceCraft CI.
6. Negative tenant tests.
7. Concurrency/failure test harness.
8. Fail-fast env.
9. Media integrity.
10. Research concurrency/retry.
11. Knowledge retry.
12. Publishing state machine cleanup.
13. Publishing reconciliation.
14. Atomic publication attempts.
15. Video provider reconciliation.
16. Resource graph tenant integrity.
17. Storyboard authorization.
18. Worker false-success removal.
19. Workflow dispatcher.
20. Queue lifecycle.
21. Lost QUEUED reconciliation.
22. Worker readiness.
23. Protected app shell.
24. Organizations UI.
25. Brands UI.
26. Navigation.
27. First real E2E.
28. Knowledge UI.
29. Production research provider.
30. Research workspace.
31. Claims/evidence.
32. TextGenerationProvider.
33. Production LLM provider.
34. AI execution tracking.
35. Prompt versioning.
36. Context assembler.
37. Generate draft.
38. Rewrite.
39. Fact-check.
40. Content editor/review UI.
41. Editorial approval workflow.
42. Media library.
43. Storyboard generation.
44. Video production workflow.
45. HeyGen runtime adapter.
46. Render jobs.
47. Transcription.
48. Captions.
49. QC gate.
50. Social accounts UI.
51. VK OAuth/provider.
52. Instagram OAuth/provider.
53. Publication creation.
54. Calendar.
55. Durable scheduler.
56. VK publishing.
57. Instagram publishing.
58. Outcome investigation.
59. Analytics scheduling.
60. VK analytics.
61. Instagram analytics.
62. Analytics worker.
63. Pagination.
64. Analytics dashboard.
65. Learning insights.
66. MCP auth context.
67. MCP runtime.
68. MCP tools.
69. Structured logging.
70. Audit expansion.
71. Error reporting.
72. Performance hardening.
73. Real readiness.
74. Rate limiting.
75. Outbound SSRF hardening.
76. Docker hardening.
77. Dependency hygiene.
78. Security headers.
79. Migration drill.
80. Backup.
81. Restore drill.
82. Release smoke.
83. First production deployment.
84. Connect only owner VK + Instagram.
85. One-month pilot.
86. Add client organizations gradually.

---

# 33. Codex Execution Contract

```text
1. Work only from current canonical main.

2. Before every task inspect actual code.
   Documentation does not override code.

3. One master-plan task = one PR.

4. Do not combine unrelated changes.

5. Do not change stack unless explicitly requested.

6. Do not introduce infrastructure not required by the current task.

7. Every write path:
   actor → permission → organization → brand → resource.

8. Every external mutation:
   persist intent → execute → persist result → reconcile.

9. Every retryable operation must be idempotent.

10. Never use mock success as implementation completion.

11. Missing credentials or infrastructure = BLOCKED_EXTERNAL.

12. No production deployment during Waves 0–18.

13. For DB changes:
    schema + migration + repository + tests.

14. For state changes:
    positive + invalid transition + recovery test.

15. For tenant changes:
    same-tenant + cross-tenant + revoked/suspended tests.

16. For provider changes:
    success
    error
    timeout
    outcome unknown
    provider success + DB failure
    duplicate
    parallel request.

17. For UI changes:
    real E2E user action, not screenshot-only checks.

18. After every PR:
    lint
    format
    typecheck
    unit
    integration
    prisma validate
    build
    e2e where applicable.

19. Update MASTER_IMPLEMENTATION_PLAN after merge:
    DONE
    NEXT
    BLOCKED_EXTERNAL.

20. Never deploy automatically.
    Production release requires an explicit separate owner instruction.
```

---

# 34. Финальный архитектурный принцип

AMS Content Factory не должен превращаться в сложную enterprise-платформу до появления соответствующей нагрузки.

Цель первой архитектуры:

```text
простая
проверяемая
идемпотентная
tenant-safe
recoverable
понятная solo + AI разработчику
```

До 10 организаций текущий modular monolith достаточно масштабируем.

Главный риск проекта сегодня — не нехватка технологий, а разрыв между хорошо описанными сущностями и реальным сквозным пользовательским процессом.

Поэтому порядок разработки:

```text
security invariants
→ CI
→ data integrity
→ worker
→ real application
→ knowledge/research
→ AI engine
→ editorial workflow
→ media/video
→ social publishing
→ analytics
→ MCP
→ production hardening
→ один deployment
```

Этот порядок является основным планом развития проекта.
