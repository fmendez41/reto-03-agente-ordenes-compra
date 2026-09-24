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

export type Cotizacion = {
  proveedor: string
  nit: string | null
  total: number
  moneda: string
  validez_hasta: string | null
  referencia: string | null
  texto: string
  encabezado_item: string | null
}

export type Aprobacion = {
  de: string
  para: string
  fecha: string
  asunto: string
  aprobado: boolean
  texto: string
}

export type Factura = {
  numero: string
  fecha: string
  total: number
}

export type Correo = {
  id: string
  de: string
  asunto: string
  fecha: string
}

export type Paquete = {
  correo: Correo | null
  solicitud: Solicitud | null
  cotizacion: Cotizacion | null
  aprobacion: Aprobacion | null
  factura: Factura | null
  ausentes: string[]
}

export type EstadoRegla = "cumple" | "bloquea" | "confirma" | "informa" | "no_evaluable"

export type Evaluacion = {
  regla: string
  estado: EstadoRegla
  detalle: string
  accion_sugerida: string
}

export type EstadoCaso = "BLOQUEADA" | "PENDIENTE_CONFIRMACION" | "LISTA_PARA_CREAR"

export type Derivados = {
  proveedor: { codigo_sap: string; nit: string; nombre: string } | null
  indicador_iva: { valor: string; fuente: string } | null
  condiciones_pago: { valor: string; fuente: string } | null
  unidad: { valor: "UN" | "H" | "MES"; fuente: string } | null
}

export type Validacion = {
  apta: boolean
  estado: EstadoCaso
  bloqueos: Evaluacion[]
  confirmaciones: Evaluacion[]
  derivados: Derivados
  retroactiva: boolean
  evaluaciones: Evaluacion[]
}

export type Excepcion = {
  codigo: string
  detalle: string
  confirmado_por: string | null
}

export type OrdenCompra = {
  referencia: { solicitud_id: string; correo_id: string; cotizacion_ref: string | null }
  sociedad: "1000"
  organizacion_compras: "1000"
  proveedor: { codigo_sap: string; nit: string; nombre: string }
  moneda: "COP" | "USD"
  condiciones_pago: string
  aprobador: { email: string; fecha_aprobacion: string; evidencia_sha256: string }
  posiciones: Array<{
    numero: number
    descripcion: string
    cantidad: number
    unidad: "UN" | "H" | "MES"
    precio_unitario: number
    centro_costo: string
    subarea: string
    indicador_iva: string
  }>
  excepciones: Excepcion[]
}

export type TrazaCampo = {
  campo: string
  valor: unknown
  fuente: string
  transformacion?: string
  original?: unknown
}

export type ResultadoControl =
  | "CREADA"
  | "IDEMPOTENTE"
  | "BLOQUEADA"
  | "PENDIENTE_CONFIRMACION"
  | "ERROR"

export type ProveedorMaestro = {
  codigo_sap: string
  nit: string
  nombre: string
  condiciones_pago_default: string
  indicador_iva_default: string
  activo: boolean
}

export type AprobadorMaestro = {
  email: string
  nombre?: string
  tope: number
}

export type CentroCosto = {
  centro_costo: string
  nombre?: string
  subareas: string[]
  aprobadores: AprobadorMaestro[]
}

export type Maestros = {
  proveedores: ProveedorMaestro[]
  centros: CentroCosto[]
  indicadores: Array<{ codigo: string; descripcion: string; tasa: number }>
  condiciones: Array<{ codigo: string; descripcion: string; dias: number }>
}

export const TTL_CONFIRMACION_MS = 15 * 60 * 1000

export type AccionPendiente = {
  actionId: string
  caso: string
  payload_hash: string
  codigos: string[]
  sessionId: string
  turno: number
  creada_en: string
  estado: "pendiente" | "consumida" | "caducada"
}

export type Ubicacion = {
  directory: string
  fixturesDir: string
  outDir: string
}
