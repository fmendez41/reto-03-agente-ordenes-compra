import { z } from "zod"
import { crearAccion, consumirAccion, validarAccion } from "../confirmacion.ts"
import { flushIntento, intentoVacio, type Intento } from "../control.ts"
import { escribirEvidenciaTxt } from "../evidencia.ts"
import { construirOrden, guardarTrazabilidad, hashPayload, ordenCompraSchema } from "../payload.ts"
import { leerPaquete } from "../paquete.ts"
import { validarCaso } from "../reglas.ts"
import { redactar } from "../secreto.ts"
import { ubicar } from "../rutas.ts"
import { crearSapArchivo, excluirReferencia, leerOrdenes } from "../sap-archivo.ts"
import type { OrdenCompra, Ubicacion } from "../types.ts"

export type Contexto = {
  directory: string
  sessionId: string
  turno?: number
  fixturesDir?: string
  outDir?: string
  actionId?: string | null
  intentos?: Map<string, Intento>
}

export type Definicion = {
  description: string
  args: Record<string, z.ZodType>
  execute: (args: Record<string, unknown>, ctx: Contexto) => Promise<string>
}

function ok(data: unknown): string {
  return JSON.stringify({ ok: true, data })
}

function fallo(error: string): string {
  return JSON.stringify({ ok: false, error })
}

function ubicacionDe(ctx: Contexto): Ubicacion {
  return ubicar(ctx.directory, { fixturesDir: ctx.fixturesDir, outDir: ctx.outDir })
}

function intentoDe(ctx: Contexto, caso: string): Intento {
  if (!ctx.intentos) ctx.intentos = new Map()
  const turno = ctx.turno ?? 1
  const clave = `${ctx.sessionId}:${turno}:${caso}`
  const previo = ctx.intentos.get(clave)
  if (previo) return previo
  const creado = intentoVacio(caso, ctx.sessionId, turno)
  ctx.intentos.set(clave, creado)
  return creado
}

/**
 * Un fallo inesperado tiene que decir cuál fue, o el agente repite el intento a ciegas
 * y la analista no sabe si el problema es del documento o del sistema. La causa se
 * sanea antes de salir: nunca debe viajar una clave ni la ruta absoluta del servidor.
 */
