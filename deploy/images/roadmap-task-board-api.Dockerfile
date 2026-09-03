FROM python:3.14.7-slim@sha256:cad9a2c871761c413caa6fdd6441c783451e740a48aaeba60ae62a8b53525ef6

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/opt/roadmap-task-board \
    PORTAL_HOST=0.0.0.0 \
    PORTAL_PORT=8000 \
    PORTAL_DATABASE_PATH=/var/lib/roadmap-task-board/portal.db

WORKDIR /opt/roadmap-task-board

# This tracked Portal feature owns its FastAPI domain; the image only supplies
# its private runtime boundary within the composed Portal stack.
COPY features/roadmap-task-board/backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r backend/requirements.txt

COPY features/roadmap-task-board/backend ./backend

RUN useradd --create-home --uid 10002 roadmap \
    && mkdir -p /var/lib/roadmap-task-board \
    && chown -R roadmap:roadmap /var/lib/roadmap-task-board

USER roadmap
EXPOSE 8000

CMD ["python", "-m", "backend.app"]
