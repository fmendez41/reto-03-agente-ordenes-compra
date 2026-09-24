export type Unidad = "UN" | "H" | "MES"

export function decidirUnidad(encabezado: string): { unidad: Unidad; fuente: string } {
  const limpio = encabezado
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/^\d+\s*\.?\s*/, "")
    .trim()
  if (/^horas?\b/.test(limpio)) return { unidad: "H", fuente: "derivado" }
  if (/^(mes|mensualidad|suscripcion mensual)\b/.test(limpio)) return { unidad: "MES", fuente: "derivado" }
  return { unidad: "UN", fuente: "derivado" }
}

export function truncarDescripcion(texto: string): {
  valor: string
  transformacion?: "truncado_40"
  original?: string
} {
  const limpio = texto.replace(/\s+/g, " ").trim()
  const chars = [...limpio]
  if (chars.length <= 40) return { valor: limpio }
  const corte = chars.slice(0, 40).join("")
  const espacio = corte.lastIndexOf(" ")
  const porPalabra = espacio >= 0 ? corte.slice(0, espacio).trimEnd() : corte
  const valor = [...porPalabra].length >= 24 ? porPalabra : corte.trimEnd()
  return { valor, transformacion: "truncado_40", original: limpio }
}
