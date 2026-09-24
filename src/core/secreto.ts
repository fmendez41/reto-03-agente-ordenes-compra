import { createHash, timingSafeEqual } from "node:crypto"

/** Compara dos secretos sin depender del prefijo ni de la longitud visible. */
export function tokensIguales(recibido: string, esperado: string): boolean {
  const a = createHash("sha256").update(recibido).digest()
  const b = createHash("sha256").update(esperado).digest()
  return timingSafeEqual(a, b)
}

const CONTROLES = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

export function redactar(texto: string): string {
  let salida = texto
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redactado]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redactado]")
  for (const valor of [process.env.LLM_API_KEY, process.env.APP_ACCESS_TOKEN]) {
    if (valor && valor.length >= 8) salida = salida.split(valor).join("[redactado]")
  }
  return salida.replace(CONTROLES, "")
}
