import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { resolverCaso, resolverSalida } from "./rutas.ts"
import type { Ubicacion } from "./types.ts"

export function contenidoCanonico(aprobacion: {
  de: string
  para: string
  fecha: string
  asunto: string
  cuerpo: string
}): string {
  const linea = (valor: string) => valor.replace(/[ \t]+$/gm, "")
  return [
    `de: ${linea(aprobacion.de)}`,
    `para: ${linea(aprobacion.para)}`,
    `fecha: ${linea(aprobacion.fecha)}`,
    `asunto: ${linea(aprobacion.asunto)}`,
    "",
    linea(aprobacion.cuerpo).trimEnd(),
  ].join("\n")
}

export function sha256Texto(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex")
}

export function evidenciaDeCaso(
  ubicacion: Ubicacion,
  caso: string,
): { ok: true; canonico: string; sha256: string } | { ok: false; error: string } {
  const resuelto = resolverCaso(ubicacion, caso)
  if (!resuelto.ok) return resuelto
  const archivo = path.join(resuelto.dir, "aprobacion.json")
  let crudo: unknown
  try {
    crudo = JSON.parse(readFileSync(archivo, "utf8")) as unknown
  } catch {
    return { ok: false, error: "No hay aprobación legible para armar la evidencia." }
  }
  if (!crudo || typeof crudo !== "object") {
    return { ok: false, error: "La aprobación no tiene el formato esperado." }
  }
  const registro = crudo as Record<string, unknown>
  for (const campo of ["de", "para", "fecha", "asunto", "cuerpo"] as const) {
    if (typeof registro[campo] !== "string") {
      return { ok: false, error: `La aprobación no trae el campo ${campo}.` }
    }
  }
  const canonico = contenidoCanonico({
    de: registro.de as string,
    para: registro.para as string,
    fecha: registro.fecha as string,
    asunto: registro.asunto as string,
    cuerpo: registro.cuerpo as string,
  })
  return { ok: true, canonico, sha256: sha256Texto(canonico) }
}

export function escribirEvidenciaTxt(
  ubicacion: Ubicacion,
  caso: string,
): { ok: true; ruta: string; sha256: string } | { ok: false; error: string } {
  const evidencia = evidenciaDeCaso(ubicacion, caso)
  if (!evidencia.ok) return evidencia
  const destino = resolverSalida(ubicacion, caso, "aprobacion.txt")
  if (!destino.ok) return destino
  mkdirSync(destino.dir, { recursive: true })
  const cuerpo = `${evidencia.canonico}\n\nsha256: ${evidencia.sha256}\n`
  writeFileSync(destino.archivo, cuerpo, "utf8")
  return { ok: true, ruta: destino.archivo, sha256: evidencia.sha256 }
}
