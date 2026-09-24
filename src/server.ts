import { randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import path from "node:path"
import { cargarPrompt, cerrarTurno, ejecutarTurno, MAX_HISTORIAL_CARACTERES, type VistaLlamada } from "./agent/loop.ts"
import { leerAccion, validarAccion } from "./core/confirmacion.ts"
import { detalleCaso, resumenCasos } from "./core/flujo.ts"
import { evidenciaDeCaso } from "./core/evidencia.ts"
import { hashPayload, construirOrden } from "./core/payload.ts"
import { leerPaquete } from "./core/paquete.ts"
import { validarCaso } from "./core/reglas.ts"
import { ubicar } from "./core/rutas.ts"
import type { Contexto } from "./core/tools/oc.ts"
import { TTL_CONFIRMACION_MS } from "./core/types.ts"
import type { MensajeModelo } from "./llm/adapter.ts"
import { crearAdaptadorOpenAI } from "./llm/openai.ts"

const directory = path.resolve(import.meta.dir, "..")
const puerto = Number(process.env.PORT ?? 3000)
const maxIteraciones = Number(process.env.MAX_TOOL_ITERATIONS ?? 25)
const maxTokens = Number(process.env.MAX_SESSION_TOKENS ?? 100000)
const maxHistorial = Number(process.env.MAX_HISTORY_CHARS ?? MAX_HISTORIAL_CARACTERES)
const maxMensaje = Number(process.env.MAX_MESSAGE_CHARS ?? 8000)
const tokenAcceso = process.env.APP_ACCESS_TOKEN ?? ""
const modelo = process.env.LLM_MODEL ?? "gpt-4.1-mini"

type Sesion = {
  id: string
  mensajes: MensajeModelo[]
  tokens: number
  turno: number
}

const sesiones = new Map<string, Sesion>()

function archivoSesion(id: string): string {
  return path.join(directory, "out", "sessions", `${id}.json`)
}

function cargarSesion(id: string): Sesion | null {
  const enMemoria = sesiones.get(id)
  if (enMemoria) return enMemoria
  const ruta = archivoSesion(id)
  if (!existsSync(ruta)) return null
  const sesion = JSON.parse(readFileSync(ruta, "utf8")) as Sesion
  sesiones.set(id, sesion)
  return sesion
}

function guardarSesion(sesion: Sesion): void {
  sesiones.set(sesion.id, sesion)
  mkdirSync(path.dirname(archivoSesion(sesion.id)), { recursive: true })
  writeFileSync(archivoSesion(sesion.id), JSON.stringify(sesion), "utf8")
}

function autorizado(request: Request): boolean {
  if (!tokenAcceso) return true
  return request.headers.get("authorization") === `Bearer ${tokenAcceso}`
}

const prompt = cargarPrompt(directory)
const adaptador = crearAdaptadorOpenAI({
  apiKey: process.env.LLM_API_KEY ?? "",
  model: modelo,
  timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 60000),
})

Bun.serve({
  port: puerto,
  async fetch(request) {
    const url = new URL(request.url)
    if (request.method === "GET" && url.pathname === "/api/health") {
      return Response.json({ ok: true, provider: adaptador.proveedor, model: adaptador.modelo })
    }
    if (url.pathname.startsWith("/api/") && !autorizado(request)) {
      return Response.json({ ok: false, error: "Falta el token de acceso." }, { status: 401 })
    }
    if (request.method === "GET" && url.pathname === "/api/casos") {
      return Response.json({ ok: true, casos: await resumenCasos(ubicar(directory)) })
    }
    if (request.method === "GET" && url.pathname.startsWith("/api/casos/")) {
      const resto = url.pathname.slice("/api/casos/".length)
      const [caso, seccion] = resto.split("/")
      if (!caso) return Response.json({ ok: false, error: "Falta el caso." }, { status: 400 })
      if (seccion === "evidencia") {
        const evidencia = evidenciaDeCaso(ubicar(directory), caso)
        if (!evidencia.ok) return Response.json(evidencia, { status: 404 })
        return Response.json({ ok: true, sha256: evidencia.sha256, texto: evidencia.canonico })
      }
      if (seccion) return Response.json({ ok: false, error: "Ruta desconocida." }, { status: 404 })
      const detalle = await detalleCaso(ubicar(directory), caso)
      if (!detalle.ok) return Response.json(detalle, { status: 404 })
      return Response.json({ ok: true, ...detalle.data })
    }
    if (request.method === "GET" && url.pathname.startsWith("/api/sessions/")) {
      const id = url.pathname.slice("/api/sessions/".length)
      if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ ok: false, error: "Sesión inválida." }, { status: 400 })
      const sesion = cargarSesion(id)
      if (!sesion) return Response.json({ ok: false, error: "No existe la sesión." }, { status: 404 })
      return Response.json({ ok: true, mensajes: sesion.mensajes, turno: sesion.turno })
    }
    if (request.method === "POST" && url.pathname === "/api/chat") {
      return chat(request)
    }
    // Una ruta /api/ desconocida devolvía 200 con el HTML de la interfaz, así que un
    // cliente que se equivocara de ruta recibía una página en vez de un error.
    if (url.pathname.startsWith("/api/")) {
      return Response.json({ ok: false, error: `No existe la ruta ${request.method} ${url.pathname}.` }, { status: 404 })
    }
    if (request.method === "GET") return estatico(url.pathname)
    return new Response("No encontrado", { status: 404 })
  },
})

console.log(`Agente de órdenes de compra en http://localhost:${puerto}`)

