FROM python:3.11.12-slim-bookworm

WORKDIR /workspace

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements-beam.txt /tmp/requirements-beam.txt

RUN python -m venv /opt/beam-venv \
    && /opt/beam-venv/bin/pip install --upgrade pip \
    && /opt/beam-venv/bin/pip install -r /tmp/requirements-beam.txt

ENV PATH="/opt/beam-venv/bin:${PATH}"

CMD ["bash"]
