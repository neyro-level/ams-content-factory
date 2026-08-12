# AMS CONTENT OS — historical/reference
## Master Development Plan

> **Статус:** historical/reference. Текущий единственный план реализации —
> [`MASTER_IMPLEMENTATION_PLAN.md`](MASTER_IMPLEMENTATION_PLAN.md). Этот документ сохраняется для
> истории продуктовых решений и не используется для определения готовности модулей или очередности PR.

**Прежний статус:** APPROVED
**Назначение:** единый source of truth для автономной разработки  
**Основной исполнитель:** OpenAI Codex  
**Рекомендуемый режим первого прохода:** GPT-5.6 Terra / High reasoning  
**Рекомендуемый режим рутинных последующих задач:** GPT-5.6 Terra / Medium  
**Ревью критических архитектурных и security-изменений:** High; при возможности отдельным сильным reviewer-моделем  
**Production deployment:** отдельный финальный этап после готовности приложения и предоставления production credentials

---

# 0. Цель продукта

Создать **AMS Content OS** — собственную AI-driven систему управления контентом, которая объединяет:

- управление несколькими брендами и клиентами;
- бренд-контекст и базу знаний;
- Research Inbox;
- автоматический сбор и анализ источников;
- генерацию контентных возможностей;
- создание контента;
- проверку фактов;
- сценарии;
- storyboard;
- производство AI-видео;
- HeyGen;
- дополнительные motion/video providers;
- Remotion;
- FFmpeg;
- субтитры;
- quality control;
- human approval;
- публикацию в Instagram и VK;
- календарь;
- аналитику;
- учёт AI/API-затрат;
- learning loop;
- MCP;
- n8n webhooks;
- возможность дальнейшего превращения системы в SaaS.

Приложение не должно быть просто интерфейсом над OpenAI, HeyGen или Postiz.

Главная ценность продукта:

> единая операционная система, которая хранит знания бренда, понимает источники, создаёт контент, производит материалы, публикует их, измеряет результат и постепенно улучшает следующие материалы.

---

# 1. Основные архитектурные принципы

Эти правила обязательны.

## 1.1. Docs-first

Перед написанием бизнес-кода создать и поддерживать:

```text
README.md

AGENTS.md

docs/
  MASTER_DEVELOPMENT_PLAN.md
  ARCHITECTURE.md
  DATA_MODEL.md
  SECURITY.md
  WORKFLOWS.md
  PROVIDERS.md
  DESIGN_SYSTEM.md
  TESTING.md
  OPERATIONS.md
  DEPLOYMENT.md
  ENVIRONMENT.md
  DECISIONS.md
  BUILD_STATUS.md
```

Документация должна отражать фактический код.

Если документация и код расходятся:

> код считается фактическим состоянием, но расхождение должно быть устранено до завершения текущего этапа.

Не оставлять устаревшую документацию.

---

## 1.2. Один источник истины

Основной business state хранится в PostgreSQL.

Не создавать несколько конкурирующих state engines.

Не использовать одновременно в качестве источника истины:

- n8n;
- Redis;
- Temporal;
- LangGraph;
- provider state;
- UI state.

Они могут выполнять работу, но каноническое состояние бизнес-процессов хранится в PostgreSQL.

---

## 1.3. Multi-tenant с первого дня

Архитектура:

```text
Organization
    ↓
Membership
    ↓
Brand
    ↓
все остальные сущности
```

Все бизнес-данные должны быть привязаны минимум к `Brand`, а через него — к `Organization`.

Никакая сущность одного tenant не должна быть доступна другому.

---

## 1.4. Provider abstraction

Нельзя жёстко связывать business logic с:

- OpenAI;
- HeyGen;
- Motion;
- Instagram;
- VK;
- Firecrawl;
- Yandex Search;
- конкретным embedding model;
- конкретным image model;
- конкретным transcription provider.

Использовать интерфейсы adapters/providers.

---

## 1.5. Human-in-the-loop

Автоматизация не означает отсутствие контроля.

Для критических переходов предусмотреть approval gates:

```text
AI draft
→ review
→ approve/rewrite/reject
→ production
→ QC
→ approve
→ schedule
→ publish
```

Однако система должна позволять позже включать автоматические режимы для конкретного Brand.

---

## 1.6. Idempotency

Любая операция, которая может создать:

- пост;
- видео;
- платный AI render;
- upload;
- webhook;
- external resource,

должна иметь idempotency strategy.

Особенно это касается публикации в социальных сетях.

---

## 1.7. External API ≠ business logic

API провайдеров размещать только в provider layer.

Например:

```text
InstagramProvider
VkProvider
HeyGenProvider
OpenAIProvider
MotionProvider
FirecrawlProvider
YandexSearchProvider
```

Business layer не должна знать специфические HTTP endpoints этих сервисов.

---

# 2. Автономный режим работы Codex

## КРИТИЧЕСКОЕ ПРАВИЛО

Codex не должен останавливать реализацию из-за отсутствия:

- домена;
- production-сервера;
- production-БД;
- API keys;
- Instagram credentials;
- VK credentials;
- HeyGen credentials;
- Motion credentials;
- S3 credentials;
- SMTP credentials.

При отсутствии внешнего секрета:

1. реализовать interface;
2. реализовать production adapter настолько, насколько позволяют официальные API contracts;
3. создать mock/fake provider для tests/dev;
4. написать contract tests;
5. отметить реальный integration test как:

```text
BLOCKED_EXTERNAL
```

6. продолжить следующий этап.

Не задавать пользователю вопрос.

---

## 2.1. Нельзя делать

Не оставлять:

```text
TODO implement later
return true
return {}
throw new Error("not implemented")
```

в коде, который считается готовым.

Допускаются только явно изолированные external blockers, например:

```text
Instagram real OAuth test:
BLOCKED_EXTERNAL: credentials required
```

При этом production adapter должен существовать.

---

## 2.2. Если решение неоднозначно

Использовать следующий порядок:

1. этот Master Plan;
2. `docs/DECISIONS.md`;
3. Design System;
4. официальная документация используемой технологии;
5. наиболее простое безопасное решение;
6. наиболее легко поддерживаемое решение.

Не запрашивать человека по мелким архитектурным решениям.

Принятое решение записывать в `docs/DECISIONS.md`.

---

## 2.3. После каждого этапа

Обязательно выполнить:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

При наличии integration/e2e:

```bash
pnpm test:integration
pnpm test:e2e
```

Если хотя бы одна обязательная проверка не проходит — этап не считается завершённым.

---

# 3. Технический baseline

## Верифицировано на дату документа

Использовать:

```text
Node.js 22
TypeScript
Next.js 16
React 19
Prisma 7
PostgreSQL
pgvector
Tailwind CSS
pnpm
```

Prisma 7 перешла на ESM-подход; официальная документация рекомендует Node 22.x и новый `prisma-client` generator вместо старого `prisma-client-js`.

Next.js 16 использовать через App Router. Линтинг запускать отдельной командой: начиная с Next.js 16 `next build` больше сам не запускает lint.

---

# 4. Структура репозитория

Использовать один repository и `pnpm workspaces`.

Не добавлять Turborepo без реальной необходимости.

Целевая структура:

