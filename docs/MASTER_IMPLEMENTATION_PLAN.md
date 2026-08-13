# AMS Content Factory — MASTER IMPLEMENTATION PLAN

**Проект:** `ams-content-factory`
**Статус документа:** основной план доработки проекта
**Рабочая модель:** solo owner + AI/Codex
**Целевая эксплуатация:** до 10 организаций, VK + Instagram
**Первый production-период:** обкатка на собственной организации и собственных аккаунтах
**Стратегия deployment:** production deployment только после завершения основной разработки и прохождения release gate

**Текущий исполнимый срез:** [`V0_1_USER_TEST_PLAN.md`](V0_1_USER_TEST_PLAN.md). Он вводит безопасный
пользовательский editorial workflow поверх foundation, не отменяет этот master-plan и не авторизует production release.

**Последнее уточнение V0.1:** создание контент-проекта требует тему, цель, аудиторию и brief; проект и первая
неизменяемая пользовательская версия создаются одной tenant-scoped транзакцией.

**Product-language уточнение V0.1:** пользовательские экраны показывают русские продуктовые подписи, а не сырые
Prisma enum-значения; enum остаются внутренним контрактом state machine. Это относится к результатам проверки
claims, состояниям Research и контентному редакторскому flow. Content list/detail use a shared label catalog,
preventing stale display-only states.

**Manual-publication gate V0.1:** copy is a final editorial action and is exposed only from `READY`; the editable
draft experience remains available earlier in the state machine without calling it publishable output.

**Editorial feedback V0.1:** owner-facing review mutations are performed through the application service and return
safe product feedback; raw state-machine, authorization and service errors never render in the form.

**AI capability V0.1:** the server resolves whether real text generation can be offered. Without a credential,
Content remains usable for manual editorial work but is product-marked `LIMITED` and its generation/rewrite controls
are disabled; deterministic test generation cannot affect the ordinary product runtime.

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

