# Execution Plan — historical execution record

> **Статус:** historical/reference. Текущую последовательность задач, реальные статусы и release gate
> определяет [`MASTER_IMPLEMENTATION_PLAN.md`](MASTER_IMPLEMENTATION_PLAN.md). Записи `DONE` ниже
> фиксируют наличие foundation-кода и прежних проверок, а не готовность пользовательского продукта.
> Latest current-plan record: W1.4 tenant-scope repository cleanup — `DONE`; next W2.1 CI integration
> gate.

## Protocol

Каждая task содержит цель, области изменения, зависимости, ожидаемый результат, проверки, DoD и
статус. Разрешённые статусы: `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED_EXTERNAL`, `DONE`, `FAILED`.
Новая Wave не начинается до зелёного DoD предыдущей.

## Wave 0 — Repository & Engineering Foundation

| Task | Цель и области                                             | Зависимости | Проверка / DoD                                       | Статус |
| ---- | ---------------------------------------------------------- | ----------- | ---------------------------------------------------- | ------ |
| W0.1 | Нормализовать docs-first канон и autonomy policy.          | Master Plan | Все required docs существуют и согласованы.          | DONE   |
| W0.2 | Создать pnpm workspace, TypeScript/ESM, lint и formatting. | W0.1        | install, lint, format, typecheck green.              | DONE   |
| W0.3 | Bootstrap Next web, health contracts и neutral UI.         | W0.2        | unit/integration health tests, build green.          | DONE   |
| W0.4 | Добавить Docker PostgreSQL, env contract и test runners.   | W0.2        | `pnpm db:up`, test commands documented.              | DONE   |
| W0.5 | Закрыть Wave, обновить docs/status и local green commit.   | W0.1–W0.4   | Quality gate green; no untracked required artifacts. | DONE   |

## Wave 1 — Database & Identity Foundation

| Task | Цель и области                                                     | Зависимости | Проверка / DoD                                             | Статус      |
| ---- | ------------------------------------------------------------------ | ----------- | ---------------------------------------------------------- | ----------- |
| W1.1 | Prisma 7 bootstrap, PostgreSQL driver adapter, pgvector migration. | W0          | Empty-DB migrate, Prisma validate, repository integration. | DONE        |
| W1.2 | Better Auth and core identity schema.                              | W1.1        | Register/login/session tests.                              | DONE        |
| W1.3 | Organization, Membership, Brand and BrandAccess.                   | W1.2        | Tenant-scoped repository tests.                            | DONE        |
| W1.4 | Tenant context, RBAC and audit base.                               | W1.3        | Cross-tenant and permission-denied tests.                  | DONE        |
| W1.5 | Close Wave 1 with full docs and green commit.                      | W1.1–W1.4   | lint/typecheck/unit/integration/E2E/build green.           | IN_PROGRESS |

## Wave 2 — Background Infrastructure

`W2.1` pg-boss bootstrap; `W2.2` WorkflowRun; `W2.3` worker and job registry; `W2.4` retries,
logging and audit; `W2.5` restart/idempotency tests and green closure. Status: `DONE`.

## Wave 3 — Brand Intelligence & Knowledge

| Task | Цель и области                                                    | Зависимости | Проверка / DoD                                            | Статус |
| ---- | ----------------------------------------------------------------- | ----------- | --------------------------------------------------------- | ------ |
| W3.1 | BrandProfile, BrandVoice и ContentPillar.                         | W2          | Prisma migration и tenant-scoped repository.              | DONE   |
| W3.2 | KnowledgeDocument и KnowledgeChunk.                               | W3.1        | Migration, repository и cross-brand integration contract. | DONE   |
| W3.3 | Безопасный ingestion URL/text/file, checksum и document statuses. | W3.2        | SSRF/file safety tests, idempotency и lifecycle contract. | DONE   |
| W3.4 | Embeddings и hybrid retrieval через pgvector.                     | W3.3        | Prisma 7 compatibility check, retrieval contracts.        | DONE   |
| W3.5 | Расширить brand-isolation tests.                                  | W3.4        | Cross-brand negative cases for all retrieval paths.       | DONE   |
| W3.6 | Закрыть Wave 3.                                                   | W3.1–W3.5   | Full quality gate, docs and local green commit.           | DONE   |

