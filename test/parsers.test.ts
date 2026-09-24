import { describe, expect, test } from "bun:test"
import { readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { parsearCotizacion, parsearFactura } from "../src/core/parsers.ts"
import { leerPaquete } from "../src/core/paquete.ts"
import { RAIZ, copiaFixtures } from "./ayuda.ts"

const CASOS = ["sol-001", "sol-002", "sol-003", "sol-004", "sol-005", "sol-006"]

describe("cotización", () => {
  for (const caso of CASOS) {
    test(`${caso} tiene proveedor, NIT, total y referencia`, () => {
      const texto = readFileSync(path.join(RAIZ, "fixtures/reto-03/solicitudes", caso, "cotizacion.txt"), "utf8")
      const parsed = parsearCotizacion(texto)
      expect(parsed.ok).toBe(true)
      if (!parsed.ok) return
      expect(parsed.data.nit).toMatch(/^\d+$/)
      expect(parsed.data.total).toBeGreaterThan(0)
      expect(parsed.data.referencia).toBeTruthy()
      expect(parsed.data.validez_hasta).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  }

  test("sol-001 normaliza el NIT y el total", () => {
    const texto = readFileSync(path.join(RAIZ, "fixtures/reto-03/solicitudes/sol-001/cotizacion.txt"), "utf8")
    const parsed = parsearCotizacion(texto)
    if (!parsed.ok) throw new Error(parsed.error)
    expect(parsed.data.nit).toBe("900555111")
    expect(parsed.data.total).toBe(11_400_000)
    expect(parsed.data.referencia).toBe("COT-TS-2026-0451")
    expect(parsed.data.validez_hasta).toBe("2026-09-17")
  })

  test("rechaza una cotización sin total", () => {
    const parsed = parsearCotizacion("Proveedor: X\nNIT: 1\n")
    expect(parsed.ok).toBe(false)
  })
})

describe("factura", () => {
  test("sol-005 trae número, fecha y total anteriores a la solicitud", () => {
    const texto = readFileSync(path.join(RAIZ, "fixtures/reto-03/solicitudes/sol-005/factura.txt"), "utf8")
    const parsed = parsearFactura(texto)
    if (!parsed.ok) throw new Error(parsed.error)
    expect(parsed.data.numero).toBe("FC-88231")
    expect(parsed.data.fecha).toBe("2026-08-10")
    expect(parsed.data.total).toBe(3_200_000)
    expect(parsed.data.fecha < "2026-08-27").toBe(true)
  })
})

describe("paquete", () => {
  test("JSON malformado devuelve error legible", () => {
    const { ubicacion, limpiar } = copiaFixtures()
    writeRoto(ubicacion.fixturesDir)
    const resultado = leerPaquete(ubicacion, "sol-001")
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.error.length).toBeGreaterThan(10)
    limpiar()
  })

  test("adjunto ausente queda en null", () => {
    const { ubicacion, limpiar } = copiaFixtures()
    rmSync(path.join(ubicacion.fixturesDir, "solicitudes/sol-001/cotizacion.txt"))
    const resultado = leerPaquete(ubicacion, "sol-001")
    expect(resultado.ok).toBe(true)
    if (resultado.ok) {
      expect(resultado.data.cotizacion).toBeNull()
      expect(resultado.data.ausentes).toContain("cotizacion")
    }
    limpiar()
  })

  test("un caso que no existe y un caso al que le falta la solicitud dan mensajes distintos", () => {
    const { ubicacion, limpiar } = copiaFixtures()
    try {
      const inexistente = leerPaquete(ubicacion, "sol-999")
      expect(inexistente.ok).toBe(false)
      if (inexistente.ok) throw new Error("debería fallar")
      expect(inexistente.error).toContain("No existe el caso sol-999")

      rmSync(path.join(ubicacion.fixturesDir, "solicitudes/sol-001/solicitud.json"))
      const sinSolicitud = leerPaquete(ubicacion, "sol-001")
      expect(sinSolicitud.ok).toBe(true)
      if (!sinSolicitud.ok) throw new Error(sinSolicitud.error)
      expect(sinSolicitud.data.solicitud).toBeNull()
      expect(sinSolicitud.data.ausentes).toContain("solicitud")
    } finally {
      limpiar()
    }
  })
})

function writeRoto(fixturesDir: string): void {
  writeFileSync(path.join(fixturesDir, "solicitudes/sol-001/solicitud.json"), "{no", "utf8")
}
