# Wave 15 — Security & Architecture Audit

Дата: 2026-08-11. Область: код, зависимости, tenant boundaries и production contracts.

## Security audit

| Проверка                           | Результат | Evidence                                                                                                                                                                            |
| ---------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth/session/RBAC/tenant isolation | PASS      | Existing integration contracts reject cross-organization and cross-brand access.                                                                                                    |
| OAuth/social tokens                | PASS      | Social credentials are AES-256-GCM ciphertext; API keys are hash-only.                                                                                                              |
| Plaintext secrets                  | PASS      | Source scan found only runtime inputs/decryption boundaries; no persisted plaintext secret field or logged authorization header.                                                    |
| SSRF                               | PASS      | URL providers validate public HTTP(S) destinations and redirects.                                                                                                                   |
| Webhooks/MCP                       | PASS      | HMAC is constant-time checked; n8n boundary is Zod-validated; keys are scoped and revocable.                                                                                        |
| Dependencies                       | PASS      | W18.5 confirms both `pnpm audit --prod --json` and full `pnpm audit --json` report 0 vulnerabilities; evidence and reviewed analyzer findings live in `docs/DEPENDENCY_HYGIENE.md`. |

## Architecture audit

| Проверка                         | Результат | Действие                                                                                                               |
| -------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------- |
| Direct Prisma outside DB package | FIXED     | Moved pgvector embedding/hybrid retrieval raw queries from `packages/core` to `packages/db/repositories/knowledge.ts`. |
| Provider leakage                 | PASS      | Provider-specific HTTP clients remain injected adapters.                                                               |
| Business logic in UI             | PASS      | Workspace shell contains presentation only; no Prisma or service mutation.                                             |
| Tenant-scoped retrieval          | PASS      | Repository hybrid query filters organization, brand and READY document status.                                         |
| Bounded query                    | PASS      | Hybrid retrieval bounds `take` to 1–50 before repository invocation.                                                   |
| State transitions                | PASS      | Content, publication, production and evaluation services use explicit transition guards.                               |

## Residual external constraints

- Live Instagram/VK/HeyGen execution remains `BLOCKED_EXTERNAL` until official runtime clients and credentials are supplied.
- Production deployment remains prohibited until Wave 16 package is verified and infrastructure is explicitly approved.
