# ---------- Builder: install deps + build client/server ----------
FROM node:22-alpine AS builder

ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_API_URL

ENV NODE_ENV=development
ENV VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}
ENV VITE_API_URL=${VITE_API_URL}
ENV NODE_OPTIONS="--max-old-space-size=2048"

RUN apk add --no-cache openssl

WORKDIR /app

# Install ALL deps first (cached layer). Use --prefer-offline to reuse npm cache.
COPY package*.json ./
RUN npm ci --no-audit --no-fund --loglevel error || npm install --no-audit --no-fund --loglevel error

# Generate Prisma client (needs schema only)
COPY prisma ./prisma/
RUN npx prisma generate 2>&1 | tail -3 || echo "prisma generate warning (non-fatal)"

# Now copy source and build
COPY . .
RUN rm -rf dist && npm run build:docker && find dist -name "*.map" -delete

# Drop dev dependencies in-place so we can copy a slim node_modules to runtime.
# This avoids a SECOND full `npm ci` in the runtime stage (which previously
# doubled disk usage and spiked memory at image-export, causing exit 255).
RUN npm prune --omit=dev --no-audit --no-fund --loglevel error || true
# Re-add the Prisma CLI: it lives in devDependencies but start.sh needs
# `npx prisma migrate deploy` / `db push` at runtime. Keep it lean (no dev deps).
RUN npm install --no-save --omit=dev prisma@5.22.0 --no-audit --no-fund --loglevel error || true
# Ensure the generated client survives the prune.
RUN npx prisma generate 2>&1 | tail -3 || echo "prisma generate warning (non-fatal)"
RUN npm cache clean --force 2>/dev/null || true

# ---------- Runtime ----------
FROM node:22-alpine

RUN apk add --no-cache openssl wget python3 py3-pip && \
    pip3 install --break-system-packages --no-cache-dir edge-tts

RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001 -G appgroup
WORKDIR /app

# Copy the pre-built, pruned node_modules from builder (no second install).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

# Re-run prisma generate in case .prisma was affected by prune (fast, uses cache).
RUN npx prisma generate 2>&1 | tail -3 || echo "prisma generate warning (non-fatal)"

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY scripts ./scripts
COPY start.sh ./start.sh
RUN chmod +x start.sh

RUN mkdir -p uploads logs && chown -R appuser:appgroup node_modules uploads logs

ENV NODE_ENV=production
ENV PORT=3000
ENV NODE_OPTIONS="--max-old-space-size=768"

EXPOSE 3000

USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:${PORT:-3000}/health || exit 1

CMD ["./start.sh"]
