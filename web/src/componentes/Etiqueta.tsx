import { etiquetaEstado } from "../lib/formato.ts"

const COLORES: Record<string, string> = {
  LISTA_PARA_CREAR: "verde",
  CREADA: "azul",
  PENDIENTE_CONFIRMACION: "ambar",
  BLOQUEADA: "rojo",
  ERROR: "gris",
}

export function EtiquetaEstado({ estado }: { estado: string }) {
  return <span className={`etiqueta ${COLORES[estado] ?? "gris"}`}>{etiquetaEstado(estado)}</span>
}

export function EtiquetaRetroactiva() {
  return (
    <span className="etiqueta ambar" title="La factura llegó antes que la solicitud">
      Retroactiva
    </span>
  )
}