```text
/
├── apps/
│   ├── web/
│   ├── worker/
│   └── mcp/
│
├── packages/
│   ├── db/
│   ├── core/
│   ├── providers/
│   ├── jobs/
│   ├── ui/
│   ├── config/
│   └── observability/
│
├── docs/
│
├── deploy/
│
├── scripts/
│
├── tests/
│
├── AGENTS.md
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

---

# 5. Назначение пакетов

## apps/web

Next.js application.

Содержит:

- UI;
- Server Components;
- Server Actions;
- Route Handlers;
- OAuth callback endpoints;
- public API;
- internal admin.

Не размещать business logic непосредственно в React components.

---

## apps/worker

Отдельный Node.js worker process.

Выполняет:

- research;
- embeddings;
- AI generations;
- video jobs;
- provider polling;
- QC;
- publishing;
- analytics collection;
- scheduled jobs;
- learning jobs.

Web и worker используют общий `packages/core`.

---

## apps/mcp

Remote MCP server.

Первоначально реализуется после стабилизации core.

Не должен содержать независимую business logic.

Вызывает application services из `packages/core`.

---

## packages/db

Содержит:

```text
Prisma schema
Prisma migrations
Prisma client
repositories
DB helpers
tenant context
test DB utilities
```

---

## packages/core

Domain/application layer.

Например:

```text
brands/
research/
content/
video/
publishing/
analytics/
workflows/
ai/
costs/
approvals/
```

---

## packages/providers

Все внешние integrations:

```text
ai/
search/
fetch/
storage/
video/
social/
transcription/
email/
```

---

## packages/jobs

Очереди и worker registration.

Использовать PostgreSQL queue.

### Рекомендованное решение: pg-boss

Не добавлять Redis только ради queue.

pg-boss работает поверх PostgreSQL и в актуальной реализации предоставляет integration path с Prisma 7 transactions.

При несовместимости конкретной версии разрешается перейти на Graphile Worker после записи ADR в `DECISIONS.md`; Graphile Worker также использует PostgreSQL как job queue.

Основной вариант — pg-boss.

---

# 6. Authentication

Использовать:

```text
Better Auth
+
Prisma 7
```

Better Auth имеет официальный Prisma adapter и отдельно учитывает особенности Prisma 7.

Использовать Better Auth для:

- users;
- passwords;
- sessions;
- email verification при необходимости;
- account management.

Не перекладывать всю tenant/business authorization на Better Auth plugins.

Собственные сущности:

```text
Organization
Membership
BrandAccess
```

остаются частью доменной модели AMS Content OS.

---

# 7. RBAC

Организационные роли:

```text
OWNER
ADMIN
EDITOR
REVIEWER
VIEWER
```

Разрешения:

### OWNER

Полный доступ.

### ADMIN

Всё, кроме удаления Organization и передачи ownership.

### EDITOR

Создание/редактирование:

- research;
- content;
- media;
- video;
- publication drafts.

### REVIEWER

- просмотр;
- comments;
- approve;
- reject.

### VIEWER

Только read-only.

---

# 8. Brand-level access

Добавить возможность ограничить пользователя конкретными брендами.

Например:

```text
User
 ↓
Organization Membership
 ↓
BrandAccess
 ↓
Brand Bastion
```

Это позволит позже дать клиенту доступ только к его бренду.

---

# 9. Tenant security

Создать обязательные helpers:

```text
requireSession()
requireOrganization()
requireOrganizationRole()
requireBrandAccess()
```

Запретить прямой Prisma access из:

- React components;
- route handlers;
- server actions.

Доступ должен проходить через repositories/application services.

---

# 10. Prisma conventions

Все основные сущности:

```text
id          UUID/CUID
createdAt
updatedAt
```

где требуется:

```text
deletedAt
createdBy
updatedBy
```

Все tenant models должны иметь:

```text
organizationId
```

или надёжный путь через `brandId`.

Предпочтительно хранить `organizationId` и `brandId` непосредственно в high-volume моделях для:

- security;
- query simplicity;
- индексов;
- аналитики.

---

# 11. Блок Identity

Создать модели:

```text
Organization
Membership
Brand
BrandAccess
```

### Organization

Основные поля:

```text
id
name
slug
status
createdAt
updatedAt
```

### Membership

```text
id
organizationId
userId
role
status
createdAt
updatedAt
```

Unique:

```text
organizationId + userId
```

### Brand

```text
id
organizationId
name
slug
status
timezone
locale
websiteUrl
description
createdAt
updatedAt
deletedAt
```

Unique:

```text
organizationId + slug
```

---

# 12. Brand Intelligence

Создать:

```text
BrandProfile
BrandVoice
ContentPillar
BrandChannelPreference
```

---

## BrandProfile

Хранить:

```text
positioning
targetAudience
offers
customerProblems
differentiators
proof
competitors
constraints
forbiddenClaims
ctaRules
commercialContext
additionalContext
```

Не хранить всё одним гигантским plain text.

Часть структуры хранить typed JSON.

---

## BrandVoice

```text
brandId
language
toneSummary
styleRules
doRules
dontRules
lexicon
forbiddenWords
exampleTexts
ctaExamples
```

---

## ContentPillar

```text
id
brandId
name
description
priority
status
```

Примеры:

```text
маркетинг недвижимости
сайты
каталоги
CRM
AI
аналитика
кейсы
разборы
```

Это только seed для demo Brand.

Не хардкодить в core.

---

# 13. Knowledge Base

Создать:

```text
KnowledgeDocument
KnowledgeChunk
```

---

## KnowledgeDocument

Типы:

```text
FILE
URL
TEXT
NOTE
CASE
PRODUCT
```

Поля:

```text
id
organizationId
brandId
title
type
sourceUrl
mediaAssetId
status
checksum
metadata
createdAt
updatedAt
```

Статусы:

```text
PENDING
PROCESSING
READY
FAILED
ARCHIVED
```

---

## KnowledgeChunk

```text
id
brandId
documentId
ordinal
content
tokenCount
embedding
metadata
```

Использовать pgvector.

Перед реализацией vector column Codex обязан проверить актуальный поддерживаемый способ Prisma 7 + pgvector.

Допускается raw SQL migration для:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

и vector queries.

---

# 14. Hybrid retrieval

Knowledge retrieval должен учитывать:

```text
semantic similarity
+
text relevance
+
document metadata
+
brand isolation
```

Не передавать в LLM всю базу знаний.

Использовать top-N релевантных fragments.

---

# 15. Research Engine

Создать полноценный research module.

Основные сущности:

```text
ResearchInboxItem
ResearchSource
ResearchItem
ResearchReport
ContentOpportunity
Claim
Evidence
```

---

# 16. Research Inbox

Пользователь должен иметь возможность добавить:

```text
URL
текст
идею
заметку
файл
```

Статусы:

```text
NEW
PROCESSING
READY
REJECTED
ARCHIVED
FAILED
```

---

# 17. Research pipeline

Workflow:

```text
ResearchInboxItem
        ↓
canonicalize
        ↓
deduplicate
        ↓
fetch
        ↓
extract
        ↓
classify
        ↓
summarize
        ↓
score relevance
        ↓
extract claims
        ↓
generate content angles
        ↓
