import { cargarMaestros } from "./maestros.ts"
import { fechaCalendario, formatoMonto, normalizarNit, normalizarNombre } from "./texto.ts"
import type { Evaluacion, Maestros, Paquete, Ubicacion, Validacion } from "./types.ts"
import { decidirUnidad } from "./unidad.ts"

function regla(
  codigo: string,
  estado: Evaluacion["estado"],
  detalle: string,
  accion: string,
): Evaluacion {
  return { regla: codigo, estado, detalle, accion_sugerida: accion }
}

export function evaluarReglas(paquete: Paquete, maestros: Maestros): Validacion | { ok: false; error: string } {
  const solicitud = paquete.solicitud
  if (!solicitud) {
    return {
      ok: false,
      error:
        "El paquete de este caso no incluye la solicitud. De ahí salen el monto, el centro de costo y la subárea, así que sin ella no se puede evaluar ningún control. Pide el Excel al solicitante.",
    }
  }

  const evaluaciones: Evaluacion[] = []
  const nit = solicitud.proveedor_nit ? normalizarNit(solicitud.proveedor_nit) : null
  const nombre = normalizarNombre(solicitud.proveedor_nombre)
  const porNit = nit ? maestros.proveedores.filter((item) => normalizarNit(item.nit) === nit) : []
  const porNombre = maestros.proveedores.filter((item) => normalizarNombre(item.nombre) === nombre)
  const candidatos = nit ? porNit : porNombre

  let proveedor = candidatos.length === 1 ? candidatos[0] : null
  if (candidatos.length === 0) {
    evaluaciones.push(
      regla(
        "RC1",
        "bloquea",
        nit
          ? `La solicitud trae el NIT ${nit} y ese NIT no está en el maestro de proveedores.`
          : `La solicitud no trae NIT, así que se buscó por nombre: ningún proveedor del maestro coincide con "${solicitud.proveedor_nombre}".`,
        "Pide al solicitante el NIT y tramita el alta del proveedor en SAP antes de crear la OC.",
      ),
    )
  } else if (candidatos.length > 1) {
    proveedor = null
    evaluaciones.push(
      regla(
        "RC1",
        "bloquea",
        `La solicitud no trae NIT y el nombre "${solicitud.proveedor_nombre}" coincide con varios proveedores del maestro: ${candidatos
          .map((item) => `${item.nombre} (${item.codigo_sap})`)
          .join(", ")}.`,
        "Pide el NIT para desempatar. No elijas un proveedor por aproximación.",
      ),
    )
  } else if (proveedor && !proveedor.activo) {
    const inactivo = proveedor
    proveedor = null
    evaluaciones.push(
      regla(
        "RC1",
        "bloquea",
        `El proveedor ${inactivo.nombre} (${inactivo.codigo_sap}) sí está en el maestro, pero figura como inactivo.`,
        "Escala al área que administra el maestro de proveedores para reactivarlo antes de comprar.",
      ),
    )
  } else if (proveedor) {
    evaluaciones.push(
      regla(
        "RC1",
        "cumple",
        `Proveedor ${proveedor.nombre} (${proveedor.codigo_sap}) activo en el maestro, encontrado por ${nit ? `NIT ${nit}` : "nombre"}.`,
        "Ninguna.",
      ),
    )
  }

  const centro = maestros.centros.find((item) => item.centro_costo === solicitud.centro_costo) ?? null
  const aprobador =
    paquete.aprobacion && centro
      ? centro.aprobadores.find((item) => item.email.toLowerCase() === paquete.aprobacion?.de.toLowerCase()) ?? null
      : null

  if (!paquete.aprobacion) {
    evaluaciones.push(
      regla(
        "RC2",
        "bloquea",
        "El paquete no trae correo de aprobación, así que no hay constancia de que alguien haya autorizado esta compra.",
        "Pide al líder del centro de costo un correo que diga Aprobado de forma explícita.",
      ),
    )
  } else if (!paquete.aprobacion.aprobado) {
    evaluaciones.push(
      regla(
        "RC2",
        "bloquea",
        `El correo de ${paquete.aprobacion.de} no contiene la palabra Aprobado, así que no cuenta como autorización.`,
        "Pide una respuesta explícita del líder. Un reenvío o un visto bueno implícito no sirve como evidencia.",
      ),
    )
  } else if (!centro) {
    evaluaciones.push(
      regla(
        "RC2",
        "bloquea",
        `El centro de costo ${solicitud.centro_costo} que trae la solicitud no existe en el maestro, así que no hay lista de aprobadores contra la cual validar el correo.`,
        "Corrige el centro de costo con el solicitante.",
      ),
    )
  } else if (!aprobador) {
    const lista = centro.aprobadores.map((item) => item.email).join(", ")
    evaluaciones.push(
      regla(
        "RC2",
        "bloquea",
        `Aprobó ${paquete.aprobacion.de}, que no figura como aprobador del centro ${centro.centro_costo} en el maestro.`,
        `La aprobación tiene que venir de: ${lista}.`,
      ),
    )
  } else {
    evaluaciones.push(
      regla(
        "RC2",
        "cumple",
        `Aprobó ${aprobador.email}, que sí figura como aprobador del centro ${centro.centro_costo}.`,
        "Ninguna.",
      ),
    )
  }

  if (!aprobador) {
    const topes = centro
      ? centro.aprobadores.map((item) => `${item.email} (tope ${item.tope})`).join("; ")
      : "no hay centro de costo válido"
    evaluaciones.push(
      regla(
        "RC3",
        "no_evaluable",
        "RC3 no se puede evaluar: RC2 no encontró un aprobador válido para este centro, así que no hay tope contra el cual comparar el monto.",
        centro
          ? `Consigue la aprobación de alguien autorizado en ${centro.centro_costo}. Los topes vigentes son: ${topes}. Esta compra vale ${formatoMonto(solicitud.valor_total, solicitud.moneda)}.`
          : "Primero corrige el centro de costo; después se podrá saber quién puede aprobar y hasta cuánto.",
      ),
    )
  } else if (solicitud.valor_total > aprobador.tope) {
    evaluaciones.push(
      regla(
        "RC3",
        "bloquea",
        `La compra vale ${formatoMonto(solicitud.valor_total, solicitud.moneda)} y supera el tope de ${formatoMonto(aprobador.tope, solicitud.moneda)} que tiene ${aprobador.email} en este centro.`,
        "Pide la aprobación de alguien con tope suficiente. La firma actual no alcanza para este monto.",
      ),
    )
  } else {
    evaluaciones.push(
      regla(
        "RC3",
        "cumple",
        `La compra vale ${formatoMonto(solicitud.valor_total, solicitud.moneda)}, dentro del tope de ${formatoMonto(aprobador.tope, solicitud.moneda)} de ${aprobador.email}.`,
        "Ninguna.",
      ),
    )
  }

  if (!centro) {
    evaluaciones.push(
      regla(
        "RC4",
        "bloquea",
        `El centro de costo ${solicitud.centro_costo} no existe en el maestro, así que no se puede comprobar a qué subáreas pertenece.`,
        "Corrige el centro de costo con el solicitante.",
      ),
    )
  } else if (!centro.subareas.includes(solicitud.subarea)) {
    evaluaciones.push(
      regla(
        "RC4",
        "bloquea",
        `La subárea ${solicitud.subarea} no pertenece al centro ${centro.centro_costo} según el maestro, así que el gasto quedaría imputado donde no corresponde.`,
        `Las subáreas registradas para ${centro.centro_costo} son: ${centro.subareas.join(", ")}.`,
      ),
    )
  } else {
    evaluaciones.push(
      regla("RC4", "cumple", `La subárea ${solicitud.subarea} pertenece al centro ${centro.centro_costo}.`, "Ninguna."),
    )
  }

  if (!paquete.cotizacion) {
    evaluaciones.push(
      regla(
        "RC5",
        "confirma",
        "El paquete no trae cotización, así que no hay ningún documento del proveedor contra el cual contrastar el valor de la solicitud.",
        "Decide si se crea la OC sin cotización o si primero se le pide al proveedor.",
      ),
    )
  } else if (solicitud.valor_total === 0) {
    evaluaciones.push(
      regla(
        "RC5",
        "bloquea",
        "El valor total de la solicitud es cero, así que no hay forma de calcular la diferencia porcentual contra la cotización.",
        "Corrige el monto de la solicitud con el solicitante antes de seguir.",
      ),
    )
  } else {
    const diferencia = Math.abs(paquete.cotizacion.total - solicitud.valor_total) / solicitud.valor_total
    if (diferencia > 0.02) {
      evaluaciones.push(
        regla(
          "RC5",
          "confirma",
          `La solicitud dice ${formatoMonto(solicitud.valor_total, solicitud.moneda)} y la cotización ${formatoMonto(paquete.cotizacion.total, paquete.cotizacion.moneda)}: una diferencia del ${(diferencia * 100).toFixed(1)} %, por encima del 2 % que tolera el control.`,
          "Revisa ambos valores y confirma con cuál se crea la orden. La orden se arma con el valor de la solicitud.",
        ),
      )
    } else {
      evaluaciones.push(
        regla(
          "RC5",
          "cumple",
          `La cotización (${formatoMonto(paquete.cotizacion.total, paquete.cotizacion.moneda)}) cuadra con la solicitud (${formatoMonto(solicitud.valor_total, solicitud.moneda)}) dentro del 2 %.`,
          "Ninguna.",
        ),
      )
    }
  }

  let indicador: Validacion["derivados"]["indicador_iva"] = null
  if (solicitud.indicador_iva) {
    indicador = { valor: solicitud.indicador_iva, fuente: "solicitud" }
    evaluaciones.push(
      regla(
        "RC6",
        "cumple",
        `La solicitud trae el indicador de IVA ${solicitud.indicador_iva}, así que no hubo que derivarlo del maestro.`,
        "Ninguna.",
      ),
    )
  } else if (proveedor) {
    indicador = { valor: proveedor.indicador_iva_default, fuente: "maestro.proveedores" }
    evaluaciones.push(
      regla(
        "RC6",
        "confirma",
        `La solicitud no trae indicador de IVA. Se tomó ${proveedor.indicador_iva_default} del maestro del proveedor ${proveedor.nombre} (${proveedor.codigo_sap}), que es su valor por defecto.`,
        "Confirma que ese indicador es el correcto para esta compra antes de crear la OC.",
      ),
    )
  } else {
    evaluaciones.push(
      regla(
        "RC6",
        "confirma",
        "La solicitud no trae indicador de IVA y RC1 no resolvió un proveedor del cual derivarlo.",
        "Pide el indicador de IVA al solicitante, o resuelve primero el proveedor y se deriva solo.",
      ),
    )
  }

  let condiciones: Validacion["derivados"]["condiciones_pago"] = null
  if (solicitud.condiciones_pago) {
    condiciones = { valor: solicitud.condiciones_pago, fuente: "solicitud" }
    evaluaciones.push(
      regla(
        "RC7",
        "cumple",
        `La solicitud trae las condiciones de pago ${solicitud.condiciones_pago}, así que no hubo que derivarlas del maestro.`,
        "Ninguna.",
      ),
    )
  } else if (proveedor) {
    condiciones = { valor: proveedor.condiciones_pago_default, fuente: "maestro.proveedores" }
    evaluaciones.push(
      regla(
        "RC7",
        "informa",
        `La solicitud no trae condiciones de pago. Se usarán las ${proveedor.condiciones_pago_default} del maestro del proveedor ${proveedor.nombre} (${proveedor.codigo_sap}), que son las pactadas con él.`,
        "Ninguna. Este control solo informa el valor derivado y de dónde salió; no hace falta confirmarlo.",
      ),
    )
  } else {
    evaluaciones.push(
      regla(
        "RC7",
        "informa",
        "La solicitud no trae condiciones de pago y RC1 no resolvió un proveedor del cual derivarlas.",
        "Se resuelve solo en cuanto se resuelva el proveedor. Este control no bloquea por sí mismo; el que impide crear la orden es RC1.",
      ),
    )
  }

  const fechaSolicitud = fechaCalendario(solicitud.fecha_solicitud)
  const fechaFactura = paquete.factura ? fechaCalendario(paquete.factura.fecha) : null
  const retroactiva = Boolean(fechaFactura && fechaSolicitud && fechaFactura < fechaSolicitud)
  if (retroactiva && paquete.factura && fechaFactura && fechaSolicitud) {
    evaluaciones.push(
      regla(
        "RC8",
        "confirma",
        `La factura ${paquete.factura.numero} es del ${fechaFactura} y la solicitud del ${fechaSolicitud}: se facturó antes de pedir la compra, así que esta orden regulariza algo que ya pasó.`,
        "Confirma si se regulariza. La orden quedará marcada como retroactiva y el hecho se registra en el log de control.",
      ),
    )
  } else {
    evaluaciones.push(
      regla(
        "RC8",
        "cumple",
        paquete.factura
          ? `La factura ${paquete.factura.numero} no es anterior a la solicitud, así que la compra no es retroactiva.`
          : "El paquete no trae factura, así que no hay nada que regularizar: la compra no es retroactiva.",
        "Ninguna.",
      ),
    )
  }

  const fechaAprobacion = paquete.aprobacion ? fechaCalendario(paquete.aprobacion.fecha) : null
  if (!fechaAprobacion || !fechaSolicitud) {
    evaluaciones.push(
      regla(
        "RC9",
        "no_evaluable",
        "RC9 no se puede evaluar: falta la fecha de la aprobación o la de la solicitud, así que no hay dos fechas que comparar.",
        "Completa las fechas en el paquete y vuelve a validar.",
      ),
    )
  } else if (fechaAprobacion < fechaSolicitud) {
    evaluaciones.push(
      regla(
        "RC9",
        "confirma",
        `La aprobación es del ${fechaAprobacion} y la solicitud del ${fechaSolicitud}: se aprobó antes de que la solicitud existiera, así que esa firma no pudo referirse a esta compra.`,
        "Comprueba si esa aprobación ampara igualmente esta compra, o pide una nueva al líder.",
      ),
    )
  } else {
    evaluaciones.push(
      regla(
        "RC9",
        "cumple",
        `La aprobación (${fechaAprobacion}) es posterior o igual a la solicitud (${fechaSolicitud}).`,
        "Ninguna.",
      ),
    )
  }

  const producto = solicitud.cantidad * solicitud.valor_unitario
  if (Math.abs(producto - solicitud.valor_total) > 1) {
    evaluaciones.push(
      regla(
        "RC10",
        "bloquea",
        `${solicitud.cantidad} × ${formatoMonto(solicitud.valor_unitario, solicitud.moneda)} da ${formatoMonto(producto, solicitud.moneda)}, pero la solicitud informa un total de ${formatoMonto(solicitud.valor_total, solicitud.moneda)}.`,
        "Pide al solicitante que cuadre cantidad, valor unitario y total. Con tres cifras que no casan no hay forma de saber cuál es la buena.",
      ),
    )
  } else {
    evaluaciones.push(
      regla(
        "RC10",
        "cumple",
        `${solicitud.cantidad} × ${formatoMonto(solicitud.valor_unitario, solicitud.moneda)} cuadra con el total de ${formatoMonto(solicitud.valor_total, solicitud.moneda)}.`,
        "Ninguna.",
      ),
    )
  }

  const unidad = decidirUnidad(paquete.cotizacion?.encabezado_item ?? solicitud.descripcion)
  const bloqueos = evaluaciones.filter((item) => item.estado === "bloquea")
  const confirmaciones = evaluaciones.filter((item) => item.estado === "confirma")
  const estado = bloqueos.length > 0 ? "BLOQUEADA" : confirmaciones.length > 0 ? "PENDIENTE_CONFIRMACION" : "LISTA_PARA_CREAR"

  return {
    apta: bloqueos.length === 0,
    estado,
    bloqueos,
    confirmaciones,
    retroactiva,
    evaluaciones,
    derivados: {
      proveedor: proveedor
        ? { codigo_sap: proveedor.codigo_sap, nit: normalizarNit(proveedor.nit), nombre: proveedor.nombre }
        : null,
      indicador_iva: indicador,
      condiciones_pago: condiciones,
      unidad: { valor: unidad.unidad, fuente: unidad.fuente },
    },
  }
}

export function validarCaso(
  ubicacion: Ubicacion,
  paquete: Paquete,
): { ok: true; data: Validacion } | { ok: false; error: string } {
  const maestros = cargarMaestros(ubicacion)
  if (!maestros.ok) return maestros
  const validacion = evaluarReglas(paquete, maestros.data)
  if ("ok" in validacion) return validacion
  return { ok: true, data: validacion }
}
