import { etiquetaRegla } from "../lib/formato.ts"
import type { Evaluacion } from "../tipos.ts"

const COLOR_REGLA: Record<string, string> = {
  cumple: "verde",
  bloquea: "rojo",
  confirma: "ambar",
  informa: "azul",
  no_evaluable: "gris",
}

export function Reglas({ evaluaciones }: { evaluaciones: Evaluacion[] }) {
  const cumplen = evaluaciones.filter((item) => item.estado === "cumple").length
  const relevantes = evaluaciones.filter((item) => item.estado !== "cumple")
  const lista = relevantes.length > 0 ? relevantes : evaluaciones

  return (
    <section className="panel" aria-labelledby="titulo-controles">
      <h3 id="titulo-controles">Controles</h3>
      <ul className="reglas">
        {lista.map((item) => (
          <li key={item.regla} className={`regla ${item.estado}`}>
            <p className="regla-cabecera">
              <span className="regla-codigo">{item.regla}</span>
              <span className={`etiqueta ${COLOR_REGLA[item.estado] ?? "gris"}`}>{etiquetaRegla(item.estado)}</span>
            </p>
            <p className="regla-detalle">{item.detalle}</p>
            {item.accion_sugerida && item.accion_sugerida !== "Ninguna." ? (
              <p className="regla-accion">Qué hacer: {item.accion_sugerida}</p>
            ) : null}
          </li>
        ))}
      </ul>
      {relevantes.length > 0 ? (
        <p className="reglas-resumen">
          Las otras {cumplen} reglas de control pasaron sin observaciones.
        </p>
      ) : null}
    </section>
  )
}
