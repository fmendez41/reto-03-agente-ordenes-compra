import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { ubicar } from "../src/core/rutas.ts"
import type { Ubicacion } from "../src/core/types.ts"

export const RAIZ = path.resolve(import.meta.dir, "..")

export function copiaFixtures(): { ubicacion: Ubicacion; limpiar: () => void } {
  const directory = mkdtempSync(path.join(tmpdir(), "oc-"))
  const fixturesDir = path.join(directory, "fixtures", "reto-03")
  cpSync(path.join(RAIZ, "fixtures", "reto-03"), fixturesDir, { recursive: true })
  const outDir = path.join(directory, "out")
  mkdirSync(outDir, { recursive: true })
  return {
    ubicacion: ubicar(directory, { fixturesDir, outDir }),
    limpiar: () => rmSync(directory, { recursive: true, force: true }),
  }
}

export function escribir(ubicacion: Ubicacion, relativo: string, contenido: string): void {
  const destino = path.join(ubicacion.fixturesDir, relativo)
  mkdirSync(path.dirname(destino), { recursive: true })
  writeFileSync(destino, contenido, "utf8")
}

export function leerJson<T>(archivo: string): T {
  return JSON.parse(readFileSync(archivo, "utf8")) as T
}
