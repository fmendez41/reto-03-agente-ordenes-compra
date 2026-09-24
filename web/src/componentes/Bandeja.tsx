import { useMemo, useState } from "react"
import { dinero } from "../lib/formato.ts"
import type { FilaBandeja } from "../tipos.ts"
import { EtiquetaEstado, EtiquetaRetroactiva } from "./Etiqueta.tsx"

type Filtro = "TODOS" | "LISTA_PARA_CREAR" | "PENDIENTE_CONFIRMACION" | "BLOQUEADA" | "CREADA"

const FILTROS: Array<{ id: Filtro; etiqueta: string }> = [
  { id: "TODOS", etiqueta: "Todas" },
  { id: "LISTA_PARA_CREAR", etiqueta: "Listas para crear" },
  { id: "PENDIENTE_CONFIRMACION", etiqueta: "Requieren confirmación" },
  { id: "BLOQUEADA", etiqueta: "Bloqueadas" },
  { id: "CREADA", etiqueta: "Con orden creada" },
]

function motivoDe(fila: FilaBandeja): string | null {
  if (fila.error) return fila.error
  if (fila.estado === "BLOQUEADA" && fila.bloqueos[0]) {
    return `${fila.bloqueos[0].regla}: ${fila.bloqueos[0].detalle}`
  }
  if (fila.estado === "PENDIENTE_CONFIRMACION" && fila.confirmaciones[0]) {
    return `${fila.confirmaciones[0].regla}: ${fila.confirmaciones[0].detalle}`
  }
  return null
}

export function Bandeja({
  casos,
  cargando,
  error,
  alAbrir,
}: {
  casos: FilaBandeja[]
  cargando: boolean
  error: string | null
  alAbrir: (caso: string) => void
}) {
  const [filtro, setFiltro] = useState<Filtro>("TODOS")

  const visibles = useMemo(
    () => (filtro === "TODOS" ? casos : casos.filter((fila) => fila.estado === filtro)),
    [casos, filtro],
  )

  const conteo = useMemo(() => {
    const pendientes = casos.filter((fila) => fila.estado === "PENDIENTE_CONFIRMACION").length
    const bloqueadas = casos.filter((fila) => fila.estado === "BLOQUEADA").length
    const retroactivas = casos.filter((fila) => fila.retroactiva).length
    return { pendientes, bloqueadas, retroactivas }
  }, [casos])

  if (cargando) {
    return <p className="vacio">Cargando las solicitudes…</p>
  }

  if (error) {
    return (
      <div className="error-caja">
        <strong>No pude leer las solicitudes.</strong>
        <p>{error}</p>
      </div>
    )
  }

  if (casos.length === 0) {
    return (
      <div className="vacio">
        <p>No hay solicitudes en la carpeta de fixtures.</p>
      </div>
    )
  }

  return (
    <>
      <div className="bandeja-barra">
        <p className="cabecera-meta">
          {casos.length} solicitudes · {conteo.pendientes} esperan confirmación · {conteo.bloqueadas} bloqueadas ·{" "}
          {conteo.retroactivas} retroactivas
        </p>
        <div className="filtros" role="group" aria-label="Filtrar por estado">
          {FILTROS.map((opcion) => (
            <button
              key={opcion.id}
              type="button"
              className="filtro"
              aria-pressed={filtro === opcion.id}
              onClick={() => setFiltro(opcion.id)}
            >
              {opcion.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {visibles.length === 0 ? (
        <p className="vacio">Ninguna solicitud en ese estado.</p>
      ) : (
        <ul className="lista-casos">
          {visibles.map((fila) => {
            const motivo = motivoDe(fila)
            return (
              <li key={fila.caso}>
                <button type="button" className="caso-fila" onClick={() => alAbrir(fila.caso)}>
                  <span className="caso-titulo">
                    <strong>{fila.caso}</strong>
                    <span className="caso-id">{fila.solicitud_id ?? "sin identificador"}</span>
                  </span>
                  <span className="caso-descripcion">{fila.descripcion ?? "Sin descripción"}</span>
                  <span className="caso-meta">
                    {fila.proveedor ?? "Proveedor sin resolver"}
                    {fila.solicitante ? ` · pedida por ${fila.solicitante}` : ""}
                  </span>
                  <span className="caso-derecha">
                    <span className="caso-valor">{dinero(fila.valor_total, fila.moneda ?? "COP")}</span>
                    <EtiquetaEstado estado={fila.estado} />
                    {fila.retroactiva ? <EtiquetaRetroactiva /> : null}
                    {fila.numero_oc ? <span className="caso-id">OC {fila.numero_oc}</span> : null}
                  </span>
                  {motivo ? <span className="caso-motivo">{motivo}</span> : null}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
