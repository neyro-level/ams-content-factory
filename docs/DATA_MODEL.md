# Data model

## Applied Wave 1 foundation

Migration `20260811105046_init_identity_foundation` establishes:

- Better Auth: `User`, `Session`, `Account`, `Verification`.
- Tenant access: `Organization`, `Membership`, `Brand`, `BrandAccess`.
- Compliance base: append-only `AuditLog`.
- PostgreSQL extension `vector`; embeddings arrive only in Wave 3.

Wave 1 создаёт foundation: Better Auth user/session/account/verifications, Organization,
Membership, Brand, BrandAccess и AuditLog. Последующие модели добавляются migration-by-migration
и документируются здесь до закрытия соответствующей Wave.
