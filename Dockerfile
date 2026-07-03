# ===== Stage 1: Build Vite app (multi-arch) =====
FROM --platform=$BUILDPLATFORM docker.io/library/node:lts AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source
COPY . .

# Build production assets
RUN npm run build

# ===== Stage 2: Serve with Caddy =====
FROM docker.io/library/caddy:alpine

# Copy built Vite assets
COPY --from=builder /app/dist /srv

# Copy Caddy config
COPY Caddyfile /etc/caddy/Caddyfile

# Expose HTTP
EXPOSE 8000