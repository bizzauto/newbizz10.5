# ---------- Builder: install deps + build client/server ----------
FROM node:22-alpine AS builder

ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_API_URL

ENV NODE_ENV=development
ENV VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}
ENV VITE_API_URL=${VITE_API_URL}
ENV NODE_OPTIONS="--max-old-space-size=4096"

RUN apk add --no-cache openssl

WORKDIR /app

# Install deps first (cached layer). Use --prefer-offline to reuse npm cache.
COPY package*.json ./
RUN npm ci --no-audit --no-fund --loglevel error || npm install --no-audit --no-fund --loglevel error

# Generate Prisma client (needs schema only)
COPY prisma ./prisma/
RUN npx prisma generate 2>&1 | tail -3 || echo "prisma generate warning (non-fatal)"

# Now copy source and build
COPY . .
RUN rm -rf dist && npm run build:docker && find dist -name "*.map" -delete

# ---------- Runtime ----------
FROM node:22-alpine

RUN apk add --no-cache openssl wget python3 py3-pip && \
    pip3 install --break-system-packages edge-tts

RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001 -G appgroup
WORKDIR /app

# Runtime deps (production only) — also fall back to full install if lock mismatch
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --omit=dev --no-audit --no-fund --loglevel error || npm install --omit=dev --no-audit --no-fund --loglevel error
RUN npx prisma generate 2>&1 | tail -3 || echo "prisma generate warning (non-fatal)"
RUN chown -R appuser:appgroup node_modules/.prisma && \
    npm cache clean --force && rm -rf /root/.npm

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY scripts ./scripts
COPY start.sh ./start.sh
RUN chmod +x start.sh

RUN mkdir -p uploads logs && chown -R appuser:appgroup uploads logs

ENV NODE_ENV=production
ENV PORT=3000
ENV NODE_OPTIONS="--max-old-space-size=768"

EXPOSE 3000

USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:${PORT:-3000}/health || exit 1

CMD ["./start.sh"]
