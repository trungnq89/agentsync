FROM node:22-slim AS base
RUN npm install -g pnpm@12.21.0
WORKDIR /build

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /build/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# next.config is baked into the standalone server.js at build time
ARG ALLOWED_ORIGINS=
ENV ALLOWED_ORIGINS=$ALLOWED_ORIGINS
RUN pnpm build

FROM node:22-slim AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# Web server: Next standalone output.
WORKDIR /app
COPY --from=builder --chown=node:node /build/.next/standalone ./
COPY --from=builder --chown=node:node /build/.next/static ./.next/static
COPY --from=builder --chown=node:node /build/public ./public
# Ops tooling (migrations, seed-admin) with full node_modules, run via tsx.
WORKDIR /tools
COPY --from=builder --chown=node:node /build/node_modules ./node_modules
COPY --from=builder --chown=node:node /build/package.json /build/tsconfig.json ./
COPY --from=builder --chown=node:node /build/src ./src
COPY --from=builder --chown=node:node /build/scripts ./scripts
COPY --from=builder --chown=node:node /build/drizzle ./drizzle
COPY --chown=node:node docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
WORKDIR /app
USER node
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