ContentOpportunity
```

---

# 18. Research Providers

Интерфейсы:

```text
SearchProvider
PageFetcherProvider
```

Начальные adapters:

```text
YandexSearchProvider
FirecrawlProvider
```

При отсутствии ключей:

```text
MockSearchProvider
MockPageFetcherProvider
```

---

# 19. ResearchSource

Поля:

```text
id
brandId
canonicalUrl
domain
sourceType
title
author
publishedAt
capturedAt
metadata
```

---

# 20. ResearchItem

```text
id
brandId
sourceId
title
summary
rawContentStorageKey
contentHash
publishedAt
capturedAt
relevanceScore
noveltyScore
status
```

По `contentHash` выполнять deduplication.

---

# 21. Evidence Layer

Это обязательный компонент.

Нельзя позволять AI выдавать фактическое утверждение за подтверждённое только потому, что LLM его «знает».

Создать:

```text
Claim
Evidence
```

### Claim

```text
id
brandId
contentProjectId
text
type
status
confidence
```

Статусы:

```text
UNVERIFIED
SUPPORTED
CONFLICTING
REJECTED
```

### Evidence

```text
id
claimId
researchItemId
sourceUrl
sourceTitle
capturedAt
excerpt
mediaAssetId
confidence
metadata
```

---

# 22. ContentOpportunity

Research должен создавать не сразу готовый пост, а opportunity.

Поля:

```text
id
brandId
pillarId
title
angle
whyNow
audience
commercialRelevance
relevanceScore
noveltyScore
evidenceScore
overallScore
status
createdAt
```

Статусы:

```text
NEW
SHORTLISTED
ACCEPTED
REJECTED
CONVERTED
ARCHIVED
```

---

# 23. Content Engine

Основные сущности:

```text
ContentProject
ContentVersion
PlatformVariant
ContentTag
Approval
EditorialComment
```

---

# 24. ContentProject

Главный контейнер конкретной единицы контента.

```text
id
organizationId
brandId
pillarId
opportunityId
title
goal
audience
contentType
status
priority
recipeId
targetPublishAt
createdBy
createdAt
updatedAt
```

---

# 25. Content types

Первоначально:

```text
REEL
SHORT_VIDEO
SOCIAL_POST
CAROUSEL
STORY
ARTICLE
CASE
EXPLAINER
```

Архитектура не должна ограничиваться видео.

---

# 26. Content state machine

```text
IDEA
↓
RESEARCHING
↓
DRAFT
↓
FACT_CHECK
↓
REVIEW
↓
APPROVED
↓
PRODUCTION
↓
QC
↓
READY
↓
SCHEDULED
↓
PUBLISHED
↓
ARCHIVED
```

Дополнительные:

```text
REJECTED
FAILED
CANCELLED
```

Запретить хаотичные transitions.

Создать transition service.

---

# 27. ContentVersion

Никогда не перезаписывать старую редакцию AI-текста без версии.

```text
id
contentProjectId
version
brief
hook
body
cta
script
notes
createdByType
createdByUserId
aiExecutionId
createdAt
```

`createdByType`:

```text
USER
AI
SYSTEM
```

---

# 28. PlatformVariant

Один ContentProject может иметь варианты:

```text
Instagram
VK
Telegram
YouTube
```

Первоначально реально публикуются только:

```text
Instagram
VK
```

Поля:

```text
platform
title
caption
description
hashtags
cta
mediaConfiguration
status
```

---

# 29. AI Content Pipeline

Процесс:

```text
Brand Context
+
Relevant Knowledge
+
Research
+
Evidence
+
Content Opportunity
      ↓
Content Brief
      ↓
Draft
      ↓
Claim extraction
      ↓
Evidence validation
      ↓
Brand Voice Review
      ↓
Commercial Review
      ↓
ContentVersion
```

---

# 30. AI self-review

После первоначальной генерации отдельный AI step должен проверить:

```text
factuality
brand fit
commercial relevance
repetition
generic language
forbidden claims
CTA
platform fit
```

Генерирующая модель не должна автоматически считать собственный результат правильным.

---

# 31. Prompt Registry

Не разбрасывать prompts по React components.

Создать:

```text
packages/core/prompts/
```

Prompt должен иметь:

```text
key
version
purpose
input schema
output schema
```

Каждый AIExecution сохраняет:

```text
promptKey
promptVersion
```

---

# 32. Structured AI outputs

Там, где результат должен использоваться программой, требовать structured output.

Например:

```text
ResearchReportSchema
ContentOpportunitySchema
StoryboardSchema
ClaimValidationSchema
EvaluationSchema
```

Использовать Zod.

Не парсить произвольный Markdown там, где нужен объект.

---

# 33. AI Provider layer

Создать:

```ts
interface LLMProvider
interface EmbeddingProvider
interface ImageGenerationProvider
interface TranscriptionProvider
```

Primary adapter:

```text
OpenAIProvider
```

Но модель не хардкодить.

Хранить:

```text
ModelConfiguration
```

---

# 34. ModelConfiguration

```text
id
organizationId?
brandId?
capability
provider
model
reasoningEffort
temperature
maxOutputTokens
enabled
isDefault
```

Capabilities:

```text
RESEARCH
WRITING
REVIEW
FACT_CHECK
STORYBOARD
IMAGE
EMBEDDING
TRANSCRIPTION
EVALUATION
```

---

# 35. AIExecution

Каждый вызов AI логировать.

```text
id
organizationId
brandId
contentProjectId?
purpose
provider
model
reasoningEffort
promptKey
promptVersion
inputHash
inputJson
outputJson
status
inputTokens
outputTokens
estimatedCost
actualCost
startedAt
finishedAt
error
```

Это необходимо для:

- debugging;
- cost analysis;
- reproducibility;
- evals.

---

# 36. Video Recipe system

Не реализовывать video formats через большой `switch`.

Создать:

```text
VideoRecipe
```

Поля:

```text
id
key
name
version
description
bestFor
notFor
platforms
aspectRatios
durationConfig
stages
providerConfig
scriptShape
visualJobs
qcRules
deliverables
status
```

Сложную конфигурацию хранить JSON, валидируемый Zod schema.

---

# 37. Начальные Video Recipes

Seed:

```text
expert-avatar-reel
screen-proof-reel
market-breakdown
case-breakdown
motion-explainer
captioned-talking-head
```

---

# 38. Storyboard

Создать:

```text
Storyboard
StoryboardBeat
```

### Storyboard

```text
id
contentProjectId
contentVersionId
videoRecipeId
version
status
createdAt
```

### StoryboardBeat

```text
id
storyboardId
ordinal
narration
visualJob
visualInstruction
evidenceId
mediaAssetId
durationHint
metadata
```

---

# 39. VisualJob

Enum:

```text
PROOF
MECHANISM
CONSEQUENCE
ACTION
TRANSITION
```

Каждый visual beat должен иметь смысл.

Не использовать generic AI B-roll без задачи.

---

# 40. Media Library

Создать:

```text
MediaAsset
AssetUsage
```

### MediaAsset

```text
id
organizationId
brandId
parentAssetId?
type
mimeType
filename
storageKey
storageDriver
sizeBytes
width
height
durationMs
checksum
sourceType
sourceUrl
licenseMetadata
status
metadata
createdAt
```

---

# 41. Media source types

```text
UPLOAD
AI_GENERATED
SCREENSHOT
SCREEN_RECORDING
PROVIDER
RESEARCH
DERIVED
```

---

# 42. Storage abstraction

Интерфейс:

```ts
StorageProvider
```

Adapters:

```text
LocalStorageProvider
S3StorageProvider
```

### Development

Local filesystem.

### Production

Timeweb S3.

Timeweb S3 поддерживает Amazon S3 compatible API.

Использовать AWS S3 SDK-compatible client.

Production bucket:

**private by default**.

Выдавать signed URLs там, где нужно.

---

# 43. VideoProduction

```text
id
contentProjectId
storyboardId
videoRecipeId
status
aspectRatio
targetDuration
outputAssetId
startedAt
completedAt
metadata
```

Статусы:

```text
PLANNED
SCRIPT_READY
STORYBOARD_READY
WAITING_APPROVAL
GENERATING
COMPOSING
QC
READY
FAILED
CANCELLED
```

---

# 44. RenderJob

Каждый внешний render отслеживать отдельно.

```text
id
videoProductionId
provider
operation
providerJobId
attempt
status
input
output
errorCode
errorMessage
startedAt
finishedAt
providerUsageId
```

Статусы:

```text
QUEUED
SUBMITTED
PROCESSING
COMPLETED
FAILED
CANCELLED
OUTCOME_UNKNOWN
```

---

# 45. Avatar Provider

Интерфейс:

```ts
interface AvatarVideoProvider {
  create(...)
  getStatus(...)
  getResult(...)
}
```

Adapter:

```text
HeyGenProvider
```

Не смешивать HeyGen API с video workflow.

---

# 46. Motion Provider

Создать generic:

```text
MotionVideoProvider
```

Первоначально:

```text
MotionProvider
MockMotionProvider
```

Конкретную API-схему проверить по официальной документации непосредственно при реализации adapter.

---

# 47. Remotion

Использовать Remotion для:

- timeline composition;
- animated text;
- branded cards;
- source receipts;
- charts;
- overlays;
- reusable compositions.

Структура:

```text
packages/video-compositions/
```

или внутри provider/media package при сохранении архитектурной изоляции.

---

# 48. FFmpeg

FFmpeg использовать для:

- transcoding;
- normalization;
- thumbnails;
- audio extraction;
- concatenation;
- subtitle burn-in;
- technical QC;
- final H.264 output.

FFmpeg должен вызываться через isolated service.

Не формировать shell commands из невалидированных user strings.

---

# 49. Transcript

Создать:

```text
Transcript
```

Поля:

```text
id
videoProductionId
assetId
provider
language
text
wordsJson
durationMs
createdAt
```

`wordsJson`:

```json
[
  {
    "word": "...",
    "startMs": 100,
    "endMs": 420
  }
]
```

---

# 50. CaptionTrack

```text
id
videoProductionId
transcriptId
style
srtAssetId
assAssetId
burnedIn
metadata
```

Субтитры синхронизировать по реальному audio transcription.

Не вычислять timing простым делением duration на количество слов.

---

# 51. Quality Control

Создать:

```text
QCReport
```

Разделы:

```text
technical
visual
content
compliance
```

---

## Technical QC

Проверять:

```text
video stream
audio stream
codec
pixel format
resolution
duration
file size
black frames
audio duration
```

---

## Visual QC

Проверять:

```text
caption safe zones
logo placement
avatar placement
text overflow
black/empty regions
unexpected letterboxing
source visibility
CTA visibility
```

Часть visual QC можно выполнять AI vision provider.

---

## Content QC

```text
script matches approved version
CTA exists when required
forbidden claims absent
required evidence included
```

---

# 52. Cost Gate

Перед платной video generation рассчитывать estimated usage.

Создать:

```text
ProviderUsage
```

Поля:

```text
id
organizationId
brandId
contentProjectId
provider
operation
model
unit
quantity
estimatedCost
actualCost
currency
externalJobId
createdAt
```

Не хардкодить цены провайдеров в бизнес-логике.

Создать configurable rate table.

---

# 53. Workflow Engine

Не использовать Temporal на первом этапе.

Не использовать LangGraph как основной workflow engine.

Использовать:

```text
PostgreSQL
+
pg-boss
+
WorkflowRun
```

---

# 54. WorkflowRun

```text
id
organizationId
brandId
workflowType
entityType
entityId
status
currentStep
context
error
startedAt
completedAt
createdAt
```

Статусы:

```text
QUEUED
RUNNING
WAITING_APPROVAL
COMPLETED
FAILED
CANCELLED
```

---

# 55. Queue ≠ source of truth

pg-boss используется только для исполнения.

Business state остаётся в:

```text
ContentProject
VideoProduction
Publication
RenderJob
WorkflowRun
```

Если pg-boss потерял operational metadata, business state должен позволить восстановить workflow.

---

# 56. Job categories

Создать handlers:

```text
research.ingest
research.process
research.generate-opportunities

