# Build Status

## Current verified checkpoint

- **Current plan:** `docs/MASTER_IMPLEMENTATION_PLAN.md`.
- **Current V0.1 slice:** `docs/V0_1_USER_TEST_PLAN.md` is `IMPLEMENTED`: the owner-facing Brand Context →
  Knowledge → Content → READY → Copy workflow, generation integrity and critical E2E CI gate are present.
  Local verification passed Prisma validation/migration deploy, clean-database migration drill, lint, format,
  typecheck, 76 unit tests, 85 integration tests, two V0.1 browser smokes and build. SourceCraft `verify` is green
  both on the implementation PR and on canonical `main` (`b9a094b`), including PostgreSQL + pgvector and critical
  E2E. The final user-test verdict is `NOT READY` only because a securely configured `OPENAI_API_KEY` is required
  for one real owner smoke; deterministic E2E is not a substitute. User-facing module labels remain only `READY`,
  `LIMITED` and `PLANNED`.
- **Current task:** W19.6 release smoke is `FOUNDATION`: its isolated pgvector database, five critical browser flows
  and three worker contracts passed. The Release Gate remains `BLOCKED_EXTERNAL`: DNS/ports resolve, but the public
  hostname still serves generic Nginx and trusted project TLS/vhost, Timeweb `vector`, live providers and owner
  authorization are unavailable. No certificate, vhost or deployment was changed.
- **Last verification:** 2026-08-13: `pnpm release:smoke` applied 24 migrations and seed data to a disposable
  pgvector database, passed five browser and three worker contracts, and removed its containers/volume. Its external
  provider environment was intentionally empty and the research/text-generation paths required `BLOCKED_EXTERNAL`.
- **FOUNDATION:** multi-tenant model, repositories, services, provider contracts, worker/queue base,
  health endpoints, CI, immutable artifact/runbook templates, fail-closed QC persistence, suspended-
  organization denial, server-bound n8n webhook credentials, scoped tenant-owned write APIs and a
  PostgreSQL + pgvector integration gate in SourceCraft CI exist.
- **NOT_IMPLEMENTED:** live provider production operations and final Release Gate proof.
- **Remote:** private SourceCraft repository `integrator-p/ams-content-factory` is canonical `origin`;
  protected `main` and `verify` CI are active. GitHub is a non-canonical legacy mirror.

## Production boundary

```text
APPLICATION: FOUNDATION
DEPLOYMENT_PACKAGE: FOUNDATION
PRODUCTION_DEPLOYMENT: BLOCKED_EXTERNAL
```

Verified on 2026-08-11: `fabrika.ams24.ru` resolves to AMS Server `5.42.100.161`; the server has host Nginx,
active Certbot and Node 22.22.2. An exact `ce7e9f7` SourceCraft-main source snapshot is present in an
inactive staging release. Its existing TLS certificate does not cover the new hostname, so traffic is not
routed to the application.

Required inputs not present in this workspace: enabled `pgvector`, TLS policy/certificate settings and
database backup schedule; final server resource expansion, runtime env secrets, Nginx vhost/certificate
issuance, S3 endpoint/bucket/credentials, Instagram and VK app credentials, and live OpenAI/HeyGen/Motion
credentials. Production deployment additionally requires explicit infrastructure confirmation from the owner.

The supplied Fabrika DBaaS endpoint and runtime user were verified from AMS Server. `pgvector` is enabled
in the Timeweb instance configuration and the PostgreSQL package is available, but its SQL object is not
installed in `default_db`: the provider-controlled database owner retains that permission. The Timeweb API
has no separate extension-install action, so database schema deployment is specifically `BLOCKED_EXTERNAL`
until Timeweb installs `vector` or supplies an extension-capable operator connection.

Knowledge hybrid retrieval is also `BLOCKED_EXTERNAL`: the application has a real OpenAI embedding adapter
and a protected UI entry point, but this workspace has no `OPENAI_API_KEY`. It intentionally returns an
explicit unavailable status and never substitutes mock embeddings for a live result.

