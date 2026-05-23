# lab-backend

API REST del sistema de laboratorio clínico — **Sprints 0–9 completos**.

Stack: Node.js 20 · NestJS 10 · TypeScript 5 (estricto) · Prisma 6 · PostgreSQL 16 · pino · Swagger · Puppeteer (PDF) · EventEmitter2.

---

## Requisitos

- **Node.js 20** (mira `.nvmrc`).
- **pnpm 9** (`corepack enable && corepack prepare pnpm@9 --activate`).
- **Docker Desktop** (para Postgres en local).
- **Chrome / Chromium** en el host (saltamos la descarga interna de Puppeteer; ver `CHROMIUM_PATH` en `.env.example`).

## Arranque rápido (desarrollo)

```powershell
# 1. Instalar deps (con system CA si estás detrás de un proxy corporativo)
$env:NODE_OPTIONS="--use-system-ca"
pnpm install

# 2. Copiar variables de entorno y editar JWT_SECRET / CHROMIUM_PATH
Copy-Item .env.example .env

# 3. Arrancar Postgres en Docker (puerto 5434)
docker compose up -d

# 4. Generar el cliente Prisma y aplicar migraciones
pnpm db:generate
pnpm db:migrate:deploy

# 5. Sembrar admin + lab_config + catálogo demo
pnpm db:seed

# 6. Arrancar la API en modo dev
pnpm start:dev
```

Cuando arranque:

- API: <http://localhost:3000/api/v1/health>
- Swagger: <http://localhost:3000/docs>
- OpenAPI JSON: <http://localhost:3000/docs-json>

Credenciales del admin sembrado (configurables por `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`):

| Email | Password |
|---|---|
| `admin@laboratorio.com` | `Admin123!` |

## Módulos disponibles

