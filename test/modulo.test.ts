import { describe, expect, test } from "bun:test"
import { cpSync, mkdtempSync, rmSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { RAIZ } from "./ayuda.ts"

describe("modulo copiado", () => {
  test("la carpeta sola importa las herramientas", async () => {
    const destino = mkdtempSync(path.join(tmpdir(), "oc-modulo-"))
    cpSync(path.join(RAIZ, "modulo"), path.join(destino, "modulo"), { recursive: true })
    symlinkSync(path.join(RAIZ, "node_modules"), path.join(destino, "node_modules"), "junction")
    const proceso = Bun.spawn(
      ["bun", "-e", "import { leer_paquete } from './modulo/tools/oc.ts'; console.log(typeof leer_paquete.execute)"],
      { cwd: destino, stdout: "pipe", stderr: "pipe" },
    )
    const codigo = await proceso.exited
    const salida = (await new Response(proceso.stdout).text()).trim()
    const error = await new Response(proceso.stderr).text()
    rmSync(destino, { recursive: true, force: true })
    expect({ codigo, salida, error }).toEqual({ codigo: 0, salida: "function", error: "" })
  })
})
