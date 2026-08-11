# Operations

## Runtime services

| Сервис        | Назначение                                                     | Проверка                             |
| ------------- | -------------------------------------------------------------- | ------------------------------------ |
| Timeweb DBaaS | Managed PostgreSQL 16 + pgvector, единственный source of truth | панель Timeweb и `/api/health/ready` |
| `web`         | Next.js UI, API и health endpoints                             | HTTP `/api/health/live`              |
| `worker`      | pg-boss consumers и фоновые workflow                           | liveness PID 1                       |
| `nginx`       | reverse proxy на web                                           | HTTP `/api/health/live`              |

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

1. Проверить status, сеть доступа и TLS-параметры кластера в панели Timeweb Cloud.
2. Проверить, что `DATABASE_URL` в `.env` ссылается на корректный внешний хост и базу.
3. Проверить применённые миграции через `sh deploy/migrate.sh`.
4. Не менять схему вручную и не запускать restore без подтверждённого backup и maintenance window.

## Логи и секреты

В логи не выводятся значения `.env`, access tokens, API keys, HMAC secrets или URL с credentials.
При инциденте перед передачей логов удалить возможные пользовательские данные и внешние URL.
