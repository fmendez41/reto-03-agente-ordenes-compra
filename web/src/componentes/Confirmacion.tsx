import { useEffect, useState } from "react"
import { dinero, fecha, porcentaje } from "../lib/formato.ts"
import type { Confirmacion as ConfirmacionPendiente, DetalleCaso } from "../tipos.ts"

type Celda = { rotulo: string; valor: string }

function minutosRestantes(venceEn: string): number {
  const vence = Date.parse(venceEn)
  if (Number.isNaN(vence)) return 0
  return Math.max(0, Math.ceil((vence - Date.now()) / 60000))
}

function celdasDe(codigo: string, detalle: DetalleCaso | null): Celda[] {
  if (!detalle) return []
  const solicitud = detalle.paquete.solicitud
  const cotizacion = detalle.paquete.cotizacion
  const factura = detalle.paquete.factura
  const moneda = solicitud?.moneda ?? "COP"

  if (codigo === "RC5" && solicitud) {
    if (!cotizacion) {
      return [{ rotulo: "Cotización", valor: "No llegó con el paquete" }]
    }
    const diferencia = Math.abs(cotizacion.total - solicitud.valor_total) / solicitud.valor_total
    return [
      { rotulo: "Dice la solicitud", valor: dinero(solicitud.valor_total, moneda) },
      { rotulo: "Dice la cotización", valor: dinero(cotizacion.total, moneda) },
      { rotulo: "Diferencia", valor: `${porcentaje(diferencia)} (el límite es 2 %)` },
    ]
  }

  if (codigo === "RC6") {
    const iva = detalle.validacion.derivados.indicador_iva
    const catalogo = detalle.catalogos.indicadores.find((item) => item.codigo === iva?.valor)
    return [
      { rotulo: "Trae la solicitud", valor: "Sin indicador de IVA" },
      {
        rotulo: "Se usaría",
        valor: iva ? `${iva.valor}${catalogo ? ` · ${catalogo.descripcion}` : ""}` : "—",
      },
      { rotulo: "Sale de", valor: "El maestro del proveedor" },
    ]
  }

  if (codigo === "RC8" && factura && solicitud) {
    return [
      { rotulo: "Factura", valor: `${factura.numero} del ${fecha(factura.fecha)}` },
      { rotulo: "Solicitud", valor: fecha(solicitud.fecha_solicitud) },
    ]
  }

  if (codigo === "RC9" && solicitud && detalle.paquete.aprobacion) {
    return [
      { rotulo: "Aprobación", valor: fecha(detalle.paquete.aprobacion.fecha) },
      { rotulo: "Solicitud", valor: fecha(solicitud.fecha_solicitud) },
    ]
  }

  return []
}

export function Confirmacion({
  confirmacion,
  detalle,
  enviando,
  alConfirmar,
  alDejarPendiente,
}: {
  confirmacion: ConfirmacionPendiente
  detalle: DetalleCaso | null
  enviando: boolean
  alConfirmar: () => void
  alDejarPendiente: () => void
}) {
  const [minutos, setMinutos] = useState(() => minutosRestantes(confirmacion.vence_en))

  useEffect(() => {
    setMinutos(minutosRestantes(confirmacion.vence_en))
    const reloj = setInterval(() => setMinutos(minutosRestantes(confirmacion.vence_en)), 15000)
    return () => clearInterval(reloj)
  }, [confirmacion.vence_en])

  const caducada = minutos === 0

  const reglas = confirmacion.codigos
    .map((codigo) => {
      const evaluacion = detalle?.validacion.confirmaciones.find((item) => item.regla === codigo)
      return { codigo, detalle: evaluacion?.detalle ?? "", celdas: celdasDe(codigo, detalle) }
    })
    .filter((item) => item.detalle || item.celdas.length > 0)

  return (
    <section className="confirmacion" aria-labelledby="titulo-confirmacion">
      <h3 id="titulo-confirmacion">El agente necesita tu confirmación</h3>
      {reglas.length === 0 ? (
        <p>Reglas pendientes: {confirmacion.codigos.join(", ")}.</p>
      ) : (
        reglas.map((regla) => (
          <div key={regla.codigo}>
            <p className="regla-detalle">
              <strong>{regla.codigo}</strong> · {regla.detalle}
            </p>
            {regla.celdas.length > 0 ? (
              <div className="comparacion">
                {regla.celdas.map((celda) => (
                  <div key={celda.rotulo} className="comparacion-celda">
                    <span className="rotulo">{celda.rotulo}</span>
                    <span className="valor">{celda.valor}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))
      )}

      {detalle?.validacion.retroactiva ? (
        <p className="aviso-retroactiva">
          Si la creas, la orden queda marcada como retroactiva en el registro de control. Dirección mide ese dato.
        </p>
      ) : null}

      {caducada ? (
        <p className="aviso-caducada">
          Esta confirmación caducó. Pídele al agente que vuelva a revisar el caso para que te proponga una nueva.
        </p>
      ) : (
        <p className="vence">
          Vence en {minutos} {minutos === 1 ? "minuto" : "minutos"}. Después tendrás que pedirla de nuevo.
        </p>
      )}

      <div className="acciones">
        <button type="button" className="boton-principal" onClick={alConfirmar} disabled={enviando || caducada}>
          Confirmo y creo la orden
        </button>
        <button type="button" className="boton-secundario" onClick={alDejarPendiente} disabled={enviando}>
          {caducada ? "Entendido" : "No, la dejo pendiente"}
        </button>
      </div>
    </section>
  )
}
