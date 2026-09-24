import type { Evaluacion, FilaBandeja } from "../tipos.ts"

export type CambioFase = {
  caso: string
  numero_oc: string | null
  estado: string
  retroactiva: boolean
  bloqueos: Evaluacion[]
  confirmaciones: Evaluacion[]
}

/** Una orden ya emitida manda sobre el estado que calculan los controles. */
export function faseVisible(numeroOc: string | null, estadoControles: string): string {
  return numeroOc ? "CREADA" : estadoControles
}

export function aplicarFase(casos: FilaBandeja[], cambio: CambioFase): FilaBandeja[] {
  return casos.map((fila) =>
    fila.caso === cambio.caso
      ? {
          ...fila,
          estado: faseVisible(cambio.numero_oc, cambio.estado),
          numero_oc: cambio.numero_oc,
          retroactiva: cambio.retroactiva,
          bloqueos: cambio.bloqueos,
          confirmaciones: cambio.confirmaciones,
          error: null,
        }
      : fila,
  )
}
