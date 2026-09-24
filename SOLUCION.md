# Solución — reto 03

## 1. Problema

La analista administrativa digita a mano cada orden de compra a partir de un correo, una cotización y una aprobación, y nadie mide cuántas órdenes nacen después de la factura. Le duele a ella el tiempo y el error de digitación, a auditoría la evidencia, y a dirección la falta de medición.

## 2. Arquitectura

El navegador habla con un solo proceso Bun (`src/server.ts`) que sirve `web/dist` y la API. El ciclo del agente está en `src/agent/loop.ts`. El comportamiento vive en `agent/prompt.md`, el conocimiento en `src/knowledge/ordenes-compra.md` y la ejecución en `src/core/`. El servidor no contiene las reglas RC1–RC10.

La interfaz es React con Vite en `web/`, compilada a `web/dist`. Es una capa de presentación: no repite ninguna regla, solo consume `GET /api/casos`, `GET /api/casos/:caso` y `POST /api/chat`. El servidor deriva la bandeja y el detalle de `resumenCasos` y `detalleCaso` en `src/core/flujo.ts`, de modo que la pantalla y el agente leen la misma verdad.

`modulo/tools/oc.ts` reexporta `src/core/tools/oc.ts`. No importa el servidor, el ciclo ni el proveedor. Una prueba recorre ese grafo y otra compara el cuerpo del prompt y del conocimiento con las copias del módulo.

## 3. Ciclo del agente

Cada turno arma el historial, llama al adaptador y, si hay tool calls, valida los argumentos con zod, ejecuta la herramienta y devuelve el JSON al modelo. El tope es `MAX_TOOL_ITERATIONS` (25). Al llegar, el agente resume lo obtenido y lo que falta, sin otra llamada al modelo.

La confirmación no la decide el modelo. Si la validación queda en `PENDIENTE_CONFIRMACION`, el core crea una acción con `actionId`, caso, hash del payload, códigos, sesión y turno. El botón envía ese `actionId`. El servidor comprueba sesión, estado pendiente, caducidad de 15 minutos, turno inmediatamente siguiente y hash recalculado. Solo entonces inyecta la acción en el contexto. `oc_crear` vuelve a comprobarla y, además, rechaza un payload que no coincida con el recalculado. El argumento `confirmado` no autoriza nada.

`out/control.csv` lo escribe `flushIntento` una vez por `(sesión, turno, caso)` al cerrar el turno, no cada herramienta. Resultados: `CREADA`, `IDEMPOTENTE`, `BLOQUEADA`, `PENDIENTE_CONFIRMACION`, `ERROR`.

## 4. Elección del modelo

Un solo proveedor: OpenAI, modelo `gpt-4.1-mini`, por tool calling estable y costo bajo. La interfaz `LlmAdapter` está en `src/llm/adapter.ts` y la implementación en `src/llm/openai.ts`. Cambiar de proveedor es otro archivo que implemente `enviar`; el ciclo no se toca.

Estimación por caso feliz, no una medición de factura: del orden de 8.000 tokens de entrada y 1.000 de salida. Con precios públicos aproximados de 0,40 USD y 1,60 USD por millón, un caso queda cerca de 0,005 USD. El tope de iteraciones y el de tokens por sesión limitan el gasto si el link es público.

## 5. Matriz de controles

| Regla | Implementación | Dificultad |
|---|---|---|
| RC1 | NIT normalizado; si no hay NIT, nombre sin sufijo societario. Cero o varios candidatos, o inactivo, bloquean. | El nombre: `S.A.S.` queda como tres letras y hay que quitar el sufijo como frase. |
| RC2 | Existe aprobación, contiene "aprobado" y el remitente está en el centro. | Distinguir "no es de este centro" de "no hay centro". |
| RC3 | Solo si RC2 halló aprobador. Si no, `no_evaluable`, sin segundo bloqueo. | No marcarla como cumplida en `sol-003`. |
| RC4 | La subárea pertenece al centro. | Directa. |
| RC5 | Diferencia absoluta sobre el total de la solicitud, umbral 2 %. Sin cotización, confirmación. | Leer el total del texto, no del modelo. |
| RC6 | Sin IVA se deriva el default del proveedor y se pide confirmación. | Va junto con el payload, no como un parche posterior. |
| RC7 | Sin condiciones se deriva y solo se informa. | No mezclarla con las confirmaciones. |
| RC8 | Factura con fecha anterior a la solicitud: `retroactiva` y confirmación. | La marca vive en el log, no en una política inventada. |
| RC9 | Fecha de aprobación anterior a la solicitud: confirmación. | Comparar el día calendario, no la hora. |
| RC10 | Cantidad por valor unitario contra el total, tolerancia de 1. | Directa. |

