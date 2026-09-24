import { readdirSync } from "node:fs"
import path from "node:path"
import { evidenciaDeCaso } from "./evidencia.ts"
import { cargarMaestros } from "./maestros.ts"
import { leerPaquete } from "./paquete.ts"
import { construirOrden } from "./payload.ts"
import { validarCaso } from "./reglas.ts"
import { crearSapArchivo, leerOrdenes } from "./sap-archivo.ts"
import {
  construir_payload,
  crear,
  flushContexto,
  generar_evidencia,
  leer_paquete,
  validar,
  type Contexto,
} from "./tools/oc.ts"
import { ubicar } from "./rutas.ts"
import type { Evaluacion, OrdenCompra, Paquete, Ubicacion, Validacion } from "./types.ts"

export type ResumenCaso = {
  caso: string
  apta: boolean
  estado: string
  bloqueos: string[]
  confirmaciones: string[]
  retroactiva: boolean
  numero_oc: string | null
  idempotente: boolean
  motivo: string | null
}

export type FilaBandeja = {
  caso: string
  solicitud_id: string | null
  solicitante: string | null
  proveedor: string | null
  descripcion: string | null
  valor_total: number | null
  moneda: string | null
  estado: string
  retroactiva: boolean
  bloqueos: Evaluacion[]
  confirmaciones: Evaluacion[]
  numero_oc: string | null
  error: string | null
}

export type DetalleCaso = {
  caso: string
  paquete: Paquete
  validacion: Validacion
  orden: OrdenCompra | null
  numero_oc: string | null
  evidencia: { sha256: string; texto: string } | null
  catalogos: {
    indicadores: Array<{ codigo: string; descripcion: string; tasa: number }>
    condiciones: Array<{ codigo: string; descripcion: string; dias: number }>
  }
}

export function listarCasos(ubicacion: Ubicacion): string[] {
  const dir = path.join(ubicacion.fixturesDir, "solicitudes")
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entrada) => entrada.isDirectory() && /^sol-\d{3}$/.test(entrada.name))
      .map((entrada) => entrada.name)
      .sort()
  } catch {
    return []
  }
}

export async function resumenCasos(ubicacion: Ubicacion): Promise<FilaBandeja[]> {
  const sap = crearSapArchivo(ubicacion)
  const filas: FilaBandeja[] = []
  for (const caso of listarCasos(ubicacion)) {
    const paquete = leerPaquete(ubicacion, caso)
    if (!paquete.ok) {
      filas.push(filaVacia(caso, paquete.error))
      continue
    }
    const solicitud = paquete.data.solicitud
    const validacion = validarCaso(ubicacion, paquete.data)
    if (!validacion.ok) {
      filas.push({ ...filaVacia(caso, validacion.error), solicitante: solicitud?.solicitante ?? null })
      continue
    }
    const orden = solicitud ? await sap.buscarOrdenPorReferencia(solicitud.solicitud_id) : null
    filas.push({
      caso,
      solicitud_id: solicitud?.solicitud_id ?? null,
      solicitante: solicitud?.solicitante ?? null,
      proveedor: validacion.data.derivados.proveedor?.nombre ?? solicitud?.proveedor_nombre ?? null,
      descripcion: solicitud?.descripcion ?? null,
      valor_total: solicitud?.valor_total ?? null,
      moneda: solicitud?.moneda ?? null,
      estado: orden ? "CREADA" : validacion.data.estado,
      retroactiva: validacion.data.retroactiva,
      bloqueos: validacion.data.bloqueos,
      confirmaciones: validacion.data.confirmaciones,
      numero_oc: orden?.numero_oc ?? null,
      error: null,
    })
  }
  return filas
}

export async function detalleCaso(
  ubicacion: Ubicacion,
  caso: string,
): Promise<{ ok: true; data: DetalleCaso } | { ok: false; error: string }> {
  const paquete = leerPaquete(ubicacion, caso)
  if (!paquete.ok) return paquete
  const validacion = validarCaso(ubicacion, paquete.data)
  if (!validacion.ok) return validacion
  const maestros = cargarMaestros(ubicacion)
  if (!maestros.ok) return maestros
  const armado = validacion.data.apta
    ? construirOrden(ubicacion, caso, paquete.data, validacion.data, null)
    : null
  const evidencia = evidenciaDeCaso(ubicacion, caso)
  const sap = crearSapArchivo(ubicacion)
  const existente = paquete.data.solicitud
    ? await sap.buscarOrdenPorReferencia(paquete.data.solicitud.solicitud_id)
    : null
  return {
    ok: true,
    data: {
      caso,
      paquete: paquete.data,
      validacion: validacion.data,
      orden: armado?.ok ? armado.data.orden : null,
      numero_oc: existente?.numero_oc ?? null,
      evidencia: evidencia.ok ? { sha256: evidencia.sha256, texto: evidencia.canonico } : null,
      catalogos: { indicadores: maestros.data.indicadores, condiciones: maestros.data.condiciones },
    },
  }
}

