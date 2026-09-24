# Módulo de órdenes de compra

Carpeta lista para copiarse a otra plataforma de agentes. No depende del servidor, del ciclo ni del proveedor de este repositorio.

```
modulo/
├── agent.md                         # system prompt
├── tools/oc.ts                      # herramientas importables
├── skill/ordenes-compra/SKILL.md    # conocimiento del proceso
└── core/                            # reglas, payload, evidencia y SAP simulado
```

## Uso

```bash
bun install
```

```ts
import { leer_paquete, validar, construir_payload, generar_evidencia, crear } from "./tools/oc.ts"

const resultado = await leer_paquete.execute(
  { caso: "sol-001" },
  { directory: "/ruta/del/anfitrion", sessionId: "sesion-1" },
)
```

`directory` es la raíz de datos del anfitrión. Las solicitudes se leen de `fixtures/reto-03/solicitudes/<caso>/`. La salida (órdenes, evidencia, control) se escribe en `out/` dentro de esa misma raíz.

`agent.md` fija el comportamiento y `skill/ordenes-compra/SKILL.md` el conocimiento del proceso. Las reglas RC1–RC10 y los montos viven en el código de `core/`: el prompt no los recalcula.

Dependencias: `zod` y `pdf-lib`, declaradas en `package.json`.
