# Mesa de Solicitudes

Aplicación multi-filial (multi-tenant) para registrar y seguir solicitudes de compras, nómina y contabilidad de un centro de servicios compartidos. Resuelve tres problemas de raíz:

| Problema | Cómo lo resuelve |
|---|---|
| **1. Nadie sabe en qué va su solicitud** | Pantalla donde la filial ve sus solicitudes con su estado, filtra, busca por número y consulta el historial. Responde en milisegundos con 50.000 solicitudes |
| **2. El proceso no se respeta** | Las etapas son una máquina de estados en el backend: nadie se salta un paso, y quien lo intenta recibe el motivo y el siguiente paso válido |
| **3. Una filial puede ver lo de otra** | La filial sale del token firmado y es el prefijo de todas las llaves de la base. Lo ajeno es inalcanzable y responde igual que lo inexistente |

El modelo de datos y la justificación de cada decisión están en [DECISIONS.md](DECISIONS.md).

| Carpeta | Contenido |
|---|---|
| [`api/`](api) | Node.js 22 + TypeScript, Fastify, DynamoDB. Clean Architecture: `domain` ← `application` ← `infrastructure` / `http` |
| [`web/`](web) | Angular 20: standalone, signals, control flow `@if`/`@for`, `OnPush` |
| [`infra/`](infra) | AWS CDK: DynamoDB, Lambda, API Gateway HTTP, Cognito, S3 + CloudFront |
| [`docker-compose.yml`](docker-compose.yml) | Levanta la base de datos, la carga de datos, la API y el frontend |

---

## 1. Ejecutar la solución

**Requisito:** Docker con Compose v2 (Docker Desktop en Windows o macOS).

```bash
git clone https://github.com/JuanesGarcia13/mesa-solicitudes.git
cd mesa-solicitudes
docker compose up --build
```

La primera vez tarda unos minutos, por la construcción de las imágenes. Después, todo queda listo en unos 30 segundos:

1. **`dynamodb`** arranca DynamoDB Local.
2. **`seed`** crea la tabla, carga los datos de prueba, mide las consultas y **termina**. Es lo esperado: es un job de una sola ejecución.
3. **`api`** arranca cuando el seed terminó bien.
4. **`web`** arranca cuando la API responde su healthcheck.

| Servicio | URL |
|---|---|
| **Aplicación web** | **http://localhost:4200** |
| API | http://localhost:3000/api/health |
| DynamoDB Local | http://localhost:8000 |

Para comprobar que todo está arriba:

```bash
docker compose ps -a     # api: Up (healthy) · web y dynamodb: Up · seed: Exited (0)
```

Para detenerlo, `Ctrl+C` o `docker compose down`. Como DynamoDB Local corre en memoria, `down` borra los datos, y el siguiente `up` los vuelve a cargar limpios.

---

## 2. Usuarios para probar

Todos usan la contraseña **`Mesa2026*`**. El usuario solo escribe usuario y contraseña: el servidor deduce su filial y su rol y los firma en el token.

| Usuario | Filial | Rol | Datos |
|---|---|---|---|
| `ana.cementos` | Cementos | Filial | **50.000 solicitudes** (volumen) |
| `carlos.cementos` | Cementos | Analista | las mismas 50.000 |
| `laura.energia` | Energía | Filial | 120 solicitudes |
| `diego.energia` | Energía | Analista | las mismas 120 |
| `sofia.concesiones` | Concesiones | Filial | ninguna (estado vacío) |

### Recorrido sugerido (5 minutos)

1. **Visibilidad.** Entra como `ana.cementos`: 50.000 solicitudes, la más reciente primero. Filtra por estado, haz clic en *Cargar más* y busca `12345` para ver el detalle con el historial.
2. **Proceso.** Entra como `carlos.cementos`, filtra *Registrada* y abre una: solo puede *Iniciar atención*. Luego *Marcar como resuelta*, que exige comentario. Entra como `ana.cementos`, busca esa solicitud y elige *No estoy conforme* (vuelve a atención) o *Confirmar solución* (se cierra y ya no admite cambios).
3. **Aislamiento.** Entra como `laura.energia` y busca `45000`, que existe en Cementos: responde *"No encontramos la solicitud #45000 en tu filial"*, exactamente igual que con `999999`, que no existe.
4. **Estados vacíos.** Entra como `sofia.concesiones`: la pantalla indica que la filial aún no tiene solicitudes.

