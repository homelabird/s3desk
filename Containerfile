# syntax=docker/dockerfile:1

FROM harbor.k8s.homelabird.com/library/node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS frontend
WORKDIR /src
COPY openapi.yml /src/openapi.yml
COPY frontend/package.json frontend/package-lock.json /src/frontend/
# patch-package runs on postinstall; ensure patches exist before `npm ci` for reproducible builds.
COPY frontend/patches/ /src/frontend/patches/
WORKDIR /src/frontend
RUN npm run ci:deps:build
COPY frontend/ /src/frontend/
RUN npm run gen:openapi && npm run build

FROM harbor.k8s.homelabird.com/library/golang:1.25.13-alpine@sha256:1e0126852075c9c60731c8ba49088448b91f63e2aed97ca9d1a9791622a05946 AS backend
ARG APP_VERSION=0.1.0
WORKDIR /src/backend
COPY backend/go.mod backend/go.sum /src/backend/
RUN go mod download
COPY backend/ /src/backend/
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X s3desk/internal/version.Version=${APP_VERSION}" -o /out/s3desk-server ./cmd/server

FROM harbor.k8s.homelabird.com/library/rclone/rclone:1.72.0@sha256:0eb18825ac9732c21c11d654007170572bbd495352bb6dbb624f18e4f462c496 AS rclone

FROM harbor.k8s.homelabird.com/library/alpine:3.21@sha256:48b0309ca019d89d40f670aa1bc06e426dc0931948452e8491e3d65087abc07d AS runtime
ARG DB_BACKEND=sqlite
RUN set -e; \
    apk add --no-cache ca-certificates ffmpeg; \
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
