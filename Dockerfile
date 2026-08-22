# Build stage
FROM --platform=$BUILDPLATFORM golang:1.27.0-alpine AS builder

ARG TARGETOS
ARG TARGETARCH

WORKDIR /build

COPY go.mod ./
RUN go mod download

COPY server.go ./
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -trimpath -ldflags="-s -w" -o localledger .

# Runtime stage (distroless)
FROM gcr.io/distroless/static-debian13:nonroot

COPY --from=builder /build/localledger /localledger
# COPY static/ /static/

EXPOSE 8080

USER nonroot:nonroot

ENTRYPOINT ["/localledger"]