La pantalla solo muestra las acciones que el backend permite para ese rol en ese estado (`allowedActions`). Las reglas no se repiten en el frontend.

---

## 3. Datos de prueba

El servicio `seed` se ejecuta solo con `docker compose up`.

| Filial | Solicitudes | Para qué |
|---|---|---|
| Cementos | 50.000 | Volumen: demuestra que las consultas no se degradan |
| Energía | 120 | Una segunda filial para probar el aislamiento |
| Concesiones | 0 | El estado vacío |

- **Historial coherente:** cada solicitud del seed recorrió el proceso real. Una prueba verifica que todas sus transiciones son válidas y que ninguna fecha queda en el futuro.
- **Mide el rendimiento al terminar:** calienta la base y reporta la mediana de 5 ejecuciones de cada consulta de la pantalla. Para verlo: `docker compose logs seed`.

  ```
  Filial cementos: 50000 solicitudes en 10.4 s.
    Primera página (25)                      7.3 ms
    Filtro por estado REGISTERED             5.8 ms
    Filtro por estado CLOSED, página 100     12.6 ms
    Búsqueda por número                      3.8 ms
  ```
- **Otro volumen:** `SEED_VOLUME=100000 docker compose up --build`.
- **Idempotente:** si una filial ya tiene datos, la omite.
- **Sin Docker** (con DynamoDB Local en el puerto 8000): `DYNAMO_ENDPOINT=http://localhost:8000 npm run seed -w api`.

---

## 4. API

| Endpoint | Descripción |
|---|---|
| `POST /api/auth/login` | `{ username, password }` → `{ token, user }`. Solo en local; en AWS lo hace Cognito. Tras 5 fallos en 15 min responde 429 |
| `GET /api/requests?status=&limit=&cursor=` | Lista paginada de la filial del token |
| `GET /api/requests/:number` | Detalle con historial y `allowedActions` |
| `POST /api/requests` | Registrar una solicitud (rol filial). Siempre nace en `REGISTERED` |
| `POST /api/requests/:number/transitions` | `{ action: START \| RESOLVE \| CONFIRM \| REJECT, comment? }` |

Ejemplo con `curl` (Bash o Git Bash), sin pasar por la pantalla:

```bash
B=http://localhost:3000/api
login() { curl -s -X POST $B/auth/login -H 'content-type: application/json' -d "{\"username\":\"$1\",\"password\":\"Mesa2026*\"}" | sed -E 's/.*"token":"([^"]+)".*/\1/'; }
ANA=$(login ana.cementos); CARLOS=$(login carlos.cementos)

# La filial registra una solicitud (nace en REGISTERED)
NUM=$(curl -s -X POST $B/requests -H "Authorization: Bearer $ANA" -H 'content-type: application/json' \
  -d '{"title":"Pago pendiente","description":"Factura 123","category":"PURCHASES"}' | grep -o '"number":[0-9]*' | cut -d: -f2)

# El analista intenta resolverla sin atenderla -> 409 con el motivo y el siguiente paso válido
curl -s -X POST $B/requests/$NUM/transitions -H "Authorization: Bearer $CARLOS" \
  -H 'content-type: application/json' -d '{"action":"RESOLVE","comment":"listo"}'
```

Errores: `400` datos inválidos o comentario faltante · `401` sin token o token inválido · `403` el rol no puede ejecutar esa acción · `404` no existe o es de otra filial (indistinguibles) · `409` transición inválida, solicitud cerrada o modificación concurrente · `429` demasiados intentos de login.

---

## 5. Calidad: lint, pruebas, IaC y CI

```bash
npm ci && npm ci --prefix web
npm run lint     # ESLint + typecheck estricto en api, infra y web
npm test         # Vitest (api, infra) y Karma en Chrome headless (web)
npm run synth    # valida la IaC con cdk synth, sin cuenta de AWS
```

