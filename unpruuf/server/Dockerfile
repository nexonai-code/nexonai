FROM node:20-slim AS build
WORKDIR /app
# The lock file decides the versions, exactly as tested (npm ci), not whatever resolves today.
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
RUN useradd --system --uid 10001 --home /app unpruuf && mkdir -p /app/data && chown -R unpruuf /app/data
COPY package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER unpruuf
HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Data volume for the SQLite queue and the persisted auth token/TTL (relay-identity.json) — both
# derive their default path from RELAY_DATA_DIR (see src/config.ts), so setting just this one env
# var keeps everything that needs to survive a restart in the mounted volume.
VOLUME ["/app/data"]
ENV RELAY_DATA_DIR=/app/data

CMD ["node", "dist/index.js"]
