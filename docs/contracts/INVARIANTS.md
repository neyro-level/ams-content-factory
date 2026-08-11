# Invariants

1. PostgreSQL — единственный business source of truth.
2. Tenant context обязателен для tenant-owned state.
3. Direct Prisma access из UI, route handlers и server actions запрещён.
4. Provider-specific HTTP details не пересекают provider layer.
5. External mutation выполняется идемпотентно и имеет audit trail.
6. Нет готовых функций с TODO, no-op или fake success.
