FROM node:20-slim AS build
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src ./src
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist

# Data volume for the SQLite queue and the persisted auth token/TTL (relay-identity.json) — both
# derive their default path from RELAY_DATA_DIR (see src/config.ts), so setting just this one env
# var keeps everything that needs to survive a restart in the mounted volume.
VOLUME ["/app/data"]
ENV RELAY_DATA_DIR=/app/data

CMD ["node", "dist/index.js"]
