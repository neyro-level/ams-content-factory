# Backup and restore

## Backup

Timeweb Cloud DBaaS backup policy — основной контур восстановления инфраструктуры. До первого
release в панели Timeweb должны быть включены provider backups и подтверждён срок хранения.

Перед миграцией, восстановлением или ручной операцией с PostgreSQL дополнительно выполнить
логический backup через клиент, который подключается к Timeweb по `DATABASE_URL`:

```sh
sh deploy/backup.sh
```

Скрипт создаёт timestamped custom-format dump в `backups/`; он не запускает и не требует
PostgreSQL-контейнер. Каталог backup должен храниться за пределами application-сервера или в
зашифрованном долговременном хранилище. Успешное создание файла не заменяет периодическую проверку
восстановления.

## Проверка восстановления

Не реже одного раза перед первым production release восстановить свежий dump в изолированный
контур с отдельным `.env`, затем выполнить `prisma migrate deploy`, `/api/health/ready` и
релевантные integration tests. Никогда не тестировать restore на рабочем production volume.

## Restore

```sh
sh deploy/restore.sh backups/ams-content-factory-YYYYMMDDTHHMMSSZ.dump
```

Скрипт останавливает web/worker/nginx, запускает одноразовый PostgreSQL 16 client против Timeweb
DBaaS, выполняет `pg_restore --clean --if-exists`, повторно применяет migrations и поднимает
приложения. Это разрушительная операция: до запуска требуется подтвердить нужный файл backup,
окно работ и отсутствие активных публикаций. Для аварии уровня кластера использовать процедуру
восстановления Timeweb, а не application Docker Compose.
