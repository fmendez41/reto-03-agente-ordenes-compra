import { useEffect, useId, useRef, useState } from "react"

const CLAVE_GUIA = "oc-guia-vista"

const PASOS: Array<{ titulo: string; parrafos: string[] }> = [
  {
    titulo: "Mesa es la cola de solicitudes",
    parrafos: [
      "Cada tarjeta es una compra que llegó por correo. Ya trae el proveedor, el valor y el estado que calculó el sistema, así que no tienes que recordar de memoria en qué iba cada una.",
      "Lista para crear significa que los diez controles pasaron. Bloqueada significa que falta un dato y no se puede emitir la orden. Requiere confirmación significa que un control encontró una diferencia y la decisión es tuya.",
    ],
  },
  {
    titulo: "Abre una tarjeta para ver el caso",
    parrafos: [
      "A la derecha están los diez controles, cada uno con su nombre, con lo que protege y con lo que se encontró en este paquete, junto al borrador de la orden. A la izquierda está la conversación.",
      "Los filtros de arriba dejan a la vista solo lo bloqueado, lo que espera tu confirmación o lo que ya tiene orden creada.",
    ],
  },
  {
    titulo: "Habla del caso que tienes abierto",
    parrafos: [
      "Escribe en lenguaje normal. «Procesa este caso» se refiere a la solicitud que estás mirando, aunque no escribas su código. El agente lee el paquete, lo valida y te cuenta el resultado. Los montos salen de los documentos, no de lo que él recuerde.",
      "Cada herramienta que usa aparece como una tarjeta en el chat. Ábrela y verás qué le pediste y qué devolvió.",
    ],
  },
  {
    titulo: "Nada se crea hasta que confirmas",
    parrafos: [
      "Si un control necesita tu decisión, aparece un bloque con los dos valores enfrentados, cuánto dura esa confirmación y el botón «Confirmo y creo la orden». Pulsarlo es lo que autoriza la compra. El agente no puede autorizarla por sí solo.",
      "Si escribes otro mensaje antes de pulsar, esa confirmación caduca y no se crea ninguna orden. Pídele que vuelva a validar el caso y te propondrá una nueva.",
    ],
  },
]

export function guiaYaVista(): boolean {
  try {
    return localStorage.getItem(CLAVE_GUIA) === "1"
  } catch {
    return true
  }
}

export function marcarGuiaVista(): void {
  try {
    localStorage.setItem(CLAVE_GUIA, "1")
  } catch {
    // En una ventana privada el almacenamiento puede fallar. La guía se cierra igual.
  }
}

export function Tutorial({ abierto, alCerrar }: { abierto: boolean; alCerrar: () => void }) {
  const [paso, setPaso] = useState(0)
  const dialogo = useRef<HTMLDivElement>(null)
  const tituloId = useId()
  const actual = PASOS[paso] ?? PASOS[0]!
  const ultimo = paso === PASOS.length - 1

  useEffect(() => {
    if (abierto) setPaso(0)
  }, [abierto])

  useEffect(() => {
    if (!abierto) return
    const nodo = dialogo.current
    if (!nodo) return
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const cuerpo = document.body.style.overflow
    document.body.style.overflow = "hidden"
    nodo.querySelector<HTMLElement>("[data-foco-inicial]")?.focus()

    const alTecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") {
        evento.preventDefault()
        alCerrar()
        return
      }
      if (evento.key !== "Tab") return
      const focables = [...nodo.querySelectorAll<HTMLButtonElement>("button")].filter((boton) => !boton.disabled)
      const primero = focables[0]
      const ultimoFoco = focables[focables.length - 1]
      if (!primero || !ultimoFoco) return
      if (evento.shiftKey && document.activeElement === primero) {
        evento.preventDefault()
        ultimoFoco.focus()
      } else if (!evento.shiftKey && document.activeElement === ultimoFoco) {
        evento.preventDefault()
        primero.focus()
      }
    }
    nodo.addEventListener("keydown", alTecla)
    return () => {
      document.body.style.overflow = cuerpo
      nodo.removeEventListener("keydown", alTecla)
      anterior?.focus()
    }
  }, [abierto, alCerrar])

  useEffect(() => {
    if (!abierto) return
    dialogo.current?.querySelector<HTMLElement>("[data-foco-inicial]")?.focus()
  }, [abierto, paso])

  if (!abierto) return null

  return (
    <div className="guia-capa">
      <div
        className="guia-dialogo"
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        ref={dialogo}
      >
        <p className="guia-paso">
          Paso {paso + 1} de {PASOS.length}
        </p>
        <h2 id={tituloId}>{actual.titulo}</h2>
        {actual.parrafos.map((parrafo) => (
          <p key={parrafo}>{parrafo}</p>
        ))}
        <ol className="guia-puntos" aria-hidden="true">
          {PASOS.map((item, indice) => (
            <li key={item.titulo} className={indice === paso ? "activo" : undefined} />
          ))}
        </ol>
        <div className="guia-acciones">
          <button type="button" className="boton-secundario" onClick={alCerrar}>
            {ultimo ? "Cerrar" : "Saltar la guía"}
          </button>
          <div className="guia-avance">
            {paso > 0 ? (
              <button type="button" className="boton-secundario" onClick={() => setPaso((valor) => valor - 1)}>
                Atrás
              </button>
            ) : null}
            <button
              type="button"
              className="boton-principal"
              data-foco-inicial=""
              onClick={() => (ultimo ? alCerrar() : setPaso((valor) => valor + 1))}
            >
              {ultimo ? "Entendido, ir a la bandeja" : "Siguiente"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
