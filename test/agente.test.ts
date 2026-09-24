import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { ejecutarTurno, podarHistorial, redactar } from "../src/agent/loop.ts"
import { crearAdaptadorOpenAI } from "../src/llm/openai.ts"
import type { LlmAdapter, MensajeModelo } from "../src/llm/adapter.ts"
import { copiaFixtures, RAIZ } from "./ayuda.ts"

describe("adaptador", () => {
  test("traduce una respuesta con tool call y no filtra la clave", async () => {
    let autorizacion = ""
    const adaptador = crearAdaptadorOpenAI({
      apiKey: "sk-testsecreto123456",
      model: "gpt-4.1-mini",
      timeoutMs: 1000,
      fetchImpl: async (_url, init) => {
        autorizacion = String((init.headers as Record<string, string>).authorization)
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: null, tool_calls: [{ id: "1", function: { name: "oc_leer_paquete", arguments: "{\"caso\":\"sol-001\"}" } }] } }],
            usage: { total_tokens: 12 },
          }),
          { status: 200 },
        )
      },
    })
    const respuesta = await adaptador.enviar([{ role: "user", content: "hola" }], [])
    expect(respuesta.toolCalls[0]?.name).toBe("oc_leer_paquete")
    expect(autorizacion).toContain("sk-testsecreto123456")
    expect(redactar(autorizacion)).not.toContain("sk-testsecreto123456")
  })

  test("el tope de iteraciones responde con lo obtenido", async () => {
    const adaptador: LlmAdapter = {
      proveedor: "falso",
      modelo: "falso",
      async enviar() {
        return { content: null, tokens: 1, toolCalls: [{ id: "1", name: "oc_leer_paquete", arguments: "{\"caso\":\"sol-001\"}" }] }
      },
    }
    const resultado = await ejecutarTurno({
      directory: RAIZ,
      adapter: adaptador,
      historial: [],
      ctx: { directory: RAIZ, sessionId: "s", turno: 1, outDir: path.join(RAIZ, "out-test-tope"), intentos: new Map() },
      maxIteraciones: 1,
    })
    expect(resultado.reply).toContain("tope")
    expect(resultado.toolCalls).toHaveLength(1)
  })
})

describe("historial de la sesión", () => {
  test("el segundo turno ve los resultados de herramienta del primero", async () => {
    const { ubicacion, limpiar } = copiaFixtures()
    const recibidos: MensajeModelo[][] = []
    let llamadas = 0
    const adaptador: LlmAdapter = {
      proveedor: "falso",
      modelo: "falso",
      async enviar(mensajes) {
        recibidos.push(mensajes.map((mensaje) => ({ ...mensaje })))
        llamadas += 1
        if (llamadas === 1) {
          return {
            content: null,
            tokens: 1,
            toolCalls: [{ id: "1", name: "oc_leer_paquete", arguments: "{\"caso\":\"sol-001\"}" }],
          }
        }
        return { content: "Listo.", tokens: 1, toolCalls: [] }
      },
    }
    const historial: MensajeModelo[] = [{ role: "system", content: "Eres el agente." }]
    const turno = async (texto: string, numero: number) => {
      historial.push({ role: "user", content: texto })
      await ejecutarTurno({
        directory: ubicacion.directory,
        adapter: adaptador,
        historial,
        ctx: {
          directory: ubicacion.directory,
          sessionId: "s",
          turno: numero,
          fixturesDir: ubicacion.fixturesDir,
          outDir: ubicacion.outDir,
          intentos: new Map(),
        },
        maxIteraciones: 5,
      })
    }
    try {
      await turno("Procesa sol-001.", 1)
      await turno("¿Cuál es el NIT del proveedor?", 2)
      const ultima = recibidos.at(-1) ?? []
      const herramientas = ultima.filter((mensaje) => mensaje.role === "tool")
      expect(herramientas.length).toBeGreaterThan(0)
      expect(herramientas.map((mensaje) => mensaje.content ?? "").join("")).toContain("900555111")
      expect(historial.filter((mensaje) => mensaje.role === "tool")).toHaveLength(1)
      expect(historial.filter((mensaje) => mensaje.role === "assistant")).toHaveLength(3)
    } finally {
      limpiar()
    }
  })

  test("la poda conserva el sistema y nunca empieza en un resultado de herramienta", () => {
    const mensajes: MensajeModelo[] = [
      { role: "system", content: "sistema" },
      { role: "user", content: "antiguo".repeat(200) },
      { role: "assistant", content: "viejo".repeat(200) },
      { role: "user", content: "reciente" },
      { role: "assistant", content: null, tool_calls: [{ id: "1", name: "oc_validar", arguments: "{}" }] },
      { role: "tool", tool_call_id: "1", content: "resultado" },
    ]
    const podado = podarHistorial(mensajes, 400)
    expect(podado[0]?.role).toBe("system")
    expect(podado[1]?.role).not.toBe("tool")
    expect(podado.length).toBeLessThan(mensajes.length)
    expect(podado.at(-1)?.role).toBe("tool")
    expect(podado.at(-2)?.tool_calls?.[0]?.id).toBe("1")
  })

  test("la poda deja el historial intacto cuando cabe entero", () => {
    const mensajes: MensajeModelo[] = [
      { role: "system", content: "sistema" },
      { role: "user", content: "hola" },
    ]
    expect(podarHistorial(mensajes, 120000)).toEqual(mensajes)
  })
})

describe("textos únicos", () => {
  test("el prompt y el conocimiento coinciden con el módulo", () => {
    const prompt = readFileSync(path.join(RAIZ, "agent/prompt.md"), "utf8").trim()
    const agent = cuerpo(readFileSync(path.join(RAIZ, "modulo/agent.md"), "utf8"))
    expect(agent).toBe(prompt)
    const conocimiento = readFileSync(path.join(RAIZ, "src/knowledge/ordenes-compra.md"), "utf8").trim()
    const skill = cuerpo(readFileSync(path.join(RAIZ, "modulo/skill/ordenes-compra/SKILL.md"), "utf8"))
    expect(skill).toBe(conocimiento)
  })

  test("el módulo no importa servidor, agente ni proveedor", () => {
    const vistos = new Set<string>()
    const pendientes = [path.join(RAIZ, "modulo/tools/oc.ts")]
    while (pendientes.length > 0) {
      const archivo = pendientes.pop()
      if (!archivo || vistos.has(archivo)) continue
      vistos.add(archivo)
      const texto = readFileSync(archivo, "utf8")
      const imports = [...texto.matchAll(/from "(\.\.?\/[^"]+)"/g)].map((coincidencia) => coincidencia[1] ?? "")
      for (const relativo of imports) {
        const resuelto = path.resolve(path.dirname(archivo), relativo)
        expect(resuelto.includes(`${path.sep}src${path.sep}server`)).toBe(false)
        expect(resuelto.includes(`${path.sep}src${path.sep}agent${path.sep}`)).toBe(false)
        expect(resuelto.includes(`${path.sep}src${path.sep}llm${path.sep}`)).toBe(false)
        if (resuelto.endsWith(".ts")) pendientes.push(resuelto)
      }
    }
  })
})

function cuerpo(markdown: string): string {
  return markdown.replace(/^---[\s\S]*?---\s*/, "").trim()
}
