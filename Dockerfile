# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

# Node.js 22.13.1 bookworm-slim, pinned to the immutable multi-platform digest.
ARG NODE_IMAGE=node:22.13.1-bookworm-slim@sha256:83fdfa2a4de32d7f8d79829ea259bd6a4821f8b2d123204ac467fbe3966450fc

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

FROM --platform=$TARGETPLATFORM ${NODE_IMAGE} AS runtime
ARG TARGETPLATFORM
ARG BAZORIA_RELEASE_COMMIT=unknown
ARG BAZORIA_BUILD_ID=local
WORKDIR /app
RUN test "$TARGETPLATFORM" = "linux/amd64"
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    BAZORIA_RELEASE_COMMIT=$BAZORIA_RELEASE_COMMIT \
    BAZORIA_BUILD_ID=$BAZORIA_BUILD_ID
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/scripts/check-node-version.cjs ./scripts/check-node-version.cjs
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.output ./.output
USER node
EXPOSE 8080
CMD ["npm", "run", "start:web"]
