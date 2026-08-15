FROM python:3.12-slim

ARG PORTAL_HMD_READER_REQUIRED=false
ARG PORTAL_HMD_READER_VERSION=0.1.0rc3
ARG PORTAL_HMD_READER_SHA256=3b2a41b87ff834912556bb3039bf3e3c148bd859a1ced9ee4f52a3c658ca5663

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/opt/portal/src:/opt/portal \
    NUMBA_CACHE_DIR=/var/cache/numba

WORKDIR /opt/portal

# The stack constraint pins quantbt-engine==1.0.8 from PyPI, so the image
# never depends on a sibling QuantBT source checkout.
COPY constraints/portal.txt /tmp/portal-constraints.txt
COPY apps/portal/backend/pyproject.toml apps/portal/backend/README.md ./
COPY apps/portal/backend/src ./src
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir --constraint /tmp/portal-constraints.txt .

# Product metadata is an image-owned read-only sidecar. Keep it after the
# dependency layer so registry-only changes do not invalidate package installs.
COPY apps/portal/registry ./registry

# Generic CI/local images may leave the historical capability disabled. A
# production image is built with PORTAL_HMD_READER_REQUIRED=true after CI has
# staged the approved code-only wheel into this ignored build-input directory.
COPY vendor/hmd-reader /tmp/hmd-reader
RUN wheel="/tmp/hmd-reader/primus_historical_market_data-${PORTAL_HMD_READER_VERSION}-py3-none-any.whl" \
    && if [ -f "${wheel}" ]; then \
         printf '%s  %s\n' "${PORTAL_HMD_READER_SHA256}" "${wheel}" | sha256sum -c - \
         && pip install --no-cache-dir --no-deps "${wheel}"; \
       elif [ "${PORTAL_HMD_READER_REQUIRED}" = "true" ]; then \
         printf 'Required approved Historical Market Data reader wheel is missing.\n' >&2; \
         exit 1; \
       fi \
    && rm -rf /tmp/hmd-reader

ENV PORTAL_HMD_READER_VERSION=${PORTAL_HMD_READER_VERSION} \
    PORTAL_HMD_READER_WHEEL_SHA256=${PORTAL_HMD_READER_SHA256} \
    PORTAL_REGISTRY_ROOT=/opt/portal/registry

# The protected strategy remains source-controlled in the portal application.
COPY apps/portal/strategy ./strategy

RUN useradd --create-home --uid 10001 portal \
    && mkdir -p /var/lib/portal/artifacts /var/cache/numba \
    && chown -R portal:portal /var/lib/portal /var/cache/numba

USER portal
EXPOSE 8000

CMD ["python", "-m", "uvicorn", "portal_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
