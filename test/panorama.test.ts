import { describe, expect, test } from "bun:test"
import { aplicarFase } from "../web/src/lib/bandeja.ts"
import { resumirCola } from "../web/src/lib/panorama.ts"
import type { FilaBandeja } from "../web/src/tipos.ts"

describe("panorama de la cola", () => {
  test("agrupa cantidades y suma el dinero de una sola moneda", () => {
    const resumen = resumirCola([
      { estado: "LISTA_PARA_CREAR", valor_total: 100, moneda: "COP", retroactiva: false },
      { estado: "BLOQUEADA", valor_total: 50, moneda: "COP", retroactiva: false },
      { estado: "PENDIENTE_CONFIRMACION", valor_total: 25, moneda: "COP", retroactiva: true },
      { estado: "CREADA", valor_total: 10, moneda: "COP", retroactiva: false },
    ])
    expect(resumen.monedaUnica).toBe("COP")
    expect(resumen.retroactivas).toBe(1)
    expect(resumen.grupos.find((grupo) => grupo.filtro === "BLOQUEADA")).toMatchObject({ cantidad: 1, valor: 50 })
    expect(resumen.grupos.find((grupo) => grupo.filtro === "PENDIENTE_CONFIRMACION")?.valor).toBe(25)
  })

  test("no suma monedas distintas", () => {
    const resumen = resumirCola([
      { estado: "LISTA_PARA_CREAR", valor_total: 100, moneda: "COP", retroactiva: false },
      { estado: "LISTA_PARA_CREAR", valor_total: 20, moneda: "USD", retroactiva: false },
    ])
    expect(resumen.monedaUnica).toBeNull()
    expect(resumen.grupos.find((grupo) => grupo.filtro === "LISTA_PARA_CREAR")?.moneda).toBeNull()
  })

  test("crear la orden mueve el caso de «listas» a «con orden» en el tablero", () => {
    const fila = (estado: string): FilaBandeja => ({
      caso: "sol-001",
      solicitud_id: "SOL-2026-001",
      solicitante: "Ana",
      proveedor: "Proveedor",
      descripcion: "Servicio",
      valor_total: 100,
      moneda: "COP",
      estado,
      retroactiva: false,
      bloqueos: [],
      confirmaciones: [],
      numero_oc: null,
      error: null,
    })
    const antes = resumirCola([fila("LISTA_PARA_CREAR"), fila("BLOQUEADA")])
    const despues = resumirCola(
      aplicarFase(
        [fila("LISTA_PARA_CREAR"), { ...fila("PENDIENTE_CONFIRMACION"), caso: "sol-004" }],
        {
          caso: "sol-001",
          numero_oc: "4500000001",
          estado: "LISTA_PARA_CREAR",
          retroactiva: false,
          bloqueos: [],
          confirmaciones: [],
        },
      ),
    )
    expect(antes.grupos.find((grupo) => grupo.filtro === "LISTA_PARA_CREAR")?.cantidad).toBe(1)
    expect(despues.grupos.find((grupo) => grupo.filtro === "LISTA_PARA_CREAR")?.cantidad).toBe(0)
    expect(despues.grupos.find((grupo) => grupo.filtro === "CREADA")).toMatchObject({
      cantidad: 1,
      valor: 100,
    })
    expect(despues.grupos.find((grupo) => grupo.filtro === "PENDIENTE_CONFIRMACION")?.cantidad).toBe(1)
  })

  test("los grupos cubren todas las filas, incluida una con error", () => {
    const fila = (estado: string, valor: number) => ({
      estado,
      valor_total: valor,
      moneda: "COP",
      retroactiva: false,
    })
    const filas = [
      fila("LISTA_PARA_CREAR", 1),
      fila("BLOQUEADA", 2),
      fila("BLOQUEADA", 3),
      fila("PENDIENTE_CONFIRMACION", 4),
      fila("PENDIENTE_CONFIRMACION", 5),
      fila("PENDIENTE_CONFIRMACION", 6),
      fila("ERROR", 7),
    ]
    const resumen = resumirCola(filas)
    const suma = resumen.grupos.reduce((total, grupo) => total + grupo.cantidad, 0)
    expect(suma).toBe(filas.length)
    expect(resumen.grupos.find((grupo) => grupo.filtro === "ERROR")).toMatchObject({
      etiqueta: "Con error",
      cantidad: 1,
      valor: 7,
    })
  })
})
