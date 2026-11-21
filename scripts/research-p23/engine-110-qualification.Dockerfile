# Qualification only: never a deployable Portal API/worker image. The base
# application still declares 1.1.1; the old wheels are for bounded public-API
# compatibility experiments, not runtime admission or a rewritten release pin.
FROM local/portal-research-p23-retained-portal-api:7d68b990005ef504176128c83513fce7103c31b8db725979cfc30dcc75ac9700
USER root
LABEL primus.research.qualification-only="true" primus.research.engine="1.1.0"
COPY scripts/research-p23/engine-110-qualification.requirements.txt /tmp/engine-110-pins.txt
RUN python -m pip install --no-cache-dir --no-deps --require-hashes -r /tmp/engine-110-pins.txt \
    && python -c "from importlib.metadata import version; assert version('quantbt-engine') == '1.1.0'; assert version('quantbt-native') == '0.4.1'"
USER 10001:10001
