import { existsSync, realpathSync } from "node:fs"
import path from "node:path"
import type { Ubicacion } from "./types.ts"

const CASO_VALIDO = /^sol-\d{3}$/

export function ubicar(
  directory: string,
  parcial?: { fixturesDir?: string; outDir?: string },
): Ubicacion {
  return {
    directory,
    fixturesDir: parcial?.fixturesDir ?? path.join(directory, "fixtures", "reto-03"),
    outDir: parcial?.outDir ?? path.join(directory, "out"),
  }
}

function contenidoLogico(base: string, destino: string): boolean {
  const relativo = path.relative(base, destino)
  return relativo.length > 0 && !relativo.startsWith("..") && !path.isAbsolute(relativo)
}

/**
 * Confina el destino a la raíz permitida. `startsWith` no basta: un hermano
 * `dist-otro` pasaría, y un enlace que salga de la raíz también.
 */
export function dentroDe(padre: string, candidato: string): boolean {
  const baseLogica = path.resolve(padre)
  const destino = path.resolve(candidato)
  if (!contenidoLogico(baseLogica, destino)) return false
  try {
    const base = existsSync(baseLogica) ? realpathSync(baseLogica) : baseLogica
    if (existsSync(destino)) return contenidoLogico(base, realpathSync(destino))
    const padreDestino = path.dirname(destino)
    if (!existsSync(padreDestino)) return true
    const realPadre = realpathSync(padreDestino)
    return contenidoLogico(base, path.join(realPadre, path.basename(destino)))
  } catch {
    return false
  }
}

export function resolverCaso(
  ubicacion: Ubicacion,
  caso: string,
): { ok: true; dir: string } | { ok: false; error: string } {
  if (!CASO_VALIDO.test(caso)) {
    return { ok: false, error: `El caso "${caso}" no es un identificador válido.` }
  }
  const dir = path.join(ubicacion.fixturesDir, "solicitudes", caso)
  if (!dentroDe(path.join(ubicacion.fixturesDir, "solicitudes"), dir)) {
    return { ok: false, error: "La ruta del caso sale de la carpeta de solicitudes." }
  }
  return { ok: true, dir }
}

export function resolverSalida(
  ubicacion: Ubicacion,
  caso: string,
  archivo: string,
): { ok: true; dir: string; archivo: string } | { ok: false; error: string } {
  const casoResuelto = resolverCaso(ubicacion, caso)
  if (!casoResuelto.ok) return casoResuelto
  if (archivo.includes("..") || path.isAbsolute(archivo) || archivo.includes("/") || archivo.includes("\\")) {
    return { ok: false, error: "El nombre de archivo de salida no es válido." }
  }
  const dir = path.join(ubicacion.outDir, caso)
  const destino = path.join(dir, archivo)
  if (!dentroDe(ubicacion.outDir, destino)) {
    return { ok: false, error: "La ruta de salida sale de out/." }
  }
  return { ok: true, dir, archivo: destino }
}
