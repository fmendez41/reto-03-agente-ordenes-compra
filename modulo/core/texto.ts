const PESOS_NIT = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]

export function digitoVerificacionNit(base: string): string | null {
  if (!/^\d{5,15}$/.test(base)) return null
  const digitos = [...base].reverse()
  let suma = 0
  for (let i = 0; i < digitos.length; i++) {
    const peso = PESOS_NIT[i]
    const digito = digitos[i]
    if (peso === undefined || digito === undefined) return null
    suma += Number(digito) * peso
  }
  const residuo = suma % 11
  return String(residuo > 1 ? 11 - residuo : residuo)
}

export function normalizarNit(valor: string): string {
  const compacto = valor.replace(/[.\s]/g, "")
  const sinGuion = /-\d$/.test(compacto) ? compacto.slice(0, -2) : compacto
  return sinGuion.replace(/\D/g, "")
}

export function nitsCoinciden(a: string, b: string): boolean {
  const na = normalizarNit(a)
  const nb = normalizarNit(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const [corto, largo] = na.length < nb.length ? [na, nb] : [nb, na]
  return largo.length === corto.length + 1 && largo.startsWith(corto) && digitoVerificacionNit(corto) === largo.at(-1)
}

const SUFIJOS = [/\s+s a s$/, /\s+s a$/, /\s+sas$/, /\s+sa$/, /\s+ltda$/, /\s+cia$/, /\s+e u$/]

export function normalizarNombre(valor: string): string {
  let base = valor
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
  let cambio = true
  while (cambio) {
    cambio = false
    for (const sufijo of SUFIJOS) {
      if (sufijo.test(base)) {
        base = base.replace(sufijo, "").trim()
        cambio = true
      }
    }
  }
  return base
}

export function parseMonto(texto: string): number | null {
  const coincidencia = texto.match(/(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?/)
  if (!coincidencia?.[1]) return null
  const entero = coincidencia[1].replace(/\./g, "")
  const decimal = coincidencia[2] ? `.${coincidencia[2]}` : ""
  const numero = Number(entero + decimal)
  return Number.isFinite(numero) ? numero : null
}

export function fechaCalendario(valor: string): string | null {
  const coincidencia = valor.match(/^(\d{4}-\d{2}-\d{2})/)
  return coincidencia?.[1] ?? null
}

export function sumarDias(fecha: string, dias: number): string | null {
  const calendario = fechaCalendario(fecha)
  if (!calendario) return null
  const [anio, mes, dia] = calendario.split("-").map(Number)
  if (!anio || !mes || !dia) return null
  const instante = new Date(Date.UTC(anio, mes - 1, dia))
  instante.setUTCDate(instante.getUTCDate() + dias)
  return instante.toISOString().slice(0, 10)
}

export function formatoMonto(valor: number, moneda = "COP"): string {
  const entero = Math.round(valor).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  return moneda === "COP" ? `$ ${entero}` : `${entero} ${moneda}`
}

export function contieneAprobado(texto: string): boolean {
  return texto.toLocaleLowerCase("es").includes("aprobado")
}
