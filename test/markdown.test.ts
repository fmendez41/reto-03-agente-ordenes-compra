import { describe, expect, test } from "bun:test"
import { analizar, trozos } from "../web/src/lib/markdown.ts"

describe("markdown del agente", () => {
  test("reconoce negritas y código en línea", () => {
    expect(trozos("El total es **11.400.000** según `solicitud.json`.")).toEqual([
      { texto: "El total es ", estilo: "normal" },
      { texto: "11.400.000", estilo: "fuerte" },
      { texto: " según ", estilo: "normal" },
      { texto: "solicitud.json", estilo: "codigo" },
      { texto: ".", estilo: "normal" },
    ])
  })

  test("una tabla se convierte en filas y no en barras sueltas", () => {
    const bloques = analizar("| Origen | Valor |\n| --- | --- |\n| Solicitud | 25.000.000 |\n| Cotización | 26.500.000 |")
    expect(bloques).toHaveLength(1)
    const tabla = bloques[0]
    if (tabla?.tipo !== "tabla") throw new Error("esperaba una tabla")
    expect(tabla.encabezados).toHaveLength(2)
    expect(tabla.filas).toHaveLength(2)
    expect(tabla.filas[1]?.[1]?.[0]?.texto).toBe("26.500.000")
  })

  test("agrupa las viñetas en una sola lista y distingue las numeradas", () => {
    const bloques = analizar("Controles:\n- RC1 pasa\n- RC5 pide confirmación\n\n1. Primero\n2. Después")
    expect(bloques.map((bloque) => bloque.tipo)).toEqual(["parrafo", "lista", "lista"])
    const vinietas = bloques[1]
    const numerada = bloques[2]
    if (vinietas?.tipo !== "lista" || numerada?.tipo !== "lista") throw new Error("esperaba listas")
    expect(vinietas.ordenada).toBe(false)
    expect(vinietas.items).toHaveLength(2)
    expect(numerada.ordenada).toBe(true)
  })

  test("los encabezados no se muestran con las almohadillas", () => {
    const bloques = analizar("### Resumen del caso")
    const parrafo = bloques[0]
    if (parrafo?.tipo !== "parrafo") throw new Error("esperaba un párrafo")
    expect(parrafo.contenido).toEqual([{ texto: "Resumen del caso", estilo: "fuerte" }])
  })

  test("el texto plano sigue saliendo un párrafo por línea, sin las vacías", () => {
    const bloques = analizar("Primera línea.\n\nSegunda línea.")
    expect(bloques).toHaveLength(2)
    expect(bloques.every((bloque) => bloque.tipo === "parrafo")).toBe(true)
  })

  test("el html que venga en el texto se queda como texto", () => {
    const partes = trozos("<script>alert(1)</script>")
    expect(partes).toEqual([{ texto: "<script>alert(1)</script>", estilo: "normal" }])
  })
})
