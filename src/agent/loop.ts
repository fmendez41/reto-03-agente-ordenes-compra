import { appendFileSync, mkdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { z } from "zod"
import type { HerramientaJson, LlmAdapter, MensajeModelo } from "../llm/adapter.ts"
import { nombreRegla } from "../core/catalogo-reglas.ts"
import { flushContexto, herramientas, type Contexto, type Definicion } from "../core/tools/oc.ts"
import { ubicar } from "../core/rutas.ts"

const TABLA: Record<string, Definicion> = {
  oc_leer_paquete: herramientas.leer_paquete,
  oc_validar: herramientas.validar,
  oc_construir_payload: herramientas.construir_payload,
  oc_generar_evidencia: herramientas.generar_evidencia,
  oc_crear: herramientas.crear,
}

export type VistaLlamada = {
  name: string
  titulo: string
  args: unknown
  ok: boolean
  resumen: string
  data?: unknown
  error?: string
}

const TITULOS: Record<string, string> = {
  oc_leer_paquete: "Leí el paquete del caso",
  oc_validar: "Validé contra los maestros",
  oc_construir_payload: "Armé la orden de compra",
  oc_generar_evidencia: "Generé la evidencia de aprobación",
  oc_crear: "Creé la orden en SAP",
}

export function cargarPrompt(directory: string): string {
  const prompt = readFileSync(path.join(directory, "agent", "prompt.md"), "utf8").trim()
  const conocimiento = readFileSync(path.join(directory, "src", "knowledge", "ordenes-compra.md"), "utf8").trim()
  return `${prompt}\n\nConocimiento del proceso:\n${conocimiento}`
}

export function esquemaHerramientas(): HerramientaJson[] {
  return Object.entries(TABLA).map(([name, definicion]) => ({
    name,
    description: definicion.description,
    parameters: parametros(definicion.args),
  }))
}

export const MAX_HISTORIAL_CARACTERES = 120000

export async function ejecutarTurno(opciones: {
  directory: string
  adapter: LlmAdapter
  historial: MensajeModelo[]
  ctx: Contexto
  maxIteraciones: number
  maxHistorialCaracteres?: number
}): Promise<{ reply: string; toolCalls: VistaLlamada[]; tokens: number }> {
  const mensajes = opciones.historial
  const tope = opciones.maxHistorialCaracteres ?? MAX_HISTORIAL_CARACTERES
  const vistas: VistaLlamada[] = []
  let tokens = 0
  const cerrar = (reply: string) => {
    mensajes.push({ role: "assistant", content: reply })
    return { reply, toolCalls: vistas, tokens }
  }
  for (let i = 0; i < opciones.maxIteraciones; i++) {
    let respuesta: Awaited<ReturnType<LlmAdapter["enviar"]>>
    try {
      respuesta = await opciones.adapter.enviar(podarHistorial(mensajes, tope), esquemaHerramientas())
    } catch (error) {
      const texto = error instanceof Error ? error.message : "Fallo el proveedor."
      return cerrar(texto)
    }
    tokens += respuesta.tokens
    if (respuesta.toolCalls.length === 0) {
      return cerrar(respuesta.content ?? "No tengo una respuesta.")
    }
    mensajes.push({ role: "assistant", content: respuesta.content, tool_calls: respuesta.toolCalls })
    for (const llamada of respuesta.toolCalls) {
      const resultado = await ejecutarLlamada(llamada.name, llamada.arguments, opciones.ctx, opciones.directory)
      vistas.push(resultado.vista)
      mensajes.push({ role: "tool", tool_call_id: llamada.id, content: resultado.cuerpo })
    }
  }
  const resumen = vistas.map((vista) => `${vista.titulo}: ${vista.resumen}`).join("\n")
  return cerrar(
    `Llegué al tope de iteraciones. Esto obtuve:\n${resumen || "ninguna herramienta"}\nFalta cerrar el caso en un turno nuevo.`,
  )
}

/**
 * La sesión guarda el historial completo porque la sección 6.4 del PRD lo expone por API,
 * pero al modelo se le manda solo la cola que cabe en el presupuesto. El corte nunca puede
 * empezar en un mensaje `tool`: OpenAI rechaza un resultado de herramienta cuyo mensaje
 * `assistant` con `tool_calls` quedó fuera de la ventana.
 */
export function podarHistorial(mensajes: MensajeModelo[], maxCaracteres: number): MensajeModelo[] {
  if (mensajes.length === 0) return mensajes
  const sistema = mensajes[0]?.role === "system" ? [mensajes[0]] : []
  const resto = sistema.length > 0 ? mensajes.slice(1) : mensajes
  const presupuesto = maxCaracteres - pesar(sistema)
  let acumulado = 0
  let corte = resto.length
  for (let indice = resto.length - 1; indice >= 0; indice--) {
    acumulado += pesar([resto[indice]!])
    if (acumulado > presupuesto && indice < resto.length - 1) break
    corte = indice
  }
  while (corte > 0 && resto[corte]!.role === "tool") corte -= 1
  if (corte === 0) return mensajes
  return [...sistema, ...resto.slice(corte)]
}

function pesar(mensajes: MensajeModelo[]): number {
  let total = 0
  for (const mensaje of mensajes) total += JSON.stringify(mensaje).length
  return total
}

async function ejecutarLlamada(
  nombre: string,
  argumentos: string,
  ctx: Contexto,
  directory: string,
): Promise<{ vista: VistaLlamada; cuerpo: string }> {
  const titulo = TITULOS[nombre] ?? nombre
  const definicion = TABLA[nombre]
  if (!definicion) {
    const error = `No existe la herramienta ${nombre}.`
    return {
      cuerpo: JSON.stringify({ ok: false, error }),
      vista: { name: nombre, titulo, args: argumentos, ok: false, resumen: error, error },
    }
  }
  let args: Record<string, unknown> = {}
  try {
    const crudo = JSON.parse(argumentos) as unknown
    args = z.object(definicion.args).strict().parse(crudo) as Record<string, unknown>
  } catch {
    const error = "Los argumentos no cumplen el esquema."
    registrar(directory, ctx, nombre, argumentos, false, error)
    return {
      cuerpo: JSON.stringify({ ok: false, error }),
      vista: { name: nombre, titulo, args: argumentos, ok: false, resumen: error, error },
    }
  }
  const cuerpo = await definicion.execute(args, ctx)
  const parsed = JSON.parse(cuerpo) as { ok: boolean; error?: string; data?: unknown }
  const resumen = parsed.ok ? describir(nombre, parsed.data) : (parsed.error ?? "Error")
  registrar(directory, ctx, nombre, args, parsed.ok, parsed.ok ? truncar(parsed.data) : resumen)
  return {
    cuerpo,
    vista: {
      name: nombre,
      titulo,
      args,
      ok: parsed.ok,
      resumen,
      data: parsed.ok ? parsed.data : undefined,
      error: parsed.ok ? undefined : (parsed.error ?? "Error"),
    },
  }
}

function truncar(data: unknown): string {
  const texto = JSON.stringify(data)
  return texto.length > 500 ? `${texto.slice(0, 500)}…` : texto
}

const PIEZAS: Record<string, string> = {
  correo: "el correo",
  solicitud: "la solicitud",
  cotizacion: "la cotización",
  aprobacion: "la aprobación",
  factura: "la factura",
}

export function describir(nombre: string, data: unknown): string {
  const registro = (data ?? {}) as Record<string, unknown>
  if (nombre === "oc_leer_paquete") {
    const ausentes = Array.isArray(registro.ausentes) ? (registro.ausentes as string[]) : []
    const piezas = Object.entries(PIEZAS)
      .filter(([clave]) => registro[clave] !== null && registro[clave] !== undefined)
      .map(([, nombreLegible]) => nombreLegible)
    const falta = ausentes.length > 0 ? ` Falta ${ausentes.map((pieza) => PIEZAS[pieza] ?? pieza).join(", ")}.` : ""
    return `Leí ${piezas.join(", ")}.${falta}`
  }
  if (nombre === "oc_validar") {
    const estado = String(registro.estado ?? "")
    const bloqueos = codigosDe(registro.bloqueos)
    const confirmaciones = codigosDe(registro.confirmaciones)
    if (estado === "BLOQUEADA") return `Bloqueada por ${enumerar(bloqueos.map(nombreRegla))}.`
    if (estado === "PENDIENTE_CONFIRMACION") return `Falta confirmar ${enumerar(confirmaciones.map(nombreRegla))}.`
    return "Pasó los diez controles sin observaciones."
  }
  if (nombre === "oc_construir_payload") {
    const orden = registro.orden as
      | { proveedor?: { nombre?: string }; posiciones?: Array<{ cantidad?: number; precio_unitario?: number }> }
      | undefined
    const posicion = orden?.posiciones?.[0]
    const total =
      posicion && typeof posicion.cantidad === "number" && typeof posicion.precio_unitario === "number"
        ? ` por ${posicion.cantidad * posicion.precio_unitario}`
        : ""
    return `Orden armada para ${orden?.proveedor?.nombre ?? "el proveedor"}${total}. Todavía no está en SAP.`
  }
  if (nombre === "oc_generar_evidencia") {
    const sha = String(registro.sha256 ?? "")
    const aviso = registro.aviso ? " El PDF no se pudo generar." : ""
    return `Correo de aprobación firmado con sha256 ${sha.slice(0, 12)}….${aviso}`
  }
  if (nombre === "oc_crear") {
    const numero = String(registro.numero_oc ?? "")
    return registro.idempotente
      ? `Esa solicitud ya tenía la orden ${numero}, así que no se creó otra.`
      : `Orden ${numero} creada en SAP con su evidencia firmada.`
  }
  return "Listo."
}

function enumerar(items: string[]): string {
  if (items.length === 0) return "ningún control"
  if (items.length === 1) return items[0] ?? ""
  return `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`
}

function codigosDe(valor: unknown): string[] {
  if (!Array.isArray(valor)) return []
  return valor
    .map((item) => (item && typeof item === "object" && "regla" in item ? String((item as { regla: unknown }).regla) : ""))
    .filter((item) => item.length > 0)
}

function registrar(directory: string, ctx: Contexto, nombre: string, args: unknown, ok: boolean, summary: string): void {
  const ubicacion = ubicar(directory, { outDir: ctx.outDir })
  mkdirSync(ubicacion.outDir, { recursive: true })
  const linea = JSON.stringify({
    ts: new Date().toISOString(),
    sessionId: ctx.sessionId,
    name: nombre,
    args,
    ok,
    summary: redactar(summary),
  })
  appendFileSync(path.join(ubicacion.outDir, "log.jsonl"), `${linea}\n`, "utf8")
}

export function redactar(texto: string): string {
  return texto.replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redactado]").replace(/Bearer\s+\S+/gi, "Bearer [redactado]")
}

export function cerrarTurno(ctx: Contexto, _consumida: boolean): void {
  flushContexto(ctx)
}

function parametros(args: Record<string, z.ZodType>): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (const [clave, esquema] of Object.entries(args)) {
    properties[clave] = nodo(esquema)
    if (!(esquema instanceof z.ZodOptional)) required.push(clave)
  }
  return { type: "object", properties, required, additionalProperties: false }
}

function nodo(esquema: z.ZodType): Record<string, unknown> {
  if (esquema instanceof z.ZodOptional) return nodo(esquema.unwrap())
  if (esquema instanceof z.ZodString) return { type: "string", description: esquema.description }
  if (esquema instanceof z.ZodNumber) return { type: "number", description: esquema.description }
  if (esquema instanceof z.ZodBoolean) return { type: "boolean", description: esquema.description }
  return { description: esquema.description }
}
