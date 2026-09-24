import { readdirSync, rmSync } from "node:fs"
import path from "node:path"
import { procesarCaso } from "./src/core/flujo.ts"

const directory = path.resolve(import.meta.dir)
const outDir = process.env.DEMO_OUT_DIR
  ? path.resolve(directory, process.env.DEMO_OUT_DIR)
  : path.join(directory, "out")

limpiarSalida(outDir)

/**
 * El demo tiene que arrancar de cero para ser determinista, pero borrar out/ entero
 * se llevaba por delante las sesiones de chat y las confirmaciones pendientes de
 * quien estuviera usando la aplicación. Se borra todo lo que el demo produce y se
 * respeta el estado de la conversación. Con DEMO_OUT_DIR se aísla por completo.
 */
function limpiarSalida(dir: string): void {
  const conservar = new Set(["sessions", "confirmaciones.json"])
  let entradas: string[]
  try {
    entradas = readdirSync(dir)
  } catch {
    return
  }
  for (const entrada of entradas) {
    if (conservar.has(entrada)) continue
    rmSync(path.join(dir, entrada), { recursive: true, force: true })
  }
}

const casos = ["sol-001", "sol-002", "sol-003", "sol-004", "sol-005", "sol-006"]

for (const caso of casos) {
  const resumen = await procesarCaso(caso, { directory, outDir, confirmar: false, sessionId: "demo", turno: 1 })
  imprimir(resumen)
}

const repetida = await procesarCaso("sol-001", { directory, outDir, confirmar: false, sessionId: "demo", turno: 3 })
imprimir(repetida)

for (const caso of ["sol-004", "sol-005", "sol-006"]) {
  const resumen = await procesarCaso(caso, { directory, outDir, confirmar: true, sessionId: "demo", turno: 5 })
  imprimir(resumen)
}

function imprimir(resumen: Awaited<ReturnType<typeof procesarCaso>>): void {
  const oc = resumen.numero_oc
    ? `OC ${resumen.numero_oc}${resumen.idempotente ? " (idempotente)" : ""}`
    : `sin OC: ${resumen.motivo ?? resumen.estado}`
  console.log(
    `${resumen.caso} | ${resumen.estado} | apta=${resumen.apta} | retroactiva=${resumen.retroactiva} | bloqueos=${resumen.bloqueos.join(",") || "-"} | confirmaciones=${resumen.confirmaciones.join(",") || "-"} | ${oc}`,
  )
}
