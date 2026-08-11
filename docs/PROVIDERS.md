# Provider policy

Каждая интеграция реализуется как interface + production adapter + explicit `Mock*Provider` + contract tests.
Неполученные credentials фиксируются точной записью `BLOCKED_EXTERNAL: <VARIABLE>`.

`KnowledgeUrlProvider` is the only outbound URL-fetch boundary. `NodeKnowledgeUrlProvider` implements the
production-safe transport; tests inject a provider implementation instead of making live network requests.
