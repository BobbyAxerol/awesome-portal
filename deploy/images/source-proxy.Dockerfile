FROM nginxinc/nginx-unprivileged:1.31.4-alpine3.24-slim@sha256:021f32b23e2bfc8610ccdec499b709625dcee1369884d7a51bd8a23a3accb301

LABEL org.opencontainers.image.title="Primus Portal Trading System source proxy" \
      org.opencontainers.image.description="Typed GET-only mTLS boundary for the AWS HK Portal execution cell"

# Configuration and workload identities are runtime, root/group-owned bind
# mounts. No source credential or environment-specific route enters the image.
USER 101:101