knowledge.extract
knowledge.embed

content.generate
content.review
content.fact-check

video.storyboard
video.avatar.submit
video.avatar.poll
video.compose
video.transcribe
video.qc

publication.dispatch
publication.prepare
publication.publish
publication.status-check

analytics.collect

learning.analyze

notification.send
```

---

# 57. Retry policy

Разделить операции на:

### Safe retry

Например:

```text
GET status
download
analytics fetch
research fetch
embedding
```

Можно автоматически retry.

### Unsafe mutation

Например:

```text
publish social post
create external video
chargeable generation
```

Не делать безусловный retry.

Использовать idempotency.

---

# 58. Publication Gateway

Создать:

```ts
interface PublishingProvider {
  connect(...)
  refresh(...)
  validate(...)
  prepare(...)
  publish(...)
  getStatus(...)
  getMetrics(...)
}
```

Adapters:

```text
InstagramPublishingProvider
VkPublishingProvider
PostizPublishingProvider   // optional, later
MockPublishingProvider
```

---

# 59. Postiz

Не использовать Postiz как обязательную часть architecture.

Не копировать Postiz source code.

Допускается позднее добавить:

```text
PostizPublishingProvider
```

как отдельный headless external service adapter.

На MVP:

```text
Instagram Direct
VK Direct
```

---

# 60. SocialAccount

Не хранить OAuth tokens непосредственно рядом с публично читаемой моделью.

Создать:

```text
SocialAccount
SocialCredential
```

### SocialAccount

```text
id
brandId
platform
externalAccountId
name
username
status
scopes
metadata
createdAt
```

### SocialCredential

```text
id
socialAccountId
accessTokenCiphertext
refreshTokenCiphertext
expiresAt
encryptionVersion
updatedAt
```

---

# 61. Token encryption

OAuth tokens шифровать application-level encryption.

Environment:

```text
TOKEN_ENCRYPTION_KEY
```

Использовать authenticated encryption.

Ключи не хранить в БД.

Логи никогда не должны содержать access/refresh tokens.

---

# 62. Publication

```text
id
organizationId
brandId
contentProjectId
platformVariantId
socialAccountId
status
scheduledAt
publishedAt
externalPostId
permalink
lastAttemptId
createdAt
updatedAt
```

---

# 63. Publication state machine

```text
DRAFT
↓
QUEUED
↓
PREPARING
↓
UPLOADING
↓
PROCESSING
↓
READY_TO_FINALIZE
↓
PUBLISHING
↓
PUBLISHED
```

Ошибочные:

```text
FAILED
OUTCOME_UNKNOWN
CANCELLED
```

---

# 64. PublicationAttempt

```text
id
publicationId
attempt
idempotencyKey
status
providerOperation
providerJobId
requestFingerprint
response
errorCode
errorMessage
startedAt
finishedAt
```

---

# 65. OUTCOME_UNKNOWN

Обязательный статус.

Если внешний API мог принять mutation, но connection оборвался:

не выполнять автоматическое повторение.

Алгоритм:

```text
mutation sent
↓
timeout
↓
OUTCOME_UNKNOWN
↓
provider status investigation
↓
found published
    → PUBLISHED

not found + conclusively safe
    → retry

cannot determine
    → manual review
```

---

# 66. Instagram

Реализовать provider через актуальный официальный Instagram/Meta publishing API.

Перед coding adapter Codex обязан проверить:

```text
OAuth scopes
account requirements
media requirements
Reels publishing flow
container states
token lifecycle
analytics endpoints
rate limits
```

Не копировать версии endpoints из старых open-source repositories.

---

# 67. VK

Реализовать:

```text
OAuth
token refresh where supported
image upload
video upload
wall post
status/error mapping
metrics where available
```

Перед implementation проверить актуальную официальную VK API documentation.

---

# 68. Scheduler

Не создавать отдельную cron infrastructure.

pg-boss periodic job:

```text
publication.dispatch
```

например раз в минуту.

Он ищет:

```text
READY/SCHEDULED
scheduledAt <= now
```

и создаёт уникальную publication task.

Повторный dispatcher не должен создавать duplicate publish.

---

# 69. Brand timezone

Все timestamps в PostgreSQL:

```text
UTC
```

Brand хранит:

```text
timezone
```

UI показывает время в Brand timezone.

---

# 70. Calendar

Создать Calendar UI:

```text
month
week
list
```

Показывать:

```text
ContentProject
Publication
platform
brand
status
```

Drag-and-drop допускается только после базового scheduler.

---

# 71. Analytics

Создать:

```text
MetricSnapshot
PerformanceInsight
```

---

# 72. MetricSnapshot

```text
id
brandId
publicationId
capturedAt

