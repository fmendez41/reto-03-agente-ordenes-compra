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
    return { ok: false, error: "Falta la solicitud. Pide el Excel al solicitante." }
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
          ? `El NIT ${nit} no está en el maestro de proveedores.`
          : `Ningún proveedor activo coincide con "${solicitud.proveedor_nombre}".`,
        "Pide al solicitante el NIT y el alta del proveedor en SAP antes de crear la OC.",
      ),
    )
  } else if (candidatos.length > 1) {
    proveedor = null
    evaluaciones.push(
      regla(
        "RC1",
        "bloquea",
        `El nombre coincide con varios proveedores: ${candidatos.map((item) => item.codigo_sap).join(", ")}.`,
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
        `El proveedor ${inactivo.nombre} (${inactivo.codigo_sap}) está inactivo.`,
        "Escala a maestro de proveedores antes de comprar.",
      ),
    )
  } else if (proveedor) {
    evaluaciones.push(regla("RC1", "cumple", `Proveedor ${proveedor.codigo_sap} activo.`, "Ninguna."))
  }

  const centro = maestros.centros.find((item) => item.centro_costo === solicitud.centro_costo) ?? null
  const aprobador =
    paquete.aprobacion && centro
      ? centro.aprobadores.find((item) => item.email.toLowerCase() === paquete.aprobacion?.de.toLowerCase()) ?? null
      : null

  if (!paquete.aprobacion) {
    evaluaciones.push(
      regla("RC2", "bloquea", "No hay correo de aprobación.", "Pide al líder el correo con la palabra Aprobado."),
    )
  } else if (!paquete.aprobacion.aprobado) {
    evaluaciones.push(
      regla(
        "RC2",
        "bloquea",
        "El correo de aprobación no contiene la palabra Aprobado.",
        "Pide una respuesta explícita del líder.",
      ),
    )
  } else if (!centro) {
    evaluaciones.push(
      regla(
        "RC2",
        "bloquea",
        `El centro ${solicitud.centro_costo} no está en el maestro.`,
        "Corrige el centro de costo con el solicitante.",
      ),
    )
  } else if (!aprobador) {
    const lista = centro.aprobadores.map((item) => item.email).join(", ")
    evaluaciones.push(
      regla(
        "RC2",
        "bloquea",
        `${paquete.aprobacion.de} no es aprobador de ${centro.centro_costo}.`,
        `La aprobación debe venir de: ${lista}.`,
      ),
    )
  } else {
    evaluaciones.push(regla("RC2", "cumple", `Aprobó ${aprobador.email}.`, "Ninguna."))
  }

  if (!aprobador) {
    const topes = centro
      ? centro.aprobadores.map((item) => `${item.email} (tope ${item.tope})`).join("; ")
      : "no hay centro de costo válido"
    evaluaciones.push(
      regla(
        "RC3",
        "no_evaluable",
        "RC3 no es evaluable porque RC2 no encontró un aprobador válido para el centro.",
        centro
          ? `Consigue un aprobador autorizado de ${centro.centro_costo}. Hoy: ${topes}. El valor es ${formatoMonto(solicitud.valor_total, solicitud.moneda)}.`
          : "Primero corrige el centro de costo y el aprobador.",
      ),
    )
  } else if (solicitud.valor_total > aprobador.tope) {
    evaluaciones.push(
      regla(
        "RC3",
        "bloquea",
        `El valor ${formatoMonto(solicitud.valor_total, solicitud.moneda)} supera el tope ${formatoMonto(aprobador.tope, solicitud.moneda)} de ${aprobador.email}.`,
        "Pide aprobación de alguien con tope suficiente para este centro.",
      ),
    )
  } else {
    evaluaciones.push(
      regla("RC3", "cumple", `El valor está dentro del tope ${formatoMonto(aprobador.tope, solicitud.moneda)}.`, "Ninguna."),
    )
  }

  if (!centro) {
    evaluaciones.push(
      regla("RC4", "bloquea", `El centro ${solicitud.centro_costo} no existe.`, "Corrige el centro de costo."),
    )
  } else if (!centro.subareas.includes(solicitud.subarea)) {
    evaluaciones.push(
      regla(
        "RC4",
        "bloquea",
        `La subárea ${solicitud.subarea} no pertenece a ${centro.centro_costo}.`,
        `Usa una de: ${centro.subareas.join(", ")}.`,
      ),
    )
  } else {
    evaluaciones.push(regla("RC4", "cumple", `Subárea ${solicitud.subarea} válida.`, "Ninguna."))
  }

  if (!paquete.cotizacion) {
    evaluaciones.push(
      regla(
        "RC5",
        "confirma",
        "No hay cotización. El proceso pide crearla antes de la factura.",
        "Confirma con la analista si se crea la OC sin cotización.",
      ),
    )
  } else if (solicitud.valor_total === 0) {
    evaluaciones.push(regla("RC5", "bloquea", "El valor total de la solicitud es cero.", "Corrige el monto."))
  } else {
    const diferencia = Math.abs(paquete.cotizacion.total - solicitud.valor_total) / solicitud.valor_total
    if (diferencia > 0.02) {
      evaluaciones.push(
        regla(
          "RC5",
          "confirma",
          `La solicitud vale ${formatoMonto(solicitud.valor_total, solicitud.moneda)} y la cotización ${formatoMonto(paquete.cotizacion.total, paquete.cotizacion.moneda)} (${(diferencia * 100).toFixed(1)} %, por encima del 2 %).`,
          "Muestra ambos valores y espera confirmación antes de crear.",
        ),
      )
    } else {
      evaluaciones.push(regla("RC5", "cumple", "La cotización cuadra con la solicitud dentro del 2 %.", "Ninguna."))
    }
  }

  let indicador: Validacion["derivados"]["indicador_iva"] = null
  if (solicitud.indicador_iva) {
    indicador = { valor: solicitud.indicador_iva, fuente: "solicitud" }
    evaluaciones.push(regla("RC6", "cumple", `IVA informado: ${solicitud.indicador_iva}.`, "Ninguna."))
  } else if (proveedor) {
    indicador = { valor: proveedor.indicador_iva_default, fuente: "maestro.proveedores" }
    evaluaciones.push(
      regla(
        "RC6",
        "confirma",
        `La solicitud no trae IVA. Se derivó ${proveedor.indicador_iva_default} del proveedor ${proveedor.codigo_sap}.`,
        "Confirma ese indicador antes de crear la OC.",
      ),
    )
  } else {
    evaluaciones.push(
      regla(
        "RC6",
        "confirma",
        "No hay indicador de IVA y no hay proveedor válido del cual derivarlo.",
        "Pide el indicador de IVA al solicitante.",
      ),
    )
  }

  let condiciones: Validacion["derivados"]["condiciones_pago"] = null
  if (solicitud.condiciones_pago) {
    condiciones = { valor: solicitud.condiciones_pago, fuente: "solicitud" }
    evaluaciones.push(regla("RC7", "cumple", `Condiciones ${solicitud.condiciones_pago}.`, "Ninguna."))
  } else if (proveedor) {
    condiciones = { valor: proveedor.condiciones_pago_default, fuente: "maestro.proveedores" }
    evaluaciones.push(
      regla(
        "RC7",
        "informa",
        `Se usarán las condiciones ${proveedor.condiciones_pago_default} del proveedor.`,
        "Infórmalo. No hace falta confirmación.",
      ),
    )
  } else {
    evaluaciones.push(
      regla(
        "RC7",
        "informa",
        "No hay condiciones de pago ni proveedor del cual derivarlas.",
        "No se puede armar la OC hasta resolver el proveedor.",
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
        `La factura ${paquete.factura.numero} es del ${fechaFactura}, anterior a la solicitud ${fechaSolicitud}.`,
        "Confirma si se crea la OC marcada como retroactiva.",
      ),
    )
  } else {
    evaluaciones.push(regla("RC8", "cumple", "No hay factura anterior a la solicitud.", "Ninguna."))
  }

  const fechaAprobacion = paquete.aprobacion ? fechaCalendario(paquete.aprobacion.fecha) : null
  if (!fechaAprobacion || !fechaSolicitud) {
    evaluaciones.push(
      regla("RC9", "no_evaluable", "Falta la fecha de aprobación o de la solicitud.", "Completa las fechas."),
    )
  } else if (fechaAprobacion < fechaSolicitud) {
    evaluaciones.push(
      regla(
        "RC9",
        "confirma",
        `La aprobación es del ${fechaAprobacion} y la solicitud del ${fechaSolicitud}.`,
        "Confirma si esa aprobación anterior a la solicitud es válida.",
      ),
    )
  } else {
    evaluaciones.push(regla("RC9", "cumple", "La aprobación es posterior o igual a la solicitud.", "Ninguna."))
  }

  const producto = solicitud.cantidad * solicitud.valor_unitario
  if (Math.abs(producto - solicitud.valor_total) > 1) {
    evaluaciones.push(
      regla(
        "RC10",
        "bloquea",
        `Cantidad por valor unitario da ${formatoMonto(producto, solicitud.moneda)} y el total informado es ${formatoMonto(solicitud.valor_total, solicitud.moneda)}.`,
        "Pide al solicitante que cuadre cantidad, valor unitario y total.",
      ),
    )
  } else {
    evaluaciones.push(regla("RC10", "cumple", "Cantidad por valor unitario cuadra con el total.", "Ninguna."))
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
