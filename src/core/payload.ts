import { createHash } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { z } from "zod"
import { evidenciaDeCaso } from "./evidencia.ts"
import { truncarDescripcion } from "./unidad.ts"
import type { OrdenCompra, Paquete, TrazaCampo, Ubicacion, Validacion } from "./types.ts"

export const ordenCompraSchema = z.object({
  referencia: z.object({
    solicitud_id: z.string(),
    correo_id: z.string(),
    cotizacion_ref: z.string().nullable(),
  }),
  sociedad: z.literal("1000"),
  organizacion_compras: z.literal("1000"),
  proveedor: z.object({
    codigo_sap: z.string(),
    nit: z.string(),
    nombre: z.string(),
  }),
  moneda: z.enum(["COP", "USD"]),
  condiciones_pago: z.string(),
  aprobador: z.object({
    email: z.string(),
    fecha_aprobacion: z.string(),
    evidencia_sha256: z.string(),
  }),
  posiciones: z
    .array(
      z.object({
        numero: z.number(),
        descripcion: z.string().max(40),
        cantidad: z.number(),
        unidad: z.enum(["UN", "H", "MES"]),
        precio_unitario: z.number(),
        centro_costo: z.string(),
        subarea: z.string(),
        indicador_iva: z.string(),
      }),
    )
    .min(1),
  excepciones: z.array(
    z.object({
      codigo: z.string(),
      detalle: z.string(),
      confirmado_por: z.string().nullable(),
    }),
  ),
})

function canonico(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(",")}]`
  if (valor && typeof valor === "object") {
    const entradas = Object.entries(valor as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
    return `{${entradas.map(([clave, item]) => `${JSON.stringify(clave)}:${canonico(item)}`).join(",")}}`
  }
  return JSON.stringify(valor)
}

export function hashPayload(orden: OrdenCompra): string {
  const copia: OrdenCompra = {
    ...orden,
    excepciones: orden.excepciones.map((item) => ({ ...item, confirmado_por: null })),
  }
  return createHash("sha256").update(canonico(copia), "utf8").digest("hex")
}

export function construirOrden(
  ubicacion: Ubicacion,
  caso: string,
  paquete: Paquete,
  validacion: Validacion,
  confirmadoPor: string | null,
): { ok: true; data: { orden: OrdenCompra; trazas: TrazaCampo[] } } | { ok: false; error: string } {
  const solicitud = paquete.solicitud
  const proveedor = validacion.derivados.proveedor
  const iva = validacion.derivados.indicador_iva
  const condiciones = validacion.derivados.condiciones_pago
  const unidad = validacion.derivados.unidad
  if (!solicitud || !proveedor || !iva || !condiciones || !unidad || !paquete.aprobacion || !paquete.correo) {
    return { ok: false, error: "Faltan datos derivados o la aprobación para armar la OC." }
  }
  if (solicitud.moneda !== "COP" && solicitud.moneda !== "USD") {
    return { ok: false, error: `La moneda ${solicitud.moneda} no está soportada.` }
  }
  const evidencia = evidenciaDeCaso(ubicacion, caso)
  if (!evidencia.ok) return evidencia
  const descripcion = truncarDescripcion(solicitud.descripcion)
  const excepciones = validacion.confirmaciones.map((item) => ({
    codigo: item.regla,
    detalle: item.detalle,
    confirmado_por: confirmadoPor,
  }))
  const orden: OrdenCompra = {
    referencia: {
      solicitud_id: solicitud.solicitud_id,
      correo_id: paquete.correo.id,
      cotizacion_ref: paquete.cotizacion?.referencia ?? null,
    },
    sociedad: "1000",
    organizacion_compras: "1000",
    proveedor,
    moneda: solicitud.moneda,
    condiciones_pago: condiciones.valor,
    aprobador: {
      email: paquete.aprobacion.de,
      fecha_aprobacion: paquete.aprobacion.fecha,
      evidencia_sha256: evidencia.sha256,
    },
    posiciones: [
      {
        numero: 10,
        descripcion: descripcion.valor,
        cantidad: solicitud.cantidad,
        unidad: unidad.valor,
        precio_unitario: solicitud.valor_unitario,
        centro_costo: solicitud.centro_costo,
        subarea: solicitud.subarea,
        indicador_iva: iva.valor,
      },
    ],
    excepciones,
  }
  const parsed = ordenCompraSchema.safeParse(orden)
  if (!parsed.success) {
    return { ok: false, error: "El payload no cumple el esquema de la orden de compra." }
  }
  const trazas: TrazaCampo[] = [
    { campo: "referencia.solicitud_id", valor: solicitud.solicitud_id, fuente: "solicitud" },
    { campo: "referencia.correo_id", valor: paquete.correo.id, fuente: "solicitud" },
    {
      campo: "referencia.cotizacion_ref",
      valor: paquete.cotizacion?.referencia ?? null,
      fuente: paquete.cotizacion ? "cotizacion" : "derivado",
    },
    { campo: "sociedad", valor: "1000", fuente: "derivado" },
    { campo: "organizacion_compras", valor: "1000", fuente: "derivado" },
    { campo: "proveedor", valor: proveedor, fuente: "maestro.proveedores" },
    { campo: "moneda", valor: solicitud.moneda, fuente: "solicitud" },
    { campo: "condiciones_pago", valor: condiciones.valor, fuente: condiciones.fuente },
    { campo: "aprobador.email", valor: paquete.aprobacion.de, fuente: "solicitud" },
    { campo: "aprobador.fecha_aprobacion", valor: paquete.aprobacion.fecha, fuente: "solicitud" },
    { campo: "aprobador.evidencia_sha256", valor: evidencia.sha256, fuente: "derivado" },
    {
      campo: "posiciones[0].descripcion",
      valor: descripcion.valor,
      fuente: "solicitud",
      ...(descripcion.transformacion
        ? { transformacion: descripcion.transformacion, original: descripcion.original }
        : {}),
    },
    { campo: "posiciones[0].cantidad", valor: solicitud.cantidad, fuente: "solicitud" },
    { campo: "posiciones[0].unidad", valor: unidad.valor, fuente: unidad.fuente },
    { campo: "posiciones[0].precio_unitario", valor: solicitud.valor_unitario, fuente: "solicitud" },
    { campo: "posiciones[0].centro_costo", valor: solicitud.centro_costo, fuente: "solicitud" },
    { campo: "posiciones[0].subarea", valor: solicitud.subarea, fuente: "solicitud" },
    { campo: "posiciones[0].indicador_iva", valor: iva.valor, fuente: iva.fuente },
  ]
  return { ok: true, data: { orden: parsed.data, trazas } }
}

export function guardarTrazabilidad(ubicacion: Ubicacion, caso: string, trazas: TrazaCampo[]): string {
  const dir = path.join(ubicacion.outDir, caso)
  mkdirSync(dir, { recursive: true })
  const archivo = path.join(dir, "trazabilidad.json")
  writeFileSync(archivo, JSON.stringify(trazas, null, 2), "utf8")
  return archivo
}
