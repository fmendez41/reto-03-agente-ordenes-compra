// La pantalla de detalle sabe qué caso está mirando la analista, pero el mensaje que
// escribe casi nunca lo nombra: "procesa este caso", "¿por qué está bloqueada?".
// Hasta ahora esa referencia no llegaba al servidor y el agente tenía que adivinar,
// así que con el caso sol-004 abierto podía ponerse a trabajar sobre sol-001.
//
// El caso viaja aparte del texto y el servidor lo anexa al mensaje, igual que hace con
// el aviso de confirmación. No lo pone el modelo: es un dato de la interfaz.

const FORMATO_CASO = /^[a-z0-9][a-z0-9-]{0,39}$/i

export function contextoDelCaso(caso: unknown): { ok: true; aviso: string } | { ok: false; error: string } {
  if (caso === undefined || caso === null || caso === "") return { ok: true, aviso: "" }
  if (typeof caso !== "string") return { ok: false, error: "El caso tiene que ser texto." }
  const limpio = caso.trim()
  if (!limpio) return { ok: true, aviso: "" }
  if (!FORMATO_CASO.test(limpio)) {
    return { ok: false, error: `El identificador de caso ${limpio} no tiene un formato válido.` }
  }
  return {
    ok: true,
    aviso:
      `[Contexto de la interfaz] La analista tiene abierto el caso ${limpio}. ` +
      `Si el mensaje dice "este caso", "la solicitud" o no nombra ninguno, se refiere a ${limpio}. ` +
      `Si nombra otro caso explícitamente, atiende el que nombra.`,
  }
}
