# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

# Node.js 22.23.2 on Debian 13, pinned to the immutable multi-platform digest.
ARG NODE_IMAGE=node:22.23.2-trixie-slim@sha256:7b8a0c89c54499bee567618f96578e1a12a800f062fbdbfd1fb6a443fa6f6284
ARG RUNTIME_IMAGE=gcr.io/distroless/nodejs22-debian13:nonroot@sha256:4e4fb0ce55fd73901600796ef079a9490369d2515d7da31633a91608c82ca13b

FROM --platform=$TARGETPLATFORM ${NODE_IMAGE} AS dependencies
ARG TARGETPLATFORM
WORKDIR /app
RUN test "$TARGETPLATFORM" = "linux/amd64"
COPY package.json package-lock.json .npmrc ./
COPY scripts/check-node-version.cjs scripts/check-rolldown-binding.cjs ./scripts/
RUN --mount=type=cache,target=/root/.npm \
    npm ci \
      --fetch-retries=5 \
      --fetch-retry-mintimeout=2000 \
      --fetch-retry-maxtimeout=30000

FROM dependencies AS build
COPY tsconfig.json vite.config.ts ./
COPY public ./public
COPY scripts ./scripts
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev

FROM --platform=$TARGETPLATFORM ${RUNTIME_IMAGE} AS runtime
ARG TARGETPLATFORM
ARG BAZORIA_RELEASE_COMMIT=unknown
ARG BAZORIA_BUILD_ID=local
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    BAZORIA_RELEASE_COMMIT=$BAZORIA_RELEASE_COMMIT \
    BAZORIA_BUILD_ID=$BAZORIA_BUILD_ID
COPY --from=build --chown=65532:65532 /app/node_modules ./node_modules
COPY --from=build --chown=65532:65532 /app/.output ./.output
EXPOSE 8080
CMD [".output/commands/web-process.mjs"]