views
reach
impressions
likes
comments
shares
saves
clicks
watchTimeMs
averageWatchTimeMs
followersDelta

rawMetrics
```

Не все платформы дают одинаковые metrics.

Отсутствующие значения:

```text
null
```

а не `0`.

---

# 73. Analytics normalization

Создать normalized layer.

Не предполагать:

```text
Instagram view == VK view
```

Raw platform metrics сохранять всегда.

Derived metrics считать отдельно.

---

# 74. Analytics collection

После публикации планировать configurable snapshots.

Начальная политика:

```text
24 hours
72 hours
7 days
```

Периоды должны настраиваться.

---

# 75. Learning Loop

Создать worker:

```text
learning.analyze
```

Он периодически анализирует performance:

```text
hooks
topics
recipes
duration
CTA
platform
content pillars
posting time
```

Результат:

```text
PerformanceInsight
```

---

# 76. Learning Loop не должен автоматически переписывать BrandVoice

AI предлагает:

```text
INSIGHT
RECOMMENDATION
EXPERIMENT
```

Пользователь утверждает изменение стратегии.

---

# 77. AI Evals

Создать evaluation subsystem.

Модели:

```text
EvaluationSuite
EvaluationCase
EvaluationRun
EvaluationResult
```

---

# 78. EvaluationSuite

Начальные suites:

```text
content-quality
brand-voice
factuality
research-quality
storyboard-quality
```

---

# 79. EvaluationCase

Хранит:

```text
input
expectedProperties
forbiddenProperties
referenceContext
tags
```

---

# 80. EvaluationRun

Запускается:

- вручную;
- перед серьёзным изменением prompts;
- перед production release.

Сравнивать:

```text
old prompt
vs
new prompt
```

---

# 81. Media/Research security

Любая загрузка:

проверить:

```text
MIME
real file signature
size
extension
allowed media type
```

Не доверять:

```text
Content-Type
filename
extension
```

---

# 82. SSRF protection

Особенно важно для:

```text
import URL
upload-from-url
screenshot
research fetch
social media media fetch
```

Запретить обращения к:

```text
127.0.0.0/8
10.0.0.0/8
172.16.0.0/12
192.168.0.0/16
169.254.0.0/16
localhost
metadata endpoints
```

за исключением явно разрешённых dev режимов.

---

# 83. Audit Log

Создать:

```text
AuditLog
```

Поля:

```text
organizationId
brandId?
userId?
actorType
action
entityType
entityId
metadata
ip
userAgent
createdAt
```

Audit минимум для:

```text
login
brand changes
approval
social account connection
social disconnect
schedule
publish
delete
role change
API token actions
```

---

# 84. Observability

Использовать structured JSON logging.

Рекомендуемый logger:

```text
Pino
```

Каждый log context должен уметь содержать:

```text
requestId
organizationId
brandId
workflowRunId
contentProjectId
publicationId
provider
```

Никогда:

```text
password
access token
refresh token
secret key
full authorization header
```

---

# 85. Error handling

Создать typed application errors:

```text
ValidationError
UnauthorizedError
ForbiddenError
NotFoundError
ConflictError
ProviderError
ProviderTemporaryError
ProviderPermanentError
OutcomeUnknownError
RateLimitError
```

Не передавать сырые provider stack traces клиенту.

---

# 86. UI architecture

Все UI строить по существующей Design System.

Codex обязан перед созданием production UI найти дизайн-систему проекта.

Поиск минимум:

```text
docs/design-system/
design-system/
docs/ui/
DESIGN_SYSTEM.md
```

---

# 87. Если Design System отсутствует

Не спрашивать пользователя.

Создать минимальный временный:

```text
docs/TEMP_UI_RULES.md
```

и использовать только нейтральный operational UI.

Обязательно пометить:

```text
DESIGN_SYSTEM_PENDING
```

После появления design system заменить временные решения.

---

# 88. UI запреты

Если это не разрешено Design System:

не создавать самостоятельно:

```text
новые цвета
новые gradients
random shadows
random radii
random spacing
собственные button styles
собственные form patterns
```

---

# 89. Основная навигация

Предварительно:

```text
Dashboard

Brands

Research
  Inbox
  Sources
  Opportunities

Content
  Pipeline
  Calendar

Production
  Video
  Media

Publishing
  Accounts
  Publications

Analytics

Costs

Automation

Settings
```

---

# 90. Dashboard

Показывать:

```text
активный Brand
content in progress
awaiting approvals
scheduled publications
failed jobs
outcome unknown
recent research opportunities
recent performance
provider costs
```

Dashboard не должен быть vanity dashboard.

Главная функция:

> показать, что требует действия.

---

# 91. Brands

Brand detail tabs:

```text
Overview
Profile
Voice
Knowledge
Pillars
Channels
Team
Settings
```

---

# 92. Research UI

Research Inbox:

```text
URL input
text input
file upload
Brand
priority
submit
```

Показывать processing states.

---

# 93. Opportunities UI

Карточка:

```text
title
angle
why now
pillar
sources
relevance
novelty
evidence
```

Actions:

```text
Create Content
Reject
Archive
```

---

# 94. Content Pipeline

Использовать pipeline view.

Колонки:

```text
Idea
Research
Draft
Review
Approved
Production
QC
Ready
Scheduled
Published
```

Состояния должны соответствовать backend state machine.

---

# 95. Content Detail

Главный экран проекта.

Tabs:

```text
Brief
Research
Draft
Claims
Script
Storyboard
Assets
Video
Publishing
Analytics
History
```

---

# 96. Review UI

Должны быть действия:

```text
Approve
Reject
Edit
Rewrite with AI
Request specific change
Change recipe
```

После AI rewrite:

возвращать в `REVIEW`.

Не auto-approve.

---

# 97. Video Production UI

Показывать stepper:

```text
Script
Storyboard
Assets
Avatar
Composition
Captions
QC
Ready
```

RenderJob status показывать отдельно.

---

# 98. QC UI

Показывать:

```text
technical checks
visual checks
content checks
warnings
preview
```

Кнопка:

```text
Approve video
```

---

# 99. Social Accounts UI

Показывать:

```text
Instagram
VK
```

Statuses:

```text
CONNECTED
TOKEN_EXPIRING
RECONNECT_REQUIRED
DISABLED
ERROR
```

---

# 100. Costs UI

Разрез:

```text
Brand
Content Project
Provider
Month
Operation
```

Показывать:

```text
estimated
actual
```

---

# 101. MCP

После стабилизации API реализовать MCP.

Первоначальные tools:

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

# 102. MCP safety

Не давать MCP на первой версии:

```text
delete organization
change roles
publish now without approval
disconnect accounts
expose credentials
```

---

# 103. MCP authentication

Создать:

```text
ApiKey
```

или отдельный MCP token mechanism.

Хранить hash token.

Не хранить plaintext token после создания.

Scopes:

```text
READ
WRITE
APPROVE
ADMIN
```

---

# 104. n8n integration

n8n остаётся auxiliary automation layer.

Создать authenticated webhook API:

```text
/api/v1/webhooks/n8n/research
/api/v1/webhooks/n8n/content
/api/v1/webhooks/n8n/events
```

Использовать HMAC signature.

---

# 105. Webhooks

Outbound webhooks:

```text
content.approved
video.ready
publication.published
publication.failed
research.opportunity.created
```

Создать:

```text
WebhookEndpoint
WebhookDelivery
```

если webhook functionality реально включается.

---

# 106. API architecture

Для UI:

```text
Server Actions
```

где это удобно.

Для:

```text
MCP
OAuth
webhooks
external integrations
```

использовать Route Handlers/API.

Не использовать Server Actions как публичный integration API.

---

# 107. Validation

Все external boundaries валидировать Zod:

```text
route body
query
webhook
provider response where practical
AI structured output
job payload
environment
```

---

# 108. Environment validation

Создать central:

```text
packages/config/env.ts
```

Разделить:

```text
required core
optional providers
production-only
```

Приложение не должно падать локально из-за отсутствия Instagram key.

---

# 109. .env.example

Минимум:

```text
NODE_ENV=

