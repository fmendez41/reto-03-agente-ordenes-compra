import { conDescripcion, dinero, fecha, numero, unidad } from "../lib/formato.ts"
import type { Catalogos, OrdenCompra } from "../tipos.ts"

export function Orden({
  orden,
  catalogos,
  numeroOc,
  sha256,
}: {
  orden: OrdenCompra | null
  catalogos: Catalogos
  numeroOc: string | null
  sha256: string | null
}) {
  if (!orden) {
    return (
      <section className="panel" aria-labelledby="titulo-orden">
        <h3 id="titulo-orden">Orden de compra</h3>
        <p>Todavía no hay orden que mostrar: primero hay que levantar los bloqueos.</p>
      </section>
    )
  }

  const posicion = orden.posiciones[0]
  const total = posicion ? posicion.cantidad * posicion.precio_unitario : 0

  return (
    <section className="panel" aria-labelledby="titulo-orden">
      <h3 id="titulo-orden">Orden de compra {numeroOc ? `· ${numeroOc}` : "· sin crear"}</h3>
      <dl className="datos">
        <dt>Proveedor</dt>
        <dd>
          {orden.proveedor.nombre} · código SAP {orden.proveedor.codigo_sap} · NIT {orden.proveedor.nit}
        </dd>
        <dt>Sociedad</dt>
        <dd>
          {orden.sociedad} · organización de compras {orden.organizacion_compras}
        </dd>
        <dt>Condiciones de pago</dt>
        <dd>{conDescripcion(orden.condiciones_pago, catalogos.condiciones)}</dd>
        <dt>Aprobó</dt>
        <dd>
          {orden.aprobador.email} el {fecha(orden.aprobador.fecha_aprobacion)}
        </dd>
        <dt>Referencias</dt>
        <dd>
          Solicitud {orden.referencia.solicitud_id}
          {orden.referencia.cotizacion_ref ? ` · cotización ${orden.referencia.cotizacion_ref}` : ""}
        </dd>
      </dl>

      {posicion ? (
        <div className="posicion">
          <dl className="datos">
            <dt>Posición {posicion.numero}</dt>
            <dd>{posicion.descripcion}</dd>
            <dt>Cantidad</dt>
            <dd className="numerico">
              {numero(posicion.cantidad)} {unidad(posicion.unidad)}
            </dd>
            <dt>Precio unitario</dt>
            <dd className="numerico">{dinero(posicion.precio_unitario, orden.moneda)}</dd>
            <dt>Imputación</dt>
            <dd>
              {posicion.centro_costo} · {posicion.subarea}
            </dd>
            <dt>Indicador de IVA</dt>
            <dd>{conDescripcion(posicion.indicador_iva, catalogos.indicadores)}</dd>
          </dl>
          <p className="posicion-total">
            <span>Total de la posición</span>
            <span className="numerico">{dinero(total, orden.moneda)}</span>
          </p>
        </div>
      ) : null}

      {orden.excepciones.length > 0 ? (
        <p className="reglas-resumen">
          {numeroOc ? "Quedó registrada" : "Quedará registrada"} con{" "}
          {orden.excepciones.length === 1 ? "la excepción" : "las excepciones"}{" "}
          {orden.excepciones.map((item) => item.codigo).join(", ")}.
        </p>
      ) : null}

      {sha256 ? (
        <p className="reglas-resumen">
          Evidencia de aprobación, firmada sobre el texto del correo: <span className="sha">{sha256}</span>
        </p>
      ) : null}
    </section>
  )
}