| Задача   | Статус             | Результат                                                                                                                                                                                                                                       |
| -------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR 0.1   | `DONE`             | Текущий master plan добавлен, предыдущий план отмечен historical/reference.                                                                                                                                                                     |
| PR 0.2   | `DONE`             | Статусы проекта приведены к фактическим `FOUNDATION`, `NOT_IMPLEMENTED` и `BLOCKED_EXTERNAL`.                                                                                                                                                   |
| PR 1.1   | `DONE`             | QC fail-closed: типизированные секции и вычисляемый persisted status.                                                                                                                                                                           |
| PR 1.2   | `DONE`             | Tenant context отклоняет `SUSPENDED` organization до проверки membership.                                                                                                                                                                       |
| PR 1.3   | `DONE`             | n8n `keyId` server-bound к organization; per-org secrets encrypted и подписаны critical fields.                                                                                                                                                 |
| PR 1.4   | `DONE`             | Tenant-owned write APIs требуют organization/brand scope вместе с resource ID.                                                                                                                                                                  |
| PR 2.1   | `DONE`             | SourceCraft CI поднимает PostgreSQL + pgvector и выполняет integration gate.                                                                                                                                                                    |
| PR 2.2   | `DONE`             | Negative contracts покрывают foreign resources, revoked membership и insufficient permission.                                                                                                                                                   |
| PR 2.3   | `DONE`             | Reusable adapters моделируют storage/provider/repository failure, timeout и worker crash.                                                                                                                                                       |
| PR 2.4   | `DONE`             | Runtime валидирует core env, условные provider groups и отказывает worker/web при ошибке.                                                                                                                                                       |
| PR 3.1   | `DONE`             | Media pipeline uses PENDING, byte inspection and controlled READY/FAILED transitions.                                                                                                                                                           |
| PR 3.2   | `DONE`             | Research ingestion has explicit duplicate, processing and failed-retry transitions.                                                                                                                                                             |
| PR 3.3   | `DONE`             | Knowledge ingestion has retry-safe document and chunk persistence.                                                                                                                                                                              |
| PR 3.4   | `DONE`             | Publication dispatch bypasses unused PREPARING; legacy intermediate states have explicit recovery.                                                                                                                                              |
| PR 3.5   | `DONE`             | Provider success followed by persistence failure becomes reconcilable `OUTCOME_UNKNOWN`.                                                                                                                                                        |
| PR 3.6   | `DONE`             | Publication attempts are atomically acquired per idempotency key under parallel dispatch.                                                                                                                                                       |
| PR 3.7   | `DONE`             | Video provider success with persistence failure is retained as reconcilable `OUTCOME_UNKNOWN`.                                                                                                                                                  |
| PR 3.8   | `DONE`             | Content-project pillar and opportunity links are validated against the active brand graph.                                                                                                                                                      |
| PR 3.9   | `DONE`             | Storyboard creation is bound to verified tenant context and `content:write`.                                                                                                                                                                    |
| PR 4.1   | `DONE`             | Worker fails unsupported workflow types instead of recording false success.                                                                                                                                                                     |
| PR 4.2   | `DONE`             | Worker dispatches only registered handlers selected by workflow type.                                                                                                                                                                           |
| PR 4.3   | `DONE`             | A process-lifetime pg-boss singleton replaces per-webhook connection start/stop.                                                                                                                                                                |
| PR 4.4   | `DONE`             | Worker startup re-enqueues durable `QUEUED` workflow intents with pg-boss singleton keys.                                                                                                                                                       |
| PR 4.5   | `DONE`             | Worker emits `worker.ready` only after queue, recovery and handler registration complete.                                                                                                                                                       |
| PR 5.1   | `DONE`             | Better Auth login and server-protected `/app` shell are live with a browser E2E flow.                                                                                                                                                           |
| PR 5.2   | `DONE`             | Authenticated users can list and create their active owner organizations in `/app/organizations`.                                                                                                                                               |
| PR 5.3   | `DONE`             | Brand list/create is scoped to a verified organization context with owner MANAGE access.                                                                                                                                                        |
| PR 5.4   | `DONE`             | Route-aware application navigation and Better Auth session exit are available in the protected shell.                                                                                                                                           |
| PR 5.5   | `DONE`             | Browser-to-PostgreSQL owner/brand lifecycle is covered as one real authenticated flow.                                                                                                                                                          |
| PR 6.1   | `DONE`             | Brand-scoped knowledge document list has a protected application entry point.                                                                                                                                                                   |
| PR 6.2   | `DONE`             | Safe text, URL and UTF-8 text-file intake is connected to the protected Knowledge UI.                                                                                                                                                           |
| PR 6.3   | `DONE`             | Failed knowledge documents are retried from their persisted safe source within the active brand.                                                                                                                                                |
| PR 6.4   | `BLOCKED_EXTERNAL` | Brand-scoped hybrid retrieval is wired to OpenAI; live execution requires `OPENAI_API_KEY`.                                                                                                                                                     |
| PR 7.1   | `BLOCKED_EXTERNAL` | Firecrawl research search/extraction and a protected workspace exist; live execution requires `FIRECRAWL_API_KEY`.                                                                                                                              |
| PR 8.1   | `FOUNDATION`       | Provider-neutral `TextGenerationProvider` contract is available; it has no production SDK dependency.                                                                                                                                           |
| PR 8.2   | `BLOCKED_EXTERNAL` | One OpenAI Responses API adapter exists; live execution requires `OPENAI_API_KEY`.                                                                                                                                                              |
| PR 8.3   | `FOUNDATION`       | Tenant-scoped AI execution records track provider lifecycle, prompt version, usage, costs and errors.                                                                                                                                           |
| PR 8.4   | `FOUNDATION`       | The approved v1 prompt keys are versioned in code and unknown keys fail closed.                                                                                                                                                                 |
| PR 8.5   | `FOUNDATION`       | Context assembler returns only verified brand/project, evidence and optional retrieval context.                                                                                                                                                 |
| PR 8.6   | `DONE`             | Persisted AI draft generation through the execution boundary.                                                                                                                                                                                   |
| PR 8.7   | `DONE`             | Immutable rewrite creates a new version and independently tracked execution.                                                                                                                                                                    |
| PR 8.8   | `DONE`             | Fact-check persists claims and stops before editorial review.                                                                                                                                                                                   |
| PR 8.9   | `DONE`             | Protected content list/detail UI exposes only scoped project data.                                                                                                                                                                              |
| PR 9.1   | `DONE`             | Content state controls expose only valid next actions and fail visibly without OpenAI.                                                                                                                                                          |
| PR 9.2   | `DONE`             | Editorial request/review/comment actions are actor- and permission-scoped.                                                                                                                                                                      |
| PR 9.3   | `DONE`             | Human-only manual approval atomically records the reviewer and decision.                                                                                                                                                                        |
| PR 10.1  | `FOUNDATION`       | Protected brand media library lists scoped assets; live upload is `BLOCKED_EXTERNAL` until private S3 is configured.                                                                                                                            |
| PR 10.2  | `FOUNDATION`       | Storyboard generation accepts only an approved scoped script and validates generated beats against an active recipe.                                                                                                                            |
| PR 10.3  | `FOUNDATION`       | VideoProduction lifecycle is guarded from an approved storyboard; valid, invalid and recovery transitions are covered.                                                                                                                          |
| PR 10.4  | `BLOCKED_EXTERNAL` | HeyGen V2 runtime client is implemented; live calls require API key plus configured avatar and voice identifiers.                                                                                                                               |
| PR 10.5  | `FOUNDATION`       | Provider submissions require `GENERATING`, persist RenderJob before calls and completed polling advances to `COMPOSING`.                                                                                                                        |
| PR 10.6  | `FOUNDATION`       | Transcription is gated on the checked `COMPOSING` production's durable `READY` output asset.                                                                                                                                                    |
| PR 10.7  | `FOUNDATION`       | Scoped persisted transcripts serialize to private derived SRT/ASS assets linked by CaptionTrack.                                                                                                                                                |
| PR 10.8  | `FOUNDATION`       | `QC → READY` is available only through a gate that reads the latest scoped `PASSED` QC report.                                                                                                                                                  |
| PR 11.1  | `FOUNDATION`       | The protected active-brand social workspace lists VK/Instagram account status without returning credentials or token UI.                                                                                                                        |
| PR 11.2  | `FOUNDATION`       | VK/Instagram OAuth contracts, PKCE parameters and runtime-client adapters are isolated in the provider layer.                                                                                                                                   |
| PR 11.3  | `FOUNDATION`       | Due encrypted credentials refresh only through a scoped provider contract; success rotates ciphertext, failures persist account status.                                                                                                         |
| PR 11.4  | `FOUNDATION`       | Connect, disconnect, expiry and refresh failures persist scoped AuditLog events without tokens; disconnect removes credentials.                                                                                                                 |
| PR 12.1  | `FOUNDATION`       | A Publication starts only as DRAFT from an APPROVED project, matching PlatformVariant and connected scoped social account.                                                                                                                      |
| PR 12.2  | `FOUNDATION`       | Protected week/month calendar shows only active-brand scheduled publications and unscheduled DRAFT items.                                                                                                                                       |
| PR 12.3  | `FOUNDATION`       | A future `scheduledAt` atomically moves only the active-brand DRAFT Publication to QUEUED through the protected calendar action.                                                                                                                |
| PR 12.4  | `FOUNDATION`       | Due QUEUED records are read from PostgreSQL, create/reuse an idempotent dispatch WorkflowRun and enqueue a singleton pg-boss intent.                                                                                                            |
| PR 12.5  | `FOUNDATION`       | Only a QUEUED active-brand publication without an attempt can move its scheduledAt; the same record and provider boundary are retained.                                                                                                         |
| PR 12.6  | `FOUNDATION`       | A scoped QUEUED publication without an attempt atomically becomes CANCELLED; calendar reads exclude cancelled records.                                                                                                                          |
| PR 13.1  | `BLOCKED_EXTERNAL` | VK API `wall.post`/`wall.getById` adapter is fail-closed; real posting needs OAuth account tokens and a separate media-upload path.                                                                                                             |
| PR 13.2  | `BLOCKED_EXTERNAL` | Instagram Graph image container/publish adapter is fail-closed; needs OAuth token and public media delivery instead of private keys.                                                                                                            |
| PR 13.3  | `FOUNDATION`       | Worker claims due QUEUED publication atomically, then invokes a scoped provider through one durable workflow/attempt idempotency key.                                                                                                           |
| PR 13.4  | `FOUNDATION`       | Outcome investigation decrypts account credentials only at the provider boundary; VK and Instagram status checks preserve uncertainty on errors.                                                                                                |
| PR 13.5  | `FOUNDATION`       | Concurrent duplicate dispatches acquire one attempt and issue at most one provider mutation; uncertainty blocks all repeats until reconciliation.                                                                                               |
| PR 13.6  | `FOUNDATION`       | The scoped calendar surfaces FAILED, OUTCOME_UNKNOWN and expired/error accounts with safe codes and next steps, never provider credentials.                                                                                                     |
| PR 14.1  | `FOUNDATION`       | Published active-brand records create idempotent analytics.collect intents for +24/+72/+168h; future workflows stay out of the worker queue.                                                                                                    |
| PR 14.2  | `BLOCKED_EXTERNAL` | A bounded, fail-closed VK wall analytics adapter normalizes only available views/likes/comments/shares and never discloses an OAuth token.                                                                                                      |
| PR 14.3  | `BLOCKED_EXTERNAL` | A bounded, fail-closed Instagram Media Insights adapter normalizes only returned metrics and never discloses an OAuth token.                                                                                                                    |
| PR 14.4  | `FOUNDATION`       | A real worker dispatcher processes due `analytics.collect` workflows through scoped core/repository layers and fails closed.                                                                                                                    |
| PR 14.5  | `FOUNDATION`       | Tenant-scoped history repositories use bounded `take` and deterministic `cursor` pagination before dashboard reads.                                                                                                                             |
| PR 14.6  | `FOUNDATION`       | Protected per-brand dashboard aggregates only the latest normalized snapshot per publication; unavailable metrics remain explicit and never become mock zeroes.                                                                                 |
| PR 15.1  | `FOUNDATION`       | Each MCP tool handler receives an authenticated, token-free `McpAuthContext`; malformed or insufficient bearer keys fail closed before handler creation.                                                                                        |
| PR 15.2  | `FOUNDATION`       | Every MCP brand tool passes a shared active brand-in-organization guard before its handler can execute.                                                                                                                                         |
| PR 15.3  | `FOUNDATION`       | API-key authentication is pure; `lastUsedAt` mutates only through a separate post-auth context-bound action.                                                                                                                                    |
| PR 15.4  | `FOUNDATION`       | A startable stdio MCP process resolves a read-scoped key before constructing its server; the first business tools remain W15.5.                                                                                                                 |
| PR 15.5a | `FOUNDATION`       | MCP keys are bound to an active organization actor; legacy unbound keys and suspended actors fail closed before any tool can call an application service.                                                                                       |
| PR 15.5b | `FOUNDATION`       | The complete first tool catalogue is bound to tenant-scoped application services; tool permissions are enforced at the MCP edge before handlers.                                                                                                |
| PR 15.6  | `FOUNDATION`       | Negative MCP protocol and PostgreSQL contracts cover revoked, expired, wrong-scope, foreign-brand and unknown-tool paths.                                                                                                                       |
| PR 16.1  | `FOUNDATION`       | Structured logger emits only approved correlation and outcome fields with deterministic timestamps for tests.                                                                                                                                   |
| PR 16.2  | `FOUNDATION`       | Recursive redaction removes credential fields and bearer/API-key values from arbitrary error/context payloads.                                                                                                                                  |
| PR 16.3  | `FOUNDATION`       | Durable AuditLog covers brand/API-key actions, editorial approval/rejection, publication scheduling, dispatch and reconciliation without secrets.                                                                                               |
| PR 16.4  | `FOUNDATION`       | Infrastructure-compatible error reporter redacts error/context values before forwarding them to an optional sink.                                                                                                                               |
| PR 17.1  | `FOUNDATION`       | Publication transitions load only the scoped provider fields and one relevant attempt; ordinary transition/schedule/worker reads exclude credentials and relations.                                                                             |
| PR 17.2  | `FOUNDATION`       | Analytics reads use deterministic cursor pages with a narrowed projection; dashboard aggregation advances through bounded pages.                                                                                                                |
| PR 17.3  | `FOUNDATION`       | ContentProject detail loads bound versions/approvals/comments and expose tenant-scoped cursor methods for each history.                                                                                                                         |
| PR 17.4  | `FOUNDATION`       | Query audit added only indexes for proven project-list and due-publication queue predicates/sorts.                                                                                                                                              |
| PR 18.1  | `FOUNDATION`       | Web readiness fails closed for invalid runtime config or unavailable PostgreSQL; worker opens a loopback readiness probe only after config, DB/pg-boss and handler bootstrap.                                                                   |
| PR 18.2  | `FOUNDATION`       | PostgreSQL atomic rate limits protect auth, inbound n8n, MCP tools, AI generation and external search/extraction/indexing without storing raw request subjects.                                                                                 |
| PR 18.3  | `FOUNDATION`       | Outbound webhook configuration accepts only HTTPS URLs that pass the shared public-DNS/IP SSRF guard before encrypted persistence.                                                                                                              |
| PR 18.4  | `FOUNDATION`       | Root and immutable-release Docker images use multi-stage builds, a dedicated non-root runtime user and `pnpm prune --prod`; Git metadata, env files and Next build cache are excluded from runtime payloads.                                    |
| PR 18.5  | `FOUNDATION`       | Dependency graph, production and full lockfile audits are clean; unused `auth` and stale internal exports were removed, and workspace-wide esbuild override resolves only the patched 0.28.1 version.                                           |
| PR 18.6  | `FOUNDATION`       | Web and both Nginx profiles apply `nosniff`, DENY frame policy, strict referrer/permissions policy and a same-origin CSP; application-level contracts cover the response policy without relying on the proxy.                                   |
| PR 19.1  | `FOUNDATION`       | Portable Compose retains only web, worker and proxy as long-lived services; PostgreSQL/pgvector and S3 are external, maintenance clients require an explicit profile, and worker health uses real readiness.                                    |
| PR 19.2  | `FOUNDATION`       | The `db:migration-drill` command creates a disposable pgvector database, applies `migrate deploy`, seeds, starts the production web process and proves `/api/health/ready` before cleanup.                                                      |
| PR 19.3  | `FOUNDATION`       | The `db:backup-drill` command creates a non-empty custom-format `pg_dump` archive from a disposable pgvector database and verifies schema/seed entities through `pg_restore --list` before cleanup.                                             |
| PR 19.4  | `FOUNDATION`       | The `db:restore-drill` command restores a real source archive into a separate clean pgvector database, verifies migrations/critical seed entities and proves standalone web readiness on the restored target.                                   |
| PR 19.5  | `BLOCKED_EXTERNAL` | Read-only DNS/TCP checks pass, but public HTTP/HTTPS serve generic Nginx and TLS is not trusted for `fabrika.ams24.ru`; vhost, certificate and release inputs remain external and unmodified.                                                   |
| PR 19.6  | `FOUNDATION`       | `release:smoke` proves the local V0.1 editorial, cross-tenant isolation, no-credential limited-mode and worker paths on a disposable pgvector database. Deterministic generation is explicit test-only evidence, never live-provider readiness. |
| Next     | `Release Gate`     | Remains `BLOCKED_EXTERNAL` until the documented Timeweb, TLS/vhost, live-provider and owner-authorization inputs are independently completed.                                                                                                   |

