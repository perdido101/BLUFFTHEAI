# Production dependencies stage
FROM node:18.19-alpine3.19 AS prod-deps

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
    NPM_CONFIG_ENGINE_STRICT=true \
    NPM_CONFIG_OMIT="dev,optional" \
    PYTHONUNBUFFERED=1

# Copy only package files
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN set -eux; \
    # Configure Alpine mirrors and update
    echo "https://dl-cdn.alpinelinux.org/alpine/v3.19/main" > /etc/apk/repositories && \
    echo "https://dl-cdn.alpinelinux.org/alpine/v3.19/community" >> /etc/apk/repositories && \
    apk update && \
    # Install build tools
    apk add --no-cache --virtual .build-deps \
        python3 \
        make \
        g++ \
    && \
    # Update npm and verify installation
    npm install -g npm@latest && \
    npm --version && \
    # Install production dependencies with proper error handling
    if [ ! -f package-lock.json ]; then \
        echo "Error: package-lock.json not found" && exit 1; \
    fi && \
    npm ci --production --prefer-offline && \
    # Verify critical dependencies
    if [ ! -d node_modules ]; then \
        echo "Error: Failed to install dependencies" && exit 1; \
    fi && \
    # Cleanup
    apk del .build-deps && \
    rm -rf /var/cache/apk/* /root/.npm /tmp/* && \
    npm cache clean --force

# Development dependencies stage
FROM node:18.19-alpine3.19 AS dev-deps

WORKDIR /app

# Set npm configuration for development
ENV NODE_ENV=development \
    CI=true \
    NPM_CONFIG_LOGLEVEL=warn \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_SAVE_EXACT=true \
    NPM_CONFIG_ENGINE_STRICT=true \
    PYTHONUNBUFFERED=1

# Copy only package files
COPY package.json package-lock.json* ./

# Install all dependencies including dev
RUN set -eux; \
    # Configure Alpine mirrors and update
    echo "https://dl-cdn.alpinelinux.org/alpine/v3.19/main" > /etc/apk/repositories && \
    echo "https://dl-cdn.alpinelinux.org/alpine/v3.19/community" >> /etc/apk/repositories && \
    apk update && \
    # Install build tools
    apk add --no-cache --virtual .build-deps \
        python3 \
        make \
        g++ \
    && \
    # Update npm and verify installation
    npm install -g npm@latest && \
    npm --version && \
    # Install all dependencies with proper error handling
    if [ ! -f package-lock.json ]; then \
        echo "Error: package-lock.json not found" && exit 1; \
    fi && \
    npm ci --prefer-offline && \
    # Verify critical dependencies
    if [ ! -d node_modules ]; then \
        echo "Error: Failed to install dependencies" && exit 1; \
    fi && \
    # Cleanup
    apk del .build-deps && \
    rm -rf /var/cache/apk/* /root/.npm /tmp/* && \
    npm cache clean --force

# Builder stage
FROM node:18.19-alpine3.19 AS builder

WORKDIR /app

# Set build env
ENV NODE_ENV=development \
    CI=true \
    PYTHONUNBUFFERED=1 \
    NPM_CONFIG_LOGLEVEL=warn \
    TS_NODE_TRANSPILE_ONLY=true \
    TS_NODE_PROJECT=./tsconfig.json \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

# Install build tools
RUN set -eux; \
    # Configure Alpine mirrors
    echo "https://dl-cdn.alpinelinux.org/alpine/v3.19/main" > /etc/apk/repositories && \
    echo "https://dl-cdn.alpinelinux.org/alpine/v3.19/community" >> /etc/apk/repositories && \
    apk update && \
    # Install build dependencies
    apk add --no-cache \
        python3 \
        make \
        g++ \
        git \
    && \
    # Setup Python symlink
    if [ ! -f /usr/bin/python ]; then \
        ln -sf /usr/bin/python3 /usr/bin/python; \
    fi && \
    # Verify tools
    python3 --version && \
    make --version && \
    g++ --version && \
    git --version && \
    # Cleanup
    rm -rf /var/cache/apk/*

# Copy configuration files first
COPY package*.json tsconfig.json ./

# Verify configuration files
RUN set -eux; \
    if [ ! -f package.json ]; then \
        echo "Error: package.json not found" && exit 1; \
    fi; \
    if [ ! -f tsconfig.json ]; then \
        echo "Error: tsconfig.json not found" && exit 1; \
    fi

# Copy source code
COPY server/src ./server/src

# Copy dependencies from dev-deps stage
COPY --from=dev-deps /app/node_modules ./node_modules

# Verify source and build
RUN set -eux; \
    # Verify source exists
    if [ ! -d ./server/src ]; then \
        echo "Error: Source directory not found" && exit 1; \
    fi && \
    # Verify TypeScript compiler
    if [ ! -f ./node_modules/.bin/tsc ]; then \
        echo "Error: TypeScript compiler not found" && exit 1; \
    fi && \
    # Run build with proper error handling
    npm run build || { \
        echo "Error: Build failed"; \
        exit 1; \
    } && \
    # Verify build output
    if [ ! -d ./dist ]; then \
        echo "Error: Build output directory not found" && exit 1; \
    fi && \
    # Verify key files exist in dist
    if [ ! -f ./dist/server.js ]; then \
        echo "Error: Main server file not found in build output" && exit 1; \
    fi && \
    # Cleanup
    rm -rf /root/.npm /tmp/*

# Runtime stage
FROM node:18.19-alpine3.19 AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    CI=true \
    NPM_CONFIG_LOGLEVEL=warn \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_AUDIT=false

# Install runtime dependencies with better error handling
RUN set -eux; \
    # Configure Alpine mirrors and update
    echo "https://dl-cdn.alpinelinux.org/alpine/v3.19/main" > /etc/apk/repositories && \
    echo "https://dl-cdn.alpinelinux.org/alpine/v3.19/community" >> /etc/apk/repositories && \
    # Update package list
    apk update && \
    # Upgrade existing packages
    apk upgrade && \
    # Install required packages
    apk add --no-cache \
        busybox-extras \
        curl \
        tini \
        ca-certificates \
    && \
    # Verify critical packages
    which curl && \
    which tini && \
    # Cleanup
    rm -rf /var/cache/apk/* /root/.npm /tmp/*

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