FROM rust:1.97.1-slim-bookworm@sha256:2775a09d208ff0d7c1f50490c45b62db929e87ba1dcbc3f2132ac71a704bcdd3

RUN rustup component add clippy rustfmt

LABEL org.opencontainers.image.title="Portal execution edge CI" \
      org.opencontainers.image.description="Pinned EX-BE-01 Rust formatting, test, and lint toolchain"
