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
