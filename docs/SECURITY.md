# Security baseline

- Все tenant-owned repository methods требуют tenant context.
- Сессия, role и brand access проверяются на сервере.
- Secrets только в environment/Doppler; логи редактируют секретные поля.
- SSRF, upload validation, webhook signatures, OAuth token encryption и rate limits появляются
  до соответствующих внешних entrypoints, а не в конце проекта.
- Knowledge URL ingestion accepts only HTTP(S) on standard ports, resolves every target before use and
  pins the outbound request to a verified public IPv4 address; redirects are independently validated.
  Files are limited to 1 MB UTF-8 text in an explicit allowlist of extensions; direct text is bounded
  to the same limit. Neither source type is accepted without a brand-scoped write context.
