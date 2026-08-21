FROM node:22-alpine AS build

WORKDIR /opt/control-api

COPY apps/control-api/package.json apps/control-api/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY apps/control-api/tsconfig.json apps/control-api/tsconfig.build.json ./
COPY apps/control-api/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine

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
