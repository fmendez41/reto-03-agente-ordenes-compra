import { useEffect, useId, useRef, useState } from "react"
import { responderSoporte, type AccionSoporte } from "../lib/soporte.ts"

type Turno = { autor: "tu" | "soporte"; texto: string; acciones: AccionSoporte[] }

const SUGERENCIAS = ["¿Cómo se usa Mesa?", "Muéstrame las bloqueadas", "¿Qué espera mi confirmación?", "Procesa sol-001"]

function etiquetaAccion(accion: AccionSoporte): string {
  if (accion.tipo === "filtrar") return `Ver ${accion.etiqueta.toLowerCase()}`
  if (accion.tipo === "abrir") return `Abrir ${accion.caso}`
  if (accion.tipo === "guia") return "Abrir la guía"
  return `Pedirle al agente que procese ${accion.caso}`
}

export function Soporte({
  abierto,
  casoAbierto,
  casos,
  alCerrar,
  alEjecutar,
}: {
  abierto: boolean
  casoAbierto: string | null
  casos: string[]
  alCerrar: () => void
  alEjecutar: (accion: AccionSoporte) => string
}) {
  const [texto, setTexto] = useState("")
  const [turnos, setTurnos] = useState<Turno[]>([])
  const tituloId = useId()
  const fin = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!abierto) return
    campo.current?.focus()
  }, [abierto])

  useEffect(() => {
    fin.current?.scrollIntoView({ block: "end" })
  }, [turnos.length])

  function preguntar(pregunta: string): void {
    const limpia = pregunta.trim()
    if (!limpia) return
    const respuesta = responderSoporte(limpia, { casoAbierto, casos })
    setTurnos((previos) => [
      ...previos,
      { autor: "tu", texto: limpia, acciones: [] },
      { autor: "soporte", texto: respuesta.texto, acciones: respuesta.acciones },
    ])
    setTexto("")
  }

  function ejecutar(accion: AccionSoporte): void {
    const aviso = alEjecutar(accion)
    setTurnos((previos) => [...previos, { autor: "soporte", texto: aviso, acciones: [] }])
  }

  if (!abierto) return null

  return (
    <aside className="soporte" aria-labelledby={tituloId}>
      <header className="soporte-cabecera">
        <div>
          <h2 id={tituloId}>Soporte</h2>
          <p>{casoAbierto ? `Tienes abierto ${casoAbierto}.` : "Estás en la bandeja."} La acción se ve al lado, sin cerrar esta conversación.</p>
        </div>
        <button type="button" className="boton-secundario" onClick={alCerrar}>
          Cerrar
        </button>
      </header>
      <div className="soporte-turnos">
        {turnos.length === 0 ? (
          <p className="soporte-vacio">
            Pregunta cómo se usa Mesa o pídele una acción: filtrar la cola, abrir un caso o escribirle al agente. El botón verde es el único que le envía un mensaje.
          </p>
        ) : (
          turnos.map((turno, indice) => (
            <article key={`${turno.autor}-${indice}`} className={`soporte-turno ${turno.autor}`}>
              <p className="mensaje-autor">{turno.autor === "tu" ? "Tú" : "Soporte"}</p>
              <p>{turno.texto}</p>
              {turno.acciones.length > 0 ? (
                <div className="soporte-acciones">
                  {turno.acciones.map((accion) => (
                    <button
                      key={etiquetaAccion(accion)}
                      type="button"
                      className={accion.tipo === "enviar" ? "boton-principal" : "boton-secundario"}
                      onClick={() => ejecutar(accion)}
                    >
                      {etiquetaAccion(accion)}
                    </button>
                  ))}
                </div>
              ) : null}
            </article>
          ))
        )}
        <div ref={fin} />
      </div>
      <div className="sugerencias">
        {SUGERENCIAS.map((sugerencia) => (
          <button key={sugerencia} type="button" className="sugerencia" onClick={() => preguntar(sugerencia)}>
            {sugerencia}
          </button>
        ))}
      </div>
      <form
        className="entrada"
        onSubmit={(evento) => {
          evento.preventDefault()
          preguntar(texto)
        }}
      >
        <label className="solo-lectores" htmlFor="soporte-pregunta">
          Pregunta para soporte
        </label>
        <textarea
          id="soporte-pregunta"
          ref={campo}
          value={texto}
          placeholder="Muéstrame las bloqueadas"
          onChange={(evento) => setTexto(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key === "Enter" && !evento.shiftKey) {
              evento.preventDefault()
              preguntar(texto)
            }
            if (evento.key === "Escape") alCerrar()
          }}
        />
        <button type="submit" className="boton-principal" disabled={texto.trim().length === 0}>
          Preguntar
        </button>
      </form>
    </aside>
  )
}
