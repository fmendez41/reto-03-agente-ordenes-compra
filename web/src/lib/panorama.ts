import type { FiltroBandeja } from "./soporte.ts"

export type GrupoCola = {
  filtro: Exclude<FiltroBandeja, "TODOS">
  etiqueta: string
  cantidad: number
  valor: number
  moneda: string | null
}

const ORDEN: Array<{ filtro: GrupoCola["filtro"]; etiqueta: string }> = [
  { filtro: "PENDIENTE_CONFIRMACION", etiqueta: "Esperan confirmación" },
  { filtro: "BLOQUEADA", etiqueta: "Bloqueadas" },
  { filtro: "LISTA_PARA_CREAR", etiqueta: "Listas para crear" },
  { filtro: "CREADA", etiqueta: "Con orden" },
  { filtro: "ERROR", etiqueta: "Con error" },
]

type Fila = {
  estado: string
  valor_total: number | null
  moneda: string | null
  retroactiva: boolean
}

export function resumirCola(casos: Fila[]): { grupos: GrupoCola[]; retroactivas: number; monedaUnica: string | null } {
  const grupos = ORDEN.map((definicion) => {
    const filas = casos.filter((fila) => fila.estado === definicion.filtro)
    const monedas = new Set(filas.map((fila) => fila.moneda).filter((moneda): moneda is string => Boolean(moneda)))
    const valor = filas.reduce((suma, fila) => suma + (fila.valor_total ?? 0), 0)
    return {
      filtro: definicion.filtro,
      etiqueta: definicion.etiqueta,
      cantidad: filas.length,
      valor,
      moneda: monedas.size === 1 ? [...monedas][0]! : null,
    }
  })
  const monedas = new Set(casos.map((fila) => fila.moneda).filter((moneda): moneda is string => Boolean(moneda)))
  return {
    grupos,
    retroactivas: casos.filter((fila) => fila.retroactiva).length,
    monedaUnica: monedas.size === 1 ? [...monedas][0]! : null,
  }
}
