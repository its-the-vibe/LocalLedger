# Build stage
FROM golang:1.26.2-alpine AS builder

WORKDIR /build

COPY go.mod ./
RUN go mod download

COPY server.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o localledger .

# Runtime stage — minimal scratch image
FROM scratch

COPY --from=builder /build/localledger /localledger
# COPY static/ /static/

EXPOSE 8080

ENTRYPOINT ["/localledger"]
