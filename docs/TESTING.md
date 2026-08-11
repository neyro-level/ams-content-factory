# Testing strategy

Unit: domain rules, validation, transitions, encryption and idempotency.
Integration: repositories, migrations, tenant isolation and provider contracts.
E2E: login → organization → brand → critical workflow paths. Tests создаются в той же Wave,
что и функция; full quality gate обязателен перед её закрытием.
