# syntax=docker/dockerfile:1

FROM docker.io/library/node:20-alpine AS frontend
WORKDIR /src
COPY openapi.yml /src/openapi.yml
COPY frontend/package.json frontend/package-lock.json /src/frontend/
WORKDIR /src/frontend
RUN npm ci --no-audit --no-fund
COPY frontend/ /src/frontend/
RUN npm run gen:openapi && npm run build

FROM docker.io/library/golang:1.23-alpine AS backend
WORKDIR /src/backend
COPY backend/go.mod backend/go.sum /src/backend/
RUN go mod download
COPY backend/ /src/backend/
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/object-storage-server ./cmd/server

FROM docker.io/library/golang:1.23-alpine AS s5cmd
ARG S5CMD_VERSION=v2.3.0
RUN CGO_ENABLED=0 GOBIN=/out go install github.com/peak/s5cmd/v2@${S5CMD_VERSION}

FROM docker.io/library/alpine:3.20 AS runtime
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=backend /out/object-storage-server /app/object-storage-server
COPY --from=s5cmd /out/s5cmd /usr/local/bin/s5cmd
COPY --from=frontend /src/frontend/dist/ /app/ui/
COPY openapi.yml /app/openapi.yml

ENV ADDR=127.0.0.1:8080 \
    DATA_DIR=/data \
    STATIC_DIR=/app/ui \
    S5CMD_PATH=/usr/local/bin/s5cmd

VOLUME ["/data"]
EXPOSE 8080
ENTRYPOINT ["/app/object-storage-server"]
