# syntax=docker/dockerfile:1.6

# -------- Etapa 1: deps --------
FROM node:20-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
# Evitamos descargar Chromium al instalar — se usa el de Alpine en runtime.
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN pnpm install --frozen-lockfile || pnpm install

# -------- Etapa 2: build --------
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm db:generate && pnpm build

# -------- Etapa 3: runner --------
FROM node:20-alpine AS runner
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV CHROMIUM_PATH=/usr/bin/chromium-browser

# Dependencias del Chromium de Alpine + utilidades minimas.
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont \
      dumb-init \
      wget

# Solo prod deps
COPY package.json pnpm-lock.yaml* ./
COPY .npmrc* ./
RUN pnpm install --prod --frozen-lockfile || pnpm install --prod

# Artefactos compilados (incluyen los templates Handlebars gracias a nest-cli.json)
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

# Regeneramos el cliente Prisma aqui (en el runner) en lugar de copiarlo desde
# el build stage. Razon: pnpm guarda el cliente generado en el virtual store
# (node_modules/.pnpm/@prisma+client@X/node_modules/.prisma/) y expone
# node_modules/.prisma como symlink. Copiar el symlink entre stages rompe
# porque el destino real (en .pnpm/) no se copia tambien. Regenerar es mas
# limpio y agnostico al package manager.
RUN pnpm exec prisma generate

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "pnpm db:migrate:deploy && node dist/main.js"]
