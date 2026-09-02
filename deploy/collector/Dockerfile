# Collector image. Phase 1 needs only Node (HAC is plain HTTP). Phase 2 switches the base to
# mcr.microsoft.com/playwright:v1.62.1-noble (bundled Chromium) for Stagehand.
FROM node:22-bookworm-slim
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable && corepack prepare pnpm@11.4.0 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY services/collector/package.json services/collector/
RUN pnpm install --frozen-lockfile --filter @skoolie/collector...
COPY packages/shared packages/shared
COPY services/collector services/collector
RUN pnpm --filter @skoolie/collector typecheck
USER node
WORKDIR /app/services/collector
ENTRYPOINT ["pnpm", "exec", "tsx", "src/run.ts"]
