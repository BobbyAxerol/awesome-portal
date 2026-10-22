FROM nginxinc/nginx-unprivileged:1.31.5-alpine3.24-slim@sha256:7d289d4f8935051d213bc3ecee3b4fc2d52f97ea5a954273e031054b633e7934

LABEL org.opencontainers.image.title="Primus Portal Trading System source proxy" \
      org.opencontainers.image.description="Typed GET-only mTLS boundary for the AWS HK Portal execution cell"

# Configuration and workload identities are runtime, root/group-owned bind
# mounts. No source credential or environment-specific route enters the image.
USER 101:101
