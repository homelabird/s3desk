# syntax=docker/dockerfile:1

ARG RCLONE_VERSION=1.72.0

FROM harbor.k8s.homelabird.com/library/node:22-alpine AS frontend
WORKDIR /src
COPY openapi.yml /src/openapi.yml
COPY frontend/package.json frontend/package-lock.json /src/frontend/
# patch-package runs on postinstall; ensure patches exist before `npm ci` for reproducible builds.
COPY frontend/patches/ /src/frontend/patches/
WORKDIR /src/frontend
RUN npm ci --no-audit --no-fund
COPY frontend/ /src/frontend/
RUN npm run gen:openapi && npm run build

FROM harbor.k8s.homelabird.com/library/golang:1.24.11-alpine AS backend
WORKDIR /src/backend
COPY backend/go.mod backend/go.sum /src/backend/
RUN go mod download
COPY backend/ /src/backend/
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/s3desk-server ./cmd/server

FROM harbor.k8s.homelabird.com/library/rclone/rclone:${RCLONE_VERSION} AS rclone

FROM harbor.k8s.homelabird.com/library/alpine:3.21 AS runtime
ARG DB_BACKEND=sqlite
RUN set -e; \
    apk add --no-cache ca-certificates; \
    if [ "$DB_BACKEND" = "sqlite" ]; then apk add --no-cache sqlite; fi; \
    addgroup -S s3desk; \
    adduser -S -G s3desk -h /home/s3desk s3desk; \
    mkdir -p /data /app; \
    chown -R s3desk:s3desk /data /app
WORKDIR /app
COPY --chown=s3desk:s3desk --from=backend /out/s3desk-server /app/s3desk-server
COPY --from=rclone /usr/local/bin/rclone /usr/local/bin/rclone
COPY --chown=s3desk:s3desk --from=frontend /src/frontend/dist/ /app/ui/
COPY --chown=s3desk:s3desk openapi.yml /app/openapi.yml

ENV ADDR=127.0.0.1:8080 \
    DATA_DIR=/data \
    STATIC_DIR=/app/ui \
    RCLONE_PATH=/usr/local/bin/rclone \
    DB_BACKEND=$DB_BACKEND

USER s3desk
VOLUME ["/data"]
EXPOSE 8080
ENTRYPOINT ["/app/s3desk-server"]
