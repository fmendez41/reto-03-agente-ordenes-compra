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
  const lista =
    fila.estado === "BLOQUEADA" ? fila.bloqueos : fila.estado === "PENDIENTE_CONFIRMACION" ? fila.confirmaciones : []
  const primera = lista[0]
  if (!primera) return null
  const restantes = lista.length - 1
  const extra = restantes > 0 ? ` Y ${restantes} control${restantes > 1 ? "es" : ""} más.` : ""
  return `${primera.regla}: ${primera.detalle}${extra}`
}

function plural(cantidad: number, singular: string, plural: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : plural}`
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
        <p>
          No hay ninguna solicitud cargada. Los casos se leen de <code>fixtures/reto-03/solicitudes/</code>, una carpeta
          por caso con el nombre <code>sol-001</code>, <code>sol-002</code> y así.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="bandeja-barra">
        <p className="cabecera-meta">
          {plural(casos.length, "solicitud", "solicitudes")} · {plural(conteo.pendientes, "espera", "esperan")} tu
          confirmación · {plural(conteo.bloqueadas, "bloqueada", "bloqueadas")} ·{" "}
          {plural(conteo.retroactivas, "retroactiva", "retroactivas")}
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
        <p className="vacio">
          Ninguna de las {casos.length} solicitudes está en ese estado ahora mismo. Prueba con otro filtro o vuelve a
          «Todas».
        </p>
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
