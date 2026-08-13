# Non-destructive Release Smoke Suite

## Purpose

`pnpm release:smoke` is W19.6 evidence for the release package. It creates an isolated local pgvector database,
applies only committed migrations and seed data, executes the selected browser and worker contracts, then removes its
containers and volume. It does not read `.env`, connect to Timeweb, send a publication or call an external provider.

## Covered flow

| Required release step  | Evidence                                                           | Result scope                      |
| ---------------------- | ------------------------------------------------------------------ | --------------------------------- |
| Login                  | authenticated browser flow                                         | `FOUNDATION`                      |
| Organization and brand | owner creates both through `/app`                                  | `FOUNDATION`                      |
| Knowledge              | text intake and scoped knowledge page                              | `FOUNDATION`                      |
| Research               | workspace request with no Firecrawl credential                     | expected `BLOCKED_EXTERNAL`       |
| Generate content       | request with no OpenAI credential                                  | expected `BLOCKED_EXTERNAL`       |
| Approve                | manual fact-check/review approval flow                             | `FOUNDATION`                      |
| Schedule               | protected calendar scheduling flow                                 | `FOUNDATION`                      |
| Worker                 | real pg-boss/readiness bootstrap                                   | `FOUNDATION`                      |
| Publication sandbox    | durable dispatch contract with an explicitly named mock provider   | sandbox only; not live publishing |
| Analytics sandbox      | durable collection contract with an explicitly named mock provider | sandbox only; not live analytics  |

The command deliberately removes all provider credentials from its child environment. A missing Firecrawl/OpenAI
credential must lead to the visible `BLOCKED_EXTERNAL` path; it must not be replaced with a mock success. The two
sandbox entries prove transaction, scope and worker behavior only. They do not satisfy live social-provider, OAuth or
analytics readiness.

## Run

```powershell
$nodeDir='C:\Users\Юлия Скрицкая\AppData\Roaming\fnm\node-versions\v22.13.0\installation'
& "$nodeDir\corepack.cmd" pnpm release:smoke
```

The default loopback-only ports are PostgreSQL `55462` and browser application `55463`. Override them with
`RELEASE_SMOKE_DATABASE_PORT` and `RELEASE_SMOKE_E2E_PORT`; they must differ.

## Release boundary

This suite is necessary local evidence, not a Production Release Gate. It cannot prove the Timeweb `vector` object,
production environment and backup retention, trusted TLS/vhost, real provider credentials, real OAuth callbacks or
manual release authorization. Until those inputs and every checkbox in the Release Gate are complete, production
deployment remains `BLOCKED_EXTERNAL` and prohibited.
