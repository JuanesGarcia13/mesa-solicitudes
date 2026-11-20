# Decisiones

## Modelo de datos (DynamoDB, tabla única)

| Entidad | PK | SK | GSI1PK | GSI1SK |
|---|---|---|---|---|
| Solicitud | `TENANT#<filial>` | `REQ#<número, 10 dígitos>` | `TENANT#<filial>#STATUS#<estado>` | `REQ#<número>` |
| Contador | `TENANT#<filial>` | `COUNTER#REQ` | — | — |

**Solicitud:** `number, title, description, category, status, createdBy, createdAt, updatedAt, version, history[]`. Cada cambio del historial guarda acción, origen y destino, quién, rol, cuándo y comentario. **GSI1** proyecta solo los campos del listado (`INCLUDE`). El modelo sale de las tres consultas de la pantalla:

| Consulta | Operación |
|---|---|
| Mis solicitudes, recientes primero | `Query PK=TENANT#f, begins_with(SK,'REQ#')`, descendente |
| Filtrar por estado | `Query GSI1PK=TENANT#f#STATUS#s` |
| Buscar por número | `GetItem PK+SK` |

## Problema 1: nadie sabe en qué va su solicitud
- **Solución:** pantalla Angular con filtro por estado, búsqueda por número y detalle con el historial. Toda consulta es `Query` o `GetItem` sobre la partición de la filial, con **paginación por cursor**. Con 50.000 solicitudes, cada consulta tarda entre 3 y 13 ms (el seed lo mide). Los números son secuenciales por filial, con un contador atómico: la filial busca "la #1250", no un UUID.
- **Criterios:** lista, filtro, cursor y búsqueda en `list-requests.http.test.ts`. Estados vacío y de error en `request-list.page.spec.ts`. Volumen con `seed` (`SEED_VOLUME`).
- **Descartado:** paginación por *offset* (DynamoDB no la tiene y su costo crece con la página) y búsqueda por texto libre (exige OpenSearch). También `SK = REQ#<fecha>#<número>` para ordenar por fecha: perdería el `GetItem` directo por número, y el contador ya ordena por registro.

## Problema 2: el proceso no se respeta
- **Solución:** una **máquina de estados declarativa** en `domain/request-workflow.ts`. `REGISTERED →START(analista)→ IN_PROGRESS →RESOLVE(analista)→ RESOLVED →CONFIRM(filial)→ CLOSED`, y `RESOLVED →REJECT(filial)→ IN_PROGRESS`. Cada transición declara su rol y si exige comentario. El cliente envía la **acción**, nunca el estado. Un rechazo explica el motivo y el siguiente paso válido (409, 403 o 400). La misma tabla calcula `allowedActions`, así que la pantalla no repite reglas.
- **"Queda como estaba":** se valida antes de escribir, y la escritura es un `UpdateItem` **condicionado al estado esperado**: si dos analistas actúan a la vez, el segundo recibe 409. Estado, versión e historial se escriben en la misma operación atómica.
- **Criterios:** cada regla y todas las combinaciones inválidas en `request-workflow.test.ts`. Códigos, mensajes y la solicitud idéntica tras cada rechazo en `request-workflow.http.test.ts`.
- **Descartado:** `PATCH status` desde el cliente, que es justo lo que permitía el desorden del Excel.

## Problema 3: una filial puede ver lo de otra
- **Solución:** la filial sale **solo del token firmado**, nunca de la URL, el body ni los headers. El repositorio no tiene ningún método sin `tenantId`, y todas las llaves empiezan por la filial. Una solicitud ajena es inalcanzable por construcción y responde un **404 idéntico** al de una inexistente. El cursor solo lleva el número: la partición se reconstruye desde el token.
- **Criterios:** `tenant-isolation.test.ts` prueba listar, leer y modificar lo ajeno, compara el 404 con el de una inexistente, y cubre header ignorado, token alterado y sin token. `repository.contract.test.ts` corre la misma batería contra memoria y contra DynamoDB real en CI.
- **Descartado:** una tabla por filial (operación y migraciones multiplicadas) y filtrar en memoria después de leer (un descuido expone datos).

## Identidad
Login local con usuario y contraseña (scrypt, comparación en tiempo constante y el mismo 401 para usuario inexistente o contraseña errada). Tras 5 fallos en 15 minutos responde 429. El servidor deduce la filial y firma un JWT. En AWS, Cognito con `tenantId` inmutable, validado por JWKS: el código de negocio es el mismo.

## Mejoras vistas, no construidas
- **Analista multi-filial:** hoy tiene un token por filial. Lo real es una lista de filiales en el token y elegir la activa.
- **Concurrencia por versión:** condicionar también por `version` (`If-Match`) cubre el caso ABA (rechazo y nueva resolución entre leer y confirmar).
- **Negocio:** notificar a la filial al resolver, SLA por etapa y cierre automático si no confirma (regla por acordar).
- **Escala:** el contador limita a unas 1.000 creaciones por segundo por filial (si hiciera falta, ULID). El historial vive en el ítem (límite de 400 KB): si creciera, iría a ítems `HIST#`. Los GSI son eventualmente consistentes: el filtro puede tardar milisegundos en reflejar un cambio.
