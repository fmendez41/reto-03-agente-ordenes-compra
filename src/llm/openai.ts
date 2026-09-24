import type { HerramientaJson, LlmAdapter, MensajeModelo, RespuestaModelo } from "./adapter.ts"

type FetchImpl = (input: string, init: RequestInit) => Promise<Response>

type Opciones = {
  apiKey: string
  model: string
  timeoutMs: number
  fetchImpl?: FetchImpl
}

export function crearAdaptadorOpenAI(opciones: Opciones): LlmAdapter {
  const fetchImpl = opciones.fetchImpl ?? fetch
  return {
    proveedor: "openai",
    modelo: opciones.model,
    async enviar(mensajes, herramientas) {
      const controlador = new AbortController()
      const temporizador = setTimeout(() => controlador.abort(), opciones.timeoutMs)
      try {
        const respuesta = await Promise.race([
          fetchImpl("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          signal: controlador.signal,
          headers: {
            authorization: `Bearer ${opciones.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: opciones.model,
            messages: mensajes.map(serializar),
            tools: herramientas.map((herramienta) => ({
              type: "function",
              function: {
                name: herramienta.name,
                description: herramienta.description,
                parameters: herramienta.parameters,
              },
            })),
          }),
          }),
          new Promise<Response>((_resolve, reject) => {
            controlador.signal.addEventListener("abort", () => {
              const abortado = new Error("abort")
              abortado.name = "AbortError"
              reject(abortado)
            })
          }),
        ])
        if (!respuesta.ok) {
          throw new Error(`El proveedor respondió ${respuesta.status}. Intenta de nuevo en unos segundos.`)
        }
        const cuerpo = (await respuesta.json()) as {
          choices?: Array<{
            message?: {
              content?: string | null
              tool_calls?: Array<{ id: string; function?: { name?: string; arguments?: string } }>
            }
          }>
          usage?: { total_tokens?: number }
        }
        const mensaje = cuerpo.choices?.[0]?.message
        const toolCalls = (mensaje?.tool_calls ?? []).map((llamada) => ({
          id: llamada.id,
          name: llamada.function?.name ?? "",
          arguments: llamada.function?.arguments ?? "{}",
        }))
        return {
          content: mensaje?.content ?? null,
          toolCalls,
          tokens: cuerpo.usage?.total_tokens ?? 0,
        } satisfies RespuestaModelo
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("El proveedor tardó demasiado. La sesión sigue abierta; reintenta el mensaje.")
        }
        if (error instanceof Error && error.message.startsWith("El proveedor")) throw error
        throw new Error("No pude hablar con el proveedor del modelo. La sesión sigue abierta.")
      } finally {
        clearTimeout(temporizador)
      }
    },
  }
}

function serializar(mensaje: MensajeModelo): Record<string, unknown> {
  if (mensaje.role === "tool") {
    return { role: "tool", tool_call_id: mensaje.tool_call_id, content: mensaje.content ?? "" }
  }
  if (mensaje.role === "assistant" && mensaje.tool_calls?.length) {
    return {
      role: "assistant",
      content: mensaje.content,
      tool_calls: mensaje.tool_calls.map((llamada) => ({
        id: llamada.id,
        type: "function",
        function: { name: llamada.name, arguments: llamada.arguments },
      })),
    }
  }
  return { role: mensaje.role, content: mensaje.content ?? "" }
}
