import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { evidenciaDeCaso, sha256Texto, contenidoCanonico } from "../src/core/evidencia.ts"
import { construirOrden, guardarTrazabilidad } from "../src/core/payload.ts"
import { leerPaquete } from "../src/core/paquete.ts"
import { validarCaso } from "../src/core/reglas.ts"
import { truncarDescripcion } from "../src/core/unidad.ts"
import { copiaFixtures, RAIZ } from "./ayuda.ts"
import type { TrazaCampo } from "../src/core/types.ts"

describe("payload", () => {
  test("sol-001 usa UN y sol-004 usa H", () => {
    for (const [caso, unidad] of [
      ["sol-001", "UN"],
      ["sol-004", "H"],
    ] as const) {
      const { ubicacion, limpiar } = copiaFixtures()
      const paquete = leerPaquete(ubicacion, caso)
      if (!paquete.ok) throw new Error(paquete.error)
      const validacion = validarCaso(ubicacion, paquete.data)
      if (!validacion.ok) throw new Error(validacion.error)
      expect(validacion.data.derivados.unidad?.valor).toBe(unidad)
      limpiar()
    }
  })

  test("recorta la descripción a 40 y conserva el original", () => {
    const { ubicacion, limpiar } = copiaFixtures()
    const paquete = leerPaquete(ubicacion, "sol-001")
    if (!paquete.ok || !paquete.data.solicitud) throw new Error("paquete")
    const validacion = validarCaso(ubicacion, paquete.data)
    if (!validacion.ok) throw new Error(validacion.error)
    const orden = construirOrden(ubicacion, "sol-001", paquete.data, validacion.data, null)
    if (!orden.ok) throw new Error(orden.error)
    const ruta = guardarTrazabilidad(ubicacion, "sol-001", orden.data.trazas)
    const trazas = JSON.parse(readFileSync(ruta, "utf8")) as TrazaCampo[]
    const descripcion = trazas.find((item) => item.campo === "posiciones[0].descripcion")
    expect(orden.data.orden.posiciones[0]?.descripcion.length).toBeLessThanOrEqual(40)
    expect(descripcion?.transformacion).toBe("truncado_40")
    expect(descripcion?.original).toBe(paquete.data.solicitud.descripcion)
    const corto = truncarDescripcion("uno dos tres cuatro cinco seis siete ocho nueve")
    expect(corto.valor.endsWith(" ")).toBe(false)
    expect([...corto.valor].length).toBeLessThanOrEqual(40)
    limpiar()
  })

  test("el sha256 cambia si cambia el cuerpo y no incluye la línea del hash", () => {
    const { ubicacion, limpiar } = copiaFixtures()
    const evidencia = evidenciaDeCaso(ubicacion, "sol-001")
    if (!evidencia.ok) throw new Error(evidencia.error)
    expect(evidencia.canonico).not.toContain("sha256:")
    expect(evidencia.sha256).toBe(sha256Texto(evidencia.canonico))
    const crudo = JSON.parse(
      readFileSync(path.join(RAIZ, "fixtures/reto-03/solicitudes/sol-001/aprobacion.json"), "utf8"),
    ) as { de: string; para: string; fecha: string; asunto: string; cuerpo: string }
    const distinto = sha256Texto(contenidoCanonico({ ...crudo, cuerpo: `${crudo.cuerpo} extra` }))
    expect(distinto).not.toBe(evidencia.sha256)
    limpiar()
  })
})
