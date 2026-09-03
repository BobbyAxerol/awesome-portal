FROM rust:1.98.0-slim-bookworm@sha256:1469a27c125cb5a3aebfa4f4e4665d935b02fb72cc093b2c974b3d740e43f157

RUN rustup component add clippy rustfmt

LABEL org.opencontainers.image.title="Portal execution edge CI" \
      org.opencontainers.image.description="Pinned EX-BE-01 Rust formatting, test, and lint toolchain"
