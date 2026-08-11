-- Prisma 7 represents pgvector as Unsupported("vector"); vector writes and reads use parameterized raw SQL.
ALTER TABLE "knowledge_chunk" ADD COLUMN "embedding" vector(1536);

CREATE INDEX "knowledge_chunk_embedding_hnsw_idx"
  ON "knowledge_chunk" USING hnsw ("embedding" vector_cosine_ops)
  WHERE "embedding" IS NOT NULL;

CREATE INDEX "knowledge_chunk_content_search_idx"
  ON "knowledge_chunk" USING gin (to_tsvector('simple', "content"));
