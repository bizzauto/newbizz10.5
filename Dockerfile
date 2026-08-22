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

# Install ALL deps first (cached layer).
COPY package*.json ./
RUN npm ci --no-audit --no-fund --loglevel error || npm install --no-audit --no-fund --loglevel error

# Generate Prisma client (needs schema only)
COPY prisma ./prisma/
RUN npx prisma generate 2>&1 | tail -3 || echo "prisma generate warning (non-fatal)"

# Now copy source and build
COPY . .
RUN rm -rf dist && npm run build:docker && find dist -name "*.map" -delete

# Persist the npm cache so the runtime stage's lean install is fast/offline
RUN cp -r /root/.npm /tmp/npm-cache 2>/dev/null || true

# ---------- Runtime ----------
FROM node:22-alpine

RUN apk add --no-cache openssl wget python3 py3-pip && \
    pip3 install --break-system-packages --no-cache-dir edge-tts

RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001 -G appgroup
WORKDIR /app

# Reuse the builder's npm cache for a fast, offline lean install
COPY --from=builder /tmp/npm-cache /root/.npm

# Copy built artifacts. The server/worker bundles (built by esbuild) contain
# ALL dependencies EXCEPT the externals list in scripts/build-server.js, so the
# runtime node_modules is tiny.
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./
COPY scripts ./scripts
COPY start.sh ./start.sh
RUN chmod +x start.sh

# Install ONLY the runtime-external deps (native modules + prisma client).
# Previously the ENTIRE node_modules was copied from the builder, which made the
# image huge, caused `chown -R node_modules` to hang for 7+ min, and the export
# step to time out -> Coolify "exit code 255". Now node_modules is a few hundred MB.
# Keep this list in sync with `commonExternals` in scripts/build-server.js.
RUN npm install --omit=dev --no-audit --no-fund --prefer-offline --loglevel error \
      @prisma/client prisma sharp bcryptjs jsonwebtoken openai googleapis \
      nodemailer razorpay speakeasy bullmq ioredis \
      || npm install --omit=dev --no-audit --no-fund --loglevel error \
      @prisma/client prisma sharp bcryptjs jsonwebtoken openai googleapis \
      nodemailer razorpay speakeasy bullmq ioredis

RUN npx prisma generate 2>&1 | tail -3 || echo "prisma generate warning (non-fatal)"

RUN mkdir -p uploads logs && chown -R appuser:appgroup node_modules uploads logs

ENV NODE_ENV=production
ENV PORT=3000
ENV NODE_OPTIONS="--max-old-space-size=768"

EXPOSE 3000

USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:${PORT:-3000}/health || exit 1

CMD ["./start.sh"]
