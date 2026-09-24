import { useCallback, useEffect, useRef, useState } from "react"
import { estadoServidor, traerCasos } from "./api.ts"
import { Bandeja } from "./componentes/Bandeja.tsx"
import { Logo } from "./componentes/Logo.tsx"
import { Detalle } from "./componentes/Detalle.tsx"
import { Soporte } from "./componentes/Soporte.tsx"
import { guiaYaVista, marcarGuiaVista, Tutorial } from "./componentes/Tutorial.tsx"
import { aplicarFase, type CambioFase } from "./lib/bandeja.ts"
import type { AccionSoporte, FiltroBandeja } from "./lib/soporte.ts"
import type { FilaBandeja } from "./tipos.ts"

export function App() {
  const [casos, setCasos] = useState<FilaBandeja[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [proveedor, setProveedor] = useState<string | null>(null)
  const [guia, setGuia] = useState(false)
  const [soporte, setSoporte] = useState(false)
  const [filtro, setFiltro] = useState<FiltroBandeja>("TODOS")
  const [pedidoAgente, setPedidoAgente] = useState<{ id: number; caso: string; texto: string } | null>(null)
  const lectura = useRef(0)

  const cargar = useCallback(async () => {
    const id = ++lectura.current
    try {
      const filas = await traerCasos()
      if (id !== lectura.current) return
      setCasos(filas)
      setError(null)
    } catch (fallo) {
      if (id !== lectura.current) return
      setError(fallo instanceof Error ? fallo.message : "No pude leer las solicitudes.")
    } finally {
      if (id === lectura.current) setCargando(false)
    }
  }, [])

  const reflejarFase = useCallback(
    (cambio: CambioFase) => {
      setCasos((previos) => aplicarFase(previos, cambio))
      void cargar()
    },
    [cargar],
  )

  const volverABandeja = useCallback(() => {
    setAbierto(null)
    void cargar()
  }, [cargar])

  useEffect(() => {
    void cargar()
    void estadoServidor()
      .then((salud) => setProveedor(`${salud.provider} · ${salud.model}`))
      .catch(() => setProveedor(null))
  }, [cargar])

  useEffect(() => {
    if (!cargando && !error && casos.length > 0 && !abierto && !guiaYaVista()) setGuia(true)
  }, [abierto, cargando, casos.length, error])

  const cerrarGuia = useCallback(() => {
    marcarGuiaVista()
    setGuia(false)
  }, [])

  const ejecutarSoporte = useCallback(
    (accion: AccionSoporte): string => {
      if (accion.tipo === "guia") {
        setGuia(true)
        return "Abrí la guía encima de la bandeja. Al cerrarla sigues en esta conversación."
      }
      if (accion.tipo === "filtrar") {
        setAbierto(null)
        setFiltro(accion.filtro)
        void cargar()
        return `Volví a la bandeja y dejé el filtro en «${accion.etiqueta}». Lo ves a la izquierda.`
      }
      if (accion.tipo === "abrir") {
        setAbierto(accion.caso)
        return `Abrí ${accion.caso}. A la izquierda están la conversación y los controles.`
      }
      setAbierto(accion.caso)
      setPedidoAgente({ id: Date.now(), caso: accion.caso, texto: accion.texto })
      return `Le escribí al agente para que procese ${accion.caso}. La respuesta aparece en la conversación del caso, no aquí.`
    },
    [cargar],
  )

  return (
    <>
      <a className="saltar" href="#principal">
        Saltar al contenido
      </a>
      <header className="cabecera">
        <div className="cabecera-interna">
          <div className="marca">
            <Logo />
            <div>
              <h1>Mesa</h1>
              <p className="marca-bajada">Órdenes de compra antes de SAP</p>
              <p>
                {abierto
                  ? "Conversa con el agente sobre este caso. Cada herramienta que usa queda a la vista."
                  : "Las solicitudes que llegaron por correo, con su estado de control."}
              </p>
            </div>
          </div>
          <div className="cabecera-acciones">
            <button type="button" className="guia-abrir" onClick={() => setSoporte(true)}>
              Soporte
            </button>
            <button type="button" className="guia-abrir" onClick={() => setGuia(true)}>
              Cómo se usa
            </button>
            {proveedor ? <p className="cabecera-meta">Modelo: {proveedor}</p> : null}
          </div>
        </div>
      </header>
      <Tutorial abierto={guia} alCerrar={cerrarGuia} />
      <div className={soporte ? "marco con-soporte" : "marco"}>
      <Soporte
        abierto={soporte}
        casoAbierto={abierto}
        casos={casos.map((fila) => fila.caso)}
        alCerrar={() => setSoporte(false)}
        alEjecutar={ejecutarSoporte}
      />
      <main className="contenido" id="principal">
        {abierto ? (
          <Detalle
            key={abierto}
            caso={abierto}
            alVolver={volverABandeja}
            alCambiar={reflejarFase}
            pedido={pedidoAgente && pedidoAgente.caso === abierto ? pedidoAgente : null}
            alConsumirPedido={() => setPedidoAgente(null)}
          />
        ) : (
          <Bandeja
            casos={casos}
            cargando={cargando}
            error={error}
            alAbrir={(caso) => setAbierto(caso)}
            filtro={filtro}
            alFiltrar={setFiltro}
          />
        )}
      </main>
      </div>
    </>
  )
}
