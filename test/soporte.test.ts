import { describe, expect, test } from "bun:test"
import { responderSoporte } from "../web/src/lib/soporte.ts"

const contexto = { casoAbierto: null, casos: ["sol-001", "sol-002", "sol-004"] }

describe("soporte", () => {
  test("explica el uso y ofrece la guía", () => {
    const respuesta = responderSoporte("¿Cómo se usa Mesa?", contexto)
    expect(respuesta.texto).toContain("Confirmo y creo la orden")
    expect(respuesta.acciones[0]?.tipo).toBe("guia")
  })

  test("filtra los casos que no se pudieron leer", () => {
    const respuesta = responderSoporte("Muéstrame las que no se pudieron leer", contexto)
    expect(respuesta.acciones[0]).toEqual({ tipo: "filtrar", filtro: "ERROR", etiqueta: "Con error" })
  })

  test("filtra las bloqueadas", () => {
    const respuesta = responderSoporte("Muéstrame las bloqueadas", contexto)
    expect(respuesta.acciones[0]).toEqual({ tipo: "filtrar", filtro: "BLOQUEADA", etiqueta: "Bloqueadas" })
  })

  test("procesa el caso nombrado", () => {
    const respuesta = responderSoporte("Procesa sol-001", contexto)
    expect(respuesta.acciones[0]).toMatchObject({ tipo: "enviar", caso: "sol-001" })
  })

  test("rechaza un caso que no está en la mesa", () => {
    const respuesta = responderSoporte("abre sol-999", contexto)
    expect(respuesta.texto).toContain("No existe sol-999")
    expect(respuesta.acciones.some((accion) => accion.tipo === "abrir" && accion.caso === "sol-999")).toBe(false)
  })

  test("pide un caso si no hay ninguno abierto", () => {
    const respuesta = responderSoporte("Procesa este caso", contexto)
    expect(respuesta.acciones.map((accion) => accion.tipo).every((tipo) => tipo === "abrir")).toBe(true)
  })
})
