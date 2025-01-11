FROM node:18

WORKDIR /app

# Install TypeScript globally
RUN npm install -g typescript

# Copy package files
COPY server/package*.json ./
COPY server/tsconfig.json ./

# Install dependencies
RUN npm install --legacy-peer-deps
RUN npm install typescript @types/node --save-dev

# Copy source code
COPY server/src ./src

# Show debugging info
RUN echo "Directory contents:"
RUN ls -la
RUN echo "Source directory contents:"
RUN ls -la src

# Build server
RUN npx tsc --version
RUN npx tsc

# Start server
CMD ["npm", "start"] 