FROM node:18

WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install dependencies (without running postinstall script yet)
RUN npm install --ignore-scripts

# Copy source code and TypeScript config
COPY . .

# Now run TypeScript compilation
RUN npm run build

# Start the server
CMD ["npm", "start"] 