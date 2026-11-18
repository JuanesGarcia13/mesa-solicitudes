# Mesa de Solicitudes

Aplicación multi-filial (multi-tenant) para registrar y seguir solicitudes de compras, nómina y contabilidad. En ella, cada filial ve en qué va cada una de sus solicitudes, el proceso de atención no se puede saltar y ninguna filial ve la información de otra.

| Carpeta | Contenido |
|---|---|
| [`api/`](api) | Node.js 22 + TypeScript, Fastify, DynamoDB (Clean Architecture: `domain` → `application` → `infrastructure`/`http`) |
| [`web/`](web) | Angular 20 (standalone, signals, control flow `@if`/`@for`) |
| [`infra/`](infra) | AWS CDK: DynamoDB, Lambda, API Gateway HTTP, Cognito, S3 + CloudFront |
| [`DECISIONS.md`](DECISIONS.md) | Modelo de datos y decisiones por problema |

## Ejecutarlo

Requisitos: Docker con Compose v2.

```bash
docker compose up --build
```

| Servicio | URL |
|---|---|
| Aplicación | http://localhost:4200 |
| API | http://localhost:3000/api/health |
| DynamoDB Local | http://localhost:8000 |

Al arrancar, el job `seed` crea la tabla, carga los datos de prueba e imprime cuánto tardan las consultas. La API arranca cuando el seed termina (unos 30 s).

### Usuarios simulados

En la pantalla de ingreso eliges un usuario. El backend emite un JWT firmado con su filial.

| Usuario | Filial | Rol | Datos |
|---|---|---|---|
| Ana Restrepo | Cementos | Filial | **50.000 solicitudes** (volumen) |
| Carlos Mejía | Cementos | Analista | — |
| Laura Gómez | Energía | Filial | 120 solicitudes |
| Diego Ríos | Energía | Analista | — |
| Sofía Vélez | Concesiones | Filial | ninguna (estado vacío) |

### Datos de prueba

- Volumen configurable: `SEED_VOLUME=100000 docker compose up --build`.
- El seed es idempotente: si una filial ya tiene datos, la omite. Como DynamoDB Local corre en memoria, `docker compose down` borra los datos y el siguiente `up` los vuelve a cargar.
- Sin Docker, con una instancia de DynamoDB Local en el puerto 8000: `DYNAMO_ENDPOINT=http://localhost:8000 npm run seed -w api`.

### Probar el proceso desde la API (sin pantalla)

```bash
B=http://localhost:3000/api
login() { curl -s -X POST $B/auth/dev-login -H 'content-type: application/json' -d "{\"userId\":\"$1\"}" | sed -E 's/.*"token":"([^"]+)".*/\1/'; }
ANA=$(login ana.cementos); CARLOS=$(login carlos.cementos)

# La filial registra una solicitud
curl -s -X POST $B/requests -H "Authorization: Bearer $ANA" -H 'content-type: application/json' \
  -d '{"title":"Pago pendiente","description":"Factura 123","category":"PURCHASES"}'
# El analista intenta resolverla sin atenderla primero -> 409 con explicación
curl -s -X POST $B/requests/50001/transitions -H "Authorization: Bearer $CARLOS" \
  -H 'content-type: application/json' -d '{"action":"RESOLVE","comment":"listo"}'
```

| Endpoint | Descripción |
|---|---|
| `GET /api/requests?status=&limit=&cursor=` | Lista paginada de la filial |
| `GET /api/requests/:number` | Detalle con historial y `allowedActions` |
| `POST /api/requests` | Registrar (solo rol filial) |
| `POST /api/requests/:number/transitions` | `{ action: START \| RESOLVE \| CONFIRM \| REJECT, comment? }` |

## Desarrollo

```bash
npm ci && npm ci --prefix web
npm run lint        # api + infra + web
npm test            # api + infra + web (Karma, Chrome headless)
npm run synth       # valida la IaC con cdk synth, sin cuenta de AWS

# La API sin Docker ni DynamoDB, en memoria:
PERSISTENCE=memory AUTH_DEV_SECRET=local-dev-only-secret-not-for-production npm run dev -w api
npm start --prefix web   # http://localhost:4200, proxy /api -> :3000
```

Las pruebas de contrato del repositorio también corren contra DynamoDB cuando existe `DYNAMO_ENDPOINT`. En CI corren siempre, con DynamoDB Local como *service container*.

| Prueba | Qué demuestra |
|---|---|
| `api/test/domain/request-workflow.test.ts` | Cada regla del proceso, incluidas todas las combinaciones inválidas |
| `api/test/http/request-workflow.http.test.ts` | Mensajes y códigos HTTP; la solicitud queda igual tras un intento inválido |
| `api/test/http/tenant-isolation.test.ts` | No listar, leer ni modificar lo ajeno; mismo 404 que lo inexistente; token alterado |
| `api/test/infrastructure/repository.contract.test.ts` | Memoria y DynamoDB cumplen el mismo contrato (llaves, índice, escritura condicional) |
| `web/src/app/features/requests/*.spec.ts` | Lista, filtro, paginación, búsqueda, estados vacío y error |

**CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) corre en tres jobs paralelos: api, web e infra. Cada uno ejecuta lint y pruebas; además, api compila, web hace el build e infra ejecuta `cdk synth`.

## Despliegue en AWS (no requerido; validado con `cdk synth`)

```
CloudFront ─┬─ /*      → S3 (Angular)
            └─ /api/*  → API Gateway HTTP → Lambda (misma app Fastify) → DynamoDB
Cognito: emite el token; tenantId es un atributo inmutable
```

## Qué dejé por fuera y por qué

- **Pantalla para analistas y para confirmar o rechazar.** El problema 2 no la pide y el backend ya la soporta (`allowedActions` en el detalle). Prioricé que la filial pueda consultar, que es el dolor del problema 1.
- **Registrar solicitudes desde la pantalla.** El endpoint existe y está probado. La carga real hoy entra por correo; un formulario es el siguiente paso natural.
- **Búsqueda por texto libre.** Requiere un índice de búsqueda (OpenSearch). Número y estado cubren "encontrar una solicitud específica" con costo constante.
- **Identidad real en local.** Se simula con JWT firmado; en AWS el stack ya define Cognito y la API sabe validar su JWKS.
- **Despliegue real y pipeline de CD.** La prueba pide validar la IaC sin desplegar.
- **Observabilidad avanzada.** Hay logs estructurados con `tenantId` y `userId` por petición, y X-Ray activo en Lambda; faltan métricas de negocio y alarmas.

Ver mejoras propuestas en [DECISIONS.md](DECISIONS.md#parcial-o-pendiente-visto-pero-no-construido).
