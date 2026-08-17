FROM node:22-alpine AS build

WORKDIR /opt/control-api

COPY apps/control-api/package.json apps/control-api/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY apps/control-api/tsconfig.json apps/control-api/tsconfig.build.json ./
COPY apps/control-api/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine

WORKDIR /opt/control-api

COPY --from=build /opt/control-api/node_modules ./node_modules
COPY --from=build /opt/control-api/dist ./dist
COPY apps/control-api/migrations ./migrations
COPY apps/control-api/package.json ./
COPY deploy/control-api/bootstrap-users.yaml ./bootstrap-users.yaml

ENV NODE_ENV=production

USER node
EXPOSE 4000

# Apply migrations before serving; the web gateway now routes /api/ through
# this façade, so the DB must be migrated at startup (idempotent).
CMD ["sh", "-c", "./node_modules/.bin/node-pg-migrate -m migrations up && node dist/cli/bootstrap.js --file bootstrap-users.yaml --generate-one-time-credentials && node dist/main.js"]
