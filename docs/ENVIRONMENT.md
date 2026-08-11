# Environment

`.env.example` содержит только имена переменных и безопасные placeholder-значения. Реальный `.env`
не попадает в Git, SourceCraft CI, Markdown, браузерный bundle или логи.

| Группа      | Переменные                                                         | Назначение                                            |
| ----------- | ------------------------------------------------------------------ | ----------------------------------------------------- |
| Application | `APP_URL`, `NODE_ENV`, `HTTP_PORT`                                 | public origin и runtime                               |
| Database    | `DATABASE_URL`                                                     | Timeweb Cloud DBaaS PostgreSQL, Prisma и pg-boss      |
| Security    | `BETTER_AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY`, `N8N_WEBHOOK_SECRET` | auth, credential encryption, HMAC                     |
| AI/media    | `OPENAI_API_KEY`, `HEYGEN_API_KEY`, `MOTION_API_KEY`, `S3_*`       | provider adapters; live calls blocked без credentials |
| Social      | `INSTAGRAM_*`, `VK_*`                                              | официальные provider credentials                      |

`TOKEN_ENCRYPTION_KEY` должен быть base64-представлением случайных 32 байтов. Все production
секреты генерируются и передаются через утверждённое secret storage/серверное окружение, а не через
issue, PR description или чат.

`DATABASE_URL` для production копируется из панели Timeweb Cloud DBaaS и остаётся единственным
источником параметров подключения. Он обязан указывать на внешний кластер, включать согласованную
TLS-политику и никогда не использовать имя Docker-сервиса `postgres`. Для local development
используется отдельный, некоммитящийся `.env` с `localhost:54329` из `docker-compose.dev.yml`.
