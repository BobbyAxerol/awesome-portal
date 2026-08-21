FROM rust:1.85.1-slim-bookworm@sha256:9f841bbe9e7d8e37ceb96ed907265a3a0df7f44e3737d0b100e7907a679acb36 AS build

WORKDIR /repo
COPY services/portal-execution-edge-rs services/portal-execution-edge-rs
COPY upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/repo/services/portal-execution-edge-rs/target,sharing=locked \
    cd services/portal-execution-edge-rs && \
    cargo build --locked --release --package edge-service --quiet && \
    cp target/release/edge-service /portal-execution-edge

FROM debian:bookworm-slim@sha256:abd67ffcfa541b485a3dff59865ab629aa048a6c613e639d36e7456b0b229241

LABEL org.opencontainers.image.title="Primus Portal execution edge" \
      org.opencontainers.image.description="Read-only Rust compatibility edge for the AWS HK execution cell"

COPY --from=build /portal-execution-edge /usr/local/bin/portal-execution-edge

USER 65532:65532
EXPOSE 8443
ENTRYPOINT ["/usr/local/bin/portal-execution-edge"]
CMD ["serve"]
