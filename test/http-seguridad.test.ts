import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { RAIZ } from "./ayuda.ts"

const PUERTO = 3291
const TOKEN = "token-de-prueba-auditoria"

describe("http", () => {
  test("token, sesión, cupo, cuerpo y archivos", async () => {
    const out = mkdtempSync(path.join(tmpdir(), "oc-http-"))
    const proceso = Bun.spawn(["bun", "--no-env-file", "src/server.ts"], {
      cwd: RAIZ,
      env: {
        PATH: process.env.PATH ?? "",
        PORT: String(PUERTO),
        APP_ACCESS_TOKEN: TOKEN,
        OUT_DIR: out,
        LLM_FAKE: "1",
        RATE_LIMIT_MAX: "12",
        RATE_LIMIT_WINDOW_MS: "60000",
        NODE_ENV: "test",
      },
      stdout: "pipe",
      stderr: "pipe",
    })
    const base = `http://127.0.0.1:${PUERTO}`
    const auth = { authorization: `Bearer ${TOKEN}` }
    try {
      await esperar(PUERTO)
      const health = await fetch(`${base}/api/health`)
      const healthJson = (await health.json()) as { ok: boolean; provider: string; model: string }
      expect(health.status).toBe(200)
      expect(healthJson).toEqual({ ok: true, provider: "falso", model: "falso" })
      expect(health.headers.get("x-content-type-options")).toBe("nosniff")
      expect(health.headers.get("content-security-policy")).toContain("frame-ancestors 'none'")
      expect(health.headers.get("strict-transport-security")).toBeNull()

      expect((await fetch(`${base}/api/casos`)).status).toBe(401)
      expect((await fetch(`${base}/api/casos`, { headers: { authorization: "Bearer otro" } })).status).toBe(401)
      expect(
        (
          await fetch(`${base}/api/casos`, {
            headers: { authorization: `Bearer ${TOKEN}, Bearer ${TOKEN}` },
          })
        ).status,
      ).toBe(401)
      const casos = await fetch(`${base}/api/casos`, { headers: auth })
      expect(casos.status).toBe(200)
      expect(casos.headers.get("cache-control")).toBe("no-store")

      const inventada = "11111111-1111-4111-8111-111111111111"
      expect((await fetch(`${base}/api/sessions/${inventada}`, { headers: auth })).status).toBe(404)
      expect((await fetch(`${base}/api/sessions/no-es-uuid`, { headers: auth })).status).toBe(400)
      expect((await fetch(`${base}/api/sessions/${inventada}`)).status).toBe(401)

      const sinTipo = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ message: "hola" }),
      })
      expect(sinTipo.status).toBe(415)

      const fijada = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ sessionId: inventada, message: "hola", caso: "sol-001" }),
      })
      const fijadaJson = (await fijada.json()) as { sessionId: string }
      expect(fijada.status).toBe(200)
      expect(fijadaJson.sessionId).not.toBe(inventada)
      expect((await fetch(`${base}/api/sessions/${inventada}`, { headers: auth })).status).toBe(404)

      const seguida = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ sessionId: fijadaJson.sessionId, message: "sigue", caso: "sol-001" }),
      })
      const seguidaJson = (await seguida.json()) as { sessionId: string }
      expect(seguidaJson.sessionId).toBe(fijadaJson.sessionId)

      expect((await fetch(`${base}/fixtures/reto-03/maestros/proveedores.json`)).status).toBe(404)
      expect((await fetch(`${base}/.env`)).status).toBe(404)
      expect((await fetch(`${base}/package.json`)).status).toBe(404)
      const https = await fetch(`${base}/api/health`, { headers: { "x-forwarded-proto": "https" } })
      expect(https.headers.get("strict-transport-security")).toContain("max-age=")

      let limitado = 0
      for (let i = 0; i < 6; i++) {
        const respuesta = await fetch(`${base}/api/casos`)
        if (respuesta.status === 429) limitado += 1
      }
      expect(limitado).toBeGreaterThan(0)
    } finally {
      proceso.kill()
      await proceso.exited
      rmSync(out, { recursive: true, force: true })
    }
  })

  test("en producción sin token la API no se abre", async () => {
    const out = mkdtempSync(path.join(tmpdir(), "oc-prod-"))
    const puerto = 3292
    const proceso = Bun.spawn(["bun", "--no-env-file", "src/server.ts"], {
      cwd: RAIZ,
      env: {
        PATH: process.env.PATH ?? "",
        PORT: String(puerto),
        OUT_DIR: out,
        NODE_ENV: "production",
        LLM_FAKE: "1",
      },
      stdout: "pipe",
      stderr: "pipe",
    })
    try {
      await esperar(puerto)
      expect((await fetch(`http://127.0.0.1:${puerto}/api/health`)).status).toBe(200)
      expect((await fetch(`http://127.0.0.1:${puerto}/api/casos`)).status).toBe(401)
      const health = (await (await fetch(`http://127.0.0.1:${puerto}/api/health`)).json()) as { provider: string }
      expect(health.provider).not.toBe("falso")
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