APP_URL=

DATABASE_URL=

BETTER_AUTH_SECRET=

TOKEN_ENCRYPTION_KEY=

STORAGE_DRIVER=

S3_ENDPOINT=
S3_REGION=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=

OPENAI_API_KEY=
OPENAI_DEFAULT_MODEL=
OPENAI_EMBEDDING_MODEL=

YANDEX_SEARCH_API_KEY=
FIRECRAWL_API_KEY=

HEYGEN_API_KEY=
HEYGEN_AVATAR_ID=
HEYGEN_VOICE_ID=

MOTION_API_KEY=

INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=

VK_CLIENT_ID=
VK_CLIENT_SECRET=

MCP_SECRET=

N8N_WEBHOOK_SECRET=

SENTRY_DSN=
```

Не помещать реальные значения.

---

# 110. Local development

Создать:

```text
docker-compose.dev.yml
```

Минимально:

```text
PostgreSQL + pgvector
```

Не запускать Redis.

Storage в dev:

```text
filesystem
```

---

# 111. Seed data

Создать dev seed.

Минимум:

```text
Demo Organization
Demo User
Demo Brand
Brand Profile
Brand Voice
Content Pillars
Video Recipes
Mock Social Accounts
Research Samples
```

Seed разрешён только:

```text
development
test
```

Никогда production.

---

# 112. Test strategy

Использовать:

```text
unit
integration
contract
e2e
AI evals
```

---

# 113. Unit tests

Обязательно:

```text
state transitions
permissions
scoring
content validation
provider mapping
encryption
idempotency
cost calculations
```

---

# 114. Integration tests

Поднимать test PostgreSQL.

Проверять:

```text
Prisma repositories
tenant isolation
transactions
queue integration
auth
migrations
```

---

# 115. Provider contract tests

Один набор tests должен запускаться против:

```text
MockInstagramProvider
InstagramProvider
```

где live adapter tests включаются только при наличии credentials.

То же:

```text
VK
HeyGen
LLM
Storage
```

---

# 116. Tenant isolation tests

Это security-critical.

Создать минимум две организации:

```text
Org A
Org B
```

Попытаться из A получить:

```text
Brand B
Content B
Media B
Publication B
Analytics B
```

Ожидаемый результат:

```text
Forbidden/NotFound
```

Никаких утечек.

---

# 117. Publishing idempotency tests

Проверить:

```text
job executed twice
provider timeout
worker crash
status poll duplicated
publication dispatcher duplicated
```

Результат:

```text
не более одной подтверждённой публикации
```

---

# 118. E2E

Playwright scenarios:

```text
login
create brand
edit brand
upload knowledge
submit research URL
create opportunity
create content
review content
approve content
create storyboard
run mock video pipeline
pass QC
connect mock social account
schedule
mock publish
view analytics
```

---

# 119. Security tests

Проверить:

```text
unauthorized route
wrong tenant
IDOR
invalid uploads
oversized uploads
fake MIME
SSRF
invalid webhook signature
expired session
role escalation
unsafe redirects
token leakage
```

---

# 120. Migration safety

Каждая migration должна проходить на чистой DB.

Перед завершением проекта выполнить:

```text
create empty DB
apply every migration from zero
seed
run tests
```

---

# 121. Performance

Не оптимизировать вслепую.

Однако сразу:

- добавлять индексы по FK;
- status;
- scheduledAt;
- brandId;
- organizationId;
- createdAt;
- provider external IDs.

Избегать N+1.

---

# 122. Prisma repository layer

Запрещено:

```text
prisma.contentProject.findMany(...)
```

хаотично по всей кодовой базе.

Создать repository/service boundaries.

Например:

```text
ContentProjectRepository
BrandRepository
PublicationRepository
ResearchRepository
```

---

# 123. Repository tenant contract

Каждый tenant repository принимает:

```text
TenantContext
```

например:

```ts
{
  organizationId,
  userId,
  brandIds
}
```

Нельзя полагаться только на ID из URL.

---

# 124. Background job observability

Для job ошибки сохранять:

```text
job type
entity
attempt
error classification
provider
timestamp
```

UI Automation должен показывать failed business workflows.

Не требуется показывать все внутренние записи pg-boss.

---

# 125. Health checks

Создать:

```text
/api/health/live
/api/health/ready
```

### live

Процесс запущен.

### ready

Проверить минимум:

```text
database
```

External AI API не должен делать приложение unready.

---

# 126. Production topology

Целевая схема:

```text
Internet
   ↓
Domain
   ↓
Nginx
   ↓
┌──────────────┬──────────────┐
│ Web          │ MCP          │
│ container    │ container    │
└──────┬───────┴──────┬───────┘
       │              │
       └──────┬───────┘
              ↓
       Managed PostgreSQL
              ↑
              │
        Worker container
              │
              ↓
       Timeweb S3
```

MCP можно временно объединить с web process, если отдельный container не нужен.

---

# 127. Production containers

Минимум:

```text
ams-content-web
ams-content-worker
```

Optional:

```text
ams-content-mcp
```

Не запускать PostgreSQL внутри production Docker Compose.

Использовать managed PostgreSQL.

---

# 128. Production DB

Подключить отдельную Timeweb managed PostgreSQL.

Production deployment использует:

```bash
prisma migrate deploy
```

Не использовать:

```bash
prisma db push
```

в production.

---

# 129. Production storage

Timeweb S3.

Создать отдельный bucket для AMS Content OS.

Предпочтительно:

```text
private
versioning enabled if economically acceptable
```

Структура ключей:

```text
organizations/{orgId}/brands/{brandId}/...
```

Не использовать названия клиентов как единственный storage namespace.

---

# 130. Backups

Перед production проверить:

```text
managed DB backups
S3 policy
restore procedure
```

Timeweb предоставляет логические backups PostgreSQL, которые могут сохраняться в S3.

Главное требование:

> backup считается существующим только если restore procedure проверялась.

---

# 131. Domain

Production domain не требуется для начала разработки.

Он потребуется перед:

```text
production deployment
Instagram OAuth registration/testing
VK OAuth registration/testing
MCP remote connection
```

Рекомендуется заранее выбрать стабильный hostname.

Пример структуры без фиксации конкретного домена:

```text
content.<main-domain>
```

или:

```text
os.<main-domain>
```

Не хардкодить hostname.

Использовать:

```text
APP_URL
```

---

# 132. OAuth callbacks

Формировать относительно `APP_URL`.

Например:

```text
${APP_URL}/api/integrations/instagram/callback
${APP_URL}/api/integrations/vk/callback
```

Не размещать production hostname непосредственно в source code.

---

# 133. Deployment input file

Подготовить:

```text
docs/PRODUCTION_INPUTS.example.md
```

С полями:

```text
APP_DOMAIN=

