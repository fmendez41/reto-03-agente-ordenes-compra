import { randomUUID } from "node:crypto"
import { readFileSync, existsSync, rmSync, statSync } from "node:fs"
import path from "node:path"
import { escribirAtomico } from "./core/atomico.ts"
import { tokensIguales } from "./core/secreto.ts"
import { contextoDelCaso } from "./agent/contexto.ts"
import { cargarPrompt, cerrarTurno, ejecutarTurno, MAX_HISTORIAL_CARACTERES, type VistaLlamada } from "./agent/loop.ts"
import { leerAccion, validarAccion } from "./core/confirmacion.ts"
import { detalleCaso, resumenCasos } from "./core/flujo.ts"
import { evidenciaDeCaso } from "./core/evidencia.ts"
import { hashPayload, construirOrden } from "./core/payload.ts"
import { leerPaquete } from "./core/paquete.ts"
import { validarCaso } from "./core/reglas.ts"
import { dentroDe, ubicar } from "./core/rutas.ts"
import type { Contexto } from "./core/tools/oc.ts"
import { TTL_CONFIRMACION_MS } from "./core/types.ts"
import type { MensajeModelo } from "./llm/adapter.ts"
import { crearAdaptadorOpenAI } from "./llm/openai.ts"

const directory = path.resolve(import.meta.dir, "..")
const outDir = process.env.OUT_DIR ? path.resolve(process.env.OUT_DIR) : path.join(directory, "out")
const puerto = Number(process.env.PORT ?? 3000)
const maxIteraciones = Number(process.env.MAX_TOOL_ITERATIONS ?? 25)
const maxTokens = Number(process.env.MAX_SESSION_TOKENS ?? 100000)
const maxHistorial = Number(process.env.MAX_HISTORY_CHARS ?? MAX_HISTORIAL_CARACTERES)
const maxMensaje = Number(process.env.MAX_MESSAGE_CHARS ?? 8000)
const maxCuerpo = Number(process.env.MAX_BODY_BYTES ?? 32_000)
const maxSesiones = Number(process.env.MAX_SESSIONS ?? 200)
const ttlSesion = Number(process.env.SESSION_TTL_MS ?? 86_400_000)
const maxPeticiones = Number(process.env.RATE_LIMIT_MAX ?? 60)
const ventanaPeticiones = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000)
const maxModelos = Number(process.env.MAX_CONCURRENT_LLM ?? 4)
const tokenAcceso = process.env.APP_ACCESS_TOKEN ?? ""
const produccion = process.env.NODE_ENV === "production"
const modelo = process.env.LLM_MODEL ?? "gpt-4.1-mini"
const sinCache = { "cache-control": "no-store" }
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type Sesion = {
  id: string
  mensajes: MensajeModelo[]
  tokens: number
  turno: number
  actividadEn: string
}

const sesiones = new Map<string, Sesion>()

function archivoSesion(id: string): string {
  return path.join(outDir, "sessions", `${id}.json`)
}

function sitio() {
  return ubicar(directory, { outDir })
}

function cargarSesion(id: string): Sesion | null {
  if (!UUID.test(id)) return null
  const enMemoria = sesiones.get(id)
  if (enMemoria) return vigente(enMemoria) ? enMemoria : null
  const ruta = archivoSesion(id)
  if (!existsSync(ruta)) return null
  try {
    if (statSync(ruta).size > 2_000_000) return null
    const sesion = JSON.parse(readFileSync(ruta, "utf8")) as Sesion
    if (!sesion || sesion.id !== id || !Array.isArray(sesion.mensajes)) return null
    if (!vigente(sesion)) return null
    sesiones.set(id, sesion)
    return sesion
  } catch {
    return null
  }
}

function vigente(sesion: Sesion): boolean {
  const marca = Date.parse(sesion.actividadEn ?? "")
  if (!Number.isNaN(marca) && Date.now() - marca > ttlSesion) {
    sesiones.delete(sesion.id)
    rmSync(archivoSesion(sesion.id), { force: true })
    return false
  }
  return true
}

