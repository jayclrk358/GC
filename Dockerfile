# syntax=docker/dockerfile:1.7
# One image definition for every Magnox process. Build a specific target:
#   docker build --target web .      Next.js standalone server
#   docker build --target app .      realtime / worker / migrate (run from source with tsx)

FROM node:22-bookworm-slim AS base
# pnpm is installed into a shared folder at build time, so the unprivileged runtime user can run
# it without downloading anything.
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_HOME=/opt/corepack COREPACK_ENABLE_DOWNLOAD_PROMPT=0
COPY package.json /tmp/package.json
RUN corepack enable \
 && corepack install -g "$(node -p "require('/tmp/package.json').packageManager")" \
 && chmod -R a+rX /opt/corepack
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
# public/ may be empty, and git doesn't keep empty folders, so make sure it exists.
RUN mkdir -p apps/web/public && pnpm --filter @magnox/web build

FROM node:22-bookworm-slim AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /srv
# The upload volume mounts at /data/media; a new volume takes this folder's owner.
RUN useradd --system --uid 1001 magnox && mkdir -p /data/media && chown magnox /data/media
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
RUN useradd --system --uid 1001 magnox && mkdir -p /data/media && chown magnox /data/media
USER magnox
CMD ["pnpm", "--filter", "@magnox/realtime", "start"]