Research search and URL extraction are `BLOCKED_EXTERNAL`: a protected workspace and a production
Firecrawl adapter are implemented, but this workspace has no `FIRECRAWL_API_KEY`. Text intake remains
available through the repository-bound application service; external search and extraction never report
mock success when the provider is not configured.

Text generation is `BLOCKED_EXTERNAL`: the application-facing provider contract and one OpenAI Responses
API adapter exist, but no `OPENAI_API_KEY` is configured. The adapter uses a bounded request and `store:
false`; missing credentials, upstream errors and empty output are fail-closed. No user-facing generation
result is presented as live until the credential is supplied and a later execution workflow is implemented.

Media upload is `BLOCKED_EXTERNAL`: the protected brand media library is available and test contracts use
an explicit test-only storage double, but the product path has no local-storage fallback. It does not create
an asset record or report a successful upload until the private S3 endpoint, bucket and credentials are
configured through the production runtime.

Storyboard generation is `BLOCKED_EXTERNAL`: approved-script and active-recipe validation are implemented
behind the existing OpenAI provider boundary, but the runtime has no `OPENAI_API_KEY`. An unavailable
provider creates no storyboard; test-only mock generation is not part of the product path.

VK publishing is `BLOCKED_EXTERNAL`: the provider layer contains a bounded VK API v5.199 client for text-only
`wall.post` and post reconciliation. It needs an encrypted per-account OAuth token, `VK_API_VERSION` and the
not-yet-implemented VK media upload path; absent inputs, API errors, timeouts and internal storage keys fail
closed and never report a published post.

Instagram publishing is `BLOCKED_EXTERNAL`: the provider layer contains bounded Graph API v22.0 image-container
and publish calls, but private storage keys, local/private URLs, missing OAuth tokens and unsupported media shapes
are rejected. A public delivery/upload boundary and connected Instagram OAuth account are required before a real
post can be attempted; authenticated status reconciliation is implemented but live operation remains blocked.

VK analytics is `BLOCKED_EXTERNAL`: a bounded VK `wall.getById` runtime adapter validates that the requested
post belongs to the connected account and stores only returned views, likes, comments and reposts (as shares).
The adapter has no live worker entry point yet and requires the encrypted account OAuth token and `VK_API_VERSION`;
missing configuration, malformed ids, API errors, timeouts and absent posts fail closed.

Instagram analytics is `BLOCKED_EXTERNAL`: a bounded Graph media adapter reads direct like/comment counters and
the documented Media Insights values for impressions, reach, shares and saved media. It requires the encrypted
account OAuth token and `INSTAGRAM_GRAPH_API_VERSION`; it does not fabricate unavailable metrics or preserve a
token in raw metrics/errors, and missing configuration, malformed ids, Graph errors, timeouts and absent media
fail closed. W14.4 registers the actual worker handler, while live collection remains blocked without credentials.

Analytics workflow execution is `FOUNDATION`: W14.4 registers `analytics.collect` in the actual worker dispatcher.
It invokes the scoped core service only after validating the durable workflow's type, brand, payload and due time;
foreign, malformed or premature runs persist `FAILED` without a snapshot. Live provider collection remains
`BLOCKED_EXTERNAL` until an encrypted connected account credential and provider runtime configuration exist.

The AMS Server artifact pipeline is a `FOUNDATION`: it has not been built from a merged main commit or
installed on the server. It intentionally does not bypass the missing `vector` SQL object, runtime
environment file, server capacity expansion, systemd/Nginx/TLS activation or release-gate proof.

## Verification note

`docker compose config --quiet` passes. Two local Docker image builds reached the pinned Node base and package installation but were interrupted by transient npm-registry socket resets inside Docker; this is an external network condition, not a code failure. Re-run the image build in a network-stable release environment before the first deployment.
