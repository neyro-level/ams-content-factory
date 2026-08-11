# Полный паспорт

AMS Content Factory строится как production-ready modular monolith с отдельным worker.
PostgreSQL хранит весь business state; pg-boss использует тот же кластер для фоновых jobs.
В production этот кластер предоставляется Timeweb Cloud DBaaS: PostgreSQL не запускается в Docker Compose приложения.
Локальный Docker PostgreSQL 16 + pgvector остаётся изолированным контуром разработки и тестов.
Все данные изолированы по Organization и Brand. Внешние интеграции заменяемы через provider adapters.

Внешние credentials не блокируют реализацию: production adapter, mock и contract tests создаются
в соответствующей Wave, а live test получает `BLOCKED_EXTERNAL`.