### W6.4 — hybrid retrieval

The protected Knowledge UI now has an explicit indexing action for each ready document and a hybrid search
form. Both actions rebuild the Better Auth actor and tenant context before reaching application services;
indexing additionally requires `content:write`. Search and embedding use `OpenAiEmbeddingProvider` only in
the live application path. Test-only `MockEmbeddingProvider` proves active-brand retrieval and rejects a
foreign document without embedding it. The current environment has no `OPENAI_API_KEY`, so the UI returns a
visible `BLOCKED_EXTERNAL` status rather than pretending that search succeeded. Live indexing and search
remain blocked until a valid provider credential is supplied.

### W7 — protected research workspace

The application now exposes a brand-scoped research workspace only below a verified organization and
brand. Better Auth session data is rebuilt into a tenant context in every Server Action and the application
service owns list, text intake, URL intake and external search. The production `FirecrawlResearchProvider`
uses the documented `/v2/search` and `/v2/scrape` endpoints, while URL fetches still pass the core
SSRF-safe URL guard before any provider call. Results, extracted content and persisted research items stay
inside organization-and-brand repository predicates. No fallback turns an unavailable provider into a
successful result: without `FIRECRAWL_API_KEY`, URL ingestion and search visibly return
`BLOCKED_EXTERNAL`. Provider mapping, workspace isolation and the browser path are covered without a live
provider request.

