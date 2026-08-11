# Security baseline

- Все tenant-owned repository methods требуют tenant context.
- Сессия, role и brand access проверяются на сервере.
- Secrets только в environment/Doppler; логи редактируют секретные поля.
- SSRF, upload validation, webhook signatures, OAuth token encryption и rate limits появляются
  до соответствующих внешних entrypoints, а не в конце проекта.
