import { mkdirSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"

/** Escribe el archivo completo y lo publica con rename, para no dejar un JSON a medias. */
export function escribirAtomico(ruta: string, contenido: string | Uint8Array): void {
  mkdirSync(path.dirname(ruta), { recursive: true })
  const temporal = `${ruta}.${process.pid}.tmp`
  writeFileSync(temporal, contenido)
  renameSync(temporal, ruta)
}
