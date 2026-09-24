import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { cargarMaestros } from "./maestros.ts"
import { normalizarNit } from "./texto.ts"
import type { OrdenCompra, Ubicacion } from "./types.ts"

export type SapAdapter = {
  consultarProveedor(nit: string): Promise<{ codigo_sap: string; activo: boolean } | null>
  crearOrden(orden: OrdenCompra): Promise<{ numero_oc: string; fecha: string }>
  buscarOrdenPorReferencia(solicitud_id: string): Promise<{ numero_oc: string } | null>
}

type OrdenGuardada = {
  numero_oc: string
  fecha: string
  orden: OrdenCompra
}

const INICIO = 4500000001

function archivo(ubicacion: Ubicacion): string {
  return path.join(ubicacion.outDir, "sap", "ordenes.jsonl")
}

export function leerOrdenes(ubicacion: Ubicacion): OrdenGuardada[] {
  const ruta = archivo(ubicacion)
  if (!existsSync(ruta)) return []
  return readFileSync(ruta, "utf8")
    .split("\n")
    .map((linea) => linea.trim())
    .filter((linea) => linea.length > 0)
    .map((linea) => JSON.parse(linea) as OrdenGuardada)
}

export function crearSapArchivo(ubicacion: Ubicacion): SapAdapter {
  return {
    async consultarProveedor(nit: string) {
      const maestros = cargarMaestros(ubicacion)
      if (!maestros.ok) return null
      const encontrado = maestros.data.proveedores.find((item) => normalizarNit(item.nit) === normalizarNit(nit))
      return encontrado ? { codigo_sap: encontrado.codigo_sap, activo: encontrado.activo } : null
    },
    async buscarOrdenPorReferencia(solicitudId) {
      const encontrada = leerOrdenes(ubicacion).find((item) => item.orden.referencia.solicitud_id === solicitudId)
      return encontrada ? { numero_oc: encontrada.numero_oc } : null
    },
    async crearOrden(orden) {
      const existentes = leerOrdenes(ubicacion)
      const previa = existentes.find((item) => item.orden.referencia.solicitud_id === orden.referencia.solicitud_id)
      if (previa) return { numero_oc: previa.numero_oc, fecha: previa.fecha }
      const ultimo = existentes.reduce((max, item) => Math.max(max, Number(item.numero_oc)), INICIO - 1)
      const numero = String(ultimo + 1)
      const fecha = new Date().toISOString()
      mkdirSync(path.dirname(archivo(ubicacion)), { recursive: true })
      appendFileSync(archivo(ubicacion), `${JSON.stringify({ numero_oc: numero, fecha, orden })}\n`, "utf8")
      return { numero_oc: numero, fecha }
    },
  }
}
