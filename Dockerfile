# Build Vite + React app
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production image — runs the Express + WebSocket server
FROM node:22-alpine AS runner

WORKDIR /app

ENV PORT=3000
ENV NODE_ENV=production

# Install only production deps (express, ws, serve)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.mjs ./
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "server.mjs"]
