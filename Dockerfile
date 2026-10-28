ARG NODE_IMAGE=node:24-bookworm-slim@sha256:cb4e8f7c443347358b7875e717c29e27bf9befc8f5a26cf18af3c3dec80e58c5
ARG QA_BASE_IMAGE=node:24-bookworm-slim@sha256:cb4e8f7c443347358b7875e717c29e27bf9befc8f5a26cf18af3c3dec80e58c5
FROM ${NODE_IMAGE} AS node-base
WORKDIR /app
FROM node-base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
FROM dependencies AS build
COPY . .
RUN npm run build
FROM dependencies AS production-dependencies
RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund
FROM node-base AS runtime
ENV NODE_ENV=production
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/src ./src
COPY --from=build /app/public ./public
COPY --from=build /app/data ./data
COPY --from=build /app/engines ./engines
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/ops ./ops
COPY --from=build /app/package.json /app/accounts-server.ts /app/server.ts /app/resource-server.ts /app/blob-server.ts ./
USER node
CMD ["node","--import","tsx","accounts-server.ts"]
FROM ${QA_BASE_IMAGE} AS browser
USER root
RUN node -e "if (Number(process.versions.node.split('.')[0]) < 22) process.exit(1)"
RUN if ! command -v chromium >/dev/null; then apt-get update && apt-get install -y --no-install-recommends chromium fonts-noto-cjk && rm -rf /var/lib/apt/lists/*; fi
WORKDIR /opt/wvn
COPY --from=build /app ./
ENV HOME=/tmp/wvn-browser
USER 1000:1000
ENTRYPOINT []
CMD ["node","ops/compose/browser-check.mjs"]
