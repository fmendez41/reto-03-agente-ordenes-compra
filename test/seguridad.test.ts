import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { celdaCsv, flushIntento, intentoVacio } from "../src/core/control.ts"
import { leer_paquete, crear, validar, type Contexto } from "../src/core/tools/oc.ts"
import { copiaFixtures } from "./ayuda.ts"

function ctxDe(ubicacion: ReturnType<typeof copiaFixtures>["ubicacion"], turno = 1, actionId?: string): Contexto {
  return {
    directory: ubicacion.directory,
    sessionId: "sesion-prueba",
    turno,
    fixturesDir: ubicacion.fixturesDir,
    outDir: ubicacion.outDir,
    actionId,
    intentos: new Map(),
  }
}

describe("rutas y csv", () => {
  test("un caso con .. no abre archivos", async () => {
    const { ubicacion, limpiar } = copiaFixtures()
    const respuesta = await leer_paquete.execute({ caso: "../sol-001" }, ctxDe(ubicacion))
    const json = JSON.parse(respuesta) as { ok: boolean; error?: string }
    expect(json.ok).toBe(false)
    limpiar()
  })

  test("escapa fórmulas al escribir el CSV", () => {
    const { ubicacion, limpiar } = copiaFixtures()
    const intento = intentoVacio("sol-001", "s", 1)
    intento.solicitudId = "SOL"
    intento.resultado = "BLOQUEADA"
    intento.bloqueos = ['=HYPERLINK("http://evil")']
    flushIntento(ubicacion, intento)
    flushIntento(ubicacion, intento)
    const csv = readFileSync(path.join(ubicacion.outDir, "control.csv"), "utf8")
    expect(csv).toContain(`'=HYPERLINK`)
    expect(csv.trim().split("\n")).toHaveLength(2)
    expect(celdaCsv("=CMD")).toBe("'=CMD")
    limpiar()
  })
})

describe("crear", () => {
  test("rechaza un payload alterado y no escribe orden", async () => {
    const { ubicacion, limpiar } = copiaFixtures()
    const ctx = ctxDe(ubicacion)
    const leido = JSON.parse(await leer_paquete.execute({ caso: "sol-001" }, ctx)) as {
      ok: boolean
      data: unknown
    }
    const validado = JSON.parse(await validar.execute({ caso: "sol-001", paquete: leido.data }, ctx)) as {
      ok: boolean
    }
    expect(validado.ok).toBe(true)
    const falso = {
      referencia: { solicitud_id: "SOL-2026-001", correo_id: "x", cotizacion_ref: null },
      sociedad: "1000",
      organizacion_compras: "1000",
      proveedor: { codigo_sap: "100234", nit: "900555111", nombre: "TecnoSuministros S.A.S." },
      moneda: "COP",
      condiciones_pago: "Z030",
      aprobador: { email: "a@b.c", fecha_aprobacion: "2026-08-21", evidencia_sha256: "0" },
      posiciones: [
        {
          numero: 10,
          descripcion: "otra",
          cantidad: 1,
          unidad: "UN",
          precio_unitario: 1,
          centro_costo: "CC-1010",
          subarea: "Infraestructura",
          indicador_iva: "C1",
        },
      ],
      excepciones: [],
    }
    const creado = JSON.parse(await crear.execute({ caso: "sol-001", payload: falso, confirmado: true }, ctx)) as {
      ok: boolean
    }
    expect(creado.ok).toBe(false)
    const { leerOrdenes } = await import("../src/core/sap-archivo.ts")
    expect(leerOrdenes(ubicacion)).toHaveLength(0)
    limpiar()
  })
})
