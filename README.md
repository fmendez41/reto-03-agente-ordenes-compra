# Órdenes de compra

Agente conversacional que lee un paquete de compra, lo valida contra los maestros y crea la orden en un SAP simulado. Las reglas y los montos viven en TypeScript. El modelo solo conversa y coordina.

La interfaz es una bandeja de casos: el analista ve las seis solicitudes con su estado de control, entra a una y conversa con el agente sobre ese caso. Cada herramienta que usa el agente queda a la vista en lenguaje natural, y cuando una regla exige confirmación el analista ve los valores enfrentados antes de decidir.

## Arranque

```bash
bun install
cp .env.example .env
```

Completa `LLM_API_KEY` en `.env`. Luego:

```bash
bun run dev
```

`bun run dev` compila el front con Vite en modo watch y levanta el servidor. Abre `http://localhost:3000`. Si definiste `APP_ACCESS_TOKEN`, entra con `http://localhost:3000/?token=el-token`. Ese token no es la clave del modelo.

Para una compilación única, `bun run build` genera `web/dist` y `bun start` sirve esa carpeta.

## Interfaz

El front es React con Vite en `web/`. Vive aparte del núcleo: solo habla con el servidor por HTTP y no conoce las reglas.

- `web/src/componentes/Bandeja.tsx` lista los casos con filtro por estado y el motivo del bloqueo o de la confirmación.
- `web/src/componentes/Detalle.tsx` es la vista de un caso: conversación a un lado, controles RC y ficha de la orden al otro.
- `web/src/componentes/Herramienta.tsx` traduce cada llamada a herramienta a una tarjeta legible en vez de JSON crudo.
- `web/src/componentes/Confirmacion.tsx` enfrenta los valores en disputa, avisa cuándo vence la confirmación y bloquea el botón si ya caducó.
- `web/src/lib/formato.ts` concentra el formato de dinero, fechas, unidades y códigos de catálogo.

## Pruebas y demo

```bash
bun test
bun demo.ts
```

`bun test` no necesita clave. `demo.ts` limpia `out/`, recorre los seis casos, repite `sol-001` (idempotencia) y crea `sol-004`, `sol-005` y `sol-006` solo después de emitir y consumir una confirmación.

Las 45 pruebas cubren las diez reglas, los parsers, los límites de seguridad, el protocolo de confirmación, la construcción del payload, el recorrido completo, la frontera de módulos y la bandeja con su capa de formato.

## Variables

| Variable | Uso |
|---|---|
| `LLM_API_KEY` | Clave de OpenAI. Solo en el backend. |
| `LLM_MODEL` | Por defecto `gpt-4.1-mini`. |
| `LLM_TIMEOUT_MS` | Timeout del proveedor. |
| `MAX_TOOL_ITERATIONS` | Tope de iteraciones por turno. |
| `MAX_SESSION_TOKENS` | Tope aproximado por sesión. |
| `MAX_MESSAGE_CHARS` | Tamaño máximo del mensaje. |
| `APP_ACCESS_TOKEN` | Si existe, `POST /api/chat` exige `Authorization: Bearer`. |
| `PORT` | Puerto HTTP. Por defecto 3000. |

## API

- `POST /api/chat` con `{ sessionId, message, actionId? }` devuelve `{ reply, toolCalls, needsConfirmation, confirmacion }`. La confirmación incluye `vence_en` para que la interfaz avise antes de que caduque.
- `GET /api/casos` devuelve la bandeja: una fila por caso con estado, proveedor, valor, marca de retroactiva y número de orden si ya existe.
- `GET /api/casos/:caso` devuelve el detalle: paquete, evaluación de las diez reglas, orden propuesta y catálogos para traducir los códigos.
- `GET /api/casos/:caso/evidencia` devuelve el texto canónico de la aprobación y su SHA-256, reconstruido desde los fixtures. No sirve archivos de `out/`.
- `GET /api/sessions/:id` devuelve el historial de esa sesión.
- `GET /api/health` devuelve `{ ok, provider, model }` sin la clave.

## Despliegue

Hay `Dockerfile` y `render.yaml`. En Render, el servicio Docker usa el health check `/api/health`. La clave del modelo se carga como variable de entorno del servicio, nunca en la imagen. El token de acceso generado se entrega a quien vaya a probar el link, en la URL `/?token=...`.

## Fuera de alcance

`oc_leer_excel` no está implementado: los fixtures ya traen la solicitud en JSON. No hay conexión real a SAP, ni usuarios, ni recepción de mercancía.