| Prueba | Qué demuestra |
|---|---|
| `api/test/domain/request-workflow.test.ts` | Cada regla del proceso, incluidas todas las combinaciones inválidas de estado, acción y rol |
| `api/test/http/request-workflow.http.test.ts` | Códigos y mensajes, y que la solicitud queda idéntica tras cada tipo de rechazo |
| `api/test/http/tenant-isolation.test.ts` | No listar, leer ni modificar lo ajeno; el mismo 404 que lo inexistente; header ignorado; token alterado |
| `api/test/http/list-requests.http.test.ts` | Orden, filtro, cursor (incluido uno manipulado) y búsqueda por número |
| `api/test/http/auth.http.test.ts` | La filial la decide el servidor; no se pueden enumerar usuarios; bloqueo por intentos fallidos |
| `api/test/infrastructure/repository.contract.test.ts` | Memoria y DynamoDB cumplen el mismo contrato: llaves, índice y escritura condicional |
| `api/test/scripts/seed-data.test.ts` | Los datos de prueba también respetan el proceso |
| `infra/test/*.test.ts` | La plantilla tiene la tabla y su índice, Cognito con `tenantId` inmutable, la API con identidad real y el bucket del frontend privado |
| `web/src/app/**/*.spec.ts` | Login; lista, filtro, cursor y búsqueda; estados vacío y de error; acciones según el rol |

**Suite de contrato contra DynamoDB:** con DynamoDB corriendo (`docker compose up -d dynamodb`), `DYNAMO_ENDPOINT=http://localhost:8000 npm test -w api` ejecuta la misma batería también contra la base real.

**CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)): en cada push y pull request corre tres jobs en paralelo.
- **api:** lint, typecheck, pruebas con DynamoDB Local como *service container* y build.
- **web:** lint, pruebas y build de producción.
- **infra:** lint, pruebas y `cdk synth`.

---

## 6. Desarrollo sin Docker

```bash
npm ci && npm ci --prefix web

# API en memoria (sin base de datos ni datos de volumen), con recarga al guardar
PERSISTENCE=memory AUTH_DEV_SECRET=local-dev-only-secret-not-for-production npm run dev -w api

# En otra terminal: frontend con recarga en caliente (proxy /api -> :3000)
npm start --prefix web    # http://localhost:4200
```

| Variable | Uso | Por defecto |
|---|---|---|
| `PERSISTENCE` | `dynamo` o `memory` | `dynamo` |
| `DYNAMO_ENDPOINT` | DynamoDB Local (vacío = AWS) | — |
| `TABLE_NAME` | Nombre de la tabla | `service-requests` |
| `AUTH_MODE` | `dev` (login local) o `jwks` (Cognito) | `dev` |
| `AUTH_DEV_SECRET` | Secreto HS256 (mínimo 32 caracteres; si no, la API no arranca) | — |
| `CORS_ORIGINS` | Orígenes permitidos | `http://localhost:4200` |

---

## 7. Arquitectura

```
Local (docker compose)                      AWS (infra/, validado con cdk synth)
──────────────────────                      ────────────────────────────────────
Navegador → nginx ─┬─ /      Angular        CloudFront ─┬─ /*     → S3 (Angular)
                   └─ /api/* → API Fastify               └─ /api/* → API Gateway → Lambda
                                  ↓                                    (la misma app Fastify)
                           DynamoDB Local                                  ↓
                                                                        DynamoDB
                                                  Cognito emite el token (tenantId inmutable)
```

- **Una sola aplicación** corre igual en un contenedor y en Lambda. Solo cambia la composición (`api/src/composition-root.ts`): qué repositorio y qué verificador de tokens se conectan.
- **Backend en capas:** el dominio (estados, máquina de estados, errores) no depende de Fastify ni de AWS. El repositorio es un puerto con dos adaptadores, memoria y DynamoDB, y todos sus métodos exigen `tenantId`.
- **Frontend:** `core/` (cliente de API, sesión, guard, interceptor), `features/` (login, solicitudes con un store de signals) y `shared/`.

---

## 8. Priorización y alcance

