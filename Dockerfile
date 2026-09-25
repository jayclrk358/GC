# syntax=docker/dockerfile:1.7
# One image definition for every Magnox process. Build a specific target:
#   docker build --target web .      Next.js standalone server
#   docker build --target app .      realtime / worker / migrate (run from source with tsx)

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY apps/realtime/package.json apps/realtime/
COPY apps/worker/package.json apps/worker/
COPY packages/auth/package.json packages/auth/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
ARG NEXT_PUBLIC_REALTIME_URL=""
ENV NEXT_PUBLIC_REALTIME_URL=$NEXT_PUBLIC_REALTIME_URL
RUN pnpm --filter @magnox/web build

FROM node:22-bookworm-slim AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /srv
RUN useradd --system --uid 1001 magnox
COPY --from=build --chown=magnox /repo/apps/web/.next/standalone ./
COPY --from=build --chown=magnox /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=magnox /repo/apps/web/public ./apps/web/public
USER magnox
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]

FROM deps AS app
ENV NODE_ENV=production
COPY . .
RUN useradd --system --uid 1001 magnox && chown -R magnox /repo/storage 2>/dev/null || true
USER magnox
CMD ["pnpm", "--filter", "@magnox/realtime", "start"]