## Wave 3.5 — SourceCraft inception

After green W3 only: verify Doppler PAT without printing it, discover the owner AMS organization,
create private `ams-content-factory`, set it as `origin`, push local `main`, add SourceCraft verify
CI and main policy. No production deploy. Status: `DONE`.

## Subsequent Waves

### Execution status

- W4 Research — DONE.
- W5 Content — DONE.
- W6 Video planning — DONE.
- W7 Media — DONE: private storage, media assets/usages, render state and isolated media tool contracts.
- W8 Video providers — DONE; live HeyGen execution is BLOCKED_EXTERNAL, mock contracts are green.
- W9 Captions & QC — DONE.
- W10 Publishing — DONE: encrypted credentials, idempotent attempts and `OUTCOME_UNKNOWN` investigation contracts.
- W11 Analytics — DONE: raw/normalized snapshots, configurable collection policy and non-mutating learning insights.
- W12 MCP — DONE: scoped hash-only API keys, MCP service boundary and HMAC n8n/outbound webhook foundation.
- W13 AI Evals — DONE: seeded suites, cases, prompt comparison metadata and regression contracts.
- W14 UX — DONE: accessible responsive operational shell and empty/disabled states.
- W15 Hardening — DONE: security/architecture audit, repository-boundary remediation and repeat gate.
- W16 Production — DONE: Timeweb DBaaS portable Docker package, Linux artifact/systemd/host-Nginx release path, migration/seed, backup/restore runbooks and fresh-DB quality gate are complete; production deployment remains `BLOCKED_EXTERNAL` pending installed Timeweb `vector`, runtime/TLS/backup setup and release proof.

| Wave               | Task sequence                                                                    | Required outcome                                                             |
| ------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| W4 Research        | Inbox → sources → extraction → reports → Claim/Evidence → opportunities          | SSRF-safe research path with provenance.                                     |
| W5 Content         | project/version → generation → review → facts → approval                         | Controlled content state machine.                                            |
| W6 Video planning  | recipes → validation → storyboard → visual jobs                                  | Reusable, validated production plans.                                        |
| W7 Media           | assets → storage → render/video states → FFmpeg/Remotion                         | Composable media production foundation.                                      |
| W8 Video providers | contracts → HeyGen/Motion adapters → mocks → polling/costs                       | Provider-neutral video generation.                                           |
| W9 Captions & QC   | transcript → captions → burn-in → technical/visual/content QC                    | Mock pipeline produces verified MP4.                                         |
| W10 Publishing     | accounts/credentials → Publication → scheduler → Instagram/VK                    | Idempotent mock social E2E and `OUTCOME_UNKNOWN`.                            |
| W11 Analytics      | snapshots → normalized metrics → dashboard → costs/learning                      | Measured feedback loop.                                                      |
| W12 MCP            | auth/scopes → tools → signed n8n and outbound webhooks                           | MCP calls application services only.                                         |
| W13 AI Evals       | suites → cases → runs/results → regression CI                                    | Prompt quality is regression-tested.                                         |
| W14 UX             | neutral accessible baseline → states → responsive/a11y cleanup                   | Operational UI is responsive and no temporary product UI remains.            |
| W15 Hardening      | security audit → architecture audit → fixes → repeat audit                       | No critical tenant/auth/provider/secrets debt.                               |
| W16 Production     | Timeweb DBaaS + Docker/Nginx → migration/backup/runbooks → manual SC deploy gate | Deployment package ready; live deploy waits for Timeweb inputs and owner OK. |
