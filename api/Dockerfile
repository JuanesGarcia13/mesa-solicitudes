# syntax=docker/dockerfile:1
# Contexto de build: raíz del repositorio (usa el package-lock.json del monorepo).

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY infra/package.json infra/package.json
RUN npm ci --workspace api --include-workspace-root=false --ignore-scripts
COPY api api
RUN npm run build --workspace api

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY infra/package.json infra/package.json
RUN npm ci --workspace api --include-workspace-root=false --omit=dev --ignore-scripts \
  && npm cache clean --force
COPY --from=build /app/api/dist api/dist
WORKDIR /app/api
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
# El mismo artefacto sirve para la API (por defecto) y para el job de seed:
#   node dist/scripts/seed.js
CMD ["node", "dist/server.js"]
