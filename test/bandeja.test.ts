import { afterAll, describe, expect, test } from "bun:test"
import { detalleCaso, listarCasos, resumenCasos } from "../src/core/flujo.ts"
import { dinero, etiquetaEstado, etiquetaRegla, fecha, fuenteLegible, numero, unidad } from "../web/src/lib/formato.ts"
import { copiaFixtures } from "./ayuda.ts"

const { ubicacion, limpiar } = copiaFixtures()
afterAll(() => limpiar())

describe("bandeja", () => {
  test("lista los seis casos en orden", () => {
    expect(listarCasos(ubicacion)).toEqual(["sol-001", "sol-002", "sol-003", "sol-004", "sol-005", "sol-006"])
  })

  test("resume cada caso con estado, proveedor y valor", async () => {
    const filas = await resumenCasos(ubicacion)
    expect(filas).toHaveLength(6)

    const primera = filas[0]
    expect(primera?.caso).toBe("sol-001")
    expect(primera?.estado).toBe("LISTA_PARA_CREAR")
    expect(primera?.solicitud_id).toBe("SOL-2026-001")
    expect(primera?.valor_total).toBe(11400000)
    expect(primera?.numero_oc).toBeNull()
    expect(primera?.error).toBeNull()

    const bloqueada = filas.find((fila) => fila.caso === "sol-002")
    expect(bloqueada?.estado).toBe("BLOQUEADA")
    expect(bloqueada?.bloqueos[0]?.regla).toBe("RC1")

    const retroactiva = filas.find((fila) => fila.caso === "sol-005")
    expect(retroactiva?.retroactiva).toBe(true)
    expect(retroactiva?.estado).toBe("PENDIENTE_CONFIRMACION")
  })

  test("el detalle trae reglas, catálogos y evidencia sin tocar el disco de salida", async () => {
    const resultado = await detalleCaso(ubicacion, "sol-001")
    if (!resultado.ok) throw new Error(resultado.error)
    expect(resultado.data.validacion.evaluaciones).toHaveLength(10)
    expect(resultado.data.catalogos.indicadores.length).toBeGreaterThan(0)
    expect(resultado.data.evidencia?.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(resultado.data.numero_oc).toBeNull()
  })

  test("un caso inventado no se lee", async () => {
    const resultado = await detalleCaso(ubicacion, "sol-999")
    expect(resultado.ok).toBe(false)
  })
})

describe("formato para el analista", () => {
  test("el dinero sale con separador de miles y sin decimales", () => {
    expect(dinero(11400000).replace(/\u00a0/g, " ")).toContain("11.400.000")
    expect(dinero(null)).toBe("—")
    expect(numero(120)).toBe("120")
  })

  test("los códigos internos se leen en palabras", () => {
    expect(etiquetaEstado("PENDIENTE_CONFIRMACION")).toBe("Requiere confirmación")
    expect(etiquetaRegla("no_evaluable")).toBe("No evaluable")
    expect(unidad("H")).toBe("horas")
    expect(fuenteLegible("maestro.proveedores")).toBe("del maestro de proveedores")
  })

  test("un estado desconocido se muestra tal cual en vez de romperse", () => {
    expect(etiquetaEstado("OTRA_COSA")).toBe("OTRA_COSA")
    expect(unidad(null)).toBe("—")
  })

  test("la fecha no se corre un día al formatearse en zonas al oeste de UTC", () => {
    const previa = process.env.TZ
    process.env.TZ = "America/Bogota"
    try {
      expect(fecha("2026-08-10")).toBe("10 de agosto de 2026")
      expect(fecha("2026-01-01")).toBe("1 de enero de 2026")
      expect(fecha("2026-08-21T10:02:00-05:00")).toBe("21 de agosto de 2026")
      expect(fecha(null)).toBe("—")
      expect(fecha("no es fecha")).toBe("no es fecha")
    } finally {
      process.env.TZ = previa
    }
  })
})
