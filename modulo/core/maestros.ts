import { readFileSync } from "node:fs"
import path from "node:path"
import { z } from "zod"
import type { Maestros, Ubicacion } from "./types.ts"

const proveedorSchema = z.object({
  codigo_sap: z.string(),
  nit: z.string(),
  nombre: z.string(),
  condiciones_pago_default: z.string(),
  indicador_iva_default: z.string(),
  activo: z.boolean(),
})

const centroSchema = z.object({
  centro_costo: z.string(),
  nombre: z.string().optional(),
  subareas: z.array(z.string()),
  aprobadores: z.array(
    z.object({
      email: z.string(),
      nombre: z.string().optional(),
      tope: z.number(),
    }),
  ),
})

const indicadorSchema = z.object({
  codigo: z.string(),
  descripcion: z.string(),
  tasa: z.number(),
})

const condicionSchema = z.object({
  codigo: z.string(),
  descripcion: z.string(),
  dias: z.number(),
})

function leerJson(archivo: string): unknown {
  const texto = readFileSync(archivo, "utf8")
  return JSON.parse(texto) as unknown
}

export function cargarMaestros(ubicacion: Ubicacion): { ok: true; data: Maestros } | { ok: false; error: string } {
  const dir = path.join(ubicacion.fixturesDir, "maestros")
  try {
    const proveedores = z.array(proveedorSchema).parse(leerJson(path.join(dir, "proveedores.json")))
    const centros = z.array(centroSchema).parse(leerJson(path.join(dir, "centros-costo.json")))
    const indicadores = z.array(indicadorSchema).parse(leerJson(path.join(dir, "indicadores-iva.json")))
    const condiciones = z.array(condicionSchema).parse(leerJson(path.join(dir, "condiciones-pago.json")))
    return { ok: true, data: { proveedores, centros, indicadores, condiciones } }
  } catch {
    return { ok: false, error: "No pude leer los maestros. Revisa que los JSON estén bien formados." }
  }
}
