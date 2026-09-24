import { conDescripcion, dinero, etiquetaRegla, fecha, fuenteLegible, numero, unidad } from "../lib/formato.ts"
import type { Catalogos, Evaluacion, FichaRegla, VistaLlamada } from "../tipos.ts"

type Registro = Record<string, unknown>

const CATALOGOS_VACIOS: Catalogos = { indicadores: [], condiciones: [], reglas: [] }

function conFuente(derivado: Registro | null, texto: string): string {
  if (!derivado) return "—"
  const fuente = fuenteLegible(String(derivado.fuente ?? ""))
  return fuente === "—" ? texto : `${texto} · ${fuente}`
}

function Par({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <>
      <dt>{rotulo}</dt>
      <dd>{valor}</dd>
    </>
  )
}

function ListaReglas({ titulo, items, reglas }: { titulo: string; items: Evaluacion[]; reglas: FichaRegla[] }) {
  if (items.length === 0) return null
  const fichas = new Map(reglas.map((ficha) => [ficha.codigo, ficha]))
  return (
    <>
      <p className="regla-cabecera">
        <span className="regla-codigo">{titulo}</span>
      </p>
      <ul className="reglas">
        {items.map((item) => {
          const ficha = fichas.get(item.regla)
          return (
            <li key={item.regla} className={`regla ${item.estado}`}>
              <p className="regla-detalle">
                <strong>{ficha ? `${item.regla} · ${ficha.nombre}` : item.regla}</strong> · {etiquetaRegla(item.estado)}.{" "}
                {item.detalle}
              </p>
            </li>
          )
        })}
      </ul>
    </>
  )
}

/**
 * La sección 6.1 del PRD pide mostrar nombre, argumentos y resultado de cada llamada.
 * Varios argumentos son documentos enteros que el servidor vuelve a leer del disco, así
 * que se recortan: interesa ver con qué se llamó, no volcar el paquete completo.
 */
function valorLegible(valor: unknown): string {
  if (valor === null || valor === undefined) return "—"
  if (typeof valor === "string") return valor.length > 140 ? `${valor.slice(0, 140)}…` : valor
  if (typeof valor === "number" || typeof valor === "boolean") return String(valor)
  const texto = JSON.stringify(valor)
  return texto.length > 140 ? `${texto.slice(0, 140)}…` : texto
}

function Argumentos({ args }: { args: unknown }) {
  const entradas =
    args !== null && typeof args === "object" && !Array.isArray(args) ? Object.entries(args as Registro) : null
  return (
    <div className="herramienta-args">
      <p className="herramienta-args-titulo">Argumentos de la llamada</p>
      {entradas && entradas.length > 0 ? (
        <dl className="datos">
          {entradas.map(([clave, valor]) => (
            <Par key={clave} rotulo={clave} valor={valorLegible(valor)} />
          ))}
        </dl>
      ) : (
        <p className="herramienta-args-crudo">{valorLegible(args)}</p>
      )}
    </div>
  )
}

function DetallePaquete({ data }: { data: Registro }) {
  const solicitud = data.solicitud as Registro | null
  const cotizacion = data.cotizacion as Registro | null
  const aprobacion = data.aprobacion as Registro | null
  const factura = data.factura as Registro | null
  const moneda = String(solicitud?.moneda ?? "COP")
  return (
    <dl className="datos">
      {solicitud ? (
        <>
          <Par rotulo="Solicitud" valor={String(solicitud.solicitud_id)} />
          <Par rotulo="Pide" valor={String(solicitud.solicitante)} />
          <Par rotulo="Proveedor" valor={String(solicitud.proveedor_nombre)} />
          <Par
            rotulo="Valor"
            valor={`${numero(Number(solicitud.cantidad))} × ${dinero(Number(solicitud.valor_unitario), moneda)} = ${dinero(Number(solicitud.valor_total), moneda)}`}
          />
          <Par rotulo="Imputación" valor={`${solicitud.centro_costo} · ${solicitud.subarea}`} />
          <Par rotulo="Fecha" valor={fecha(String(solicitud.fecha_solicitud))} />
        </>
      ) : (
        <Par rotulo="Solicitud" valor="No vino en el paquete" />
      )}
      <Par
        rotulo="Cotización"
        valor={
          cotizacion
            ? `${cotizacion.referencia ?? "sin referencia"} por ${dinero(Number(cotizacion.total), String(cotizacion.moneda ?? moneda))}`
            : "No vino en el paquete"
        }
      />
      <Par
        rotulo="Aprobación"
        valor={
          aprobacion
            ? `${aprobacion.de} el ${fecha(String(aprobacion.fecha))}${aprobacion.aprobado ? "" : " (sin la palabra Aprobado)"}`
            : "No vino en el paquete"
        }
      />
      {factura ? (
        <Par
          rotulo="Factura"
          valor={`${factura.numero} del ${fecha(String(factura.fecha))} por ${dinero(Number(factura.total), moneda)}`}
        />
      ) : null}
    </dl>
  )
}

