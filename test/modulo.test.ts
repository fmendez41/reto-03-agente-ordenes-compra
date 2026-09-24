import { describe, expect, test } from "bun:test"
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { RAIZ } from "./ayuda.ts"

describe("modulo copiado", () => {
  test(
    "la carpeta sola instala sus dependencias y lee el paquete",
    async () => {
      const destino = mkdtempSync(path.join(tmpdir(), "oc-modulo-"))
      const modulo = path.join(destino, "modulo")
      cpSync(path.join(RAIZ, "modulo"), modulo, {
        recursive: true,
        filter: (origen) => !origen.split(path.sep).includes("node_modules"),
      })
      cpSync(
        path.join(RAIZ, "fixtures", "reto-03", "solicitudes", "sol-001"),
        path.join(destino, "fixtures", "reto-03", "solicitudes", "sol-001"),
        { recursive: true },
      )
      const instalacion = Bun.spawn(["bun", "install", "--frozen-lockfile"], {
        cwd: modulo,
        stdout: "pipe",
        stderr: "pipe",
      })
      const codigoInstalacion = await instalacion.exited
      const errorInstalacion = await new Response(instalacion.stderr).text()
      expect({ codigoInstalacion, errorInstalacion }).toEqual({ codigoInstalacion: 0, errorInstalacion: "" })

      writeFileSync(
        path.join(destino, "probar.ts"),
        [
          "import { leer_paquete } from './modulo/tools/oc.ts'",
          "const texto = await leer_paquete.execute({ caso: 'sol-001' }, { directory: process.cwd(), sessionId: 'aislada' })",
          "const respuesta = JSON.parse(texto)",
          "const solicitud = respuesta.ok ? respuesta.data.solicitud.solicitud_id : ''",
          "if (solicitud !== 'SOL-2026-001') {",
          "  console.error(texto)",
          "  process.exit(1)",
          "}",
          "console.log(solicitud)",
        ].join("\n"),
      )
      const proceso = Bun.spawn(["bun", "probar.ts"], { cwd: destino, stdout: "pipe", stderr: "pipe" })
      const codigo = await proceso.exited
      const salida = (await new Response(proceso.stdout).text()).trim()
      const error = await new Response(proceso.stderr).text()
      rmSync(destino, { recursive: true, force: true })
      expect({ codigo, salida, error }).toEqual({ codigo: 0, salida: "SOL-2026-001", error: "" })
    },
    60_000,
  )
})
