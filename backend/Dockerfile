# maze-mipool API (Express + TypeORM). Listens on 3002.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
# `npm run build` runs tsc *and* tsc-alias; without the alias pass the emitted
# JS keeps unresolvable "@common/*" specifiers and crashes on require.
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3002
RUN useradd --system --uid 1001 delta
COPY --from=build --chown=delta:delta /app/package.json /app/package-lock.json ./
COPY --from=build --chown=delta:delta /app/node_modules ./node_modules
COPY --from=build --chown=delta:delta /app/dist ./dist
USER delta
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3002/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
