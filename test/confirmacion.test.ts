import { describe, expect, test } from "bun:test"
import { crearAccion, validarAccion } from "../src/core/confirmacion.ts"
import { hashPayload, construirOrden } from "../src/core/payload.ts"
import { leerPaquete } from "../src/core/paquete.ts"
import { validarCaso } from "../src/core/reglas.ts"
import { crear, leer_paquete, validar, type Contexto } from "../src/core/tools/oc.ts"
import { leerOrdenes } from "../src/core/sap-archivo.ts"
import { TTL_CONFIRMACION_MS } from "../src/core/types.ts"
import { copiaFixtures } from "./ayuda.ts"
import type { Ubicacion } from "../src/core/types.ts"

function ctx(ubicacion: Ubicacion, turno: number, sessionId = "s1", actionId?: string): Contexto {
  return {
    directory: ubicacion.directory,
    sessionId,
    turno,
    fixturesDir: ubicacion.fixturesDir,
    outDir: ubicacion.outDir,
    actionId,
    intentos: new Map(),
  }
}

async function hashDe(ubicacion: Ubicacion, caso: string): Promise<string> {
  const paquete = leerPaquete(ubicacion, caso)
  if (!paquete.ok) throw new Error(paquete.error)
  const validacion = validarCaso(ubicacion, paquete.data)
  if (!validacion.ok) throw new Error(validacion.error)
  const orden = construirOrden(ubicacion, caso, paquete.data, validacion.data, null)
  if (!orden.ok) throw new Error(orden.error)
  return hashPayload(orden.data.orden)
}

describe("confirmación", () => {
  test("ausente, caducada, usada, otra sesión, otro caso, otro turno y hash viejo", async () => {
    const { ubicacion, limpiar } = copiaFixtures()
    const hash = await hashDe(ubicacion, "sol-004")
    const accion = crearAccion(ubicacion, {
      caso: "sol-004",
      payload_hash: hash,
      codigos: ["RC5"],
      sessionId: "s1",
      turno: 1,
    })
    const base = { caso: "sol-004", sessionId: "s1", turno: 2, payloadHash: hash }
    expect(validarAccion(ubicacion, { ...base, actionId: "no-existe" }).ok).toBe(false)

    const caducada = crearAccion(ubicacion, {
      caso: "sol-004",
      payload_hash: hash,
      codigos: ["RC5"],
      sessionId: "s1",
      turno: 1,
      creada_en: new Date(Date.now() - TTL_CONFIRMACION_MS - 1000).toISOString(),
    })
    expect(validarAccion(ubicacion, { ...base, actionId: caducada.actionId }).ok).toBe(false)

    const usada = crearAccion(ubicacion, {
      caso: "sol-004",
      payload_hash: hash,
      codigos: ["RC5"],
      sessionId: "s1",
      turno: 1,
    })
    usada.estado = "consumida"
    const { actualizarAccion } = await import("../src/core/confirmacion.ts")
    actualizarAccion(ubicacion, usada)
    expect(validarAccion(ubicacion, { ...base, actionId: usada.actionId }).ok).toBe(false)

    expect(validarAccion(ubicacion, { ...base, actionId: accion.actionId, sessionId: "otra" }).ok).toBe(false)
    expect(validarAccion(ubicacion, { ...base, actionId: accion.actionId, caso: "sol-005" }).ok).toBe(false)
    expect(validarAccion(ubicacion, { ...base, actionId: accion.actionId, turno: 4 }).ok).toBe(false)
    expect(validarAccion(ubicacion, { ...base, actionId: accion.actionId, payloadHash: "0" }).ok).toBe(false)
    expect(leerOrdenes(ubicacion)).toHaveLength(0)
    limpiar()
  })

  test("oc_crear sin actionId no crea la orden aunque confirmado sea true", async () => {
    const { ubicacion, limpiar } = copiaFixtures()
    const contexto = ctx(ubicacion, 2)
    await leer_paquete.execute({ caso: "sol-004" }, contexto)
    await validar.execute({ caso: "sol-004", paquete: {} }, contexto)
    const creado = JSON.parse(
      await crear.execute({ caso: "sol-004", payload: {}, confirmado: true }, contexto),
    ) as { ok: boolean }
    expect(creado.ok).toBe(false)
    expect(leerOrdenes(ubicacion)).toHaveLength(0)
    limpiar()
  })
})
