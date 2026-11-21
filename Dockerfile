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
RUN pnpm build

FROM node:22-slim AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# Web server: Next standalone output.
WORKDIR /app
COPY --from=builder /build/.next/standalone ./
COPY --from=builder /build/.next/static ./.next/static
COPY --from=builder /build/public ./public
# Ops tooling (migrations, seed-admin) with full node_modules, run via tsx.
WORKDIR /tools
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/package.json /build/tsconfig.json ./
COPY --from=builder /build/src ./src
COPY --from=builder /build/scripts ./scripts
COPY --from=builder /build/drizzle ./drizzle
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
WORKDIR /app
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
