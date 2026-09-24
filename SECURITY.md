# Seguridad del agente de órdenes de compra

Este documento describe controles que están en el código y escenarios que se probaron en el workspace local. No afirma que el sistema sea seguro en todos los contextos.

## Modelo de amenazas

El proceso convierte solicitudes ficticias en órdenes de un SAP simulado. El daño relevante es crear una orden que los documentos no autorizan, filtrar `LLM_API_KEY` o agotar el cupo del proveedor.

`LLM_API_KEY` es un secreto crítico. No puede aparecer en el repositorio, el frontend, los logs, la documentación ni el historial. `APP_ACCESS_TOKEN` es la contraseña compartida de la demo: se entrega a los evaluadores a propósito, se revoca al cerrar la defensa y no abre sistemas externos.

```text
Navegador --Bearer--> API --turno--> agente --herramientas allowlist--> fixtures (lectura)
                                      |                          \--> out/ (escritura)
                                      \--> proveedor LLM
```

Caminos que se revisaron:

- Llamar a la API sin token, con token ajeno o con el token en la URL.
- Elegir el `sessionId` de otra conversación o inventarlo.
- Confirmar con `confirmado: true`, con un `actionId` de otra sesión, caducado, repetido o con el payload cambiado.
- Pedirle al modelo que ignore las reglas o que lea secretos.
- Pedir `../`, archivos ocultos, `fixtures/` y `out/` por HTTP.
- Dejar `ordenes.jsonl` con una última línea a medias.
- Seguir un enlace de directorio que sale de `out/`.
- Mandar muchas peticiones o un cuerpo enorme.

Actores: analista con el token, visitante sin token, y el propio modelo si sigue un texto hostil del correo, de la cotización o del usuario. El proveedor LLM se trata como no confiable.

## Principios

- El servidor decide si se crea la orden. El modelo y el front solo proponen.
- Las herramientas permitidas son cinco. Los argumentos pasan por un esquema estricto.
- Los montos salen de los archivos y de los maestros, no del texto del modelo.
- Los secretos no se escriben en logs ni en errores. La redacción usa el valor real, no solo el prefijo `sk-`.
- Si un control falla, no se escribe la orden. La sesión sigue viva cuando el fallo es del proveedor o del cupo.

## Controles implementados

- `APP_ACCESS_TOKEN` en `Authorization: Bearer`, comparación con SHA-256 y `timingSafeEqual`. Un encabezado duplicado no autentica. En `NODE_ENV=production`, sin token la API responde 401. `/api/health` sigue público y solo devuelve `ok`, `provider` y `model`, como pide el PRD.
- Un `sessionId` que el cliente inventa no se adopta. Solo se reanuda una sesión que el servidor ya creó. El identificador es un UUID. La sesión caduca (`SESSION_TTL_MS`, 24 h) y hay un tope de sesiones.
- La confirmación guarda caso, sesión, turno, códigos de excepción y hash canónico del payload (con `confirmado_por` en null). Sirve una vez, solo en el turno siguiente, y caduca. Dos chats de la misma sesión no corren a la vez.
- Cupos: tamaño de mensaje, tamaño del JSON, peticiones por ventana, concurrencia hacia el modelo, iteraciones, tokens por sesión y rotación de `log.jsonl`.
- Encabezados: `Content-Security-Policy` con scripts solo del propio origen y `frame-ancestors 'none'`. Los estilos permiten `'unsafe-inline'` porque la barra del panorama usa un atributo `style` para el ancho. `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`. `Strict-Transport-Security` solo si la petición llega como HTTPS. `Cache-Control: no-store` en la API.
- El markdown del chat se dibuja como nodos de texto. No hay `dangerouslySetInnerHTML`.
- Las rutas de caso y de salida se resuelven y se comprueba el destino real, incluidos enlaces que salen de la raíz. `fixtures/` no se escribe. HTTP no sirve `fixtures/`, `out/`, código ni archivos ocultos. Una ruta con extensión que no existe responde 404, no el HTML de la aplicación.
- `ordenes.jsonl` ignora una última línea incompleta. Una línea corrupta en medio aborta la lectura. Confirmaciones, sesiones y el índice de control se publican con rename.
- El CSV escapa fórmulas y comillas, y quita caracteres de control.

## Limitaciones conocidas

