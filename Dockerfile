# ---------- deps ----------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- build ----------
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------- runtime ----------
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# standalone output (server.js) + static assets
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# data dir (SQLite db + images) — mounted from host via docker-compose
RUN mkdir -p /app/data/images

EXPOSE 3000
# Next.js standalone server listens on $HOSTNAME; Docker injects the container
# id there, so force 0.0.0.0 to keep it reachable on all interfaces.
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 node server.js"]
