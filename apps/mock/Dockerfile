# Mock platform / courier / store for the devnet demo. Build context: repo root.
FROM node:24-slim
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV CI=1
COPY . .
RUN pnpm install --frozen-lockfile --filter "@kolab/mock..." --filter "{.}"
ENV NODE_ENV=production
CMD ["node", "apps/mock/src/server.ts"]
