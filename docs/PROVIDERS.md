# Provider policy

Каждая интеграция реализуется как interface + production adapter + explicit `Mock*Provider` + contract tests.
Неполученные credentials фиксируются точной записью `BLOCKED_EXTERNAL: <VARIABLE>`.
