import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { evidenciaDeCaso } from "./evidencia.ts"
import type { Ubicacion } from "./types.ts"

export async function escribirEvidenciaPdf(
  ubicacion: Ubicacion,
  caso: string,
): Promise<{ ok: true; ruta: string } | { ok: false; error: string }> {
  const evidencia = evidenciaDeCaso(ubicacion, caso)
  if (!evidencia.ok) return evidencia
  const pdf = await PDFDocument.create()
  const fuente = await pdf.embedFont(StandardFonts.Helvetica)
  const lineas = envolver(`${evidencia.canonico}\n\nsha256: ${evidencia.sha256}`, 90)
  let pagina = pdf.addPage([595, 842])
  let y = 800
  for (const linea of lineas) {
    if (y < 60) {
      pagina = pdf.addPage([595, 842])
      y = 800
    }
    pagina.drawText(linea, { x: 48, y, size: 11, font: fuente, color: rgb(0.1, 0.1, 0.1) })
    y -= 16
  }
  const dir = path.join(ubicacion.outDir, caso)
  mkdirSync(dir, { recursive: true })
  const ruta = path.join(dir, "aprobacion.pdf")
  writeFileSync(ruta, await pdf.save())
  return { ok: true, ruta }
}

function envolver(texto: string, ancho: number): string[] {
  const salida: string[] = []
  for (const parrafo of texto.split("\n")) {
    if (!parrafo) {
      salida.push("")
      continue
    }
    let resto = parrafo
    while (resto.length > ancho) {
      const corte = resto.lastIndexOf(" ", ancho)
      const punto = corte > 20 ? corte : ancho
      salida.push(resto.slice(0, punto))
      resto = resto.slice(punto).trimStart()
    }
    salida.push(resto)
  }
  return salida
}
