# Data model

## Applied Wave 1 foundation

Migration `20260811105046_init_identity_foundation` establishes:

- Better Auth: `User`, `Session`, `Account`, `Verification`.
- Tenant access: `Organization`, `Membership`, `Brand`, `BrandAccess`.
- Compliance base: append-only `AuditLog`.
- PostgreSQL extension `vector`; embeddings arrive only in Wave 3.

Wave 1 создаёт foundation: Better Auth user/session/account/verifications, Organization,
Membership, Brand, BrandAccess и AuditLog. Последующие модели добавляются migration-by-migration
и документируются здесь до закрытия соответствующей Wave.

## Applied Wave 3.1–W3.2 foundation

Migration `20260811130457_add_brand_knowledge_foundation` establishes:

- Brand context: `BrandProfile`, `BrandVoice` and `ContentPillar`.
- Knowledge foundation: `KnowledgeDocument` with explicit type, lifecycle status, source checksum and metadata; `KnowledgeChunk` with ordered text fragments and metadata.
- Tenant-safe repository contracts: profile, document and chunk creation first confirm the supplied organization/brand relationship; ready-document text search is scoped by both organization and brand.

The vector extension was installed in Wave 1. The `embedding` vector column and vector indexes are intentionally deferred to W3.4, after verification of the supported Prisma 7 + pgvector implementation path.

## Applied Wave 3.3 ingestion

Migration `20260811164500_add_knowledge_source_content` adds the nullable `sourceText` field and unique
`[brandId, checksum]` index. The checksum makes accepted source ingestion idempotent within a brand.
The application service accepts direct text and UTF-8 text files, creates ordered chunks, and transitions
documents from `PENDING` to `PROCESSING` to `READY` (or `FAILED` on processing error). URL ingestion is
performed only through the provider boundary: it rejects private/local targets, nonstandard ports,
private DNS results, unsafe redirects, compressed/non-text responses and oversized payloads.

## Applied Wave 3.4 retrieval

Migration `20260811170000_add_knowledge_embeddings` adds nullable `vector(1536)` embeddings to
`KnowledgeChunk`, an HNSW cosine index and a GIN full-text index. Prisma 7 models the vector field as
`Unsupported("vector")`; every vector write and retrieval query uses parameterized raw SQL. Hybrid retrieval
scores cosine similarity (70%) and full-text relevance (30%), filters documents by organization, brand,
`READY` status and optional document type, and returns only bounded top-N chunks.

## Applied Waves 4–5: research and content

- Research: `ResearchInboxItem`, `ResearchSource`, `ResearchItem`, `ResearchReport`, `Claim`, `Evidence`
  and `ContentOpportunity` retain provenance, classification and the evidence path to a content decision.
- Content: `ContentProject`, immutable `ContentVersion`, `PlatformVariant`, `Approval` and
  `EditorialComment` model the editorial state machine and human review.

## Applied Waves 6–9: video and media production

- Planning: `VideoRecipe`, `Storyboard` and `StoryboardBeat` describe validated reusable video plans.
- Media: `MediaAsset`, `AssetUsage`, `VideoProduction` and `RenderJob` keep private assets,
  production state and idempotent rendering separate.
- Providers and quality: `ProviderRate`, `ProviderUsage`, `Transcript`, `CaptionTrack` and `QcReport`
  retain cost, captions and technical/visual/content QC without embedding provider state in the domain.

## Applied Waves 10–13: publishing, analytics and integrations

- Publishing: `SocialAccount`, encrypted `SocialCredential`, `Publication` and `PublicationAttempt`
  support idempotent publishing and explicit investigation of unknown outcomes.
- Analytics: `MetricSnapshot` stores raw/normalised measures, while `PerformanceInsight` stores a
  non-mutating recommendation and experiment proposal.
- MCP/webhooks: `ApiKey`, `WebhookEndpoint` and `WebhookDelivery` store hash-only access keys,
  encrypted endpoint secrets and signed delivery audit.
- Evaluation: `EvaluationSuite`, `EvaluationCase`, `EvaluationRun` and `EvaluationResult` implement
  seeded AI evaluation suites and regression results.

## Cross-cutting state

`WorkflowRun`, `BrandAccess` and append-only `AuditLog` provide execution visibility, explicit brand
permissions and compliance history. Every tenant-owned relation remains constrained through the
organization/brand context; complete model definitions, indexes and enums are canonical in
`packages/db/prisma/schema.prisma`.
