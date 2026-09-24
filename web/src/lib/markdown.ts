/**
 * Analizador mínimo de markdown para las respuestas del agente: negritas, código
 * en línea, listas y tablas. Devuelve una estructura de bloques, no HTML, así que
 * quien la dibuje solo puede crear nodos de texto. Nada de lo que escriba el modelo
 * puede convertirse en etiquetas, que es justo lo que hay que evitar cuando el texto
 * viene de un LLM que a su vez leyó documentos de terceros.
 */

export type Estilo = "normal" | "fuerte" | "codigo"

export type Trozo = { texto: string; estilo: Estilo }

export type Bloque =
  | { tipo: "parrafo"; contenido: Trozo[] }
  | { tipo: "lista"; ordenada: boolean; items: Trozo[][] }
  | { tipo: "tabla"; encabezados: Trozo[][]; filas: Trozo[][][] }

const SEPARADOR_TABLA = /^\|?(\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?$/
const ENCABEZADO = /^#{1,6}\s+(.*)$/
const VINIETA = /^[-*+]\s+(.*)$/
const NUMERADA = /^\d+[.)]\s+(.*)$/

export function trozos(texto: string): Trozo[] {
  const salida: Trozo[] = []
  let ultimo = 0
  for (const coincidencia of texto.matchAll(/\*\*([^*]+)\*\*|`([^`]+)`/g)) {
    const indice = coincidencia.index ?? 0
    if (indice > ultimo) salida.push({ texto: texto.slice(ultimo, indice), estilo: "normal" })
    if (coincidencia[1] !== undefined) salida.push({ texto: coincidencia[1], estilo: "fuerte" })
    else if (coincidencia[2] !== undefined) salida.push({ texto: coincidencia[2], estilo: "codigo" })
    ultimo = indice + coincidencia[0].length
  }
  if (ultimo < texto.length) salida.push({ texto: texto.slice(ultimo), estilo: "normal" })
  return salida.length > 0 ? salida : [{ texto, estilo: "normal" }]
}

export function analizar(texto: string): Bloque[] {
  const lineas = texto.split("\n")
  const bloques: Bloque[] = []
  let indice = 0

  while (indice < lineas.length) {
    const linea = (lineas[indice] ?? "").trim()
    if (!linea) {
      indice += 1
      continue
    }

    if (esFilaTabla(linea) && SEPARADOR_TABLA.test((lineas[indice + 1] ?? "").trim())) {
      const encabezados = celdas(linea)
      const filas: Trozo[][][] = []
      indice += 2
      while (indice < lineas.length && esFilaTabla((lineas[indice] ?? "").trim())) {
        filas.push(celdas((lineas[indice] ?? "").trim()))
        indice += 1
      }
      bloques.push({ tipo: "tabla", encabezados, filas })
      continue
    }

    const marca = marcaLista(linea)
    if (marca) {
      const items: Trozo[][] = []
      const { ordenada } = marca
      while (indice < lineas.length) {
        const actual = marcaLista((lineas[indice] ?? "").trim())
        if (!actual || actual.ordenada !== ordenada) break
        items.push(trozos(actual.contenido))
        indice += 1
      }
      bloques.push({ tipo: "lista", ordenada, items })
      continue
    }

    const encabezado = ENCABEZADO.exec(linea)
    if (encabezado) {
      bloques.push({ tipo: "parrafo", contenido: [{ texto: encabezado[1] ?? "", estilo: "fuerte" }] })
      indice += 1
      continue
    }

    bloques.push({ tipo: "parrafo", contenido: trozos(linea) })
    indice += 1
  }

  return bloques
}

function esFilaTabla(linea: string): boolean {
  return linea.startsWith("|") && linea.endsWith("|") && linea.length > 2
}

function celdas(linea: string): Trozo[][] {
  return linea
    .slice(1, -1)
    .split("|")
    .map((celda) => trozos(celda.trim()))
}

function marcaLista(linea: string): { ordenada: boolean; contenido: string } | null {
  const vinieta = VINIETA.exec(linea)
  if (vinieta) return { ordenada: false, contenido: vinieta[1] ?? "" }
  const numerada = NUMERADA.exec(linea)
  if (numerada) return { ordenada: true, contenido: numerada[1] ?? "" }
  return null
}
