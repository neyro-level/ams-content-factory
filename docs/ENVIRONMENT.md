# Environment

`.env.example` содержит production placeholder-значения для Timeweb DBaaS, а
`.env.development.example` — безопасный local Docker contract. Реальный `.env` не попадает в Git,
SourceCraft CI, Markdown, браузерный bundle или логи.

| Группа      | Переменные                                                   | Назначение                                              |
| ----------- | ------------------------------------------------------------ | ------------------------------------------------------- |
| Application | `APP_URL`, `NODE_ENV`, `HTTP_PORT`                           | public origin и runtime                                 |
| Database    | `DATABASE_URL`                                               | Timeweb Cloud DBaaS PostgreSQL, Prisma и pg-boss        |
| Security    | `BETTER_AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY`                 | auth, credential encryption и inbound HMAC              |
| MCP runtime | `MCP_API_KEY`                                                | runtime-only read-scoped API key; never browser-exposed |
| AI/media    | `OPENAI_API_KEY`, `HEYGEN_API_KEY`, `MOTION_API_KEY`, `S3_*` | provider adapters; live calls blocked без credentials   |
| Social      | `INSTAGRAM_*`, `VK_*`                                        | официальные provider credentials                        |

`TOKEN_ENCRYPTION_KEY` должен быть base64-представлением случайных 32 байтов. Все production
секреты генерируются и передаются через утверждённое secret storage/серверное окружение, а не через
issue, PR description или чат.

## Explicit live AI owner smoke

`pnpm live:ai-owner-smoke` is an isolated proof command, not a normal development or CI task. It may make exactly
one real OpenAI generation only after the operator supplies `OPENAI_API_KEY` through approved local secret storage
and adds `CONFIRM_LIVE_AI_SMOKE=run` to the process environment. It does not read or print a key, does not use
Timeweb or production data, creates a disposable local pgvector database and removes it in `finally`. Never place
either value in source control, SourceCraft CI secrets for `verify`, a PR body or a chat transcript.

Inbound n8n secrets не являются общим environment-secret: каждый секрет шифруется и хранится в
`InboundWebhookCredential` для конкретной организации. Входящий запрос определяет организацию только
по `x-ams-key-id`; его signature покрывает method, topic, key ID, brand ID, idempotency key и hash body.

## MCP runtime

`apps/mcp` is a stdio MCP process, not an HTTP endpoint. Its `MCP_API_KEY` is supplied only to the process
environment, must be an active read-scoped key from the same application database, and must never be added to
`NEXT_PUBLIC_*`, a browser bundle, source control, Markdown or logs. The runtime fails closed before opening stdio
when this value is absent, malformed, revoked, expired or insufficiently scoped. A production MCP launch remains
`BLOCKED_EXTERNAL` until an operator provisions and injects such a scoped key through approved secret storage.

`DATABASE_URL` для production копируется из панели Timeweb Cloud DBaaS и остаётся единственным
источником параметров подключения. Он обязан указывать на внешний кластер, включать согласованную
TLS-политику и никогда не использовать имя Docker-сервиса `postgres`. Для local development
скопировать `.env.development.example` в отдельный, некоммитящийся `.env`; он использует
`localhost:54329` из `docker-compose.dev.yml`.
