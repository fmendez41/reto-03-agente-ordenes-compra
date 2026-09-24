import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { RAIZ } from "./ayuda.ts"

describe("acceso", () => {
  test("health es público y el resto exige el token", async () => {
    const out = mkdtempSync(path.join(tmpdir(), "oc-acceso-"))
    const puerto = 3217
    const token = "secreto-defensa"
    const proceso = Bun.spawn(["bun", "--no-env-file", "src/server.ts"], {
      cwd: RAIZ,
      env: {
        PATH: process.env.PATH ?? "",
        PORT: String(puerto),
        APP_ACCESS_TOKEN: token,
        OUT_DIR: out,
        LLM_MODEL: "gpt-4.1-mini",
      },
      stdout: "pipe",
      stderr: "pipe",
    })
    try {
      await esperar(puerto)
      const health = await fetch(`http://127.0.0.1:${puerto}/api/health`)
      const healthJson = (await health.json()) as { ok: boolean; provider: string }
      expect(health.status).toBe(200)
      expect(healthJson.ok).toBe(true)
      expect(JSON.stringify(healthJson)).not.toContain("sk-")

      const casos = await fetch(`http://127.0.0.1:${puerto}/api/casos`)
      expect(casos.status).toBe(401)
      const chat = await fetch(`http://127.0.0.1:${puerto}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "hola" }),
      })
      expect(chat.status).toBe(401)
      const sesion = await fetch(`http://127.0.0.1:${puerto}/api/sessions/00000000-0000-0000-0000-000000000001`)
      expect(sesion.status).toBe(401)

      const autorizado = await fetch(`http://127.0.0.1:${puerto}/api/casos`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(autorizado.status).toBe(200)
      const detalle = await fetch(`http://127.0.0.1:${puerto}/api/casos/sol-003`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(detalle.status).toBe(200)
    } finally {
      proceso.kill()
      await proceso.exited
      rmSync(out, { recursive: true, force: true })
    }
  })
})

async function esperar(puerto: number): Promise<void> {
  for (let i = 0; i < 40; i++) {
    try {
      const respuesta = await fetch(`http://127.0.0.1:${puerto}/api/health`)
      if (respuesta.ok) return
    } catch {
      await Bun.sleep(100)
    }
  }
  throw new Error("El servidor de prueba no arrancó.")
}
