# Dependency Hygiene

## Scope

This record is the evidence for W18.5. It audits the committed pnpm lockfile and production dependency closure;
it does not authorize automatic dependency upgrades or removal of declared runtime peers.

## Reproducible commands

```text
pnpm why @prisma/client -r
pnpm why pg -r
pnpm why esbuild -r
pnpm why tailwindcss -r
pnpm audit --prod --json
pnpm audit --json
DATABASE_URL=<syntactically-valid-local-url> pnpm dlx knip@6.32.2 --reporter compact
```

The unused-dependency analyzer needs `DATABASE_URL` only to load `prisma.config.ts`; the check does not connect to
that URL. Its pinned invocation is an audit tool, not a production dependency.

## Verified result — 2026-08-13

- Removed `auth`: `pnpm why auth -r` showed it was an unused root-only development dependency.
- Replaced the vulnerable transitive `esbuild@0.27.7` with the workspace `overrides.esbuild: 0.28.1` policy. The
  final graph has one `esbuild@0.28.1`; both production and full `pnpm audit --json` reports contain zero
  vulnerabilities.
- The unused analyzer's remaining dependency findings are reviewed rather than suppressed: `@prisma/client` is
  imported by Prisma-generated client output; `pg` is required by `@prisma/adapter-pg` and the database client;
  `tailwindcss` is consumed by `apps/web/app/globals.css` and `apps/web/postcss.config.mjs`.
- Removed stale exports reported by the analyzer from worker/provider implementation modules. No external package
  API or tenant/provider behavior changed.

## Policy

- Run the commands above before a release package and after a dependency addition or lockfile refresh.
- Keep pnpm package overrides in `pnpm-workspace.yaml`, where pnpm 11 resolves workspace-wide security policy.
- A nonzero audit result or an unreviewed unused dependency blocks the next wave until it is remediated or recorded
  as a concrete external constraint.
