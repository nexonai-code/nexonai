# unpruuf Business Node — Linux container with its own Tor onion service.
# Tor comes from the same pinned Tor Expert Bundle as the Windows/macOS builds (built with the
# proof-of-work module; distro packages are often too old for onion-service PoW).
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npx tsc -p tsconfig.json && npm prune --omit=dev
RUN node -e "require('./dist/tor/torDownload').ensureTorBinary('/app/tor-bin').catch(e=>{console.error(e);process.exit(1)})"

FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* \
  && useradd --system --uid 10001 --home /app unpruuf
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/tor-bin ./tor-bin
COPY package.json ./
RUN mkdir -p /app/data && chown -R unpruuf /app/data
USER unpruuf
ENV NODE_MESH_DATA_DIR=/app/data \
    NODE_MESH_TOR_BIN_DIR=/app/tor-bin \
    ADMIN_BIND=0.0.0.0 \
    NODE_SLOT=1 \
    NODE_PROFILE=standard
VOLUME ["/app/data"]
# Only the setup page is published, and docker-compose.yml binds it to the host's loopback.
# The node API is never published — it is reached exclusively through the onion service.
EXPOSE 8790
CMD ["node", "dist/index.js"]
