FROM rust:1.98.0-slim-bookworm@sha256:1469a27c125cb5a3aebfa4f4e4665d935b02fb72cc093b2c974b3d740e43f157 AS build

WORKDIR /repo
COPY services/portal-execution-edge-rs services/portal-execution-edge-rs
COPY upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/repo/services/portal-execution-edge-rs/target,sharing=locked \
    cd services/portal-execution-edge-rs && \
    cargo build --locked --release --package edge-service --quiet && \
    cp target/release/edge-service /portal-execution-edge

FROM gcr.io/distroless/cc-debian12:nonroot@sha256:9dac0a79194e45a7da0158a9c6da57b217585af0786db3845d1f0ec1a0dd182f

LABEL org.opencontainers.image.title="Primus Portal execution edge" \
      org.opencontainers.image.description="Read-only Rust compatibility edge for the AWS HK execution cell"

COPY --from=build /portal-execution-edge /usr/local/bin/portal-execution-edge

USER 65532:65532
EXPOSE 8443
ENTRYPOINT ["/usr/local/bin/portal-execution-edge"]
CMD ["serve"]
