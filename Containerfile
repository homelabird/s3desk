# syntax=docker/dockerfile:1

ARG RCLONE_VERSION=1.72.0

FROM docker.io/library/node:20-alpine AS frontend
WORKDIR /src
COPY openapi.yml /src/openapi.yml
COPY frontend/package.json frontend/package-lock.json /src/frontend/
WORKDIR /src/frontend
RUN npm ci --no-audit --no-fund
COPY frontend/ /src/frontend/
RUN npm run gen:openapi && npm run build

FROM docker.io/library/golang:1.24.11-alpine AS backend
WORKDIR /src/backend
COPY backend/go.mod backend/go.sum /src/backend/
RUN go mod download
COPY backend/ /src/backend/
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/s3desk-server ./cmd/server

FROM rclone/rclone:${RCLONE_VERSION} AS rclone

FROM docker.io/library/alpine:3.21 AS runtime
RUN apk add --no-cache ca-certificates sqlite
WORKDIR /app
COPY --from=backend /out/s3desk-server /app/s3desk-server
COPY --from=rclone /usr/local/bin/rclone /usr/local/bin/rclone
COPY --from=frontend /src/frontend/dist/ /app/ui/
COPY openapi.yml /app/openapi.yml

ENV ADDR=127.0.0.1:8080 \
    DATA_DIR=/data \
    STATIC_DIR=/app/ui \
    RCLONE_PATH=/usr/local/bin/rclone

VOLUME ["/data"]
EXPOSE 8080
ENTRYPOINT ["/app/s3desk-server"]
