# Backup and restore

## Backup

Перед миграцией, восстановлением или ручной операцией с PostgreSQL выполнить:

```sh
sh deploy/backup.sh
```

Скрипт создаёт timestamped custom-format dump в `backups/`. Каталог backup должен храниться за
пределами сервера или в зашифрованном долговременном хранилище. Успешное создание файла не заменяет
периодическую проверку восстановления.

## Проверка восстановления

Не реже одного раза перед первым production release восстановить свежий dump в изолированный
контур с отдельным `.env`, затем выполнить `prisma migrate deploy`, `/api/health/ready` и
релевантные integration tests. Никогда не тестировать restore на рабочем production volume.

## Restore

```sh
sh deploy/restore.sh backups/ams-content-factory-YYYYMMDDTHHMMSSZ.dump
```

Скрипт останавливает web/worker/nginx, выполняет `pg_restore --clean --if-exists`, повторно
применяет migrations и поднимает приложения. Это разрушительная операция: до запуска требуется
подтвердить нужный файл backup, окно работ и отсутствие активных публикаций.
