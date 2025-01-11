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

# Build server (with debugging)
WORKDIR /app/server
RUN ls -la
RUN echo "Contents of src directory:"
RUN ls -la src || echo "src directory not found"
RUN echo "Running tsc directly:"
RUN npx tsc --version
RUN npx tsc --project tsconfig.json --listFiles
RUN npx tsc --project tsconfig.json

# Build client
WORKDIR /app/client
RUN npm run build

# Start server
WORKDIR /app/server
CMD ["npm", "start"] 