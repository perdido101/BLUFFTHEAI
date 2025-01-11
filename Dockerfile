FROM node:18

WORKDIR /app

# Install TypeScript globally
RUN npm install -g typescript

# Copy package files first for better caching
COPY server/package*.json ./
COPY server/tsconfig.json ./

# Install dependencies
RUN npm install
RUN npm install typescript @types/node --save-dev

# Copy the entire source code
COPY server/src ./src

# Build server
RUN npx tsc

# Start server
CMD ["node", "dist/server.js"] 