FROM node:26-alpine AS portal-build

# The Portal frontend embeds the Planning feature from source (U05), so its
# build stage needs the monorepo layout its Vite alias resolves through:
# apps/portal/frontend -> ../../../features/roadmap-task-board/frontend/src.
# Planning's own dependencies are not installed here; the only third-party
# module its source pulls in (mermaid) is a Portal dependency.
WORKDIR /repo
COPY apps/portal/frontend/package.json apps/portal/frontend/package-lock.json apps/portal/frontend/
RUN cd apps/portal/frontend && npm ci
# Planning's source tree carries no node_modules in the image, so `react`,
# `react-dom` and `mermaid` imported from it must resolve upward. Hoisting the
# Portal's install to the repo root makes it an ancestor of both trees — the
# same shape a workspace hoist produces at U09.
RUN ln -s apps/portal/frontend/node_modules /repo/node_modules
COPY features/roadmap-task-board/frontend features/roadmap-task-board/frontend
# Portal types are generated from the canonical OpenAPI document, so the
# contracts workspace is a build input rather than a runtime dependency.
COPY packages/contracts/generated packages/contracts/generated
COPY apps/portal/frontend apps/portal/frontend
ARG ROADMAP_TASK_BOARD_LOCAL_ONLY=false
ARG ROADMAP_TASK_BOARD_PERSISTENCE=v1
ARG ROADMAP_TASK_BOARD_API_BASE=/roadmap-task-board/api
ARG EXECUTION_PREVIEW_ENABLED=false
# The embedded Planning views address the gateway prefix absolutely, because
# they render under /planning/* rather than under /roadmap-task-board/.
ENV VITE_ROADMAP_TASK_BOARD_LOCAL_ONLY=${ROADMAP_TASK_BOARD_LOCAL_ONLY} \
    VITE_ROADMAP_TASK_BOARD_PERSISTENCE=${ROADMAP_TASK_BOARD_PERSISTENCE} \
    VITE_ROADMAP_TASK_BOARD_API_BASE=${ROADMAP_TASK_BOARD_API_BASE} \
    VITE_EXECUTION_PREVIEW_ENABLED=${EXECUTION_PREVIEW_ENABLED}
RUN cd apps/portal/frontend && npm run build

FROM node:26-alpine AS roadmap-task-board-build

WORKDIR /opt/roadmap-task-board/frontend
ARG ROADMAP_TASK_BOARD_LOCAL_ONLY=false
ARG ROADMAP_TASK_BOARD_PERSISTENCE=v1
ARG ROADMAP_TASK_BOARD_API_BASE=/roadmap-task-board/api
COPY features/roadmap-task-board/frontend/package.json features/roadmap-task-board/frontend/package-lock.json ./
RUN npm ci
COPY features/roadmap-task-board/frontend ./
# The standalone entry stays as the compatibility surface at
# /roadmap-task-board/ until the embedded module reaches parity (v0.4 §P0.10).
ENV VITE_ROADMAP_TASK_BOARD_LOCAL_ONLY=${ROADMAP_TASK_BOARD_LOCAL_ONLY} \
    VITE_ROADMAP_TASK_BOARD_PERSISTENCE=${ROADMAP_TASK_BOARD_PERSISTENCE} \
    VITE_ROADMAP_TASK_BOARD_API_BASE=${ROADMAP_TASK_BOARD_API_BASE}
RUN npm run build -- --base=/roadmap-task-board/

FROM nginx:1.27-alpine

# portal.conf is a template: the official nginx envsubst entrypoint renders
# /etc/nginx/templates/*.template into /etc/nginx/conf.d/ using container env
# (PORTAL_WEB_UPSTREAM selects the façade vs. the legacy Python upstream).
COPY deploy/nginx/portal.conf /etc/nginx/templates/default.conf.template
COPY --from=portal-build /repo/apps/portal/frontend/dist /usr/share/nginx/html
COPY --from=roadmap-task-board-build /opt/roadmap-task-board/frontend/dist /usr/share/nginx/html/roadmap-task-board

EXPOSE 80