### W8.1 — text generation boundary

`TextGenerationProvider` is the only application-facing contract for a text generation request and its
response. It contains no provider SDK dependency, model routing, fallback matrix or product-path mock.
`MockTextGenerationProvider` is a deterministic test double only; the production adapter is the next
separate task and will remain `BLOCKED_EXTERNAL` until its credential is available.

### W8.2 — one production LLM adapter

`OpenAiTextGenerationProvider` implements the provider-neutral contract through the Responses API only.
It has no model routing or fallback behavior, uses a bounded request signal and sends `store: false`.
Missing `OPENAI_API_KEY`, invalid upstream HTTP responses and empty output never become a generated draft.
The local environment has no key, so all live text generation remains `BLOCKED_EXTERNAL`.

### W8.3 — AI execution model

`AiExecution` persists a content-project-bound provider intent and its lifecycle with organization and
brand predicates, prompt key/version, token usage, estimated/actual costs and an error record. The
repository rejects a project from another brand and every state write is constrained by organization,
brand, project, execution id and expected current status. The migration is additive; no existing content
record changes.

### W8.5 — context assembler

The application service resolves the actor before reading a content project, brand profile, brand voices,
active pillars and bounded evidence. It can invoke hybrid retrieval only through an injected retrieval
boundary for the same resolved brand; neither arbitrary route data nor a tenant-wide dump is accepted.

