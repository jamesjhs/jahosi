# Build stage:
# - Installs production npm dependencies once, including native modules.
# - `better-sqlite3` has native bindings, so Alpine needs Python, make, and g++
#   during `npm ci`.
# - The runtime stage copies only node_modules and app files, leaving build tools
#   behind so the final image is smaller and has less installed surface area.
FROM node:20-alpine AS deps

WORKDIR /app

RUN apk add --no-cache python3 make g++

# Copy only package metadata before installing dependencies. Docker can reuse
# this layer when application source files change but package-lock.json does not.
COPY package*.json ./
RUN npm ci --omit=dev

# Runtime stage:
# - This is the image pushed to GitHub Packages / GHCR.
# - It runs the Express application directly with `npm start`.
# - No .env file is baked into the image. Runtime configuration is injected by
#   Docker Compose from the generated server .env file.
FROM node:20-alpine AS runtime

ENV NODE_ENV=production

# Jahosi runs on port 3000 in production and testing. The build arg exists so
# Docker metadata and workflow configuration can stay aligned, but the workflow
# and Compose file both default to 3000.
ARG APP_PORT=3000
ENV PORT=${APP_PORT}

# Inside a container, binding to 127.0.0.1 would make Node listen only on the
# container loopback interface. Traefik reaches the service over the Docker
# network, so the app must bind to 0.0.0.0.
ENV HOST=0.0.0.0
WORKDIR /app

# `libstdc++` is needed by native npm dependencies at runtime.
RUN apk add --no-cache libstdc++

COPY package*.json ./
COPY --from=deps /app/node_modules node_modules
COPY analytics.js jahosi.js ./
COPY public public

# SQLite-backed runtime data lives under /app/data. Compose bind-mounts this
# directory to a branch-specific host directory so production and testing data do
# not overwrite each other.
RUN mkdir -p data

# EXPOSE is documentation for Docker/Traefik. The actual Traefik port mapping is
# controlled by `traefik.http.services...loadbalancer.server.port` in Compose.
EXPOSE ${APP_PORT}

CMD ["npm", "start"]
