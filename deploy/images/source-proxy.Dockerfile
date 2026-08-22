FROM nginxinc/nginx-unprivileged:1.27.4-alpine3.21@sha256:62a904036bfc0e4a4f2b556e34cbf17bc136b47fde8cdb4628762725f48c5782

LABEL org.opencontainers.image.title="Primus Portal Trading System source proxy" \
      org.opencontainers.image.description="Typed GET-only mTLS boundary for the AWS HK Portal execution cell"

# Configuration and workload identities are runtime, root/group-owned bind
# mounts. No source credential or environment-specific route enters the image.
USER 101:101
