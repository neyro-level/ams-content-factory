# TLS and Domain External-Input Audit

## Read-only verification — 2026-08-13

| Check               | Result           | Evidence                                                                                                           |
| ------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| DNS A record        | PASS             | `fabrika.ams24.ru` resolves to AMS Server `5.42.100.161`.                                                          |
| TCP reachability    | PASS             | Public ports 80 and 443 accept connections.                                                                        |
| HTTP routing        | BLOCKED_EXTERNAL | HTTP 200 is a generic Nginx page, not the application.                                                             |
| HTTPS routing       | BLOCKED_EXTERNAL | HTTPS 200 is a generic Nginx page and the client cannot establish a trusted TLS relationship for this hostname.    |
| Application release | BLOCKED_EXTERNAL | No active project vhost, certificate, systemd services or `current` release may be inferred from the generic page. |

## Required external release inputs

1. Explicit owner confirmation of the release window and AMS Server capacity.
2. A root-owned runtime environment file with production secrets and the verified Timeweb TLS connection.
3. Provider/operator installation of the `vector` SQL object in the target Timeweb database (the runtime role cannot
   create it).
4. A reviewed AMS Server vhost and successful certificate issuance/coverage for `fabrika.ams24.ru`.
5. Enabled Timeweb backup policy and external retention decision.
6. Completion of the remaining W19 release-smoke evidence and all Release Gate entries.

## Boundary

This document records public observations only. It does not authorize certificate issuance, modification of host Nginx,
creation of systemd services, database migration, artifact activation or production deployment. Those are external,
irreversible operational actions and remain prohibited until all Release Gate conditions and explicit owner confirmation
are present.
