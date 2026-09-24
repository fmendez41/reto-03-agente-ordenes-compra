import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { z } from "zod"
import { parsearCotizacion, parsearFactura } from "./parsers.ts"
import { resolverCaso } from "./rutas.ts"
import { contieneAprobado } from "./texto.ts"
import type { Paquete, Solicitud, Ubicacion } from "./types.ts"

const solicitudSchema = z.object({
  solicitud_id: z.string(),
  solicitante: z.string(),
  proveedor_nombre: z.string(),
  proveedor_nit: z.string().optional(),
  descripcion: z.string(),
  centro_costo: z.string(),
  subarea: z.string(),
  cantidad: z.number(),
  valor_unitario: z.number(),
  valor_total: z.number(),
  moneda: z.string(),
  indicador_iva: z.string().optional(),
  condiciones_pago: z.string().optional(),
  fecha_solicitud: z.string(),
})

const correoSchema = z.object({
  id: z.string(),
  de: z.string(),
  asunto: z.string(),
  fecha: z.string(),
  cuerpo: z.string().optional(),
  adjuntos: z.array(z.string()).optional(),
})

const aprobacionSchema = z.object({
  de: z.string(),
  para: z.string(),
  fecha: z.string(),
  asunto: z.string(),
  cuerpo: z.string(),
})

const MAPA_ADJUNTOS: Record<string, string> = {
  "solicitud.xlsx": "solicitud",
  "cotizacion.pdf": "cotizacion",
  "aprobacion.eml": "aprobacion",
  "factura.pdf": "factura",
}

function leerTexto(archivo: string): string | null {
  if (!existsSync(archivo)) return null
  return readFileSync(archivo, "utf8")
}

export function leerPaquete(
  ubicacion: Ubicacion,
  caso: string,
): { ok: true; data: Paquete } | { ok: false; error: string } {
  const resuelto = resolverCaso(ubicacion, caso)
  if (!resuelto.ok) return resuelto
  const dir = resuelto.dir
  const ausentes: string[] = []

  const correoTexto = leerTexto(path.join(dir, "correo.json"))
  let adjuntos: string[] = []
  let correo: Paquete["correo"] = null
  if (correoTexto === null) {
    ausentes.push("correo")
  } else {
    let crudo: unknown
    try {
      crudo = JSON.parse(correoTexto) as unknown
    } catch {
      return { ok: false, error: "El correo está en JSON malformado. Pide al solicitante que reenvíe el mensaje." }
    }
    const parsed = correoSchema.safeParse(crudo)
    if (!parsed.success) {
      return { ok: false, error: "El correo no trae id, remitente, asunto o fecha." }
    }
    adjuntos = parsed.data.adjuntos ?? []
    correo = {
      id: parsed.data.id,
      de: parsed.data.de,
      asunto: parsed.data.asunto,
      fecha: parsed.data.fecha,
    }
  }

  const esperados = new Set(
    adjuntos.map((nombre) => MAPA_ADJUNTOS[nombre]).filter((nombre): nombre is string => Boolean(nombre)),
  )
  for (const pieza of ["solicitud", "cotizacion", "aprobacion"] as const) esperados.add(pieza)

  const solicitudTexto = leerTexto(path.join(dir, "solicitud.json"))
  let solicitud: Solicitud | null = null
  if (solicitudTexto === null) {
    if (esperados.has("solicitud")) ausentes.push("solicitud")
  } else {
    let crudo: unknown
    try {
      crudo = JSON.parse(solicitudTexto) as unknown
    } catch {
      return { ok: false, error: "La solicitud está en JSON malformado. Pide el Excel de nuevo." }
    }
    const parsed = solicitudSchema.safeParse(crudo)
    if (!parsed.success) {
      return { ok: false, error: "La solicitud trae un monto no numérico o le faltan campos obligatorios." }
    }
    solicitud = parsed.data
  }

  const cotizacionTexto = leerTexto(path.join(dir, "cotizacion.txt"))
  let cotizacion: Paquete["cotizacion"] = null
  if (cotizacionTexto === null) {
    if (esperados.has("cotizacion")) ausentes.push("cotizacion")
  } else {
    const parsed = parsearCotizacion(cotizacionTexto)
    if (!parsed.ok) return parsed
    cotizacion = parsed.data
  }

  const aprobacionTexto = leerTexto(path.join(dir, "aprobacion.json"))
  let aprobacion: Paquete["aprobacion"] = null
  if (aprobacionTexto === null) {
    if (esperados.has("aprobacion")) ausentes.push("aprobacion")
  } else {
    let crudo: unknown
    try {
      crudo = JSON.parse(aprobacionTexto) as unknown
    } catch {
      return { ok: false, error: "La aprobación está en JSON malformado. Pide el correo del líder de nuevo." }
    }
    const parsed = aprobacionSchema.safeParse(crudo)
    if (!parsed.success) {
      return { ok: false, error: "La aprobación no trae remitente, destinatario, fecha, asunto o cuerpo." }
    }
    aprobacion = {
      de: parsed.data.de,
      para: parsed.data.para,
      fecha: parsed.data.fecha,
      asunto: parsed.data.asunto,
      aprobado: contieneAprobado(parsed.data.cuerpo),
      texto: parsed.data.cuerpo,
    }
  }

  const facturaTexto = leerTexto(path.join(dir, "factura.txt"))
  let factura: Paquete["factura"] = null
  if (facturaTexto === null) {
    if (esperados.has("factura")) ausentes.push("factura")
  } else {
    const parsed = parsearFactura(facturaTexto)
    if (!parsed.ok) return parsed
    factura = parsed.data
  }

  return { ok: true, data: { correo, solicitud, cotizacion, aprobacion, factura, ausentes } }
}
