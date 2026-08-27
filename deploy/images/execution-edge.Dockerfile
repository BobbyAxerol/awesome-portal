FROM rust:1.97.1-slim-bookworm@sha256:2775a09d208ff0d7c1f50490c45b62db929e87ba1dcbc3f2132ac71a704bcdd3 AS build

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
