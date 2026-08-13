FROM node:22-alpine AS quantbt-portal-build

WORKDIR /opt/quantbt-portal/frontend
COPY apps/quantbt-portal/frontend/package.json apps/quantbt-portal/frontend/package-lock.json ./
RUN npm ci
COPY apps/quantbt-portal/frontend ./
RUN npm run build

FROM node:22-alpine AS manager-portal-build

WORKDIR /opt/manager-portal/frontend
COPY features/manager-portal/frontend/package.json features/manager-portal/frontend/package-lock.json ./
RUN npm ci
COPY features/manager-portal/frontend ./
# The Migration Tracker is an embedded, local-first UI; it is mounted under
# this existing web service rather than receiving a Compose service of its own.
RUN VITE_MIGRATION_LOCAL_ONLY=true npm run build -- --base=/migration/

FROM nginx:1.27-alpine

COPY deploy/nginx/quantbt-portal.conf /etc/nginx/conf.d/default.conf
COPY --from=quantbt-portal-build /opt/quantbt-portal/frontend/dist /usr/share/nginx/html
COPY --from=manager-portal-build /opt/manager-portal/frontend/dist /usr/share/nginx/html/migration

EXPOSE 80