function guardarSesion(sesion: Sesion): void {
  sesion.actividadEn = new Date().toISOString()
  sesiones.set(sesion.id, sesion)
  escribirAtomico(archivoSesion(sesion.id), JSON.stringify(sesion))
}

function autorizado(request: Request): boolean {
  if (!tokenAcceso) return !produccion
  const header = request.headers.get("authorization")
  if (!header || header.includes(",")) return false
  return tokensIguales(header, `Bearer ${tokenAcceso}`)
}

const ventanas = new Map<string, number[]>()
const sesionesOcupadas = new Set<string>()
let modelosEnCurso = 0

function limitado(ip: string): boolean {
  const ahora = Date.now()
  const marcas = (ventanas.get(ip) ?? []).filter((marca) => ahora - marca < ventanaPeticiones)
  if (marcas.length >= maxPeticiones) {
    ventanas.set(ip, marcas)
    return true
  }
  marcas.push(ahora)
  ventanas.set(ip, marcas)
  return false
}

const prompt = cargarPrompt(directory)
const adaptadorFalso = process.env.LLM_FAKE === "1" && !produccion
const adaptador = adaptadorFalso
  ? {
      proveedor: "falso",
      modelo: "falso",
      async enviar() {
        return { content: "Listo.", toolCalls: [], tokens: 1 }
      },
    }
  : crearAdaptadorOpenAI({
      apiKey: process.env.LLM_API_KEY ?? "",
      model: modelo,
      timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 60000),
    })

Bun.serve({
  port: puerto,
  async fetch(request, server) {
    const url = new URL(request.url)
    const ip = server.requestIP(request)?.address ?? "local"
    if (url.pathname.startsWith("/api/") && url.pathname !== "/api/health" && limitado(ip)) {
      return conDefensa(
        Response.json({ ok: false, error: "Demasiadas solicitudes. Espera un momento." }, { status: 429, headers: sinCache }),
        request,
      )
    }
    return conDefensa(await despachar(request), request)
  },
})

async function despachar(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === "GET" && url.pathname === "/api/health") {
      return Response.json({ ok: true, provider: adaptador.proveedor, model: adaptador.modelo }, { headers: sinCache })
    }
    if (url.pathname.startsWith("/api/") && !autorizado(request)) {
      return Response.json({ ok: false, error: "Falta el token de acceso." }, { status: 401, headers: sinCache })
    }
    if (request.method === "GET" && url.pathname === "/api/casos") {
      return Response.json({ ok: true, casos: await resumenCasos(sitio()) }, { headers: sinCache })
    }
    if (request.method === "GET" && url.pathname.startsWith("/api/casos/")) {
      const resto = url.pathname.slice("/api/casos/".length)
      const [caso, seccion] = resto.split("/")
      if (!caso) return Response.json({ ok: false, error: "Falta el caso." }, { status: 400 })
      if (seccion === "evidencia") {
        const evidencia = evidenciaDeCaso(sitio(), caso)
        if (!evidencia.ok) return Response.json(evidencia, { status: 404 })
        return Response.json({ ok: true, sha256: evidencia.sha256, texto: evidencia.canonico })
      }
      if (seccion) return Response.json({ ok: false, error: "Ruta desconocida." }, { status: 404 })
      const detalle = await detalleCaso(sitio(), caso)
      if (!detalle.ok) return Response.json(detalle, { status: 404, headers: sinCache })
      return Response.json({ ok: true, ...detalle.data }, { headers: sinCache })
    }
    if (request.method === "GET" && url.pathname.startsWith("/api/sessions/")) {
      const id = url.pathname.slice("/api/sessions/".length)
      if (!UUID.test(id)) return Response.json({ ok: false, error: "Sesión inválida." }, { status: 400, headers: sinCache })
      const sesion = cargarSesion(id)
      if (!sesion) return Response.json({ ok: false, error: "No existe la sesión." }, { status: 404, headers: sinCache })
      return Response.json({ ok: true, mensajes: sesion.mensajes, turno: sesion.turno }, { headers: sinCache })
    }
    if (request.method === "POST" && url.pathname === "/api/chat") {
      return chat(request)
    }
    // Una ruta /api/ desconocida devolvía 200 con el HTML de la interfaz, así que un
    // cliente que se equivocara de ruta recibía una página en vez de un error.
    if (url.pathname.startsWith("/api/")) {
      return Response.json({ ok: false, error: `No existe la ruta ${request.method} ${url.pathname}.` }, { status: 404 })
    }
    if (rutaProhibida(url.pathname)) return new Response("No encontrado", { status: 404 })
    if (request.method === "GET") return estatico(url.pathname)
    return new Response("No encontrado", { status: 404 })
}