### W8.6 — persisted AI draft generation

The generation application service verifies the actor and assembles only the resolved brand context before
it creates and starts an `AiExecution`. After a provider response, it appends an immutable AI-authored
`ContentVersion`, records token usage and moves the content project from `RESEARCHING` to `DRAFT`. A missing
live credential creates no draft: its execution is retained as `FAILED` with `BLOCKED_EXTERNAL`, while the
project remains available for a later configured generation attempt. A persistence failure after provider
success is intentionally not relabelled as a provider failure; the execution remains the reconciliation
signal for the integrity/recovery work.

### W8.7 — immutable rewrite loop

A rewrite is accepted only for a `DRAFT` project and a source version that belongs to the same checked
organization, brand and content project. It creates a separate AI-authored version and tracks a distinct
`AiExecution`; the selected source is never modified. Missing provider credentials and provider failures
leave the draft untouched and preserve a failed execution record for diagnosis.

### W8.8 — fact-check gate

The fact-check service accepts only a checked `DRAFT` project, extracts its version assertions into
tenant-scoped claims and evaluates the evidence already attached to each claim. It persists supported or
unverified status and returns unsupported findings to the caller before leaving the project in `FACT_CHECK`.
This first version deliberately surfaces rather than silently suppresses unsupported claims; a separate
editorial request is required to enter `REVIEW`, and it never moves content to `APPROVED`.

