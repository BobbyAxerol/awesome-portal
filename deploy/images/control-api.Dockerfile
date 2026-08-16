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

ENV NODE_ENV=production

USER node
EXPOSE 4000

CMD ["node", "dist/main.js"]
