import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { ResultadoControl, Ubicacion } from "./types.ts"

export type Intento = {
  caso: string
  sessionId: string
  turno: number
  solicitudId: string
  resultado: ResultadoControl | null
  numeroOc: string
  retroactiva: boolean
  bloqueos: string[]
  confirmaciones: string[]
  flushed: boolean
}

const INDICE = "control-claves.json"

export function intentoVacio(caso: string, sessionId: string, turno: number): Intento {
  return {
    caso,
    sessionId,
    turno,
    solicitudId: caso,
    resultado: null,
    numeroOc: "",
    retroactiva: false,
    bloqueos: [],
    confirmaciones: [],
    flushed: false,
  }
}

export function claveIntento(intento: Pick<Intento, "caso" | "sessionId" | "turno">): string {
  return `${intento.sessionId}:${intento.turno}:${intento.caso}`
}

export function celdaCsv(valor: string): string {
  let texto = valor
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`
  if (/[",\n]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`
  return texto
}

function indicePath(outDir: string): string {
  return path.join(outDir, INDICE)
}

function clavesEscritas(outDir: string): Set<string> {
  const archivo = indicePath(outDir)
  if (!existsSync(archivo)) return new Set()
  try {
    const lista = JSON.parse(readFileSync(archivo, "utf8")) as unknown
    if (!Array.isArray(lista)) return new Set()
    return new Set(lista.filter((item): item is string => typeof item === "string"))
  } catch {
    return new Set()
  }
}

export function flushIntento(ubicacion: Ubicacion, intento: Intento): void {
  const clave = claveIntento(intento)
  mkdirSync(ubicacion.outDir, { recursive: true })
  const claves = clavesEscritas(ubicacion.outDir)
  if (claves.has(clave) || intento.flushed) {
    intento.flushed = true
    return
  }
  const archivo = path.join(ubicacion.outDir, "control.csv")
  if (!existsSync(archivo)) {
    writeFileSync(
      archivo,
      "solicitud_id,resultado,numero_oc,retroactiva,bloqueos,confirmaciones,ts\n",
      "utf8",
    )
  }
  const fila = [
    celdaCsv(intento.solicitudId),
    celdaCsv(intento.resultado ?? "ERROR"),
    celdaCsv(intento.numeroOc),
    celdaCsv(intento.retroactiva ? "true" : "false"),
    celdaCsv(intento.bloqueos.join(";")),
    celdaCsv(intento.confirmaciones.join(";")),
    celdaCsv(new Date().toISOString()),
  ].join(",")
  appendFileSync(archivo, `${fila}\n`, "utf8")
  claves.add(clave)
  writeFileSync(indicePath(ubicacion.outDir), JSON.stringify([...claves], null, 2), "utf8")
  intento.flushed = true
}
