FROM node:22-alpine AS quantbt-portal-build

WORKDIR /opt/quantbt-portal/frontend
COPY apps/quantbt-portal/frontend/package.json apps/quantbt-portal/frontend/package-lock.json ./
RUN npm ci
COPY apps/quantbt-portal/frontend ./
RUN npm run build

FROM node:22-alpine AS roadmap-task-board-build

WORKDIR /opt/roadmap-task-board/frontend
ARG ROADMAP_TASK_BOARD_LOCAL_ONLY=true
ARG ROADMAP_TASK_BOARD_PERSISTENCE=legacy
ARG ROADMAP_TASK_BOARD_API_BASE=/roadmap-task-board/api
COPY features/roadmap-task-board/frontend/package.json features/roadmap-task-board/frontend/package-lock.json ./
RUN npm ci
COPY features/roadmap-task-board/frontend ./
# Roadmap & Task Board is embedded into this existing web service rather than
# receiving a public web service of its own. Its optional persistence backend
# stays private and is reached through the same gateway prefix.
ENV VITE_ROADMAP_TASK_BOARD_LOCAL_ONLY=${ROADMAP_TASK_BOARD_LOCAL_ONLY} \
    VITE_ROADMAP_TASK_BOARD_PERSISTENCE=${ROADMAP_TASK_BOARD_PERSISTENCE} \
    VITE_ROADMAP_TASK_BOARD_API_BASE=${ROADMAP_TASK_BOARD_API_BASE}
RUN npm run build -- --base=/roadmap-task-board/

FROM nginx:1.27-alpine

COPY deploy/nginx/quantbt-portal.conf /etc/nginx/conf.d/default.conf
COPY --from=quantbt-portal-build /opt/quantbt-portal/frontend/dist /usr/share/nginx/html
COPY --from=roadmap-task-board-build /opt/roadmap-task-board/frontend/dist /usr/share/nginx/html/roadmap-task-board

EXPOSE 80