- La demostración usa una credencial compartida entregada a los evaluadores. No proporciona identidad individual ni aislamiento entre usuarios. Se acepta porque el entorno contiene datos ficticios, no se conecta a SAP real y cuenta con límites de consumo. Para producción se requerirían autenticación individual, autorización por rol y auditoría por usuario. Quien tiene esa credencial y conoce un UUID de sesión puede leer esa conversación. El UUID no se enumera en la práctica.
- El candado de idempotencia vive en memoria del proceso. Dos procesos sobre el mismo `out/` pueden asignar el mismo número de OC. Render, en un solo contenedor, no llega a ese caso. Varias instancias sí.
- `out/` en el plan gratuito se pierde al reiniciar. Eso borra sesiones, confirmaciones y órdenes simuladas. Los fixtures siguen siendo la fuente.
- `GET /api/sessions/:id` devuelve el historial que el PRD pide, incluido el mensaje de sistema. El prompt también está en el repositorio.
- El token entra una vez por `?token=` para poder abrir el enlace de la demo. La página lo retira de la barra y lo deja en `sessionStorage`. Quien copió la URL antes de eso, o el historial del navegador de esa primera carga, pudo verlo.
- Publicar `APP_ACCESS_TOKEN` en el README es una decisión de producto para la evaluación, de riesgo bajo. El PRD pide entregar la clave de acceso si el enlace está protegido. No es CWE-798: no otorga la clave del modelo, datos reales ni privilegios fuera de la demo. No es adecuado para producción.
- Vite 5 arrastra avisos en el servidor de desarrollo (`bun audit`: uno alto y tres moderados, en `esbuild` y en `server.fs` de Vite). El proceso que se despliega es Bun y no levanta Vite. No se subió Vite de major en esta auditoría.
- La comparación en tiempo constante reduce una fuga local. Por la red, el tiempo no alcanza para recuperar el token.

## Gestión de secretos

- `LLM_API_KEY` solo la lee el adaptador del servidor. No va al front, a los fixtures, a los logs, al README ni a este documento. En Render vive en una variable secreta (`sync: false`).
- `.env` está en `.gitignore`. `.env.example` deja `LLM_API_KEY` vacía.
- `APP_ACCESS_TOKEN` es la credencial compartida de la demo, no la clave del modelo. En `NODE_ENV=production` la API no arranca abierta si falta.

Mitigaciones de la demo:

- Clave del modelo exclusiva para el ejercicio, distinta del token de acceso.
- Límite de gasto en el proveedor.
- Rate limiting, concurrencia, tamaño de cuerpo y presupuesto de tokens.
- Token de demo revocable, publicado solo para los evaluadores.
- Revocación del token y de la clave del modelo después de la evaluación.
- Ausencia de datos y sistemas reales.
- No se versionan source maps (Vite no los genera en el build de producción).

## Respuesta ante un incidente (producción)

1. Revocar `LLM_API_KEY` en el proveedor y `APP_ACCESS_TOKEN` en Render. Generar ambos de nuevo.
2. Confirmar que el token nuevo no está en el repositorio, en capturas ni en un enlace compartido.
3. Revisar `out/log.jsonl` y `out/sap/ordenes.jsonl` por órdenes que no correspondan a un caso válido. En el simulado se pueden borrar. En SAP real habría que anularlas por el procedimiento de compras.
4. Conservar el `sessionId` y la hora de `log.jsonl` para reconstruir el intento. No pegar el token ni la clave en el ticket.
5. Si el sospechoso es un despliegue con más de un proceso, parar las instancias extra antes de seguir creando órdenes.

## Lista de despliegue

- [ ] `NODE_ENV=production`
- [ ] `APP_ACCESS_TOKEN` de la demo definido en Render con el mismo valor del README, y revocado al cerrar la defensa
- [ ] `LLM_API_KEY` solo en el panel del servicio, `sync: false`
- [ ] `LLM_FAKE` sin definir
- [ ] HTTPS en el proxy (Render termina TLS; HSTS se activa con `x-forwarded-proto: https`)
- [ ] Un solo proceso, o un lock externo si hay más de uno
- [ ] Disco persistente si las órdenes y la evidencia deben sobrevivir un reinicio
- [ ] Health check en `/api/health` y nada más público
- [ ] Topes `MAX_TOOL_ITERATIONS`, `MAX_SESSION_TOKENS`, `RATE_LIMIT_MAX`, `MAX_CONCURRENT_LLM` revisados
