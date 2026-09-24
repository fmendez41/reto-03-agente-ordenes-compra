import { useCallback, useEffect, useState } from "react"
import { estadoServidor, traerCasos } from "./api.ts"
import { Bandeja } from "./componentes/Bandeja.tsx"
import { Detalle } from "./componentes/Detalle.tsx"
import type { FilaBandeja } from "./tipos.ts"

export function App() {
  const [casos, setCasos] = useState<FilaBandeja[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [proveedor, setProveedor] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      setCasos(await traerCasos())
      setError(null)
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : "No pude leer las solicitudes.")
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
    void estadoServidor()
      .then((salud) => setProveedor(`${salud.provider} · ${salud.model}`))
      .catch(() => setProveedor(null))
  }, [cargar])

  return (
    <>
      <a className="saltar" href="#principal">
        Saltar al contenido
      </a>
      <header className="cabecera">
        <div className="cabecera-interna">
          <div>
            <h1>Órdenes de compra</h1>
            <p>
              {abierto
                ? "Conversa con el agente sobre este caso. Cada herramienta que usa queda a la vista."
                : "Las solicitudes que llegaron por correo, con su estado de control."}
            </p>
          </div>
          {proveedor ? <p className="cabecera-meta">Modelo: {proveedor}</p> : null}
        </div>
      </header>
      <main className="contenido" id="principal">
        {abierto ? (
          <Detalle caso={abierto} alVolver={() => setAbierto(null)} alCambiar={() => void cargar()} />
        ) : (
          <Bandeja casos={casos} cargando={cargando} error={error} alAbrir={(caso) => setAbierto(caso)} />
        )}
      </main>
    </>
  )
}