function filaVacia(caso: string, error: string): FilaBandeja {
  return {
    caso,
    solicitud_id: null,
    solicitante: null,
    proveedor: null,
    descripcion: null,
    valor_total: null,
    moneda: null,
    estado: "ERROR",
    retroactiva: false,
    bloqueos: [],
    confirmaciones: [],
    numero_oc: null,
    error,
  }
}

function contexto(ubicacion: Ubicacion, sessionId: string, turno: number, actionId?: string): Contexto {
  return {
    directory: ubicacion.directory,
    sessionId,
    turno,
    fixturesDir: ubicacion.fixturesDir,
    outDir: ubicacion.outDir,
    actionId,
    intentos: new Map(),
  }
}

function parsear(texto: string): { ok: boolean; data?: Record<string, unknown>; error?: string } {
  return JSON.parse(texto) as { ok: boolean; data?: Record<string, unknown>; error?: string }
}

export async function procesarCaso(
  caso: string,
  opciones: { directory: string; fixturesDir?: string; outDir?: string; sessionId?: string; turno?: number; confirmar?: boolean },
): Promise<ResumenCaso> {
  const ubicacion = ubicar(opciones.directory, { fixturesDir: opciones.fixturesDir, outDir: opciones.outDir })
  const sessionId = opciones.sessionId ?? "demo"
  const turno = opciones.turno ?? 1
  const ctx = contexto(ubicacion, sessionId, turno)
  const leido = parsear(await leer_paquete.execute({ caso }, ctx))
  if (!leido.ok) {
    flushContexto(ctx)
    return vacio(caso, leido.error ?? "No pude leer el paquete.")
  }
  const validado = parsear(await validar.execute({ caso, paquete: leido.data }, ctx))
  if (!validado.ok || !validado.data) {
    flushContexto(ctx)
    return vacio(caso, validado.error ?? "No pude validar el caso.")
  }
  const estado = String(validado.data.estado)
  const bloqueos = codigos(validado.data.bloqueos)
  const confirmaciones = codigos(validado.data.confirmaciones)
  const retroactiva = Boolean(validado.data.retroactiva)
  const base = { caso, apta: Boolean(validado.data.apta), estado, bloqueos, confirmaciones, retroactiva }

  if (estado === "BLOQUEADA" || (estado === "PENDIENTE_CONFIRMACION" && !opciones.confirmar)) {
    flushContexto(ctx)
    return { ...base, numero_oc: null, idempotente: false, motivo: estado === "BLOQUEADA" ? bloqueos.join(",") : confirmaciones.join(",") }
  }

  let actionId: string | undefined
  let ctxCrear = ctx
  if (estado === "PENDIENTE_CONFIRMACION" && opciones.confirmar) {
    const accion = validado.data.accion as { actionId?: string } | null
    actionId = accion?.actionId
    flushContexto(ctx)
    ctxCrear = contexto(ubicacion, sessionId, turno + 1, actionId)
  }

  const armado = parsear(await construir_payload.execute({ caso, paquete: leido.data, derivados: validado.data.derivados }, ctxCrear))
  if (!armado.ok || !armado.data) {
    flushContexto(ctxCrear)
    return { ...base, numero_oc: null, idempotente: false, motivo: armado.error ?? "No pude armar el payload." }
  }
  await generar_evidencia.execute({ caso }, ctxCrear)
  const creado = parsear(await crear.execute({ caso, payload: armado.data.orden, confirmado: Boolean(opciones.confirmar) }, ctxCrear))
  flushContexto(ctxCrear)
  if (!creado.ok || !creado.data) {
    return { ...base, numero_oc: null, idempotente: false, motivo: creado.error ?? "No pude crear la OC." }
  }
  return {
    ...base,
    estado: creado.data.idempotente ? "IDEMPOTENTE" : "CREADA",
    numero_oc: String(creado.data.numero_oc),
    idempotente: Boolean(creado.data.idempotente),
    motivo: null,
  }
}

function codigos(valor: unknown): string[] {
  if (!Array.isArray(valor)) return []
  return valor
    .map((item) => (item && typeof item === "object" && "regla" in item ? String(item.regla) : ""))
    .filter((item) => item.length > 0)
}

function vacio(caso: string, motivo: string): ResumenCaso {
  return {
    caso,
    apta: false,
    estado: "ERROR",
    bloqueos: [],
    confirmaciones: [],
    retroactiva: false,
    numero_oc: null,
    idempotente: false,
    motivo,
  }
}

export function ordenesDe(directory: string, outDir?: string) {
  return leerOrdenes(ubicar(directory, { outDir }))
}
