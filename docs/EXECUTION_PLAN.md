# Execution Plan — AMS Content Factory

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
| W1.1 | Prisma 7 bootstrap, PostgreSQL driver adapter, pgvector migration. | W0          | Empty-DB migrate, Prisma validate, repository integration. | NOT_STARTED |
| W1.2 | Better Auth and core identity schema.                              | W1.1        | Register/login/session tests.                              | NOT_STARTED |
| W1.3 | Organization, Membership, Brand and BrandAccess.                   | W1.2        | Tenant-scoped repository tests.                            | NOT_STARTED |
| W1.4 | Tenant context, RBAC and audit base.                               | W1.3        | Cross-tenant and permission-denied tests.                  | NOT_STARTED |
| W1.5 | Close Wave 1 with full docs and green commit.                      | W1.1–W1.4   | lint/typecheck/unit/integration/E2E/build green.           | NOT_STARTED |

## Wave 2 — Background Infrastructure

`W2.1` pg-boss bootstrap; `W2.2` WorkflowRun; `W2.3` worker and job registry; `W2.4` retries,
logging and audit; `W2.5` restart/idempotency tests and green closure. Status: `NOT_STARTED`.

## Wave 3 — Brand Intelligence & Knowledge

`W3.1` BrandProfile/Voice/Pillar; `W3.2` KnowledgeDocument/Chunk; `W3.3` URL/text/file ingestion;
`W3.4` embeddings and hybrid retrieval; `W3.5` brand-isolation tests; `W3.6` green closure.
All tasks: `NOT_STARTED`.

## Wave 3.5 — SourceCraft inception

After green W3 only: verify Doppler PAT without printing it, discover the owner AMS organization,
create private `ams-content-factory`, set it as `origin`, push local `main`, add SourceCraft verify
CI and main policy. No production deploy. Status: `NOT_STARTED`.

## Subsequent Waves

| Wave               | Task sequence                                                           | Required outcome                                                     |
| ------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| W4 Research        | Inbox → sources → extraction → reports → Claim/Evidence → opportunities | SSRF-safe research path with provenance.                             |
| W5 Content         | project/version → generation → review → facts → approval                | Controlled content state machine.                                    |
| W6 Video planning  | recipes → validation → storyboard → visual jobs                         | Reusable, validated production plans.                                |
| W7 Media           | assets → storage → render/video states → FFmpeg/Remotion                | Composable media production foundation.                              |
| W8 Video providers | contracts → HeyGen/Motion adapters → mocks → polling/costs              | Provider-neutral video generation.                                   |
| W9 Captions & QC   | transcript → captions → burn-in → technical/visual/content QC           | Mock pipeline produces verified MP4.                                 |
| W10 Publishing     | accounts/credentials → Publication → scheduler → Instagram/VK           | Idempotent mock social E2E and `OUTCOME_UNKNOWN`.                    |
| W11 Analytics      | snapshots → normalized metrics → dashboard → costs/learning             | Measured feedback loop.                                              |
| W12 MCP            | auth/scopes → tools → signed n8n and outbound webhooks                  | MCP calls application services only.                                 |
| W13 AI Evals       | suites → cases → runs/results → regression CI                           | Prompt quality is regression-tested.                                 |
| W14 UX             | approved design system → states → responsive/a11y cleanup               | No temporary UI remains.                                             |
| W15 Hardening      | security audit → architecture audit → fixes → repeat audit              | No critical tenant/auth/provider/secrets debt.                       |
| W16 Production     | Docker/Nginx → migration/backup/runbooks → manual SC deploy gate        | Deployment package ready; live deploy waits for inputs and owner OK. |
