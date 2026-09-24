import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { analizar, type Trozo } from "../lib/markdown.ts"
import type { Confirmacion as ConfirmacionPendiente, DetalleCaso, Mensaje } from "../tipos.ts"
import { Confirmacion } from "./Confirmacion.tsx"
import { Herramienta } from "./Herramienta.tsx"

const AUTORES: Record<Mensaje["autor"], string> = {
  analista: "Tú",
  agente: "Agente",
  sistema: "Aviso",
}

function Trozos({ partes }: { partes: Trozo[] }) {
  return (
    <>
      {partes.map((parte, indice) => {
        if (parte.estilo === "fuerte") return <strong key={indice}>{parte.texto}</strong>
        if (parte.estilo === "codigo") return <code key={indice}>{parte.texto}</code>
        return <span key={indice}>{parte.texto}</span>
      })}
    </>
  )
}

/** Dibuja el markdown del agente sin pasar nunca por innerHTML: solo nodos de texto. */
function Texto({ contenido }: { contenido: string }) {
  return (
    <>
      {analizar(contenido).map((bloque, indice) => {
        if (bloque.tipo === "parrafo") {
          return (
            <p key={indice}>
              <Trozos partes={bloque.contenido} />
            </p>
          )
        }
        if (bloque.tipo === "lista") {
          const items = bloque.items.map((item, posicion) => (
            <li key={posicion}>
              <Trozos partes={item} />
            </li>
          ))
          return bloque.ordenada ? (
            <ol key={indice} className="mensaje-lista">
              {items}
            </ol>
          ) : (
            <ul key={indice} className="mensaje-lista">
              {items}
            </ul>
          )
        }
        return (
          <div key={indice} className="mensaje-tabla-marco">
            <table className="mensaje-tabla">
              <thead>
                <tr>
                  {bloque.encabezados.map((celda, columna) => (
                    <th key={columna}>
                      <Trozos partes={celda} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bloque.filas.map((fila, posicion) => (
                  <tr key={posicion}>
                    {fila.map((celda, columna) => (
                      <td key={columna}>
                        <Trozos partes={celda} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </>
  )
}

export function Chat({
  caso,
  mensajes,
  pensando,
  confirmacion,
  detalle,
  sugerencias,
  alEnviar,
  alConfirmar,
  alDejarPendiente,
}: {
  caso: string
  mensajes: Mensaje[]
  pensando: boolean
  confirmacion: ConfirmacionPendiente | null
  detalle: DetalleCaso | null
  sugerencias: string[]
  alEnviar: (texto: string) => void
  alConfirmar: () => void
  alDejarPendiente: () => void
}) {
  const [texto, setTexto] = useState("")
  const finRef = useRef<HTMLDivElement>(null)

  const ultimo = mensajes.at(-1)
  const anuncio = pensando
    ? "El agente está trabajando en el caso."
    : confirmacion
      ? `El agente necesita tu confirmación para ${confirmacion.caso} por ${confirmacion.codigos.join(", ")}. El bloque de confirmación está al final de la conversación.`
      : ultimo && ultimo.autor !== "analista"
        ? `${AUTORES[ultimo.autor]}. ${ultimo.texto}`
        : ""

  useEffect(() => {
    const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    finRef.current?.scrollIntoView({ block: "end", behavior: suave ? "smooth" : "auto" })
  }, [mensajes.length, pensando, confirmacion])

  function enviar(): void {
    const limpio = texto.trim()
    if (!limpio || pensando) return
    setTexto("")
    alEnviar(limpio)
  }

  function alTeclear(evento: KeyboardEvent<HTMLTextAreaElement>): void {
    if (evento.key === "Enter" && !evento.shiftKey) {
      evento.preventDefault()
      enviar()
    }
  }

  return (
    <section className="panel" aria-labelledby="titulo-conversacion">
      <h3 id="titulo-conversacion">Conversación</h3>

      {mensajes.length === 0 ? (
        <p className="vacio">
          Pídele al agente que procese {caso}. Irá leyendo el paquete de documentos, contrastándolo contra los maestros
          y armando la orden, y verás cada herramienta que usa con sus argumentos y su resultado. No creará nada en SAP
          sin tu confirmación cuando algún control lo pida.
        </p>
      ) : (
        <div className="chat-mensajes">
          {mensajes.map((mensaje) => (
            <article key={mensaje.id} className={`mensaje ${mensaje.autor}`}>
              <p className="mensaje-autor">{AUTORES[mensaje.autor]}</p>
              <Texto contenido={mensaje.texto} />
              {mensaje.toolCalls && mensaje.toolCalls.length > 0 ? (
                <div className="herramientas">
                  {mensaje.toolCalls.map((llamada, indice) => (
                    <Herramienta
                      key={`${llamada.name}-${indice}`}
                      llamada={llamada}
                      catalogos={detalle?.catalogos ?? null}
                    />
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}

      {pensando ? (
        <p className="pensando" aria-hidden="true">
          <span className="punto" />
          El agente está trabajando en el caso…
        </p>
      ) : null}

      {/*
        Una sola región viva para todo el panel. Antes solo anunciaba el indicador de
        "pensando", así que con lector de pantalla se oía que el agente trabajaba y
        después silencio: ni la respuesta ni la petición de confirmación se anunciaban.
        Tenerlas en una sola región evita además que dos regiones se pisen entre sí.
      */}
      <div className="solo-lectores" role="status" aria-live="polite">
        {anuncio}
      </div>

      {confirmacion ? (
        <Confirmacion
          confirmacion={confirmacion}
          detalle={detalle}
          enviando={pensando}
          alConfirmar={alConfirmar}
          alDejarPendiente={alDejarPendiente}
        />
      ) : null}

      {mensajes.length === 0 && sugerencias.length > 0 ? (
        <div className="sugerencias">
          {sugerencias.map((sugerencia) => (
            <button key={sugerencia} type="button" className="sugerencia" onClick={() => alEnviar(sugerencia)}>
              {sugerencia}
            </button>
          ))}
        </div>
      ) : null}

      <form
        className="entrada"
        onSubmit={(evento) => {
          evento.preventDefault()
          enviar()
        }}
      >
        <label className="solo-lectores" htmlFor="mensaje">
          Mensaje para el agente
        </label>
        <textarea
          id="mensaje"
          value={texto}
          placeholder={`Procesa la solicitud ${caso}`}
          onChange={(evento) => setTexto(evento.target.value)}
          onKeyDown={alTeclear}
        />
        <button type="submit" className="boton-principal" disabled={pensando || texto.trim().length === 0}>
          Enviar
        </button>
      </form>
      <p className="pista">Enter envía. Shift y Enter hacen un salto de línea.</p>
      <div ref={finRef} />
    </section>
  )
}
