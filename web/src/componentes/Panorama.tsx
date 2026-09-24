import { dinero } from "../lib/formato.ts"
import { resumirCola } from "../lib/panorama.ts"
import type { FiltroBandeja } from "../lib/soporte.ts"
import type { FilaBandeja } from "../tipos.ts"

export function Panorama({
  casos,
  filtro,
  alFiltrar,
}: {
  casos: FilaBandeja[]
  filtro: FiltroBandeja
  alFiltrar: (filtro: FiltroBandeja) => void
}) {
  const resumen = resumirCola(casos)
  const total = casos.length || 1
  const espera = resumen.grupos.find((grupo) => grupo.filtro === "PENDIENTE_CONFIRMACION")
  const moneda = resumen.monedaUnica ?? "COP"

  return (
    <section className="panorama" aria-label="Resumen de la cola">
      <p className="panorama-frase">
        {casos.length === 1 ? "Hay 1 solicitud en la mesa." : `Hay ${casos.length} solicitudes en la mesa.`}
        {espera && espera.cantidad > 0
          ? ` ${espera.cantidad === 1 ? "Una espera" : `${espera.cantidad} esperan`} tu confirmación${
              resumen.monedaUnica ? `, por ${dinero(espera.valor, moneda)}` : ""
            }.`
          : " Ninguna espera tu confirmación."}
        {resumen.retroactivas > 0
          ? ` ${resumen.retroactivas === 1 ? "Una es retroactiva." : `${resumen.retroactivas} son retroactivas.`}`
          : ""}
      </p>
      <div className="panorama-grupos">
        {resumen.grupos.map((grupo) => {
          const parte = Math.round((grupo.cantidad / total) * 100)
          return (
            <button
              key={grupo.filtro}
              type="button"
              className={`panorama-grupo ${grupo.filtro.toLowerCase()}`}
              aria-pressed={filtro === grupo.filtro}
              onClick={() => alFiltrar(filtro === grupo.filtro ? "TODOS" : grupo.filtro)}
            >
              <span className="panorama-marca" aria-hidden="true" />
              <span className="panorama-etiqueta">{grupo.etiqueta}</span>
              <span className="panorama-cantidad">{grupo.cantidad}</span>
              <span className="panorama-valor">
                {grupo.cantidad === 0
                  ? "—"
                  : resumen.monedaUnica
                    ? dinero(grupo.valor, grupo.moneda ?? moneda)
                    : "varias monedas"}
              </span>
              <span className="panorama-pista" aria-hidden="true">
                <span className="panorama-relleno" style={{ width: `${parte}%` }} />
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
