# Kolab API (NestJS + Prisma). Build context: repo root.
FROM node:24-slim
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV CI=1
COPY . .
# The API, its workspace packages and the root toolchain only (skips the Expo app).
RUN pnpm install --frozen-lockfile --filter "@kolab/api..." --filter "{.}"
# prisma.config.ts reads DATABASE_URL; generating the client doesn't connect.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm --filter @kolab/api exec prisma generate
RUN pnpm --filter "@kolab/api..." run build
ENV NODE_ENV=production
CMD ["sh", "-c", "pnpm --filter @kolab/api exec prisma migrate deploy && node apps/api/dist/main.js"]
