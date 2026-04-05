# Build Vite + React app
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Serve static dist (matches npm start: serve on 0.0.0.0)
FROM node:22-alpine AS runner

WORKDIR /app

ENV PORT=3000
RUN npm install -g serve@14

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["sh", "-c", "exec serve -s dist -l tcp://0.0.0.0:${PORT}"]
