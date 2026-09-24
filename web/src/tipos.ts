export type Evaluacion = {
  regla: string
  estado: "cumple" | "bloquea" | "confirma" | "informa" | "no_evaluable"
  detalle: string
  accion_sugerida: string
}

export type FilaBandeja = {
  caso: string
  solicitud_id: string | null
  solicitante: string | null
  proveedor: string | null
  descripcion: string | null
  valor_total: number | null
  moneda: string | null
  estado: string
  retroactiva: boolean
  bloqueos: Evaluacion[]
  confirmaciones: Evaluacion[]
  numero_oc: string | null
  error: string | null
}

export type Solicitud = {
  solicitud_id: string
  solicitante: string
  proveedor_nombre: string
  proveedor_nit?: string
  descripcion: string
  centro_costo: string
  subarea: string
  cantidad: number
  valor_unitario: number
  valor_total: number
  moneda: string
  indicador_iva?: string
  condiciones_pago?: string
  fecha_solicitud: string
}

export type Paquete = {
  correo: { id: string; de: string; asunto: string; fecha: string } | null
  solicitud: Solicitud | null
  cotizacion: {
    proveedor: string
    nit: string | null
    total: number
    moneda: string
    validez_hasta: string | null
    referencia: string | null
  } | null
  aprobacion: { de: string; para: string; fecha: string; asunto: string; aprobado: boolean; texto: string } | null
  factura: { numero: string; fecha: string; total: number } | null
  ausentes: string[]
}

export type Validacion = {
  apta: boolean
  estado: "BLOQUEADA" | "PENDIENTE_CONFIRMACION" | "LISTA_PARA_CREAR"
  bloqueos: Evaluacion[]
  confirmaciones: Evaluacion[]
  retroactiva: boolean
  evaluaciones: Evaluacion[]
  derivados: {
    proveedor: { codigo_sap: string; nit: string; nombre: string } | null
    indicador_iva: { valor: string; fuente: string } | null
    condiciones_pago: { valor: string; fuente: string } | null
    unidad: { valor: string; fuente: string } | null
  }
}

export type OrdenCompra = {
  referencia: { solicitud_id: string; correo_id: string; cotizacion_ref: string | null }
  sociedad: string
  organizacion_compras: string
  proveedor: { codigo_sap: string; nit: string; nombre: string }
  moneda: string
  condiciones_pago: string
  aprobador: { email: string; fecha_aprobacion: string; evidencia_sha256: string }
  posiciones: Array<{
    numero: number
    descripcion: string
    cantidad: number
    unidad: string
    precio_unitario: number
    centro_costo: string
    subarea: string
    indicador_iva: string
  }>
  excepciones: Array<{ codigo: string; detalle: string; confirmado_por: string | null }>
}

export type FichaRegla = {
  codigo: string
  nombre: string
  proposito: string
  criterio: string
  severidad: "bloqueo" | "confirmacion" | "derivado"
}

export type Catalogos = {
  indicadores: Array<{ codigo: string; descripcion: string; tasa: number }>
  condiciones: Array<{ codigo: string; descripcion: string; dias: number }>
  reglas: FichaRegla[]
}

export type DetalleCaso = {
  caso: string
  paquete: Paquete
  validacion: Validacion
  orden: OrdenCompra | null
  numero_oc: string | null
  evidencia: { sha256: string; texto: string } | null
  catalogos: Catalogos
}

export type VistaLlamada = {
  name: string
  titulo: string
  args: unknown
  ok: boolean
  resumen: string
  data?: unknown
  error?: string
}

export type Confirmacion = {
  actionId: string
  caso: string
  codigos: string[]
  vence_en: string
}

export type RespuestaChat = {
  sessionId: string
  reply: string
  toolCalls: VistaLlamada[]
  needsConfirmation: boolean
  confirmacion: Confirmacion | null
}

export type Mensaje = {
  id: string
  autor: "analista" | "agente" | "sistema"
  texto: string
  toolCalls?: VistaLlamada[]
}