**Qué prioricé.** Primero lo que tiene más riesgo para el negocio y no se puede corregir con la pantalla: el **aislamiento** (problema 3, riesgo legal) y las **reglas del proceso** (problema 2), las dos en el backend y demostradas con pruebas. Después, la **visibilidad** (problema 1) con su prueba de volumen, porque un modelo de datos mal elegido no se arregla después. Por último, lo que hace la solución verificable para quien la revisa: Docker con un comando, CI, IaC validada y datos coherentes.

**Qué dejé por fuera y por qué:**
- **Registrar solicitudes desde la pantalla.** El endpoint existe y está probado. Hoy las solicitudes entran por correo; el formulario es el siguiente paso natural, pero no lo exige ningún criterio.
- **Búsqueda por texto libre.** Requiere un índice de búsqueda (OpenSearch). El número y el estado cubren "encontrar una solicitud específica" con costo constante.
- **Gestión de usuarios.** Las cuentas de demostración están fijas en el backend. En AWS, el registro, el MFA y la recuperación los resuelve Cognito.
- **Despliegue real y pipeline de CD.** La IaC se valida sin desplegar. Un CD agregaría `cdk deploy` con credenciales OIDC y aprobación manual.
- **Pruebas E2E en el CI** (Playwright). El flujo completo está cubierto por pruebas HTTP del backend y de componentes del frontend, y se verificó manualmente en el navegador.
- **Observabilidad avanzada.** Hay logs estructurados con `tenantId` y `userId` por petición (sin el token), y X-Ray activo en Lambda. Faltan métricas de negocio y alarmas.

**Extras construidos (no exigidos).** Botones del proceso en el detalle (el problema 2 no exige pantalla, pero sin ellos el flujo no se puede mostrar de punta a punta; las reglas siguen solo en el backend) y un login con contraseña en lugar de un selector de usuario.

**Limitaciones conocidas:**
- Un analista opera una filial por token. Lo real es una lista de filiales asignadas (ver DECISIONS.md).
- El token vive en `sessionStorage`, expuesto si hubiera XSS. En producción usaría una cookie `httpOnly` con un BFF, o el SDK de Cognito con rotación.
- El bloqueo por intentos fallidos vive en memoria por instancia. Basta para el login local; en AWS lo cubre Cognito.

---

## 9. Decisiones que revisé en el camino

- **De selector de usuarios a login real.** La primera versión tenía un selector de usuarios simulados: cualquiera podía entrar como cualquier usuario, de cualquier filial, sin contraseña. Para demostrar el problema 3 eso no bastaba: la identidad tiene que probarse. Ahora hay usuario y contraseña, y el servidor deduce la filial de la cuenta y la firma en el token.
- **Botones del proceso.** Inicialmente el detalle era de solo lectura, porque el problema 2 no pide pantalla. Los agregué para poder demostrar el flujo, cuidando que la pantalla **no tenga reglas**: solo muestra `allowedActions`.
- **Ruteo de CloudFront.** El *fallback* habitual de una SPA (`errorResponses` 404 → `index.html`) aplica a toda la distribución, así que habría convertido los 404 de la API en 200 con HTML. Esto habría roto el "404 indistinguible" del problema 3. Lo reemplacé por una CloudFront Function que solo reescribe las rutas del frontend.
- **Datos de prueba realistas.** El primer seed generaba fechas en el futuro. Lo corregí y agregué una prueba que valida cada historial del seed con las mismas reglas del dominio.
- **Medición honesta.** La primera medición incluía el arranque en frío de DynamoDB Local. Ahora calienta la base y reporta la mediana de 5 ejecuciones.
- **Orden por número, no por fecha.** Evalué `SK = REQ#<fecha>#<número>`. Lo descarté porque perdería la búsqueda directa por número (`GetItem`), y el contador atómico ya ordena por registro.
- **Concurrencia.** La escritura se condiciona al estado esperado, lo que basta para que nadie se salte un paso. Identifiqué el caso ABA, que se cubre condicionando también por `version`, y lo dejé documentado como mejora.
- **Fuerza bruta en el login.** Al revisar la seguridad del login agregué el bloqueo por intentos fallidos. No confía en `X-Forwarded-For`, que se podría falsificar para evadir el límite.