### W8.9 — content project UI

The protected content workspace lists only projects for the resolved organization and brand. Its project view
shows the current immutable version, status, version/approval counts and persisted fact-check claims with
their evidence. Empty states distinguish absent projects, versions and findings; the UI has no direct Prisma
access and does not expose a cross-brand project.

### W9.3 — manual approval invariant

The only approval application service resolves a human actor and requires `content:review`. It atomically
creates an approval record and performs the guarded `REVIEW → APPROVED` transition. A writer, non-review
status or repeated request is denied; provider and worker code have no approval entry point.

### W9.2 — editorial review actions

The protected content-project entry point exposes only valid status actions: a writer can request
`FACT_CHECK → REVIEW` and add a scoped comment; a reviewer can approve, return the project to `DRAFT` or
reject it from `REVIEW`. Every server action reconstructs the session and delegates to the same checked
application service. The browser contract proves the full `FACT_CHECK → REVIEW → APPROVED` path.

### W9.1 — content state UI

The protected workspace can create a brand-scoped content project and exposes only its next valid action:
`IDEA → RESEARCHING`, live generation from `RESEARCHING`, and `DRAFT → FACT_CHECK`. The web layer calls
core application factories only. In the current credential-free environment, the production generation
request visibly returns `BLOCKED_EXTERNAL` and leaves the project in `RESEARCHING`; it never fabricates a
mock draft.

### W10.1 — protected media library

The media route rebuilds the authenticated actor and lists assets only through an organization-and-brand
repository predicate. It represents upload, AI-generated, research and derived source types without
claiming that a missing asset exists. The upload entry point delegates to the media application boundary;
in the current environment it explicitly returns `BLOCKED_EXTERNAL` before any database or object-storage
write because private S3-compatible production storage is not configured. `MockStorageProvider` remains
test-only and proves checksum storage plus active-brand isolation.

### W10.2 — storyboard generation from an approved script

Storyboard generation resolves the actor and a `content:write` tenant context before it reads a content
project. The repository requires the project to be `APPROVED`, the selected version to belong to it and the
video recipe to be active. The LLM output must be JSON with bounded narration, allowed visual job, visual
instruction and duration per beat; jobs and total duration are checked against the selected recipe before
the storyboard is persisted. The production composition root uses the existing OpenAI provider boundary;
without a configured credential it returns `BLOCKED_EXTERNAL`, while `MockTextGenerationProvider` is only
used by the integration contract.

### W10.3 — VideoProduction lifecycle

The product-path workflow creates a production only from an `APPROVED` storyboard of an `APPROVED` scoped
content project and an active recipe. Its transitions load the actual persisted state rather than accepting a
client-provided source state, apply the lifecycle table atomically and record start/terminal timestamps.
Invalid skips are rejected; a failed production can re-enter `GENERATING` with its old completion timestamp
cleared for an auditable recovery attempt.

### W6.3 — controlled knowledge retry

