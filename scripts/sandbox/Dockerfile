# Build once on the trusted host. Commands never pull an image implicitly.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates git python3 python3-pip ripgrep bash tini \
    && rm -rf /var/lib/apt/lists/*
ENV HOME=/tmp TMPDIR=/tmp
WORKDIR /workspace
USER 1000:1000
