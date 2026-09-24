import { describe, expect, test } from "bun:test"
import { cpSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { RAIZ } from "./ayuda.ts"

describe("modulo copiado", () => {
  test("la carpeta sola no ejecuta: las herramientas viven en src/core", async () => {
    const destino = mkdtempSync(path.join(tmpdir(), "oc-modulo-"))
    cpSync(path.join(RAIZ, "modulo"), path.join(destino, "modulo"), { recursive: true })
    const proceso = Bun.spawn(
      ["bun", "-e", "import { leer_paquete } from './modulo/tools/oc.ts'; console.log(typeof leer_paquete.execute)"],
      { cwd: destino, stdout: "pipe", stderr: "pipe" },
    )
    const codigo = await proceso.exited
    const error = await new Response(proceso.stderr).text()
    expect(codigo).not.toBe(0)
    expect(error.length).toBeGreaterThan(0)
    rmSync(destino, { recursive: true, force: true })
  })
})
