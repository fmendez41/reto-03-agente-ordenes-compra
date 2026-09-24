import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { enviarMensaje, traerDetalle } from "../api.ts"
import { dinero } from "../lib/formato.ts"
import type { Confirmacion, DetalleCaso, Mensaje } from "../tipos.ts"
import { Chat } from "./Chat.tsx"
import { EtiquetaEstado, EtiquetaRetroactiva } from "./Etiqueta.tsx"
import { Orden } from "./Orden.tsx"
import { Reglas } from "./Reglas.tsx"

function claveSesion(caso: string): string {
  return `oc-sesion-${caso}`
}

function idMensaje(): string {
  return Math.random().toString(36).slice(2)
}

export function Detalle({ caso, alVolver, alCambiar }: { caso: string; alVolver: () => void; alCambiar: () => void }) {
  const [detalle, setDetalle] = useState<DetalleCaso | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [pensando, setPensando] = useState(false)
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null)
  const sesion = useRef(localStorage.getItem(claveSesion(caso)) ?? "")

  const recargarDetalle = useCallback(async () => {
    try {
      setDetalle(await traerDetalle(caso))
      setError(null)
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : "No pude leer el caso.")
    }
  }, [caso])

  useEffect(() => {
    void recargarDetalle()
  }, [recargarDetalle])

  const conversar = useCallback(
    async (texto: string, actionId?: string | null) => {
      setMensajes((previos) => [...previos, { id: idMensaje(), autor: "analista", texto }])
      setPensando(true)
      setConfirmacion(null)
      try {
        const respuesta = await enviarMensaje({ sessionId: sesion.current, message: texto, actionId })
        sesion.current = respuesta.sessionId
        localStorage.setItem(claveSesion(caso), respuesta.sessionId)
        setMensajes((previos) => [
          ...previos,
          { id: idMensaje(), autor: "agente", texto: respuesta.reply, toolCalls: respuesta.toolCalls },
        ])
        setConfirmacion(respuesta.needsConfirmation ? respuesta.confirmacion : null)
        await recargarDetalle()
        alCambiar()
      } catch (fallo) {
        const mensaje = fallo instanceof Error ? fallo.message : "No pude completar el turno."
        const texto = actionId
          ? `${mensaje} No se creó ninguna orden. Pídele al agente que vuelva a revisar ${caso} para obtener una confirmación nueva.`
          : mensaje
        setMensajes((previos) => [...previos, { id: idMensaje(), autor: "sistema", texto }])
        await recargarDetalle()
      } finally {
        setPensando(false)
      }
    },
    [alCambiar, caso, recargarDetalle],
  )

  const sugerencias = useMemo(() => {
    if (!detalle) return []
    if (detalle.numero_oc) return [`Muéstrame cómo quedó la orden de ${caso}`]
    if (detalle.validacion.estado === "BLOQUEADA") return [`¿Por qué está bloqueada ${caso}?`]
    if (detalle.validacion.estado === "PENDIENTE_CONFIRMACION") {
      return [`Procesa ${caso} y no la crees hasta que yo confirme`]
    }
    return [`Procesa ${caso} y créala si todo está en orden`]
  }, [caso, detalle])

  const solicitud = detalle?.paquete.solicitud ?? null
  const estado = detalle?.numero_oc ? "CREADA" : (detalle?.validacion.estado ?? "ERROR")

  return (
    <>
      <button type="button" className="volver" onClick={alVolver}>
        ← Volver a la bandeja
      </button>

      {error ? (
        <div className="error-caja">
          <strong>No pude leer este caso.</strong>
          <p>{error}</p>
        </div>
      ) : null}

      <header className="detalle-encabezado">
        <h2>{solicitud ? `${caso} · ${solicitud.descripcion}` : caso}</h2>
        <p className="subtitulo">
          {solicitud ? `${solicitud.solicitud_id} · pedida por ${solicitud.solicitante}` : "Cargando la solicitud…"}
        </p>
        <div className="filtros">
          <EtiquetaEstado estado={estado} />
          {detalle?.validacion.retroactiva ? <EtiquetaRetroactiva /> : null}
          {detalle?.numero_oc ? <span className="etiqueta gris">Orden {detalle.numero_oc}</span> : null}
          {solicitud ? (
            <span className="etiqueta gris">{dinero(solicitud.valor_total, solicitud.moneda)}</span>
          ) : null}
        </div>
      </header>

      <div className="detalle-columnas">
        <div>
          <Chat
            caso={caso}
            mensajes={mensajes}
            pensando={pensando}
            confirmacion={confirmacion}
            detalle={detalle}
            sugerencias={sugerencias}
            alEnviar={(texto) => void conversar(texto)}
            alConfirmar={() => void conversar("Confirmo, crea la orden.", confirmacion?.actionId)}
            alDejarPendiente={() => {
              setConfirmacion(null)
              setMensajes((previos) => [
                ...previos,
                { id: idMensaje(), autor: "sistema", texto: "Dejaste el caso pendiente. No se creó ninguna orden." },
              ])
            }}
          />
        </div>
        <div>
          {detalle ? (
            <>
              <Reglas evaluaciones={detalle.validacion.evaluaciones} reglas={detalle.catalogos.reglas} />
              <Orden
                orden={detalle.orden}
                catalogos={detalle.catalogos}
                numeroOc={detalle.numero_oc}
                sha256={detalle.evidencia?.sha256 ?? null}
              />
            </>
          ) : (
            <p className="vacio">Cargando los controles del caso…</p>
          )}
        </div>
      </div>
    </>
  )
}
