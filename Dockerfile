# Production dependencies stage
FROM node:18-alpine AS prod-deps

WORKDIR /app

# Set npm configuration
ENV NODE_ENV=production \
    CI=true \
    NPM_CONFIG_LOGLEVEL=warn \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_OPTIONAL=false \
    NPM_CONFIG_SAVE_EXACT=true \
    NPM_CONFIG_IGNORE_SCRIPTS=true \
    NPM_CONFIG_ENGINE_STRICT=true \
    NPM_CONFIG_OMIT="dev,optional"

# Copy only package files
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN set -eux; \
    # Install build tools
    apk add --no-cache --virtual .build-deps \
        python3 \
        make \
        g++ \
    && \
    # Update npm and handle inflight package first
    npm install -g npm@latest && \
    npm install inflight@1.0.6 && \
    # Then install remaining production dependencies
    npm ci && \
    # Cleanup
    apk del .build-deps && \
    rm -rf /var/cache/apk/* /root/.npm /tmp/* && \
    npm cache clean --force

# Development dependencies stage
FROM node:18-alpine AS dev-deps

WORKDIR /app

# Set npm configuration for development
ENV NODE_ENV=development \
    CI=true \
    NPM_CONFIG_LOGLEVEL=warn \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_SAVE_EXACT=true \
    NPM_CONFIG_IGNORE_SCRIPTS=true \
    NPM_CONFIG_ENGINE_STRICT=true

# Copy only package files
COPY package.json package-lock.json* ./

# Install all dependencies including dev
RUN set -eux; \
    # Install build tools
    apk add --no-cache --virtual .build-deps \
        python3 \
        make \
        g++ \
    && \
    # Update npm and handle inflight package first
    npm install -g npm@latest && \
    npm install inflight@1.0.6 && \
    # Then install remaining dependencies
    npm ci && \
    # Cleanup
    apk del .build-deps && \
    rm -rf /var/cache/apk/* /root/.npm /tmp/* && \
    npm cache clean --force

# Builder stage
FROM node:18-alpine AS builder

WORKDIR /app

# Set build env
ENV NODE_ENV=development \
    CI=true \
    PYTHONUNBUFFERED=1 \
    NPM_CONFIG_LOGLEVEL=warn \
    TS_NODE_TRANSPILE_ONLY=true \
    TS_NODE_PROJECT=./tsconfig.json

# Install build tools
RUN set -eux; \
    apk add --no-cache \
        python3 \
        make \
        g++ \
        git \
    && \
    if [ ! -f /usr/bin/python ]; then \
        ln -sf /usr/bin/python3 /usr/bin/python; \
    fi && \
    rm -rf /var/cache/apk/*

# Copy dependencies from dev-deps stage
COPY --from=dev-deps /app/node_modules ./node_modules
COPY package.json package-lock.json* ./

# Copy source code
COPY tsconfig.json ./
COPY server/src ./server/src

# Build the application
RUN set -eux; \
    if [ ! -d ./server/src ]; then \
        echo "Error: Source directory not found"; \
        exit 1; \
    fi; \
    if [ ! -f ./tsconfig.json ]; then \
        echo "Error: tsconfig.json not found"; \
        exit 1; \
    fi; \
    npm run build && \
    rm -rf /root/.npm /tmp/*

# Runtime stage
FROM node:18-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    CI=true \
    NPM_CONFIG_LOGLEVEL=warn \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_AUDIT=false

# Install runtime dependencies
RUN set -eux; \
    apk update && \
    apk upgrade && \
    apk add --no-cache \
        busybox-extras \
        curl \
        tini \
    && rm -rf /var/cache/apk/* /root/.npm /tmp/*

# Copy production dependencies and built files
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# Verify critical files exist
RUN set -eux; \
    if [ ! -d ./node_modules ]; then \
        echo "Error: node_modules not found"; \
        exit 1; \
    fi; \
    if [ ! -d ./dist ]; then \
        echo "Error: dist directory not found"; \
        exit 1; \
    fi

# Setup user with proper error handling
RUN set -eux; \
    addgroup -S nodejs && \
    adduser -S nodejs -G nodejs && \
    chown -R nodejs:nodejs /app && \
    chmod -R 755 /app

USER nodejs

ENTRYPOINT ["/sbin/tini", "--"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD nc -z localhost $PORT > /dev/null 2>&1 || (echo "Health check failed" && exit 1)

EXPOSE $PORT

CMD ["node", "--expose-gc", "dist/server.js"] 