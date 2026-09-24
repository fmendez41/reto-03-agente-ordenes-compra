import { etiquetaRegla } from "../lib/formato.ts"
import type { Evaluacion, FichaRegla } from "../tipos.ts"

const COLOR_REGLA: Record<string, string> = {
  cumple: "verde",
  bloquea: "rojo",
  confirma: "ambar",
  informa: "azul",
  no_evaluable: "gris",
}

function Fila({ item, ficha }: { item: Evaluacion; ficha: FichaRegla | undefined }) {
  return (
    <li className={`regla ${item.estado}`}>
      <p className="regla-cabecera">
        <span className="regla-codigo">{item.regla}</span>
        {ficha ? <span className="regla-nombre">{ficha.nombre}</span> : null}
        <span className={`etiqueta ${COLOR_REGLA[item.estado] ?? "gris"}`}>{etiquetaRegla(item.estado)}</span>
      </p>
      <p className="regla-detalle">{item.detalle}</p>
      {item.accion_sugerida && item.accion_sugerida !== "Ninguna." ? (
        <p className="regla-accion">Qué hacer: {item.accion_sugerida}</p>
      ) : null}
      {ficha ? (
        <details className="regla-ficha">
          <summary>Qué controla {item.regla} y por qué</summary>
          <p>{ficha.proposito}</p>
          <p className="regla-criterio">
            <strong>Criterio:</strong> {ficha.criterio}
          </p>
        </details>
      ) : null}
    </li>
  )
}

export function Reglas({ evaluaciones, reglas }: { evaluaciones: Evaluacion[]; reglas: FichaRegla[] }) {
  const fichas = new Map(reglas.map((ficha) => [ficha.codigo, ficha]))
  const relevantes = evaluaciones.filter((item) => item.estado !== "cumple")
  const cumplen = evaluaciones.filter((item) => item.estado === "cumple")

  return (
    <section className="panel" aria-labelledby="titulo-controles">
      <h3 id="titulo-controles">Controles</h3>
      <p className="panel-intro">
        {relevantes.length === 0
          ? `Los ${evaluaciones.length} controles del proceso pasaron sin observaciones.`
          : `${relevantes.length} de ${evaluaciones.length} controles necesitan tu atención. Los demás pasaron sin novedad.`}
      </p>

      {relevantes.length > 0 ? (
        <ul className="reglas">
          {relevantes.map((item) => (
            <Fila key={item.regla} item={item} ficha={fichas.get(item.regla)} />
          ))}
        </ul>
      ) : null}

      {cumplen.length > 0 ? (
        <details className="reglas-cumplidas">
          <summary>
            Ver los {cumplen.length} controles que pasaron ({cumplen.map((item) => item.regla).join(", ")})
          </summary>
          <ul className="reglas">
            {cumplen.map((item) => (
              <Fila key={item.regla} item={item} ficha={fichas.get(item.regla)} />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  )
}