`apta` es `bloqueos.length === 0`. El estado separado es `BLOQUEADA`, `PENDIENTE_CONFIRMACION` o `LISTA_PARA_CREAR`.

La más difícil fue RC1 junto con RC3: un aprobador de otro centro no puede "aprobar" el tope, y un nombre societario no puede empatar dos proveedores en silencio.

## 6. Adaptador SAP real

Elegiría OData `API_PURCHASEORDER_PROCESS_SRV` cuando la viabilidad se confirme, porque es HTTP, encaja con el adaptador que ya existe y no exige la pila RFC en el mismo proceso del agente. El mapeo: `PurchaseOrder` con `CompanyCode` y `PurchasingOrganization` 1000, `Supplier` desde `codigo_sap`, `DocumentCurrency` y `PaymentTerms` desde el payload, y cada posición como `PurchaseOrderItem` 10, 20… con `PurchaseOrderItemText` (40 caracteres), `OrderQuantity`, `OrderPriceUnit` (`UN`/`H`/`MES` hacia la unidad SAP acordada), `NetPriceAmount`, `AccountAssignmentCategory` de centro de costo y el indicador de IVA en el tax code. La evidencia viaja como anexo del business object, con el sha256 del contenido canónico guardado también en un campo de texto para poder compararlo.

Las credenciales viven en el almacén del entorno de integración (no en el agente, no en el prompt, no en el repositorio). La idempotencia usa la referencia de la solicitud: antes de crear se busca; si SAP responde a medias, no se reintenta a ciegas, se consulta por esa referencia y el error queda en el log de control.

Si la conexión no es viable, el mismo payload ya validado se exporta como archivo de carga o como ficha lista para pegar. La analista deja de digitar y de validar de memoria aunque SAP siga siendo manual.

## 7. Lectura para dirección

En los fixtures hay un caso retroactivo de seis. Es un caso de prueba, no una medición del proceso real, y no sirve para afirmar un porcentaje de la operación. Lo que ya queda instalado es la columna `retroactiva` en `out/control.csv`, así que se puede medir sobre el volumen real durante unas semanas. El cambio de proceso que propondría: la orden nace con la cotización y la aprobación, antes de que llegue la factura. Tolerar o rechazar las retroactivas sigue siendo decisión de dirección; el agente las marca y no las prohíbe.

## 8. Decisiones

1. Las reglas y los montos están en TypeScript, no en el modelo. La alternativa era pedirle al modelo que extrajera totales y aplicara los controles. Se descartó porque un modelo puede "cuadrar" un monto para que la cotización coincida, y el proceso mueve dinero.
2. Un solo adaptador de OpenAI, detrás de `LlmAdapter`. La alternativa era un cliente compatible con varios proveedores a la vez. Se descartó porque las diferencias de tool calling no aportan nada evaluable y sí consumen el tiempo del P0.
3. SAP simulado en archivos, con la interfaz `SapAdapter` reemplazable, más el diseño OData y el plan B de archivo de carga. La alternativa era prometer una conexión que el enunciado dice que no está confirmada.
4. Confirmación con `actionId` y hash, verificada por el servidor. La alternativa era confiar en `confirmado: true` dicho por el modelo. Se descartó porque el modelo no puede autorizar una compra.
5. El despliegue va antes que el bonus. La alternativa era cerrar PDF y módulo primero. El enunciado penaliza la falta de link.
6. La pantalla es una bandeja de casos, no un chat suelto. La analista trabaja sobre una cola de solicitudes, así que abre viendo las seis con su estado y entra a la que le interesa. Un chat sin contexto la obliga a recordar los identificadores y no le dice qué falta por hacer.
7. Las llamadas a herramienta se muestran traducidas, no como JSON. Antes el turno devolvía el resultado recortado a 500 caracteres y la pantalla lo imprimía crudo: la analista no podía leer lo que el agente había hecho. Ahora cada llamada lleva un título, una frase en lenguaje natural y los datos completos, que la interfaz dibuja como ficha. El recorte quedó solo en `out/log.jsonl`.
8. Los montos de los mensajes de control salen formateados (`$ 25.000.000`, no `25000000`). El texto de la regla lo lee tanto la analista como el modelo, así que el formato vive en `formatoMonto` dentro del core, no en el front.

