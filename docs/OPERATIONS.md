# Operations

## Runtime services

| Сервис     | Назначение                                             | Проверка                |
| ---------- | ------------------------------------------------------ | ----------------------- |
| `postgres` | PostgreSQL 16 + pgvector, единственный source of truth | `pg_isready`            |
| `web`      | Next.js UI, API и health endpoints                     | HTTP `/api/health/live` |
| `worker`   | pg-boss consumers и фоновые workflow                   | liveness PID 1          |
| `nginx`    | reverse proxy на web                                   | HTTP `/api/health/live` |

## Стандартные операции

```sh
docker compose --env-file .env -f docker-compose.prod.yml ps
docker compose --env-file .env -f docker-compose.prod.yml logs --tail=200 web
docker compose --env-file .env -f docker-compose.prod.yml logs --tail=200 worker
sh deploy/migrate.sh
sh deploy/seed.sh
```

Перед изменением приложения создать backup. Не изменять production schema вручную и не выполнять
`prisma db push`; разрешён только миграционный контейнер.

## Инцидент ready=503

1. Проверить статус `postgres` и его логи.
2. Проверить, что `DATABASE_URL` в `.env` ссылается на корректный хост и базу.
3. Проверить применённые миграции через `sh deploy/migrate.sh`.
4. Не удалять volume PostgreSQL и не запускать restore без подтверждённого backup.

## Логи и секреты

В логи не выводятся значения `.env`, access tokens, API keys, HMAC secrets или URL с credentials.
При инциденте перед передачей логов удалить возможные пользовательские данные и внешние URL.
