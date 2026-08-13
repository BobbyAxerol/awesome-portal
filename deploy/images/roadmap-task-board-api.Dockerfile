FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/opt/roadmap-task-board \
    PORTAL_HOST=0.0.0.0 \
    PORTAL_PORT=8000 \
    PORTAL_DATABASE_PATH=/var/lib/roadmap-task-board/portal.db

WORKDIR /opt/roadmap-task-board

# The independently tracked source owns its FastAPI domain; this parent image
# only supplies the runtime boundary used by the composed Portal stack.
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
