# FIXTURE_LAB lane. NOT acceptance evidence.
#
# The fixture BFF (apps/portal/fixture-bff): the Playwright BFF doubles behind node:http, so a
# deployed preview can show the Execution V2 screens with full, realistic fixture data. It is only
# ever started by deploy/research-preview/compose.fixture-bff.yaml; no production, stable or dev
# compose file references this image.
#
# Build: the bundler is `rolldown`, which the frontend already installs for Vite, so the build stage
# runs the frontend's own `npm ci` from its lockfile and adds nothing new. Only what the bundle
# imports is copied in (the frontend sources and e2e doubles, plus apps/portal/fixture-bff); the
# generated contracts, the Planning sources and the rest of the monorepo are not needed because the
# only runtime reads are the published JSON fixtures.
FROM node:22.23.2-alpine3.24@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build

WORKDIR /repo
COPY apps/portal/frontend/package.json apps/portal/frontend/package-lock.json apps/portal/frontend/
RUN cd apps/portal/frontend && npm ci --no-audit --no-fund
COPY apps/portal/frontend/tsconfig.json apps/portal/frontend/tsconfig.json
COPY apps/portal/frontend/src apps/portal/frontend/src
COPY apps/portal/frontend/e2e apps/portal/frontend/e2e
# The shell bootstrap double (e2e/bffDoubleShell.ts) imports the canonical registry, links and summary
# fixtures; the bundler inlines them, so the runtime image does not need this directory.
COPY apps/portal/registry/fixtures/registry.public.json apps/portal/registry/fixtures/links.public.json apps/portal/registry/fixtures/summary.healthy.json apps/portal/registry/fixtures/
COPY apps/portal/fixture-bff apps/portal/fixture-bff
RUN cd apps/portal/fixture-bff && node build.mjs

FROM node:22.23.2-alpine3.24@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32

# The server is one self-contained ESM file run by Node. Package managers are build-time tools;
# retaining npm would ship its unrelated dependency graph.
RUN rm -rf /usr/local/lib/node_modules/npm \
      /usr/local/lib/node_modules/corepack /opt/yarn-* && \
    rm -f /usr/local/bin/npm /usr/local/bin/npx \
      /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/corepack

# dist/ and packages/contracts/fixtures/ must sit at the same relative depth as the sources do:
# the doubles find the published fixtures four levels above their own file
# (/app/apps/portal/fixture-bff/dist -> /app/packages/contracts/fixtures). See fixture-bff/README.md.
WORKDIR /app
COPY --chown=node:node --from=build /repo/apps/portal/fixture-bff/dist apps/portal/fixture-bff/dist
COPY --chown=node:node packages/contracts/fixtures packages/contracts/fixtures
# bffDoubleSelfAccess.ts validates its answers against this one published OpenAPI document at import time.
COPY --chown=node:node packages/contracts/openapi/execution-access.openapi.json packages/contracts/openapi/execution-access.openapi.json

# No secret and no credential: configuration is these variables only (see fixture-bff/README.md).
# FIXTURE_HOST stays 0.0.0.0 on purpose: the container network is private and nginx is the only caller.
ENV NODE_ENV=production \
    PORT=4100 \
    FIXTURE_SCALE=medium \
    FIXTURE_WRITES=refuse \
    FIXTURE_LANE_LABEL=FIXTURE_LAB

USER node
EXPOSE 4100
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=6 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4100/__fixture/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

CMD ["node", "apps/portal/fixture-bff/dist/server.mjs"]
