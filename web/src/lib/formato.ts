const MONEDAS: Record<string, string> = { COP: "COP", USD: "USD" }

export function dinero(valor: number | null | undefined, moneda = "COP"): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "—"
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: MONEDAS[moneda] ?? "COP",
    maximumFractionDigits: 0,
  }).format(valor)
}

export function numero(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "—"
  return new Intl.NumberFormat("es-CO").format(valor)
}

export function fecha(valor: string | null | undefined): string {
  if (!valor) return "—"
  const calendario = valor.slice(0, 10)
  const partes = calendario.split("-").map(Number)
  const [anio, mes, dia] = partes
  if (!anio || !mes || !dia) return valor
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(Date.UTC(anio, mes - 1, dia)),
  )
}

export function porcentaje(valor: number): string {
  return `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(valor * 100)} %`
}

export function conDescripcion(
  codigo: string | null | undefined,
  catalogo: Array<{ codigo: string; descripcion: string }>,
): string {
  if (!codigo) return "—"
  const encontrado = catalogo.find((item) => item.codigo === codigo)
  return encontrado ? `${codigo} · ${encontrado.descripcion}` : codigo
}

export const UNIDADES: Record<string, string> = {
  UN: "unidades",
  H: "horas",
  MES: "meses",
}

export function unidad(codigo: string | null | undefined): string {
  if (!codigo) return "—"
  return UNIDADES[codigo] ?? codigo
}

export const ETIQUETAS_ESTADO: Record<string, string> = {
  LISTA_PARA_CREAR: "Lista para crear",
  PENDIENTE_CONFIRMACION: "Requiere confirmación",
  BLOQUEADA: "Bloqueada",
  CREADA: "Orden creada",
  ERROR: "No se pudo leer",
}

export function etiquetaEstado(estado: string): string {
  return ETIQUETAS_ESTADO[estado] ?? estado
}

export const ETIQUETAS_REGLA: Record<string, string> = {
  cumple: "Cumple",
  bloquea: "Bloquea",
  confirma: "Requiere confirmación",
  informa: "Informativo",
  no_evaluable: "No evaluable",
}

export function etiquetaRegla(estado: string): string {
  return ETIQUETAS_REGLA[estado] ?? estado
}

export function fuenteLegible(fuente: string | null | undefined): string {
  if (!fuente) return "—"
  if (fuente === "solicitud") return "de la solicitud"
  if (fuente === "cotizacion") return "de la cotización"
  if (fuente === "derivado") return "derivado por el agente"
  if (fuente.startsWith("maestro.")) return `del maestro de ${fuente.slice("maestro.".length)}`
  return fuente
}
