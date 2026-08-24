FROM node:22.23.2-alpine3.24@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build

WORKDIR /opt/control-api

COPY apps/control-api/package.json apps/control-api/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY apps/control-api/tsconfig.json apps/control-api/tsconfig.build.json ./
COPY apps/control-api/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22.23.2-alpine3.24@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32

# The API runtime only executes the compiled service with Node. Package
# managers are build-time tools; retaining npm would ship its unrelated
# dependency graph (including node-tar) into the signed D3 image.
RUN rm -rf /usr/local/lib/node_modules/npm \
      /usr/local/lib/node_modules/corepack /opt/yarn-* && \
    rm -f /usr/local/bin/npm /usr/local/bin/npx \
      /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/corepack

WORKDIR /opt/control-api

COPY --chown=node:node --from=build /opt/control-api/node_modules ./node_modules
COPY --chown=node:node --from=build /opt/control-api/dist ./dist
COPY --chown=node:node apps/control-api/migrations ./migrations
COPY --chown=node:node apps/control-api/package.json ./
COPY --chown=node:node deploy/control-api/bootstrap-users.yaml ./bootstrap-users.yaml

ENV NODE_ENV=production

USER node
EXPOSE 4000
STOPSIGNAL SIGTERM

# Migrations and idempotent bootstrap run as separate one-shot Compose jobs.
# Keeping the long-running API as PID 1 gives SIGTERM and rolling restarts a
# deterministic lifecycle and avoids migration races when replicas scale out.
CMD ["node", "dist/main.js"]
