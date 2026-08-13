FROM node:22-alpine AS build

WORKDIR /opt/quantbt-portal/frontend
COPY apps/quantbt-portal/frontend/package.json apps/quantbt-portal/frontend/package-lock.json ./
RUN npm ci
COPY apps/quantbt-portal/frontend ./
RUN npm run build

FROM nginx:1.27-alpine

COPY deploy/nginx/quantbt-portal.conf /etc/nginx/conf.d/default.conf
COPY --from=build /opt/quantbt-portal/frontend/dist /usr/share/nginx/html

EXPOSE 80
