import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import type { Confirmacion as ConfirmacionPendiente, DetalleCaso, Mensaje } from "../tipos.ts"
import { Confirmacion } from "./Confirmacion.tsx"
import { Herramienta } from "./Herramienta.tsx"

const AUTORES: Record<Mensaje["autor"], string> = {
  analista: "Tú",
  agente: "Agente",
  sistema: "Aviso",
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
              {mensaje.texto.split("\n").map((parrafo, indice) =>
                parrafo.trim() ? <p key={indice}>{parrafo}</p> : null,
              )}
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

      <div aria-live="polite" role="status">
        {pensando ? (
          <p className="pensando">
            <span className="punto" aria-hidden="true" />
            El agente está trabajando en el caso…
          </p>
        ) : null}
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