console.log(`Agente de órdenes de compra en http://localhost:${puerto}`)

async function chat(request: Request): Promise<Response> {
  const tipo = request.headers.get("content-type") ?? ""
  if (!tipo.toLowerCase().startsWith("application/json")) {
    return Response.json({ ok: false, error: "El contenido tiene que ser JSON." }, { status: 415, headers: sinCache })
  }
  const declarado = Number(request.headers.get("content-length") ?? "0")
  if (declarado > maxCuerpo) {
    return Response.json({ ok: false, error: "El cuerpo supera el tamaño permitido." }, { status: 413, headers: sinCache })
  }
  let cuerpo: { sessionId?: string; message?: string; actionId?: string; caso?: string }
  try {
    const texto = await request.text()
    if (texto.length > maxCuerpo) {
      return Response.json({ ok: false, error: "El cuerpo supera el tamaño permitido." }, { status: 413, headers: sinCache })
    }
    cuerpo = JSON.parse(texto) as { sessionId?: string; message?: string; actionId?: string; caso?: string }
  } catch {
    return Response.json({ ok: false, error: "El mensaje no es JSON." }, { status: 400, headers: sinCache })
  }
  const message = (cuerpo.message ?? "").trim()
  if (!message || message.length > maxMensaje) {
    return Response.json({ ok: false, error: "El mensaje está vacío o supera el tamaño permitido." }, { status: 400, headers: sinCache })
  }
  const sesion = abrirSesion(cuerpo.sessionId)
  if ("error" in sesion) {
    return Response.json({ ok: false, error: sesion.error }, { status: sesion.status, headers: sinCache })
  }
  if (sesion.tokens >= maxTokens) {
    return Response.json({ ok: false, error: "Esta sesión llegó al tope de tokens. Abre una sesión nueva." }, { status: 429, headers: sinCache })
  }
  if (sesionesOcupadas.has(sesion.id) || modelosEnCurso >= maxModelos) {
    return Response.json(
      { ok: false, error: "Hay demasiadas solicitudes al modelo. La sesión sigue abierta; reintenta en unos segundos." },
      { status: 429, headers: sinCache },
    )
  }
  if (!process.env.LLM_API_KEY && !adaptadorFalso) {
    return Response.json({ ok: false, error: "Falta LLM_API_KEY en el servidor." }, { status: 500, headers: sinCache })
  }
  sesionesOcupadas.add(sesion.id)
  modelosEnCurso += 1
  const turnoPrevio = sesion.turno
  const mensajesPrevios = sesion.mensajes.length
  sesion.turno += 1
  try {
  return await completarChat(cuerpo, message, sesion, turnoPrevio, mensajesPrevios)
  } finally {
    sesionesOcupadas.delete(sesion.id)
    modelosEnCurso -= 1
  }
}

