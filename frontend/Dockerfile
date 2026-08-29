# maze-mipool SPA (Vite + React), served over plain HTTP on 8080.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Vite inlines these at build time, so they are build args rather than pod env.
# VITE_APP_VERSION is intentionally absent: vite.config.ts overwrites it from package.json.
ARG VITE_BACKEND_URL
ARG VITE_MS_API_SUBSCRIPTION_KEY
ARG VITE_GRAFANA_FARO_URL
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL \
    VITE_MS_API_SUBSCRIPTION_KEY=$VITE_MS_API_SUBSCRIPTION_KEY \
    VITE_GRAFANA_FARO_URL=$VITE_GRAFANA_FARO_URL
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080
RUN npm init -y >/dev/null \
  && npm install --omit=dev --no-fund --no-audit express@4.21.2 \
  && npm cache clean --force \
  && useradd --system --uid 1001 delta
COPY --from=build --chown=delta:delta /app/dist ./dist
COPY --chown=delta:delta server.prod.cjs ./
USER delta
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.prod.cjs"]
