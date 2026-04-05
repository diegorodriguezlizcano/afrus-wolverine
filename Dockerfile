# afrus-Wolverine — Docker Image
FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package*.json ./
RUN npm ci --only=production

# Install all dependencies (for build)
FROM base AS prod-deps
COPY package*.json ./
RUN npm ci

# Build
FROM base AS build
COPY --from=prod-deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production image
FROM base AS production
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/src/main"]
