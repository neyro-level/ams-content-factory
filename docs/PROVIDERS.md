# Provider policy

Каждая интеграция реализуется как interface + production adapter + explicit `Mock*Provider` + contract tests.
Неполученные credentials фиксируются точной записью `BLOCKED_EXTERNAL: <VARIABLE>`.

`KnowledgeUrlProvider` is the only outbound URL-fetch boundary. `NodeKnowledgeUrlProvider` implements the
production-safe transport; tests inject a provider implementation instead of making live network requests.

`EmbeddingProvider` has explicit `MockEmbeddingProvider` for deterministic local contracts and
`OpenAiEmbeddingProvider` for production. The latter requires `OPENAI_API_KEY`; its live contract is
`BLOCKED_EXTERNAL` until credentials are provisioned, while no mock provider is selected implicitly.
