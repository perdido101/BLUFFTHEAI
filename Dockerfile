FROM node:18

WORKDIR /app

# Copy package files
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install dependencies
WORKDIR /app/server
RUN npm install --legacy-peer-deps

WORKDIR /app/client
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Build server
WORKDIR /app/server
RUN npm run build

# Build client
WORKDIR /app/client
RUN npm run build

# Start server
WORKDIR /app/server
CMD ["npm", "start"] 