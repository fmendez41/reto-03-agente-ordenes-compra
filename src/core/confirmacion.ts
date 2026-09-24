import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { TTL_CONFIRMACION_MS, type AccionPendiente, type Ubicacion } from "./types.ts"

function archivo(ubicacion: Ubicacion): string {
  return path.join(ubicacion.outDir, "confirmaciones.json")
}

function leer(ubicacion: Ubicacion): AccionPendiente[] {
  const ruta = archivo(ubicacion)
  if (!existsSync(ruta)) return []
  try {
    const data = JSON.parse(readFileSync(ruta, "utf8")) as unknown
    return Array.isArray(data) ? (data as AccionPendiente[]) : []
  } catch {
    return []
  }
}

function guardar(ubicacion: Ubicacion, acciones: AccionPendiente[]): void {
  mkdirSync(ubicacion.outDir, { recursive: true })
  writeFileSync(archivo(ubicacion), JSON.stringify(acciones, null, 2), "utf8")
}

export function crearAccion(
  ubicacion: Ubicacion,
  datos: Omit<AccionPendiente, "actionId" | "estado" | "creada_en"> & { creada_en?: string },
): AccionPendiente {
  const accion: AccionPendiente = {
    actionId: randomUUID(),
    caso: datos.caso,
    payload_hash: datos.payload_hash,
    codigos: datos.codigos,
    sessionId: datos.sessionId,
    turno: datos.turno,
    creada_en: datos.creada_en ?? new Date().toISOString(),
    estado: "pendiente",
  }
  const acciones = leer(ubicacion)
  acciones.push(accion)
  guardar(ubicacion, acciones)
  return accion
}

export function leerAccion(ubicacion: Ubicacion, actionId: string): AccionPendiente | null {
  return leer(ubicacion).find((item) => item.actionId === actionId) ?? null
}

export function actualizarAccion(ubicacion: Ubicacion, accion: AccionPendiente): void {
  const acciones = leer(ubicacion).map((item) => (item.actionId === accion.actionId ? accion : item))
  guardar(ubicacion, acciones)
}

export type ResultadoConfirmacion =
  | { ok: true; accion: AccionPendiente }
  | { ok: false; error: string }

export function validarAccion(
  ubicacion: Ubicacion,
  entrada: {
    actionId: string
    caso: string
    sessionId: string
    turno: number
    payloadHash: string
    ahora?: number
  },
): ResultadoConfirmacion {
  const accion = leerAccion(ubicacion, entrada.actionId)
  if (!accion) return { ok: false, error: "No existe esa confirmación." }
  if (accion.sessionId !== entrada.sessionId) {
    return { ok: false, error: "La confirmación pertenece a otra sesión." }
  }
  if (accion.caso !== entrada.caso) {
    return { ok: false, error: "La confirmación corresponde a otro caso." }
  }
  if (accion.estado === "consumida") {
    return { ok: false, error: "Esa confirmación ya fue utilizada." }
  }
  const creada = Date.parse(accion.creada_en)
  const ahora = entrada.ahora ?? Date.now()
  if (accion.estado === "caducada" || Number.isNaN(creada) || ahora - creada > TTL_CONFIRMACION_MS) {
    accion.estado = "caducada"
    actualizarAccion(ubicacion, accion)
    return { ok: false, error: "La confirmación está caducada." }
  }
  if (accion.estado !== "pendiente") {
    return { ok: false, error: "La confirmación ya no está pendiente." }
  }
  if (entrada.turno !== accion.turno + 1) {
    return { ok: false, error: "La confirmación no llegó en el turno inmediatamente siguiente." }
  }
  if (accion.payload_hash !== entrada.payloadHash) {
    return { ok: false, error: "El payload cambió desde que se pidió la confirmación." }
  }
  return { ok: true, accion }
}

export function consumirAccion(ubicacion: Ubicacion, actionId: string): void {
  const accion = leerAccion(ubicacion, actionId)
  if (!accion) return
  accion.estado = "consumida"
  actualizarAccion(ubicacion, accion)
}

export function rearmarAccion(ubicacion: Ubicacion, actionId: string, turno: number): void {
  const accion = leerAccion(ubicacion, actionId)
  if (!accion || accion.estado !== "pendiente") return
  accion.turno = turno
  actualizarAccion(ubicacion, accion)
}