function DetalleValidacion({ data, catalogos }: { data: Registro; catalogos: Catalogos }) {
  const derivados = (data.derivados ?? {}) as Registro
  const proveedor = derivados.proveedor as Registro | null
  const iva = derivados.indicador_iva as Registro | null
  const condiciones = derivados.condiciones_pago as Registro | null
  const unidadDerivada = derivados.unidad as Registro | null
  return (
    <>
      <dl className="datos">
        <Par rotulo="Proveedor resuelto" valor={proveedor ? `${proveedor.nombre} (${proveedor.codigo_sap})` : "Sin resolver"} />
        <Par
          rotulo="Indicador de IVA"
          valor={conFuente(iva, conDescripcion(iva ? String(iva.valor) : null, catalogos.indicadores))}
        />
        <Par
          rotulo="Condiciones de pago"
          valor={conFuente(condiciones, conDescripcion(condiciones ? String(condiciones.valor) : null, catalogos.condiciones))}
        />
        <Par
          rotulo="Unidad"
          valor={conFuente(unidadDerivada, unidadDerivada ? unidad(String(unidadDerivada.valor)) : "—")}
        />
        <Par rotulo="Retroactiva" valor={data.retroactiva ? "Sí" : "No"} />
      </dl>
      <ListaReglas titulo="Bloqueos" items={(data.bloqueos ?? []) as Evaluacion[]} reglas={catalogos.reglas} />
      <ListaReglas
        titulo="Pendientes de confirmación"
        items={(data.confirmaciones ?? []) as Evaluacion[]}
        reglas={catalogos.reglas}
      />
    </>
  )
}

function DetalleOrden({ data, catalogos }: { data: Registro; catalogos: Catalogos }) {
  const orden = data.orden as Registro | undefined
  if (!orden) return null
  const proveedor = orden.proveedor as Registro
  const posiciones = (orden.posiciones ?? []) as Registro[]
  const posicion = posiciones[0]
  const moneda = String(orden.moneda ?? "COP")
  return (
    <dl className="datos">
      <Par rotulo="Proveedor" valor={`${proveedor.nombre} (${proveedor.codigo_sap})`} />
      <Par rotulo="Condiciones" valor={conDescripcion(String(orden.condiciones_pago), catalogos.condiciones)} />
      {posicion ? (
        <>
          <Par rotulo="Descripción" valor={String(posicion.descripcion)} />
          <Par
            rotulo="Cantidad"
            valor={`${numero(Number(posicion.cantidad))} ${unidad(String(posicion.unidad))} a ${dinero(Number(posicion.precio_unitario), moneda)}`}
          />
          <Par rotulo="IVA" valor={conDescripcion(String(posicion.indicador_iva), catalogos.indicadores)} />
        </>
      ) : null}
      <Par rotulo="Trazabilidad" valor={String(data.trazabilidad ?? "—")} />
    </dl>
  )
}

function DetalleEvidencia({ data }: { data: Registro }) {
  return (
    <dl className="datos">
      <dt>Firma del correo</dt>
      <dd className="sha">{String(data.sha256 ?? "—")}</dd>
      <Par rotulo="Archivo de texto" valor={nombreArchivo(String(data.ruta ?? ""))} />
      {data.pdf ? <Par rotulo="Archivo PDF" valor={nombreArchivo(String(data.pdf))} /> : null}
    </dl>
  )
}

function DetalleCreacion({ data }: { data: Registro }) {
  return (
    <dl className="datos">
      <Par rotulo="Número de orden" valor={String(data.numero_oc ?? "—")} />
      <Par
        rotulo="Resultado"
        valor={data.idempotente ? "Ya existía para esa solicitud, no se creó otra" : "Creada en esta ejecución"}
      />
    </dl>
  )
}

function nombreArchivo(ruta: string): string {
  const partes = ruta.split(/[\\/]/)
  return partes.slice(-2).join("/") || ruta
}

export function Herramienta({ llamada, catalogos }: { llamada: VistaLlamada; catalogos: Catalogos | null }) {
  const data = (llamada.data ?? {}) as Registro
  const lista = catalogos ?? CATALOGOS_VACIOS
  return (
    <details className={`herramienta ${llamada.ok ? "" : "fallo"}`}>
      <summary>
        <span className="herramienta-titulo">{llamada.titulo}</span>
        <code className="herramienta-nombre">{llamada.name}</code>
        <span className="herramienta-resumen">{llamada.resumen}</span>
      </summary>
      <div className="herramienta-cuerpo">
        <Argumentos args={llamada.args} />
        {!llamada.ok ? <p className="herramienta-error">{llamada.error}</p> : null}
        {llamada.ok && llamada.name === "oc_leer_paquete" ? <DetallePaquete data={data} /> : null}
        {llamada.ok && llamada.name === "oc_validar" ? <DetalleValidacion data={data} catalogos={lista} /> : null}
        {llamada.ok && llamada.name === "oc_construir_payload" ? <DetalleOrden data={data} catalogos={lista} /> : null}
        {llamada.ok && llamada.name === "oc_generar_evidencia" ? <DetalleEvidencia data={data} /> : null}
        {llamada.ok && llamada.name === "oc_crear" ? <DetalleCreacion data={data} /> : null}
      </div>
    </details>
  )
}