## 9. Supuestos

- Los maestros del fixture están completos. En producción se consultarían en SAP.
- El correo con la palabra "Aprobado" es evidencia suficiente para este reto. Auditoría puede exigir firma.
- El NIT se compara sin puntos ni dígito de verificación. Si el NIT viene en la solicitud, no se hace fallback por nombre.
- La unidad se decide por el encabezado del ítem de la cotización, no por cualquier mención a "meses" en la descripción. Si no hay cotización, se usa la descripción.
- La descripción se corta en el último espacio antes de 40 caracteres si el resultado conserva al menos 24; si no, se corta en seco. No se agregan puntos suspensivos.
- La confirmación caduca a los 15 minutos.
- El sha256 es del texto canónico de la aprobación, no de los bytes del PDF. El PDF y el txt declaran ese mismo hash.
- La sección 0 del enunciado dice que se aprueba con 70/100 según la rúbrica de la sección 10, pero la sección 10 trae riesgos y supuestos, no la rúbrica. No asumo criterios de calificación que el documento no contiene.
- `oc_leer_excel` queda fuera: los fixtures ya traen JSON.

## 10. Cobertura

| Historia | Estado | Qué falta para producción |
|---|---|---|
| HU-1 Leer el paquete | Hecho | Lector de Excel y PDF binarios reales. |
| HU-2 Validar | Hecho | Maestros en vivo y política firmada sobre retroactivas. |
| HU-3 Payload y trazabilidad | Hecho | Mapeo OData y anexos reales. |
| HU-4 Evidencia | Hecho (txt y pdf) | Custodia del archivo y firma si auditoría la exige. |
| HU-5 Crear, idempotencia y control | Hecho en el simulado | El adaptador real y el manejo de error parcial de SAP. |
| HU-6 Errores legibles | Hecho | Integración con el buzón para pedir el dato al solicitante. |
| Chat, tool calls y confirmación | Hecho | Identidad de la analista. El reto la declara no-objetivo. |
| Bandeja, detalle del caso y confirmación con valores enfrentados | Hecho | Paginación y búsqueda cuando sean cientos de casos, y recarga en vivo si dos analistas trabajan a la vez. |
| `oc_leer_excel` | No hecho | Solo si el canal real sigue siendo xlsx. |

## 11. Uso de IA

Construí esta solución con Cursor, modelo Grok 4.7, como asistente de implementación. Le pedí el esqueleto del dominio, las pruebas de las reglas y el ciclo del agente a partir del enunciado y de correcciones mías sobre confirmación, pruebas, frontera del módulo y prioridad del despliegue.

Descarté tres propuestas del asistente: tratar `apta: true` como permiso para crear; marcar RC3 como un segundo bloqueo en `sol-003`; y un adaptador "compatible" con varios proveedores sin probar cada uno. También descarté afirmar un porcentaje de órdenes retroactivas a partir de los fixtures.

## 12. Riesgos

- El modelo puede intentar autorizar o corregir un monto. Mitigación: el payload se recalcula y la confirmación la emite el servidor.
- Una cotización puede traer instrucciones incrustadas. Mitigación: ese texto es dato; crear exige la validación y, si aplica, el `actionId`.
- La analista puede confirmar sin leer. Mitigación: el bloque de confirmación enfrenta los dos valores en disputa, avisa si la orden va a quedar marcada como retroactiva, muestra cuánto le queda de vigencia y deshabilita el botón al caducar. El hash ata la confirmación al payload de ese momento.
- Un link público puede gastar la clave. Mitigación: topes de iteración, de tokens y de tamaño, y `APP_ACCESS_TOKEN`.
- SAP puede no estar disponible. Mitigación: el plan B de la sección 6, sin bloquear el ahorro de digitación.
- El CSV de control puede abrirse en una hoja de cálculo. Mitigación: se escapan celdas que empiezan por `=`, `+`, `-` o `@`.
