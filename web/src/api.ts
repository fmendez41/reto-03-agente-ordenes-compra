import type { DetalleCaso, FilaBandeja, RespuestaChat } from "./tipos.ts"

const token = leerToken()

function leerToken(): string | null {
  const params = new URLSearchParams(location.search)
  const enUrl = params.get("token")
  if (enUrl) {
    sessionStorage.setItem("app-access-token", enUrl)
    params.delete("token")
    const resto = params.toString()
    history.replaceState(null, "", `${location.pathname}${resto ? `?${resto}` : ""}${location.hash}`)
    return enUrl
  }
  return sessionStorage.getItem("app-access-token")
}

function cabeceras(): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" }
  if (token) headers.authorization = `Bearer ${token}`
  return headers
}

async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
  let respuesta: Response
  try {
    respuesta = await fetch(ruta, { ...init, cache: "no-store", headers: cabeceras() })
  } catch {
    throw new Error("No hubo respuesta del servidor. Revisa que siga levantado.")
  }
  let cuerpo: unknown
  try {
    cuerpo = await respuesta.json()
  } catch {
    throw new Error("El servidor respondió algo que no pude leer.")
  }
  const datos = cuerpo as { ok?: boolean; error?: string }
  if (!respuesta.ok || datos.ok === false) {
    throw new Error(datos.error ?? "El servidor no pudo completar la operación.")
  }
  return cuerpo as T
}

export async function traerCasos(): Promise<FilaBandeja[]> {
  const datos = await pedir<{ casos: FilaBandeja[] }>("/api/casos")
  return datos.casos
}

export async function traerDetalle(caso: string): Promise<DetalleCaso> {
  return pedir<DetalleCaso & { ok: true }>(`/api/casos/${encodeURIComponent(caso)}`)
}

export async function enviarMensaje(entrada: {
  sessionId: string
  // El caso abierto viaja aparte del texto para que el agente sepa a qué se refiere
  // la analista cuando escribe "este caso" sin nombrarlo.
  caso: string
  message: string
  actionId?: string | null
}): Promise<RespuestaChat> {
  return pedir<RespuestaChat>("/api/chat", {
    method: "POST",
    body: JSON.stringify(entrada),
  })
}

export async function estadoServidor(): Promise<{ provider: string; model: string }> {
  return pedir<{ provider: string; model: string }>("/api/health")
}
