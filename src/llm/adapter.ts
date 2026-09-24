export type LlamadaModelo = {
  id: string
  name: string
  arguments: string
}

export type MensajeModelo = {
  role: "system" | "user" | "assistant" | "tool"
  content: string | null
  tool_calls?: LlamadaModelo[]
  tool_call_id?: string
}

export type HerramientaJson = {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type RespuestaModelo = {
  content: string | null
  toolCalls: LlamadaModelo[]
  tokens: number
}

export interface LlmAdapter {
  readonly proveedor: string
  readonly modelo: string
  enviar(mensajes: MensajeModelo[], herramientas: HerramientaJson[]): Promise<RespuestaModelo>
}
