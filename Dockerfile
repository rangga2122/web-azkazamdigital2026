FROM node:22-slim AS builder
WORKDIR /app

ENV NODE_OPTIONS="--max-old-space-size=2048"
ENV NEXT_TELEMETRY_DISABLED=1

COPY package*.json ./
RUN npm ci

# Generate .env from build-time env vars (passed by Coolify)
# This allows NEXT_PUBLIC_* vars to be baked into JS bundle
RUN printenv | grep -E '^(NEXT_PUBLIC_|SUPABASE_|VITE_|SMTP_|WHATSAPP_|LICENSE_|UPLOAD_|NVIDIA_)' > .env || true

COPY . .

RUN npm run build

# ---- Runtime stage ----
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV NODE_OPTIONS="--max-old-space-size=768"
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
EXPOSE 3000
CMD ["node", "server.js"]
