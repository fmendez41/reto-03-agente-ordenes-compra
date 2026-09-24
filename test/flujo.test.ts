import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { ordenesDe, procesarCaso } from "../src/core/flujo.ts"
import { construir_payload, crear, type Contexto } from "../src/core/tools/oc.ts"
import { copiaFixtures } from "./ayuda.ts"

describe("recorrido", () => {
  test("crea sol-001 una vez y la segunda es idempotente", async () => {
    const { ubicacion, limpiar } = copiaFixtures()
    const primera = await procesarCaso("sol-001", { ...ubicacion, sessionId: "demo", turno: 1 })
    const segunda = await procesarCaso("sol-001", { ...ubicacion, sessionId: "demo", turno: 3 })
    expect(primera.numero_oc).toBe("4500000001")
    expect(segunda.numero_oc).toBe(primera.numero_oc)
    expect(segunda.idempotente).toBe(true)
    expect(ordenesDe(ubicacion.directory, ubicacion.outDir)).toHaveLength(1)
    limpiar()
  })

  test("sol-004 solo se crea al consumir la confirmación", async () => {
    const { ubicacion, limpiar } = copiaFixtures()
    const pendiente = await procesarCaso("sol-004", { ...ubicacion, sessionId: "demo", turno: 1 })
    expect(pendiente.numero_oc).toBeNull()
    const creada = await procesarCaso("sol-004", { ...ubicacion, confirmar: true, sessionId: "demo", turno: 5 })
    expect(creada.numero_oc).toBeTruthy()
    const csv = readFileSync(path.join(ubicacion.outDir, "control.csv"), "utf8")
    expect(csv).toContain("PENDIENTE_CONFIRMACION")
    expect(csv).toContain("CREADA")
    limpiar()
  })

  test("oc_crear escribe la evidencia aunque nadie haya llamado a oc_generar_evidencia", async () => {
    const { ubicacion, limpiar } = copiaFixtures()
    const ctx: Contexto = {
      directory: ubicacion.directory,
      sessionId: "agente",
      turno: 1,
      fixturesDir: ubicacion.fixturesDir,
      outDir: ubicacion.outDir,
      intentos: new Map(),
    }
    try {
      const armado = JSON.parse(await construir_payload.execute({ caso: "sol-001", paquete: null, derivados: null }, ctx))
      expect(armado.ok).toBe(true)
      const txt = path.join(ubicacion.outDir, "sol-001", "aprobacion.txt")
      expect(existsSync(txt)).toBe(false)

      const creado = JSON.parse(await crear.execute({ caso: "sol-001", payload: armado.data.orden }, ctx))
      expect(creado.ok).toBe(true)
      expect(existsSync(txt)).toBe(true)
      expect(readFileSync(txt, "utf8")).toContain(`sha256: ${creado.data.evidencia.sha256}`)
      expect(creado.data.evidencia.sha256).toMatch(/^[0-9a-f]{64}$/)
    } finally {
      limpiar()
    }
  })
})
