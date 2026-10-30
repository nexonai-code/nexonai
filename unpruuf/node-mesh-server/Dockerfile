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
# release-manifest.txt (signed list of the program files) is copied when the release was signed; the
# bracket pattern keeps the build working without it (an unsigned development build).
COPY package.json release-manifest.tx[t] ./
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
# The node API answers /health on its loopback port (slot 1: 8788) without any credential.
HEALTHCHECK --interval=60s --timeout=5s --start-period=120s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8788)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
