import { fechaCalendario, normalizarNit, parseMonto, sumarDias } from "./texto.ts"
import type { Cotizacion, Factura } from "./types.ts"

export function parsearCotizacion(texto: string): { ok: true; data: Cotizacion } | { ok: false; error: string } {
  const proveedor = texto.match(/^Proveedor:\s*(.+)$/m)?.[1]?.trim()
  const nitCrudo = texto.match(/^NIT:\s*(.+)$/m)?.[1]?.trim() ?? null
  const totalLinea = texto.match(/TOTAL\s*\(IVA incluido\):\s*(.+)$/im)?.[1]
  const moneda = totalLinea?.match(/[A-Z]{3}/)?.[0] ?? null
  const total = totalLinea ? parseMonto(totalLinea) : null
  const referencia = texto.match(/^COTIZACIÓN\s+(\S+)/m)?.[1] ?? null
  const fecha = texto.match(/^Fecha:\s*(\d{4}-\d{2}-\d{2})/m)?.[1] ?? null
  const dias = texto.match(/Validez de la oferta:\s*(\d+)\s*d[ií]as/i)?.[1]
  const encabezado = texto.match(/^\d+\.\s*(.+?)\s*\|/m)?.[1]?.trim() ?? null
  if (!proveedor || total === null || !moneda) {
    return { ok: false, error: "La cotización no trae proveedor, moneda o total legible." }
  }
  const validez = fecha && dias ? sumarDias(fecha, Number(dias)) : null
  return {
    ok: true,
    data: {
      proveedor,
      nit: nitCrudo ? normalizarNit(nitCrudo) : null,
      total,
      moneda,
      validez_hasta: validez,
      referencia: referencia ?? null,
      texto,
      encabezado_item: encabezado,
    },
  }
}

export function parsearFactura(texto: string): { ok: true; data: Factura } | { ok: false; error: string } {
  const numero = texto.match(/No\.\s*(\S+)/)?.[1] ?? null
  const fecha = fechaCalendario(texto.match(/Fecha de emisión:\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? "")
  const totalLinea = texto.match(/^TOTAL:\s*(.+)$/m)?.[1]
  const total = totalLinea ? parseMonto(totalLinea) : null
  if (!numero || !fecha || total === null) {
    return { ok: false, error: "La factura no trae número, fecha o total legible." }
  }
  return { ok: true, data: { numero, fecha, total } }
}