Only a document selected by all four predicates — active organization, active brand, document id and
`FAILED` status — can enter recovery. The application service replays the already persisted, validated
source text into the same document through the existing `FAILED → PROCESSING → READY` transition service
and chunk upserts; it never refetches a URL, trusts route data as authority or creates a second document.
A foreign-brand, pending or otherwise non-failed document is rejected without a status write. The browser
scenario exercises the visible retry control against a real failed database record.

### W6.2 — knowledge intake

The Knowledge page accepts text, URL and UTF-8 textual file sources through individual Server Actions. Each
action reconstructs the Better Auth actor and organization/brand context before it delegates to the existing
ingestion application service; no client or action issues Prisma queries. URL intake continues to use its
fail-closed SSRF-safe provider path, while file intake preserves the core extension, MIME, byte-size and
UTF-8 validation. A browser test performs actual text ingestion and sees the READY document rendered.

### W6.1 — knowledge document list

The first Knowledge UI entry point is nested below a verified organization and brand. Its application service
rebuilds the authenticated tenant context, requires `brand:read`, and asks a repository to list documents
with both organization and brand predicates. The browser path and a foreign-organization negative contract
prove that the page never treats route parameters as authorization.

### W5.5 — first real end-to-end application flow

One Playwright scenario now traverses the available product path using the real Better Auth route, browser
login, organization and brand forms, application services and PostgreSQL. It verifies that the visible
result has persisted as an ACTIVE organization with the session user as ACTIVE OWNER and an ACTIVE brand
with that user granted MANAGE. It then signs out and proves the nested brand route is denied again. The
scenario uses no provider mock or direct test fixture for its product records; the only setup is the
official Better Auth sign-up route required to obtain an account.

### W5.4 — application navigation

The protected application shell exposes only the entry points that are actually implemented: workspace and
organizations. Navigation uses Next.js links, marks the current route accessibly and retains no tenant data
in the client. A small Better Auth client component performs a real session sign-out, redirects to login
only after the provider confirms success and reports an accessible error on failure. Browser coverage proves
navigation, current-route indication, logout and subsequent anonymous denial of `/app`.

### W5.3 — brands UI

Brand UI is nested beneath an organization route and never treats that route id as authorization. The server
resolves the current user's tenant context for every list/create operation; list requires `brand:read` and
creation requires `brand:manage`. A brand is created with an explicit `MANAGE` BrandAccess for its creator.
Integration and browser contracts prove same-tenant success, cross-organization denial, editor denial and
safe same-name slug allocation.

### W5.2 — organizations UI

The authenticated organization entry point is now real: a server component lists only ACTIVE memberships in
ACTIVE organizations for the current session user, and a server action creates an organization with that user
as `OWNER`. No client component touches Prisma. Slug allocation is collision-safe, invalid names are
rejected, and integration/E2E contracts prove owner creation, isolation from another user and revoked-access
exclusion.

### W5.1 — protected application shell

`/app` now enforces a Better Auth session in its server layout before rendering any workspace UI; anonymous
requests are redirected to `/login?next=/app`. The login form uses the Better Auth client and only permits
safe local `/app` return paths. A real Playwright flow proves anonymous denial, credential sign-in and the
authenticated shell. Organization and brand selection deliberately remain separate W5 tasks.

### W4.5 — worker readiness signal

Worker startup is now an explicit bootstrap sequence. It emits a supervisor-safe `worker.ready` signal only
after environment validation, pg-boss startup, queued-work reconciliation and registration of every current
handler. A bootstrap failure emits no ready signal and closes an already-started queue. This is a process
readiness signal; the external, real readiness probe remains scheduled for W18.

### W4.4 — lost queued-work reconciliation

At worker startup the workflow repository lists durable `QUEUED` runs and re-enqueues each intent using
its workflow-run id as the pg-boss `singletonKey`. This recovers work after an interrupted worker or a
lost broker job without introducing a new direct execution path. Unit and PostgreSQL integration contracts
verify the durable query and exact job payload.

### W4.3 — managed queue lifecycle

`enqueueWorkflowRun` now obtains a process-lifetime pg-boss queue instead of opening and stopping a
connection for every webhook or application request. Initialization is shared by concurrent enqueue calls;
an initialization error clears the retained promise so the next request can retry. The default workflow
repository is created lazily on the first enqueue, preserving import-time isolation from database access.
Explicit lifecycle helpers provide a controlled shutdown path, while the unit contract proves reuse and
recovery after an initialization failure.

### W4.2 — explicit workflow dispatcher

