FROM node:22.13.0-bookworm-slim

RUN apt-get update \
  && apt-get install --no-install-recommends -y ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/* \
  && npm install --global pnpm@11.5.1

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile \
  && pnpm prisma:generate \
  && pnpm build

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000
CMD ["pnpm", "--filter", "@ams-content-factory/web", "start"]
