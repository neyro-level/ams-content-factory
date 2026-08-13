# syntax=docker/dockerfile:1

FROM node:22.13.0-bookworm-slim AS build

RUN apt-get update \
  && apt-get install --no-install-recommends -y ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --global pnpm@11.5.1

WORKDIR /app
COPY . .

# Prisma needs a syntactically valid URL to generate its client; this is never a live connection.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/ams_content_factory
RUN pnpm install --frozen-lockfile \
  && pnpm prisma:generate \
  && BETTER_AUTH_SECRET="$(openssl rand -base64 48)" TOKEN_ENCRYPTION_KEY="$(openssl rand -base64 32)" pnpm build \
  && mkdir -p apps/web/.next/standalone/apps/web/.next \
  && cp -a apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static \
  && CI=true pnpm prune --prod

FROM node:22.13.0-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install --no-install-recommends -y ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --global pnpm@11.5.1 \
  && groupadd --system amscf \
  && useradd --system --gid amscf --create-home --home-dir /home/amscf amscf

WORKDIR /app
COPY --from=build --chown=amscf:amscf /app /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

USER amscf
EXPOSE 3000
CMD ["node", "apps/web/.next/standalone/apps/web/server.js"]