function causaLegible(error: unknown): string {
  const texto = error instanceof Error ? error.message : String(error)
  return redactar(texto)
    .replace(/[A-Za-z]:[\\/][^\s"']+/g, "[ruta del servidor]")
    .replace(/\/(?:home|Users|var|tmp|app)\/[^\s"']+/g, "[ruta del servidor]")
    .slice(0, 300)
}

async function envolver(nombre: string, trabajo: () => Promise<string>): Promise<string> {
  try {
    return await trabajo()
  } catch (error) {
    return fallo(
      `${nombre} falló por un error inesperado del sistema, no por el contenido del caso: ${causaLegible(error)}. No se creó ni modificó nada.`,
    )
  }
}

export const leer_paquete: Definicion = {
  description: "Lee correo, solicitud, cotización, aprobación y factura opcional de un caso.",
  args: {
    caso: z.string().describe("Carpeta del caso en fixtures/reto-03/solicitudes/, por ejemplo sol-001"),
  },
  async execute(args, ctx) {
    return envolver("oc_leer_paquete", async () => {
      const caso = String(args.caso)
      const paquete = leerPaquete(ubicacionDe(ctx), caso)
      if (!paquete.ok) {
        intentoDe(ctx, caso).resultado = "ERROR"
        return fallo(paquete.error)
      }
      if (paquete.data.solicitud) intentoDe(ctx, caso).solicitudId = paquete.data.solicitud.solicitud_id
      return ok(paquete.data)
    })
  },
}

export const validar: Definicion = {
  description: "Valida el caso contra maestros y devuelve bloqueos, confirmaciones y derivados.",
  args: {
    caso: z.string().describe("Carpeta del caso, por ejemplo sol-001"),
    paquete: z.unknown().describe("Paquete devuelto por leer_paquete; el servidor vuelve a leer el disco"),
  },
  async execute(args, ctx) {
    return envolver("oc_validar", async () => {
      const caso = String(args.caso)
      const ubicacion = ubicacionDe(ctx)
      const paquete = leerPaquete(ubicacion, caso)
      if (!paquete.ok) {
        intentoDe(ctx, caso).resultado = "ERROR"
        return fallo(paquete.error)
      }
      const validacion = validarCaso(ubicacion, paquete.data)
      if (!validacion.ok) {
        intentoDe(ctx, caso).resultado = "ERROR"
        return fallo(validacion.error)
      }
      const intento = intentoDe(ctx, caso)
      if (paquete.data.solicitud) intento.solicitudId = paquete.data.solicitud.solicitud_id
      intento.retroactiva = validacion.data.retroactiva
      intento.bloqueos = validacion.data.bloqueos.map((item) => item.regla)
      intento.confirmaciones = validacion.data.confirmaciones.map((item) => item.regla)
      if (validacion.data.estado === "BLOQUEADA") intento.resultado = "BLOQUEADA"
      if (validacion.data.estado === "PENDIENTE_CONFIRMACION") intento.resultado = "PENDIENTE_CONFIRMACION"
      if (validacion.data.estado === "LISTA_PARA_CREAR") intento.resultado = null

      let accion = null
      if (validacion.data.estado === "PENDIENTE_CONFIRMACION") {
        const orden = construirOrden(ubicacion, caso, paquete.data, validacion.data, null)
        if (!orden.ok) return fallo(orden.error)
        accion = crearAccion(ubicacion, {
          caso,
          payload_hash: hashPayload(orden.data.orden),
          codigos: validacion.data.confirmaciones.map((item) => item.regla),
          sessionId: ctx.sessionId,
          turno: ctx.turno ?? 1,
        })
      }
      return ok({ ...validacion.data, accion })
    })
  },
}

export const construir_payload: Definicion = {
  description: "Construye la orden de compra canónica y guarda su trazabilidad.",
  args: {
    caso: z.string().describe("Carpeta del caso"),
    paquete: z.unknown().describe("Ignorado: el payload se recalcula desde los archivos"),
    derivados: z.unknown().describe("Ignorado: los derivados se recalculan desde los maestros"),
  },
  async execute(args, ctx) {
    return envolver("oc_construir_payload", async () => {
      const caso = String(args.caso)
      const ubicacion = ubicacionDe(ctx)
      const paquete = leerPaquete(ubicacion, caso)
      if (!paquete.ok) return fallo(paquete.error)
      const validacion = validarCaso(ubicacion, paquete.data)
      if (!validacion.ok) return fallo(validacion.error)
      if (!validacion.data.apta) {
        return fallo("Hay bloqueos. No armo el payload hasta corregirlos.")
      }
      const orden = construirOrden(ubicacion, caso, paquete.data, validacion.data, null)
      if (!orden.ok) return fallo(orden.error)
      const ruta = guardarTrazabilidad(ubicacion, caso, orden.data.trazas)
      return ok({ orden: orden.data.orden, trazabilidad: ruta, payload_hash: hashPayload(orden.data.orden) })
    })
  },
}

/**
 * El .txt es la evidencia P0: es el que se firma con sha256 y el que la API expone.
 * El PDF es una comodidad para el analista, así que un fallo suyo no puede invalidar
 * una evidencia que ya quedó escrita y firmada.
 */
async function escribirPdfSiSePuede(
  ubicacion: Ubicacion,
  caso: string,
): Promise<{ ruta: string | null; aviso: string | null }> {
  try {
    const { escribirEvidenciaPdf } = await import("../pdf.ts")
    const pdf = await escribirEvidenciaPdf(ubicacion, caso)
    if (pdf.ok) return { ruta: pdf.ruta, aviso: null }
    return { ruta: null, aviso: `La evidencia en texto quedó firmada, pero el PDF no se pudo generar: ${pdf.error}` }
  } catch {
    return {
      ruta: null,
      aviso: "La evidencia en texto quedó firmada, pero el PDF no se pudo generar por un fallo del generador.",
    }
  }
}

export const generar_evidencia: Definicion = {
  description: "Escribe la evidencia de aprobación y devuelve su ruta y sha256.",
  args: {
    caso: z.string().describe("Carpeta del caso"),
  },
  async execute(args, ctx) {
    return envolver("oc_generar_evidencia", async () => {
      const ubicacion = ubicacionDe(ctx)
      const caso = String(args.caso)
      const escrito = escribirEvidenciaTxt(ubicacion, caso)
      if (!escrito.ok) return fallo(escrito.error)
      const pdf = await escribirPdfSiSePuede(ubicacion, caso)
      return ok({ ruta: escrito.ruta, sha256: escrito.sha256, pdf: pdf.ruta, aviso: pdf.aviso })
    })
  },
}

export const crear: Definicion = {
  description: "Crea la orden en el SAP simulado si no hay bloqueos y la confirmación, si hace falta, ya fue validada.",
  args: {
    caso: z.string().describe("Carpeta del caso"),
    payload: z.unknown().describe("Orden de compra. Se rechaza si no coincide con la recalculada."),
    confirmado: z.boolean().optional().describe("No autoriza la compra. La autorización la inyecta el servidor."),
  },
  async execute(args, ctx) {
    return envolver("oc_crear", async () => {
      const caso = String(args.caso)
      const ubicacion = ubicacionDe(ctx)
      const paquete = leerPaquete(ubicacion, caso)
      if (!paquete.ok) {
        intentoDe(ctx, caso).resultado = "ERROR"
        return fallo(paquete.error)
      }
      const solicitudId = paquete.data.solicitud?.solicitud_id
      if (!solicitudId) return fallo("No hay solicitud para crear la orden.")
      return excluirReferencia(solicitudId, async () => {
      const sap = crearSapArchivo(ubicacion)
      const existente = await sap.buscarOrdenPorReferencia(solicitudId)
      if (existente) {
        const intento = intentoDe(ctx, caso)
        intento.solicitudId = solicitudId
        intento.numeroOc = existente.numero_oc
        intento.resultado = "IDEMPOTENTE"
        const guardada = leerOrdenes(ubicacion).find((item) => item.numero_oc === existente.numero_oc)
        return ok({ numero_oc: existente.numero_oc, fecha: guardada?.fecha ?? "", idempotente: true })
      }
      const validacion = validarCaso(ubicacion, paquete.data)
      if (!validacion.ok) return fallo(validacion.error)
      const intento = intentoDe(ctx, caso)
      intento.solicitudId = solicitudId
      intento.retroactiva = validacion.data.retroactiva
      intento.bloqueos = validacion.data.bloqueos.map((item) => item.regla)
      intento.confirmaciones = validacion.data.confirmaciones.map((item) => item.regla)
      if (!validacion.data.apta) {
        intento.resultado = "BLOQUEADA"
        return fallo(
          `No creo la OC. Bloqueos: ${validacion.data.bloqueos.map((item) => `${item.regla}: ${item.detalle}`).join(" ")}`,
        )
      }
      const orden = construirOrden(ubicacion, caso, paquete.data, validacion.data, null)
      if (!orden.ok) return fallo(orden.error)
      const hash = hashPayload(orden.data.orden)
      if (validacion.data.confirmaciones.length > 0) {
        if (!ctx.actionId) {
          intento.resultado = "PENDIENTE_CONFIRMACION"
          return fallo("Falta una confirmación validada por el servidor.")
        }
        const chequeo = validarAccion(ubicacion, {
          actionId: ctx.actionId,
          caso,
          sessionId: ctx.sessionId,
          turno: ctx.turno ?? 1,
          payloadHash: hash,
        })
        if (!chequeo.ok) {
          intento.resultado = "PENDIENTE_CONFIRMACION"
          return fallo(chequeo.error)
        }
        const cubre = validacion.data.confirmaciones.every((item) => chequeo.accion.codigos.includes(item.regla))
        if (!cubre) return fallo("La confirmación no cubre todas las reglas pendientes.")
      }
      const recibido = ordenCompraSchema.safeParse(args.payload)
      if (!recibido.success) return fallo("El payload no cumple el esquema.")
      if (hashPayload(recibido.data as OrdenCompra) !== hash) {
        intento.resultado = "ERROR"
        return fallo("El payload no coincide con el calculado desde los documentos.")
      }
      const final = construirOrden(
        ubicacion,
        caso,
        paquete.data,
        validacion.data,
        validacion.data.confirmaciones.length > 0 ? "analista" : null,
      )
      if (!final.ok) return fallo(final.error)
      // HU-4: ninguna orden puede existir en SAP sin su evidencia en disco. Se escribe
      // antes de crearla, no después, para que un fallo aquí aborte la creación en vez
      // de dejar una OC sin respaldo. La escritura es idempotente.
      const evidencia = escribirEvidenciaTxt(ubicacion, caso)
      if (!evidencia.ok) {
        intento.resultado = "ERROR"
        return fallo(`No creo la OC sin evidencia de aprobación. ${evidencia.error}`)
      }
      const pdf = await escribirPdfSiSePuede(ubicacion, caso)
      const creada = await sap.crearOrden(final.data.orden)
      if (ctx.actionId) consumirAccion(ubicacion, ctx.actionId)
      intento.numeroOc = creada.numero_oc
      intento.resultado = "CREADA"
      return ok({
        numero_oc: creada.numero_oc,
        fecha: creada.fecha,
        idempotente: false,
        evidencia: { ruta: evidencia.ruta, sha256: evidencia.sha256, pdf: pdf.ruta,         aviso: pdf.aviso },
      })
      })
    })
  },
}

export const herramientas = {
  leer_paquete,
  validar,
  construir_payload,
  generar_evidencia,
  crear,
}

export function flushContexto(ctx: Contexto): void {
  const ubicacion = ubicacionDe(ctx)
  for (const intento of ctx.intentos?.values() ?? []) flushIntento(ubicacion, intento)
}
