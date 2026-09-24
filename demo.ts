import { rmSync } from "node:fs"
import path from "node:path"
import { procesarCaso } from "./src/core/flujo.ts"

const directory = path.resolve(import.meta.dir)
const outDir = path.join(directory, "out")
rmSync(outDir, { recursive: true, force: true })

const casos = ["sol-001", "sol-002", "sol-003", "sol-004", "sol-005", "sol-006"]

for (const caso of casos) {
  const resumen = await procesarCaso(caso, { directory, confirmar: false, sessionId: "demo", turno: 1 })
  imprimir(resumen)
}

const repetida = await procesarCaso("sol-001", { directory, confirmar: false, sessionId: "demo", turno: 3 })
imprimir(repetida)

for (const caso of ["sol-004", "sol-005", "sol-006"]) {
  const resumen = await procesarCaso(caso, { directory, confirmar: true, sessionId: "demo", turno: 5 })
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