SERVER_HOST=
SERVER_SSH_PORT=
SERVER_USER=

DATABASE_URL=

S3_ENDPOINT=
S3_REGION=
S3_BUCKET=

INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=

VK_CLIENT_ID=
VK_CLIENT_SECRET=

HEYGEN_API_KEY=

OPENAI_API_KEY=

...
```

Пользователь позже заполнит production secrets вне Git.

---

# 134. Docker

Создать:

```text
Dockerfile.web
Dockerfile.worker
docker-compose.prod.yml
```

Использовать multi-stage builds.

Images должны запускаться non-root user, если используемые компоненты это позволяют.

---

# 135. Nginx

Создать:

```text
deploy/nginx.example.conf
```

Настроить:

```text
HTTPS
proxy headers
reasonable upload limit
timeouts for normal HTTP
security headers
```

Long-running generation не должна держать HTTP connection.

HTTP endpoint только создаёт job и возвращает ID.

---

# 136. CI quality gate

Независимо от CI-платформы создать команды:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

CI configuration должна вызывать именно эти scripts.

SourceCraft — канонический git/production контур проекта.

Не строить architecture вокруг GitHub Actions.

---

# 137. Git rules

`main` — каноническое состояние проекта.

Не создавать:

```text
deployment branch
backup branch
production branch
```

без реальной необходимости.

После каждого большого завершённого этапа:

```text
green tests
docs updated
commit
```

Если remote недоступен:

создать локальный commit и продолжить.

Не спрашивать пользователя.

---

# 138. Phase 0 — Governance

## Реализовать

```text
repository structure
AGENTS.md
docs tree
pnpm workspace
base tsconfig
lint
formatting
testing setup
environment validation
BUILD_STATUS
DECISIONS
```

## Definition of Done

```text
pnpm install
pnpm lint
pnpm typecheck
pnpm test
```

проходят.

---

# 139. Phase 1 — Web + Database bootstrap

Создать:

```text
Next.js app
Prisma 7
PostgreSQL
pgvector migration
DB package
basic UI shell
health checks
```

## Definition of Done

Web открывается.

DB connection проходит.

Migration from zero проходит.

---

# 140. Phase 2 — Authentication + Tenant foundation

Реализовать:

```text
Better Auth
Organization
Membership
Brand
BrandAccess
RBAC
tenant repositories
audit base
```

## E2E

```text
register/login
create organization
create brand
switch brand
access denied cross-tenant
```

---

# 141. Phase 3 — Job/Workflow foundation

Реализовать:

```text
pg-boss
worker app
WorkflowRun
job registry
retry policies
structured worker logs
```

Создать mock job.

UI:

```text
Automation / workflow status
```

---

# 142. Phase 4 — Brand Intelligence

Реализовать:

```text
BrandProfile
BrandVoice
ContentPillar
BrandChannelPreference
KnowledgeDocument
KnowledgeChunk
```

UI полностью функционален.

---

# 143. Phase 5 — Knowledge ingestion

Реализовать:

```text
file upload
URL
text
extraction
chunking
embedding
hybrid retrieval
```

Mock embedding допустим в tests.

Real adapter — OpenAI.

---

# 144. Phase 6 — Research Engine

Реализовать:

```text
Research Inbox
fetch
dedupe
classification
reports
claims
evidence
opportunities
```

Добавить Yandex/Firecrawl provider abstractions.

---

# 145. Phase 7 — Content Engine

Реализовать:

```text
ContentProject
ContentVersion
PlatformVariant
state machine
AI generation
fact-check
brand review
approval
rewrite loop
```

---

# 146. Phase 8 — Video Recipe + Storyboard

Реализовать:

```text
VideoRecipe
Storyboard
StoryboardBeat
recipe validation
seed recipes
storyboard generation
```

---

# 147. Phase 9 — Media + Production Engine

Реализовать:

```text
MediaAsset
StorageProvider
LocalStorage
S3Storage
RenderJob
VideoProduction
FFmpeg abstraction
Remotion composition
```

---

# 148. Phase 10 — HeyGen + Motion

Реализовать:

```text
AvatarVideoProvider
HeyGenProvider
MotionVideoProvider
Mock providers
provider polling
cost tracking
```

Если real credentials отсутствуют:

live tests → `BLOCKED_EXTERNAL`.

Остальное продолжить.

---

# 149. Phase 11 — Transcript + Captions + QC

Реализовать:

```text
TranscriptionProvider
Transcript
CaptionTrack
ASS/SRT
burn-in
technical QC
visual QC
QCReport
```

После этого mock pipeline должен производить финальный MP4.

---

# 150. Phase 12 — Publishing

Реализовать:

```text
SocialAccount
SocialCredential
Publication
PublicationAttempt
PublishingProvider
Instagram
VK
scheduler
OUTCOME_UNKNOWN
```

Использовать mock providers для полноценного E2E.

---

# 151. Phase 13 — Analytics

Реализовать:

```text
MetricSnapshot
normalized analytics
performance UI
analytics jobs
```

---

# 152. Phase 14 — Costs + Learning Loop

Реализовать:

```text
ProviderUsage
cost dashboard
PerformanceInsight
learning.analyze
```

---

# 153. Phase 15 — MCP + n8n

Реализовать:

```text
MCP server
API keys/scopes
MCP tools
n8n webhook endpoints
HMAC
outbound event infrastructure
```

---

# 154. Phase 16 — AI Evals

Реализовать:

```text
EvaluationSuite
EvaluationCase
EvaluationRun
EvaluationResult
seed evaluation cases
```

---

# 155. Phase 17 — Final UX pass

Сверить каждый экран с Design System.

Удалить:

```text
temporary UI
inconsistent components
hardcoded styles
dead screens
placeholder cards
```

Проверить:

```text
desktop
tablet
mobile where applicable
loading
empty state
error state
disabled state
long text
```

---

# 156. Phase 18 — Security audit

Отдельно проверить:

```text
auth
session
tenant isolation
RBAC
IDOR
OAuth tokens
encryption
uploads
SSRF
webhooks
MCP
rate limiting
provider errors
logging
secrets
dependencies
```

Исправить найденное.

После исправлений повторить audit.

---

# 157. Phase 19 — Architecture audit

Проверить:

```text
dead code
duplicated logic
circular dependencies
direct DB access bypass
provider leakage
business logic in UI
overgrown files
unused dependencies
unbounded queries
missing indexes
weak state transitions
```

---

# 158. Phase 20 — Final automated verification

Запустить:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

Создать DB с нуля.

Применить migrations.

Запустить seed.

Прогнать E2E.

---

# 159. Phase 21 — Production packaging

Без production credentials подготовить полностью:

```text
Dockerfiles
docker-compose.prod.yml
Nginx config
deployment script
migration script
backup/restore docs
health checks
env template
production checklist
rollback procedure
```

---

# 160. Phase 22 — Production boundary

На этом этапе, если реальные Timeweb/domain/API credentials ещё не предоставлены:

не спрашивать пользователя во время предыдущих фаз.

Записать в:

```text
docs/BUILD_STATUS.md
```

```text
APPLICATION: READY
DEPLOYMENT_PACKAGE: READY
PRODUCTION_DEPLOYMENT: BLOCKED_EXTERNAL
```

Перечислить только отсутствующие данные.

---

# 161. Production данные, которые потребуются позже

## Сервер

```text
IP/hostname
SSH user
SSH port
OS
Docker availability
```

## Domain

```text
final hostname
```

## Database

```text
DATABASE_URL
SSL requirements
```

## S3

```text
endpoint
bucket
region
access key
secret
```

## Social

```text
Instagram App ID
Instagram App Secret

