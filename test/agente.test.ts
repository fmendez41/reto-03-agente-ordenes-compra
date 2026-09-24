import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { ejecutarTurno, redactar } from "../src/agent/loop.ts"
import { crearAdaptadorOpenAI } from "../src/llm/openai.ts"
import type { LlmAdapter } from "../src/llm/adapter.ts"
import { RAIZ } from "./ayuda.ts"

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