| Sprint | Módulo | Endpoints principales |
|---|---|---|
| 1 | `auth` | `/auth/login`, `/auth/refresh`, `/auth/me`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/change-password` |
| 1 | `users` | placeholder admin (uso interno) |
| 2 | `catalog/categories`, `catalog/tests`, `catalog/reference-ranges` | CRUD admin |
| 3 | `catalog/panels`, `catalog/import` | paneles + import XLSX (dry-run + confirm) |
| 4 | `patients`, `references`, `professionals`, `lab-config` | CRUD + portal access + firmas + logo |
| 5 | `orders`, `results` | máquina de estados + bulk-save autosave |
| 6 | `reports`, `verify` | PDF Puppeteer + verificación pública con QR |
| 7 | `portal` (`/me/...`, `/me/reference/...`) | portales paciente y referencia |
| 8 | `audit`, `dashboards` | trazas + KPIs (`/audit`, `/admin/dashboard/overview`, `/admin/dashboard/timeline`) |
| 9 | hardening, e2e tests, deploy | rate limiting endurecido, suite Jest e2e, docker-compose.prod, scripts de backup |

Todos los errores siguen el formato **RFC 7807** (`application/problem+json`).

## Comandos útiles

| Comando | Qué hace |
|---|---|
| `pnpm start:dev` | API con hot-reload |
| `pnpm build` | Compila a `dist/` |
| `pnpm start:prod` | Corre el build (`node dist/main.js`) |
| `pnpm lint` | Lint con auto-fix |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Tests unitarios (jest) |
| `pnpm test:e2e` | Suite e2e contra Postgres real (admin sembrado) |
| `pnpm db:migrate` | Migración dev (genera SQL y aplica) |
| `pnpm db:migrate:deploy` | Aplica migraciones pendientes (CI / prod) |
| `pnpm db:seed` | Carga admin + lab_config + categorías + test demo |
| `pnpm db:studio` | Abre Prisma Studio |

## Variables de entorno

Ver `.env.example`. Validación con Zod en `src/config/env.validation.ts`; si falta una crítica, la app no arranca.

Variables más importantes:

- `DATABASE_URL` — URL de Postgres.
- `JWT_SECRET` — mínimo 32 caracteres.
- `FRONT_URL` — origen permitido por CORS.
- `PUBLIC_VERIFY_URL` — URL pública del frontend donde se sirve `/verificar/:token` (usada en el QR del PDF).
- `CHROMIUM_PATH` — ruta al ejecutable de Chrome/Chromium (Puppeteer no lo descarga).
- `RESEND_API_KEY` — opcional, para correos transaccionales.
- `LOG_LEVEL` — `info` por defecto; `debug` para depurar.

## Tests end-to-end

Los specs en `test/*.e2e-spec.ts` se ejecutan contra la **DB de desarrollo** (no monta una DB aislada): asumen que las migraciones están aplicadas y el admin sembrado. Cada spec limpia sus propios datos en `afterAll`.

```powershell
$env:NODE_OPTIONS="--use-system-ca"
pnpm test:e2e
```

Coverage actual:

- `health.e2e-spec.ts` — endpoints públicos y guard de auth.
- `auth.e2e-spec.ts` — login, refresh, /me, rejection de payloads malos.
- `orders-flow.e2e-spec.ts` — flujo completo paciente → orden → bulk-save → validate → deliver → audit + dashboard.

El throttler se desactiva automáticamente cuando `NODE_ENV=test` (ver `src/shared/guards/test-aware-throttler.guard.ts`).

## Despliegue

### Opción A — Railway / Fly.io / Render (recomendado para empezar)

1. Crear servicio nuevo apuntando a este repo.
2. Adjuntar el plugin de Postgres del proveedor; copiar `DATABASE_URL` a las env vars.
3. Configurar el resto de variables (`JWT_SECRET`, `FRONT_URL`, `PUBLIC_VERIFY_URL`, `CHROMIUM_PATH=/usr/bin/chromium-browser`, `RESEND_API_KEY` si hay correos, etc.).
4. Railway detecta `railway.json` y usa el `Dockerfile`. El `startCommand` aplica migraciones antes de arrancar la API.
5. Verificar `/api/v1/health` desde la URL pública del servicio.
6. Correr `scripts/post-deploy-check.sh` para validar el smoke set (login admin, catálogo, dashboard).

### Opción B — VPS / servidor on-prem

Usar `docker-compose.prod.yml`:

```bash
# 1. Copiar y completar el .env.prod
cp .env.example .env.prod
# Editar y completar: POSTGRES_PASSWORD, JWT_SECRET, APP_URL, FRONT_URL, etc.

# 2. Levantar postgres + api
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# 3. Verificar healthcheck (espera ~30s al primer arranque)
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api

# 4. Smoke check post-deploy
API_URL=http://localhost:3000 ADMIN_EMAIL=admin@... ADMIN_PASSWORD=... \
  ./scripts/post-deploy-check.sh
```

El compose:
- No expone Postgres al host por defecto (sólo red interna). Si querés acceso externo, descomentá `ports: ['5432:5432']`.
- Usa volúmenes nombrados (`lab-pgdata-prod`, `lab-storage-prod`) para que `docker compose down` no borre datos. Para wipear DB hay que `docker volume rm` explícito.
- Incluye un sidecar de backup comentado (cron simple en bash). Para algo serio, usá pgBackRest o el backup gestionado del proveedor de tu DB.

### Backup y restore

Scripts en `scripts/`:

```bash
# Backup manual (gzip + rotación de 14 días)
./scripts/backup.sh                # usa .env por defecto
./scripts/backup.sh .env.prod      # con otro archivo

# Restore (pide confirmación interactiva)
./scripts/restore.sh backups/lab_20260521_120000.sql.gz
```

Los archivos se guardan en `backups/` y se rotan automáticamente.

## Hardening de seguridad

Configurado out-of-the-box:

- **Helmet** con CSP estricta + COOP/CORP, en `src/main.ts`.
- **Throttler** global (100 req/min) + límites endurecidos en `/auth/login` (5/min) y `/auth/reset-password` (3/min). El lockout a nivel de cuenta vive en `AuthService` (5 fallos consecutivos bloquean por 15 min).
- **CORS** restringido a `FRONT_URL`.
- **JWT** con refresh rotation; el refresh va en cookie HttpOnly + SameSite Lax (Secure se activa en prod).
- **Audit log** persistente para todas las acciones críticas (state changes de orden, soft-deletes, credenciales emitidas, cambios de config).
- **Soft-delete** en todas las entidades clínicas — nunca se borran filas físicas.
- **Versionado** en Test (TestHistory) y Order (snapshot del nombre/unidad en `OrderItem`) para que el PDF refleje siempre la versión vigente al momento de la captura.

## Estructura

```
lab-backend/
├── prisma/
│   ├── schema.prisma            ← 25+ modelos (users, patients, orders, audit_log, ...)
│   ├── migrations/              ← migraciones SQL versionadas
│   └── seed.ts                  ← admin + lab_config + categorías + test demo
├── src/
│   ├── config/                  ← env validation (Zod) + swagger
│   ├── modules/
│   │   ├── audit/               ← AuditLog + suscriptor de eventos
│   │   ├── auth/                ← login, refresh, recover, change-password
│   │   ├── catalog/             ← categories + tests + panels + ranges + import
│   │   ├── dashboards/          ← /admin/dashboard/overview + /timeline
│   │   ├── health/              ← /health + /health/ready
│   │   ├── lab-config/          ← config global + logo
│   │   ├── notifications/       ← Resend + suscriptores de eventos
│   │   ├── orders/              ← state machine + items + amend
│   │   ├── patients/            ← CRUD + portal access
│   │   ├── portal/              ← /me/* y /me/reference/*
│   │   ├── professionals/       ← CRUD + firma
│   │   ├── references/          ← CRUD + usuarios anidados
│   │   ├── reports/             ← Puppeteer + Handlebars + QR + /verify/:token
│   │   ├── results/             ← captura + bulk-save autosave
│   │   ├── storage/             ← GET /storage/:folder/:file
│   │   └── users/               ← interno (admin seed)
│   ├── shared/
│   │   ├── decorators/
│   │   ├── events/              ← AppEvents + payloads tipados
│   │   ├── filters/             ← RFC 7807
│   │   ├── guards/              ← JWT, Roles, TestAwareThrottler
│   │   ├── interceptors/
│   │   ├── prisma/
│   │   └── storage/             ← LocalStorageService + image-upload validators
│   ├── app.module.ts
│   └── main.ts
├── test/
│   ├── helpers/app.ts           ← bootstrap minimo para e2e
│   ├── *.e2e-spec.ts            ← suite end-to-end
│   ├── jest-e2e.json
│   └── setup-e2e.ts
├── scripts/
│   ├── backup.sh                ← pg_dump + rotación
│   ├── restore.sh               ← psql restore con confirmación
│   └── post-deploy-check.sh     ← smoke set para CI/CD
├── docker/
│   └── postgres-init.sql        ← gestionado por Prisma extensions ahora
├── docker-compose.yml           ← Postgres 16 dev (puerto 5434)
├── docker-compose.prod.yml      ← Postgres + API + sidecar de backup opcional
├── Dockerfile                   ← multi-stage Alpine + Chromium
├── railway.json
└── .env.example
```

## Troubleshooting

**`Could not find Chrome` al generar PDF**
→ Saltamos la descarga interna de Puppeteer. Setea `CHROMIUM_PATH` apuntando a Chrome del sistema. En el `Dockerfile` ya viene configurado a `/usr/bin/chromium-browser` (paquete de Alpine).

**`drift detected` al correr `prisma migrate dev`**
→ Hay un índice o función creada manualmente fuera de migrations (ej. `idx_patients_document` del trigram). Soluciones: (a) generar la SQL con `prisma migrate diff` y usar `prisma migrate resolve --applied` para registrarla, o (b) aceptar el reset si la DB es de dev.

**Tests e2e fallan con 429 al hacer login**
→ Verifica `NODE_ENV=test`. El `TestAwareThrottlerGuard` skipea el rate-limit solo en ese modo. Si corres los specs con `NODE_ENV=production` el throttle se aplica.

**`port 5434 in use`**
→ En Windows revisa que no haya un postgres nativo escuchando: `Get-NetTCPConnection -LocalPort 5434`. Stop-Process el PID o cambia el puerto en `docker-compose.yml`.

## Licencia

UNLICENSED — uso interno.