function abrirSesion(pedido: unknown): Sesion | { error: string; status: number } {
  if (typeof pedido === "string" && pedido.length > 0) {
    if (!UUID.test(pedido)) return { error: "Sesión inválida.", status: 400 }
    const existente = cargarSesion(pedido)
    if (existente) return existente
  }
  if (sesiones.size >= maxSesiones) {
    return { error: "Hay demasiadas sesiones abiertas. Espera a que caduquen.", status: 429 }
  }
  return {
    id: randomUUID(),
    mensajes: [{ role: "system", content: prompt, tool_calls: undefined }],
    tokens: 0,
    turno: 0,
    actividadEn: new Date().toISOString(),
  }
}

async function completarChat(
  cuerpo: { sessionId?: string; message?: string; actionId?: string; caso?: string },
  message: string,
  sesion: Sesion,
  turnoPrevio: number,
  mensajesPrevios: number,
): Promise<Response> {
  const ctx: Contexto = {
    directory,
    sessionId: sesion.id,
    turno: sesion.turno,
    outDir,
    intentos: new Map(),
  }
  const avisos: string[] = []
  const contexto = contextoDelCaso(cuerpo.caso)
  if (!contexto.ok) {
    sesion.turno = turnoPrevio
    sesion.mensajes.length = mensajesPrevios
    return Response.json({ ok: false, error: contexto.error, sessionId: sesion.id }, { status: 400, headers: sinCache })
  }
  if (contexto.aviso) avisos.push(contexto.aviso)
  if (cuerpo.actionId) {
    const preparada = await prepararConfirmacion(cuerpo.actionId, sesion, ctx)
    if (!preparada.ok) {
      sesion.turno = turnoPrevio
      sesion.mensajes.length = mensajesPrevios
      return Response.json({ ok: false, error: preparada.error, sessionId: sesion.id }, { status: 400, headers: sinCache })
    }
    avisos.push(preparada.aviso)
    ctx.actionId = cuerpo.actionId
  }
  sesion.mensajes.push({ role: "user", content: avisos.length ? `${message}\n${avisos.join("\n")}` : message })
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
  return Response.json(
    {
      sessionId: sesion.id,
      reply: resultado.reply,
      toolCalls: resultado.toolCalls,
      needsConfirmation: Boolean(confirmacion) && !creada,
      confirmacion,
    },
    { headers: sinCache },
  )
}

async function prepararConfirmacion(
  actionId: string,
  sesion: Sesion,
  ctx: Contexto,
): Promise<{ ok: true; aviso: string } | { ok: false; error: string }> {
  const ubicacion = sitio()
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
  const ubicacion = sitio()
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

function rutaProhibida(pathname: string): boolean {
  if (/^\/(fixtures|out|src|modulo|agent|test|node_modules)(\/|$)/.test(pathname)) return true
  return pathname.split("/").some((parte) => parte.startsWith("."))
}

async function estatico(ruta: string): Promise<Response> {
  const relativa = ruta === "/" ? "index.html" : ruta.replace(/^\/+/, "")
  const web = path.resolve(directory, "web", "dist")
  const archivo = path.resolve(web, relativa)
  if (!dentroDe(web, archivo) && archivo !== web) return new Response("No encontrado", { status: 404 })
  const file = Bun.file(archivo)
  if (await file.exists()) return new Response(file)
  if (relativa !== "index.html" && path.extname(relativa)) return new Response("No encontrado", { status: 404 })
  const indice = Bun.file(path.join(web, "index.html"))
  if (await indice.exists()) return new Response(indice, { headers: { "content-type": "text/html", ...sinCache } })
  return new Response("Falta compilar el front. Ejecuta bun run build.", { status: 404 })
}

const POLITICA = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ")

function conDefensa(respuesta: Response, request: Request): Response {
  const headers = new Headers(respuesta.headers)
  headers.set("content-security-policy", POLITICA)
  headers.set("x-content-type-options", "nosniff")
  headers.set("referrer-policy", "no-referrer")
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()")
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "")
  if (proto === "https") headers.set("strict-transport-security", "max-age=31536000")
  return new Response(respuesta.body, { status: respuesta.status, statusText: respuesta.statusText, headers })
}

export type { VistaLlamada }
