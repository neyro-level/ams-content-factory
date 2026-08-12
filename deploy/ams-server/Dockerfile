# syntax=docker/dockerfile:1

FROM node:22.13.0-bookworm-slim AS build

RUN apt-get update \
  && apt-get install --no-install-recommends -y ca-certificates git \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --global pnpm@11.5.1

WORKDIR /workspace
COPY . .

# Prisma validates that the variable exists while generating its client. This is never a live connection.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/ams_content_factory
RUN pnpm install --frozen-lockfile \
  && pnpm prisma:generate \
  && pnpm build \
  && CI=true pnpm prune --prod

FROM node:22.13.0-bookworm-slim AS artifact

ARG RELEASE_SHA
ARG RELEASE_KIND=production

RUN test "$RELEASE_KIND" = production -o "$RELEASE_KIND" = test \
  && printf '{"format":1,"releaseSha":"%s","releaseKind":"%s"}\n' "$RELEASE_SHA" "$RELEASE_KIND" > /release.json

WORKDIR /release
COPY --from=build /workspace /release/app

# Next.js deliberately leaves these directories outside standalone output.
RUN mkdir -p /release/app/apps/web/.next/standalone/apps/web/.next/static
COPY --from=build /workspace/apps/web/.next/static /release/app/apps/web/.next/standalone/apps/web/.next/static
RUN mv /release.json /release/release.json \
  && rm -rf /release/app/.git /release/app/.next /release/app/apps/web/.next/cache