The worker owns a closed `workflow type → registered handler` map. `system.health` is the initial actual
handler; only its completed return value permits `SUCCEEDED`. Missing handlers retain the typed
`UNSUPPORTED_WORKFLOW_TYPE` failure path, and payload values never choose executable functions.

### W4.1 — worker fail-closed contract

Before W4.2 registers actual workflow handlers, a queued workflow is never reported as successful merely
because a worker dequeued it. The worker records `FAILED` with `UNSUPPORTED_WORKFLOW_TYPE` and rethrows a
typed error; this preserves retry/audit visibility without fabricating business completion.

### W3.4 — executable publication-state contract

| State               | How entered                                                          | Valid exits                                   | Terminal / recovery                                             |
| ------------------- | -------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------- |
| `DRAFT`             | Publication is created.                                              | `QUEUED`, `CANCELLED`                         | Not terminal.                                                   |
| `QUEUED`            | Scheduling, failed retry or recovery of a legacy intermediate state. | `PUBLISHING`, `CANCELLED`                     | Not terminal.                                                   |
| `PREPARING`         | Legacy persisted state only; new dispatch never writes it.           | `QUEUED`, `FAILED`, `CANCELLED`               | Explicit recovery to `QUEUED`.                                  |
| `UPLOADING`         | Legacy persisted state only; new dispatch never writes it.           | `QUEUED`, `FAILED`, `CANCELLED`               | Explicit recovery to `QUEUED`.                                  |
| `PROCESSING`        | Legacy persisted state only; new dispatch never writes it.           | `QUEUED`, `FAILED`, `CANCELLED`               | Explicit recovery to `QUEUED`.                                  |
| `READY_TO_FINALIZE` | Legacy persisted state only; new dispatch never writes it.           | `QUEUED`, `FAILED`, `CANCELLED`               | Explicit recovery to `QUEUED`.                                  |
| `PUBLISHING`        | Controlled transition immediately before the provider mutation.      | `PUBLISHED`, `FAILED`, `OUTCOME_UNKNOWN`      | Not terminal; result is persisted through a guarded transition. |
| `PUBLISHED`         | Provider success or provider investigation confirms the post.        | None.                                         | Terminal.                                                       |
| `FAILED`            | Provider mutation failed before a confirmed external outcome.        | `QUEUED`, `CANCELLED`                         | Controlled retry or cancellation.                               |
| `OUTCOME_UNKNOWN`   | Provider outcome is uncertain after a mutation.                      | Only reconciliation: `PUBLISHED` or `QUEUED`. | Never re-dispatched by ordinary scheduling.                     |
| `CANCELLED`         | Cancellation before a terminal external result.                      | None.                                         | Terminal.                                                       |

`PREPARING`, `UPLOADING`, `PROCESSING` and `READY_TO_FINALIZE` remain in the database enum for safe
recovery of historical rows but have no new write path until their durable steps are implemented.

### W3.5 — provider-result reconciliation

After a provider mutation returns success, any failure that prevents final local persistence is treated as
`OUTCOME_UNKNOWN`, never as `FAILED`. The service preserves the provider operation/job identity, blocks
another dispatch and exposes `investigate()`. Provider-confirmed `PUBLISHED` completes the local state;
provider-confirmed `NOT_FOUND` records the failed attempt and requeues it. An inconclusive provider result
remains `OUTCOME_UNKNOWN`.

### W3.6 — atomic publication attempts

`createOrGetAttempt()` serializes only the intent persistence by locking the owning publication row inside
a database transaction. It returns the existing logical attempt for the same idempotency key or creates the
next attempt number exactly once; the external provider call is never made while the lock is held. Parallel
dispatches observing an in-progress attempt receive a typed in-progress result rather than issuing another
provider mutation.

### W3.7 — video provider reconciliation

The video generation intent is persisted before the provider call. If provider `create()` succeeds but
external-job persistence fails, the render job is marked `OUTCOME_UNKNOWN` with the provider job identity
instead of `FAILED`. `poll()` is the reconciliation path: it queries that provider job and writes its later
status without resubmitting a video generation request.

### W3.8 — resource graph validation

Every content project now verifies its selected `ContentPillar` and `ContentOpportunity` in the active
brand before persistence. When an opportunity is classified under a pillar, that pillar must match the
project pillar. Existing scoped repositories continue to enforce the remaining resource graph edges.

### W3.9 — storyboard authorization boundary

`Storyboard.create()` accepts a verified `TenantContext`, not caller-provided organization/brand IDs. It
requires `content:write`, requires a selected brand and passes only the validated scope to the repository.

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
