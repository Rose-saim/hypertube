FROM node:18-alpine

ENV NODE_OPTIONS=--openssl-legacy-provider

RUN mkdir -p /app && chown -R node:node /app
WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm install

# Then copy the rest of the files
COPY --chown=node:node . .

# Build the application
RUN npm run build

USER node
