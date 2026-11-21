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
# Non-secret SQL/COPY inputs. A self-hosted checkout may be umask-0077, and COPY
# keeps the context's file modes, so a bare COPY made the pinned schema SQL
# node-owned 0600: the runtime could read it but the root cap-drop-ALL
# maintenance one-shot (no DAC_OVERRIDE) could not, and the official policy
# install refused before any DB write. These inputs are image-owned and
# read-only for every runtime user: root:root, files 0644, directories 0755.
# Bytes are untouched (the schema SQL is sha256-pinned in the runtime).
COPY --chown=root:root --chmod=0755 apps/control-api/migrations ./migrations
RUN find ./migrations -type f -exec chmod 0644 {} +
RUN mkdir -m 0755 ./native-schema
COPY --chown=root:root --chmod=0644 apps/control-api/src/execution-v2/current-human-candidate.sql ./native-schema/current-human-candidate.sql
COPY --chown=root:root --chmod=0644 apps/control-api/package.json ./
# Private input: owner and mode deliberately unchanged (node-owned, context
# mode). Never widen this one.
COPY --chown=node:node deploy/control-api/bootstrap-users.yaml ./bootstrap-users.yaml

ENV NODE_ENV=production

USER node
EXPOSE 4000
STOPSIGNAL SIGTERM

# Migrations and idempotent bootstrap run as separate one-shot Compose jobs.
# Keeping the long-running API as PID 1 gives SIGTERM and rolling restarts a
# deterministic lifecycle and avoids migration races when replicas scale out.
CMD ["node", "dist/main.js"]
