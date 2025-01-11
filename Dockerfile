# Build stage
FROM node:18-slim AS builder

# Set working directory
WORKDIR /app

# Set build env
ENV NODE_ENV=development
ENV CI=true

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies)
RUN npm ci --no-audit --no-optional && \
    npm cache clean --force

# Copy source files
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:18-slim AS production

# Set working directory
WORKDIR /app

# Set production env
ENV NODE_ENV=production
ENV PORT=3000
ENV CI=true

# Install curl for health checks (with specific version for better caching)
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl=7.* && \
    rm -rf /var/lib/apt/lists/* && \
    apt-get clean

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production --no-audit --no-optional && \
    npm cache clean --force

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Add non-root user
RUN groupadd -r nodejs && \
    useradd -r -g nodejs nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:$PORT/health || exit 1

# Expose port
EXPOSE $PORT

# Start the server
CMD ["npm", "run", "start:prod"] 