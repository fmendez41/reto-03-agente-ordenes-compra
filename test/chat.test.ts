import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { cerrarTurno, ejecutarTurno } from "../src/agent/loop.ts"
import type { LlmAdapter, MensajeModelo } from "../src/llm/adapter.ts"
import { copiaFixtures, RAIZ } from "./ayuda.ts"

const PASOS = [
  "oc_leer_paquete",
  "oc_validar",
  "oc_construir_payload",
  "oc_generar_evidencia",
  "oc_crear",
]

function adaptadorFeliz(): LlmAdapter {
  let paso = 0
  return {
    proveedor: "falso",
    modelo: "falso",
    async enviar(mensajes) {
      const nombre = PASOS[paso]
      paso += 1
      if (!nombre) return { content: "Orden creada.", tokens: 1, toolCalls: [] }
      const construccion = [...mensajes].reverse().find((mensaje) => mensaje.role === "tool" && mensaje.content?.includes("\"orden\""))
      const previo = construccion?.content ? (JSON.parse(construccion.content) as { data?: { orden?: unknown } }) : null
      const args =
        nombre === "oc_crear"
          ? { caso: "sol-001", payload: previo?.data?.orden ?? { vacio: true } }
          : nombre === "oc_construir_payload"
            ? { caso: "sol-001", paquete: {}, derivados: {} }
            : nombre === "oc_validar"
              ? { caso: "sol-001", paquete: {} }
              : { caso: "sol-001" }
      return {
        content: null,
        tokens: 1,
        toolCalls: [{ id: String(paso), name: nombre, arguments: JSON.stringify(args) }],
      }
    },
  }
}

describe("chat de sol-001", () => {
  test("una instrucción lista para crear recorre las herramientas y escribe una sola OC", async () => {
    const { ubicacion, limpiar } = copiaFixtures()
    const historial: MensajeModelo[] = [
      { role: "system", content: readFileSync(path.join(RAIZ, "agent/prompt.md"), "utf8") },
      { role: "user", content: "Procesa sol-001 y créala si todo está en orden." },
    ]
    const ctx = {
      directory: ubicacion.directory,
      sessionId: "chat-sol-001",
      turno: 1,
      fixturesDir: ubicacion.fixturesDir,
      outDir: ubicacion.outDir,
      intentos: new Map(),
    }
    const resultado = await ejecutarTurno({
      directory: ubicacion.directory,
      adapter: adaptadorFeliz(),
      historial,
      ctx,
      maxIteraciones: 8,
    })
    cerrarTurno(ctx, true)
    expect(resultado.toolCalls.map((llamada) => llamada.name)).toEqual(PASOS)
    const fallida = resultado.toolCalls.find((llamada) => !llamada.ok)
    expect(`${fallida?.name ?? "ok"}: ${fallida?.error ?? "ok"}`).toBe("ok: ok")
    const crear = resultado.toolCalls.find((llamada) => llamada.name === "oc_crear")
    const data = crear?.data as { numero_oc?: string; idempotente?: boolean }
    expect(data.numero_oc).toBe("4500000001")
    expect(data.idempotente).toBe(false)
    const ordenes = readFileSync(path.join(ubicacion.outDir, "sap", "ordenes.jsonl"), "utf8").trim().split("\n")
    expect(ordenes).toHaveLength(1)
    expect(readFileSync(path.join(ubicacion.outDir, "sol-001", "aprobacion.txt"), "utf8")).toContain("sha256:")
    const control = readFileSync(path.join(ubicacion.outDir, "control.csv"), "utf8")
    expect(control).toContain("CREADA")
    expect(control).not.toContain("PENDIENTE_CONFIRMACION")
    limpiar()
  })

  test("el prompt crea el caso listo y se detiene si la analista pide no crearlo", () => {
    const prompt = readFileSync(path.join(RAIZ, "agent/prompt.md"), "utf8")
    expect(prompt).toContain("LISTA_PARA_CREAR")
    expect(prompt).toContain("no pidió explícitamente que no la crees")
    expect(prompt).toContain("Si la analista pidió no crearla, no llames a oc_crear")
  })
})
