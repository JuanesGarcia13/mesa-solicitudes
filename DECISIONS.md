# Decisiones

## Modelo de datos (DynamoDB, tabla única)

| Entidad | PK | SK | GSI1PK | GSI1SK |
|---|---|---|---|---|
| Solicitud | `TENANT#<filial>` | `REQ#<número, 10 dígitos>` | `TENANT#<filial>#STATUS#<estado>` | `REQ#<número>` |
| Contador | `TENANT#<filial>` | `COUNTER#REQ` | — | — |

La **Solicitud** guarda `number, title, description, category, status, createdBy, createdAt, updatedAt, version` y `history[]` (cada cambio: acción, de→a, quién, rol, cuándo, comentario). **GSI1** proyecta solo los campos del listado (`INCLUDE`), no la descripción ni el historial.

| Consulta | Operación |
|---|---|
| Mis solicitudes, recientes primero | `Query PK=TENANT#f, begins_with(SK,'REQ#')`, descendente |
| Filtrar por estado | `Query GSI1 GSI1PK=TENANT#f#STATUS#s` |
| Buscar por número | `GetItem PK+SK` |

## Problema 1: nadie sabe en qué va su solicitud
- **Solución:** pantalla Angular "Mis solicitudes" con filtro por estado, búsqueda por número y detalle con el historial (quién hizo cada cambio y cuándo). Toda consulta es un `Query` o `GetItem` sobre la partición de la filial con **paginación por cursor** (`LastEvaluatedKey`). El costo no depende del total: con 50.000 solicitudes, cada consulta tarda **7–20 ms** en DynamoDB Local (el seed lo mide).
- **Números:** secuenciales por filial (#1, #2…) con contador atómico, para que la filial busque por un número legible y no por un UUID.
- **Descartado:** paginación por *offset* y conteo total. DynamoDB no la soporta sin escanear, y su costo crece con la página.
- **Descartado:** búsqueda por texto libre. Requiere OpenSearch, y para el problema planteado basta con número y estado.

## Problema 2: el proceso no se respeta
- **Solución:** el flujo es una **máquina de estados declarativa** (`api/src/domain/request-workflow.ts`): `REGISTERED -START(analista)→ IN_PROGRESS -RESOLVE(analista)→ RESOLVED -CONFIRM(filial)→ CLOSED`, más `RESOLVED -REJECT(filial)→ IN_PROGRESS`. Cada transición declara qué rol la ejecuta y si exige comentario (resolver y rechazar sí lo exigen). `planTransition` es una función pura que, si la transición no es válida, explica el motivo y el siguiente paso válido. Respuestas: 409 (`INVALID_TRANSITION`, `REQUEST_CLOSED`), 403 (rol) y 400 (comentario faltante).
- **"La solicitud queda como estaba":** la escritura es un `UpdateItem` condicional (`#status = :esperado`). Dos analistas a la vez no pueden saltarse un paso: el segundo recibe 409. Además, el historial es *append-only* dentro del mismo ítem, así que se escribe atómicamente junto con el estado.
- **Descartado:** dejar que el cliente envíe el estado destino (`PATCH status`). Así es como ocurre el problema del Excel. El cliente envía la **acción**; el servidor decide el destino.

## Problema 3: una filial puede ver lo de otra
- **Solución:** la filial sale **solo del token firmado** (claim `tenantId`), nunca de la URL, el body o los headers. Todas las llaves de la tabla empiezan por la filial y el repositorio no tiene ningún método sin `tenantId`. Por eso, una solicitud ajena es inalcanzable por construcción y responde **404 idéntico** al de una inexistente (sin filtrar si existe). El cursor solo transporta el número; la partición se reconstruye desde el token.
- **Pruebas:** `test/http/tenant-isolation.test.ts` (listar, leer, modificar, token alterado, header `x-tenant-id` ignorado) y la suite de contrato del repositorio contra DynamoDB real en CI.
- **Descartado:** una tabla por filial (operación y migraciones N veces) o filtrar en memoria después de leer (un descuido expone datos).

## Identidad
- **Local:** `POST /api/auth/login` con usuario y contraseña (hash scrypt). El servidor deduce la filial de la cuenta y firma un JWT HS256 con ella.
- **AWS:** Cognito con `tenantId` como atributo **inmutable**; la API valida contra el JWKS (`AUTH_MODE=jwks`). El código de negocio es el mismo en ambos casos.

## Parcial o pendiente (visto pero no construido)
- **Analista multi-filial:** hoy cada analista opera con un token por filial. Lo real es una lista de filiales asignadas en el token y elegir la filial activa.
- **Endurecimiento IAM:** la Lambda tiene acceso a toda la tabla. Un siguiente paso es usar `dynamodb:LeadingKeys` con credenciales por filial.
- **Funcionalidad para el negocio:** notificar a la filial cuando su solicitud pasa a Resuelta (evita que vuelva a preguntar), SLA y tiempos por etapa, y cierre automático si la filial no confirma en N días. Esta última es una regla de negocio que hay que acordar.
- **Historial muy largo:** si el historial creciera mucho (por muchos rechazos), se movería a ítems `HIST#` con `TransactWrite`.
