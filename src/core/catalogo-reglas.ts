/**
 * Catálogo único de los diez controles del proceso. Es la fuente de la que salen
 * los nombres que ve la analista, los que cita el agente y los que documenta el
 * README, para que "RC5" signifique lo mismo en los tres sitios.
 *
 * Los criterios están tomados de la tabla de controles de la sección 3.2 del PRD.
 * La severidad es la que el PRD asigna a cada regla, no la que resulte de un caso
 * concreto: RC5 es de confirmación aunque en un caso puntual acabe bloqueando.
 */

export type Severidad = "bloqueo" | "confirmacion" | "derivado"

export type FichaRegla = {
  codigo: string
  nombre: string
  proposito: string
  criterio: string
  severidad: Severidad
}

export const SEVERIDADES: Record<Severidad, string> = {
  bloqueo: "Bloquea la creación",
  confirmacion: "Pide confirmación",
  derivado: "Solo informa",
}

export const CATALOGO_REGLAS: FichaRegla[] = [
  {
    codigo: "RC1",
    nombre: "Proveedor existe y está activo",
    proposito:
      "Evita emitir una orden a un tercero que SAP no reconoce o que fue dado de baja, que es la vía más directa a un pago que después nadie puede justificar.",
    criterio:
      "El proveedor debe estar en el maestro y estar activo. Se busca por NIT; si la solicitud no trae NIT, por nombre normalizado. Un nombre que coincide con varios proveedores no se desempata por aproximación.",
    severidad: "bloqueo",
  },
  {
    codigo: "RC2",
    nombre: "Aprobación válida del centro de costo",
    proposito:
      "Garantiza que la compra la autorizó quien tiene la potestad de hacerlo, y que esa autorización quedó por escrito.",
    criterio:
      "Debe existir el correo de aprobación, contener la palabra Aprobado y venir de una dirección listada como aprobadora del centro de costo de la solicitud.",
    severidad: "bloqueo",
  },
  {
    codigo: "RC3",
    nombre: "Monto dentro del tope del aprobador",
    proposito:
      "Impide que una compra grande se cuele con la firma de alguien que solo tiene atribución para compras pequeñas.",
    criterio: "El valor total de la solicitud no puede superar el tope que tiene ese aprobador en ese centro de costo.",
    severidad: "bloqueo",
  },
  {
    codigo: "RC4",
    nombre: "Subárea pertenece al centro de costo",
    proposito: "Mantiene el gasto imputado donde corresponde, para que el presupuesto del área refleje la realidad.",
    criterio: "La subárea de la solicitud debe ser una de las registradas para ese centro de costo en el maestro.",
    severidad: "bloqueo",
  },
  {
    codigo: "RC5",
    nombre: "Cotización cuadra con la solicitud",
    proposito:
      "Detecta que se esté comprando por un valor distinto al que se cotizó, que suele ser un cambio de alcance o un error de digitación.",
    criterio:
      "La diferencia entre el total de la cotización y el de la solicitud no puede pasar del 2 %. Si lo pasa, o si no hay cotización, hace falta que la analista confirme.",
    severidad: "confirmacion",
  },
  {
    codigo: "RC6",
    nombre: "Indicador de IVA",
    proposito:
      "Un IVA mal puesto se arrastra hasta la contabilidad, así que cuando el dato no viene se deriva pero no se da por bueno en silencio.",
    criterio:
      "Si la solicitud no trae indicador de IVA, se toma el que el maestro tiene por defecto para ese proveedor y se pide confirmación del valor derivado.",
    severidad: "confirmacion",
  },
  {
    codigo: "RC7",
    nombre: "Condiciones de pago",
    proposito:
      "El plazo de pago está pactado con el proveedor, así que derivarlo del maestro es seguro y no justifica interrumpir a la analista.",
    criterio:
      "Si la solicitud no trae condiciones de pago, se usan las del maestro del proveedor. Se informa el valor derivado y su origen, sin pedir confirmación.",
    severidad: "derivado",
  },
  {
    codigo: "RC8",
    nombre: "Compra retroactiva",
    proposito:
      "Una factura anterior a la solicitud significa que se compró primero y se pidió permiso después. Se puede regularizar, pero tiene que quedar marcado.",
    criterio:
      "Si existe factura con fecha anterior a la de la solicitud, la orden se marca como retroactiva, hace falta confirmación y el hecho se registra en el log de control.",
    severidad: "confirmacion",
  },
  {
    codigo: "RC9",
    nombre: "Aprobación posterior a la solicitud",
    proposito:
      "Una aprobación firmada antes de que existiera la solicitud no puede referirse a ella; casi siempre es un correo reutilizado.",
    criterio: "La fecha de la aprobación debe ser igual o posterior a la de la solicitud. Si es anterior, hace falta confirmación.",
    severidad: "confirmacion",
  },
  {
    codigo: "RC10",
    nombre: "Aritmética de la solicitud",
    proposito:
      "Si cantidad, valor unitario y total no cuadran entre sí, no hay forma de saber cuál de los tres es el dato bueno.",
    criterio:
      "Cantidad por valor unitario debe igualar el valor total, con una tolerancia de una unidad monetaria por redondeo.",
    severidad: "bloqueo",
  },
]

const PORCODIGO = new Map(CATALOGO_REGLAS.map((ficha) => [ficha.codigo, ficha]))

export function fichaRegla(codigo: string): FichaRegla | null {
  return PORCODIGO.get(codigo) ?? null
}

/** "RC5 · Cotización cuadra con la solicitud", o el código a secas si no está en el catálogo. */
export function nombreRegla(codigo: string): string {
  const ficha = PORCODIGO.get(codigo)
  return ficha ? `${codigo} · ${ficha.nombre}` : codigo
}
