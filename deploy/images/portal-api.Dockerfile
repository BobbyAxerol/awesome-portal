FROM python:3.12-slim

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

# The protected strategy remains source-controlled in the portal application.
COPY apps/portal/strategy ./strategy

RUN useradd --create-home --uid 10001 portal \
    && mkdir -p /var/lib/portal/artifacts /var/cache/numba \
    && chown -R portal:portal /var/lib/portal /var/cache/numba

USER portal
EXPOSE 8000

CMD ["python", "-m", "uvicorn", "portal_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