async function chat(request: Request): Promise<Response> {
  let cuerpo: { sessionId?: string; message?: string; actionId?: string }
  try {
    cuerpo = (await request.json()) as { sessionId?: string; message?: string; actionId?: string }
  } catch {
    return Response.json({ ok: false, error: "El mensaje no es JSON." }, { status: 400 })
  }
  const message = (cuerpo.message ?? "").trim()
  if (!message || message.length > maxMensaje) {
    return Response.json({ ok: false, error: "El mensaje está vacío o supera el tamaño permitido." }, { status: 400 })
  }
  const id = cuerpo.sessionId && /^[0-9a-f-]{36}$/i.test(cuerpo.sessionId) ? cuerpo.sessionId : randomUUID()
  const sesion = cargarSesion(id) ?? { id, mensajes: [{ role: "system", content: prompt, tool_calls: undefined }], tokens: 0, turno: 0 }
  if (sesion.tokens >= maxTokens) {
    return Response.json({ ok: false, error: "Esta sesión llegó al tope de tokens. Abre una sesión nueva." }, { status: 429 })
  }
  if (!process.env.LLM_API_KEY) {
    return Response.json({ ok: false, error: "Falta LLM_API_KEY en el servidor." }, { status: 500 })
  }
  sesion.turno += 1
  const ctx: Contexto = {
    directory,
    sessionId: sesion.id,
    turno: sesion.turno,
    intentos: new Map(),
  }
  let aviso = ""
  if (cuerpo.actionId) {
    const preparada = await prepararConfirmacion(cuerpo.actionId, sesion, ctx)
    if (!preparada.ok) {
      return Response.json({ ok: false, error: preparada.error, sessionId: sesion.id }, { status: 400 })
    }
    aviso = preparada.aviso
    ctx.actionId = cuerpo.actionId
  }
  sesion.mensajes.push({ role: "user", content: aviso ? `${message}\n${aviso}` : message })
  const resultado = await ejecutarTurno({
    directory,
    adapter: adaptador,
    historial: sesion.mensajes,
    ctx,
    maxIteraciones,
    maxHistorialCaracteres: maxHistorial,
  })
  sesion.tokens += resultado.tokens || Math.ceil(message.length / 4)
  const creada = resultado.toolCalls.some((llamada) => llamada.name === "oc_crear" && llamada.ok)
  cerrarTurno(ctx, creada)
  guardarSesion(sesion)
  const confirmacion = confirmacionVisible(sesion.id, sesion.turno)
  return Response.json({
    sessionId: sesion.id,
    reply: resultado.reply,
    toolCalls: resultado.toolCalls,
    needsConfirmation: Boolean(confirmacion) && !creada,
    confirmacion,
  })
}

async function prepararConfirmacion(
  actionId: string,
  sesion: Sesion,
  ctx: Contexto,
): Promise<{ ok: true; aviso: string } | { ok: false; error: string }> {
  const ubicacion = ubicar(directory)
  const accion = leerAccion(ubicacion, actionId)
  if (!accion) return { ok: false, error: "No existe esa confirmación." }
  const paquete = leerPaquete(ubicacion, accion.caso)
  if (!paquete.ok) return { ok: false, error: paquete.error }
  const validacion = validarCaso(ubicacion, paquete.data)
  if (!validacion.ok) return { ok: false, error: validacion.error }
  const orden = construirOrden(ubicacion, accion.caso, paquete.data, validacion.data, null)
  if (!orden.ok) return { ok: false, error: orden.error }
  const chequeo = validarAccion(ubicacion, {
    actionId,
    caso: accion.caso,
    sessionId: sesion.id,
    turno: sesion.turno,
    payloadHash: hashPayload(orden.data.orden),
  })
  if (!chequeo.ok) return chequeo
  ctx.actionId = actionId
  return { ok: true, aviso: `El servidor validó la confirmación ${actionId} para ${accion.caso}. Puedes llamar a oc_crear.` }
}

function confirmacionVisible(
  sessionId: string,
  turno: number,
): { actionId: string; caso: string; codigos: string[]; vence_en: string } | null {
  const ubicacion = ubicar(directory)
  const ruta = path.join(ubicacion.outDir, "confirmaciones.json")
  if (!existsSync(ruta)) return null
  const acciones = JSON.parse(readFileSync(ruta, "utf8")) as Array<{
    actionId: string
    caso: string
    codigos: string[]
    sessionId: string
    turno: number
    creada_en: string
    estado: string
  }>
  const pendiente = acciones.find((item) => item.sessionId === sessionId && item.estado === "pendiente" && item.turno === turno)
  if (!pendiente) return null
  const creada = Date.parse(pendiente.creada_en)
  const vence = Number.isNaN(creada) ? Date.now() : creada + TTL_CONFIRMACION_MS
  return {
    actionId: pendiente.actionId,
    caso: pendiente.caso,
    codigos: pendiente.codigos,
    vence_en: new Date(vence).toISOString(),
  }
}

async function estatico(ruta: string): Promise<Response> {
  const relativa = ruta === "/" ? "index.html" : ruta.replace(/^\/+/, "")
  if (relativa.includes("..")) return new Response("No encontrado", { status: 404 })
  const web = path.resolve(directory, "web", "dist")
  const archivo = path.resolve(web, relativa)
  if (!archivo.startsWith(web)) return new Response("No encontrado", { status: 404 })
  const file = Bun.file(archivo)
  if (await file.exists()) return new Response(file)
  const indice = Bun.file(path.join(web, "index.html"))
  if (await indice.exists()) return new Response(indice, { headers: { "content-type": "text/html" } })
  return new Response("Falta compilar el front. Ejecuta bun run build.", { status: 404 })
}

export type { VistaLlamada }
