FROM node:18

WORKDIR /app

# Install TypeScript globally
RUN npm install -g typescript

# Copy package files
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install dependencies
WORKDIR /app/server
RUN npm install --legacy-peer-deps
RUN npm install typescript @types/node --save-dev

WORKDIR /app/client
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Build server (with verbose output)
WORKDIR /app/server
RUN npm run build --verbose

# Build client
WORKDIR /app/client
RUN npm run build

# Start server
WORKDIR /app/server
CMD ["npm", "start"] 