VK Client ID
VK Client Secret
```

## AI

```text
OpenAI
HeyGen
Motion
```

---

# 162. Что не должно блокировать Phase 0–21

Не требуются:

```text
Timeweb SSH
production domain
Instagram approval
VK approval
HeyGen balance
production database
S3 bucket
```

Вся application architecture должна быть реализована до их получения.

---

# 163. Definition of Done всего проекта до deployment

Проект считается готовым к production deployment только если:

### Architecture

- нет competing sources of truth;
- domain layer отделён;
- providers изолированы;
- worker отделён;
- tenant boundaries проверены.

### Database

- Prisma schema актуальна;
- migrations работают с zero;
- indexes проверены;
- production не требует `db push`.

### Security

- OAuth secrets защищены;
- tokens encrypted;
- tenant isolation tests green;
- SSRF protection работает;
- upload validation работает;
- webhook signatures работают.

### Research

- URL → Research Item → Report → Opportunity работает.

### Content

- Opportunity → Content → Review → Approval работает.

### Video

- Script → Storyboard → Mock/real provider → Composition → Captions → QC → Ready работает.

### Publishing

- Ready → Schedule → Publish → Result работает через mocks;
- provider contracts реализованы;
- duplicate publish tests green;
- OUTCOME_UNKNOWN реализован.

### Analytics

- published post → MetricSnapshot → analytics работает через mocks.

### Costs

- AI/provider usage записывается.

### MCP

- basic tools работают.

### Tests

Все обязательные tests green.

### Documentation

Документация соответствует фактическому коду.

---

# 164. Запреты для Codex

Не делать:

```text
форк Postiz
копирование Postiz в проект
форк social-agent
копирование Super Video Maker
гигантский n8n workflow
Redis без необходимости
Temporal на старте
LangGraph как основной backend
единственный giant AI prompt
plaintext OAuth tokens
auto retry social publish
hardcoded model names по всей системе
hardcoded provider endpoints в business logic
production secrets в git
fake analytics
fake factual sources
fake provider success
TODO под видом готовой функции
```

---

# 165. Разрешённые упрощения

Допускается:

- один Next.js web application;
- один worker process;
- один PostgreSQL cluster;
- один S3 bucket;
- mock providers;
- одна Organization для владельца;
- несколько Brands;
- minimal UI до подключения Design System;
- один основной LLM provider;
- один embedding provider;
- Instagram + VK как первые social providers.

---

# 166. Не делать преждевременно

Не создавать без требования:

```text
Kubernetes
Kafka
RabbitMQ
Redis Cluster
Temporal
microservices per domain
event sourcing
CQRS framework
service mesh
separate analytics warehouse
ElasticSearch
ClickHouse
```

Если система реально перерастёт PostgreSQL — решение принимается позже на основании нагрузки.

---

# 167. Финальная архитектура

```text
                         AMS CONTENT OS
                               │
                  ┌────────────┴────────────┐
                  │                         │
               Web App                  MCP API
                  │                         │
                  └────────────┬────────────┘
                               │
                      Application Core
                               │
                 ┌─────────────┴─────────────┐
                 │                           │
            PostgreSQL                  Object Storage
         Prisma 7 + pgvector             S3 / Local
                 │
           ┌─────┴─────┐
           │           │
         Web         pg-boss
                       │
                     Worker
                       │
        ┌──────────────┼────────────────┐
        │              │                │
     Research       AI Content       Production
        │              │                │
        │              │        ┌───────┼────────┐
        │              │        │       │        │
      Search          LLM     HeyGen   Motion  Remotion
      Fetch           Image                  + FFmpeg
        │              │                │
        └──────────────┴───────┬────────┘
                               │
                              QC
                               │
                           Approval
                               │
                        Publishing Gateway
                       ┌───────┴────────┐
                       │                │
                   Instagram           VK
                       │                │
                       └───────┬────────┘
                               │
                           Analytics
                               │
                         Learning Loop
```

---

# 168. Ожидаемый итог первого автономного прохода Codex

После выполнения Master Plan пользователь должен получить не prototype, а структурированный application foundation:

```text
готовый repository
готовая DB
готовая auth
multi-tenant
Brand system
knowledge base
research system
content system
video pipeline
provider abstractions
mock full E2E workflow
Instagram/VK adapters
analytics
cost tracking
MCP
n8n integration layer
tests
Docker
deployment package
documentation
```

Единственное, что может оставаться `BLOCKED_EXTERNAL`:

```text
live API authorization
live paid provider calls
live social publication
production deployment
```

если credentials ещё не предоставлены.

---

# 169. Инструкция по самостоятельному продолжению работы

Codex должен самостоятельно:

1. прочитать весь Master Plan;
2. прочитать Design System;
3. создать `BUILD_STATUS.md`;
4. разбить план на implementation phases;
5. выполнять phases строго последовательно;
6. после каждого phase запускать quality gates;
7. самостоятельно исправлять ошибки;
8. актуализировать документацию;
9. делать локальный git commit после green phase;
10. не переходить к следующему этапу с failing tests;
11. не спрашивать пользователя о мелких решениях;
12. не останавливаться из-за внешних credentials;
13. использовать mock providers;
14. фиксировать архитектурные решения в `DECISIONS.md`;
15. в конце провести security и architecture self-audit;
16. исправить найденные проблемы;
17. повторно прогнать полный test suite;
18. подготовить production deployment;
19. завершить работу подробным `FINAL_IMPLEMENTATION_REPORT.md`.

---

# 170. FINAL_IMPLEMENTATION_REPORT.md

В конце Codex обязан сформировать:

```text
1. Что реализовано
2. Что не реализовано
3. Что BLOCKED_EXTERNAL
4. Архитектура
5. Database
6. Security
7. Tests
8. Provider integrations
9. Known limitations
10. Required production inputs
11. Deployment instructions
12. Recommended next steps
```

Не писать «всё готово», если есть незакрытые обязательные функции.

---

# 171. Финальное правило

При конфликте между:

```text
быстрее
и
надёжнее/проще поддерживать
```

выбирать:

> простое, безопасное и поддерживаемое решение.

При конфликте между:

```text
магией AI
и
явным business state
```

выбирать:

> явный state в PostgreSQL.

При конфликте между:

```text
автоматической публикацией
и
риском duplicate/ошибочной публикации
```

выбирать:

> безопасность публикации.

При конфликте между:

```text
новой технологией
и
проверенным простым решением
```

выбирать:

> проверенное простое решение.

---

# MASTER PLAN STATUS

```text
ARCHITECTURE: APPROVED
ORM: PRISMA 7
DATABASE: POSTGRESQL
VECTOR: PGVECTOR
QUEUE: POSTGRESQL / PG-BOSS
AUTH: BETTER AUTH
FRONTEND: NEXT.JS + REACT + TYPESCRIPT
WORKERS: TYPESCRIPT
STORAGE: S3 ABSTRACTION / TIMEWEB S3 PRODUCTION
AI: PROVIDER ABSTRACTION
VIDEO: HEYGEN + MOTION + REMOTION + FFMPEG
PUBLISHING: INSTAGRAM DIRECT + VK DIRECT
POSTIZ: OPTIONAL ADAPTER ONLY
N8N: AUXILIARY
MCP: YES
HUMAN APPROVAL: YES
AI EVALS: YES
COST TRACKING: YES
MULTI-TENANT: YES
DEPLOYMENT TARGET: TIMEWEB CLOUD
PRODUCTION DEPLOYMENT: DEFERRED UNTIL APPLICATION READY
```
