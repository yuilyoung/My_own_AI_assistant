FROM node:22-bookworm-slim AS web
WORKDIR /build
COPY apps/web/package*.json ./
RUN npm ci
COPY apps/web/ ./
RUN npm run build

FROM python:3.12-slim-bookworm
WORKDIR /app
COPY pyproject.toml ./
COPY services/ services/
RUN pip install --no-cache-dir . && useradd --create-home assistant \
    && mkdir /app/.local-data && chown assistant:assistant /app/.local-data
COPY --from=web /build/dist apps/web/dist
USER assistant
ENV ASSISTANT_HOST=0.0.0.0
EXPOSE 10000
CMD ["my-assistant"]
