export type FiltroBandeja = "TODOS" | "LISTA_PARA_CREAR" | "PENDIENTE_CONFIRMACION" | "BLOQUEADA" | "CREADA" | "ERROR"

export type AccionSoporte =
  | { tipo: "filtrar"; filtro: FiltroBandeja; etiqueta: string }
  | { tipo: "abrir"; caso: string }
  | { tipo: "guia" }
  | { tipo: "enviar"; caso: string; texto: string }

export type RespuestaSoporte = {
  texto: string
  acciones: AccionSoporte[]
}

const ETIQUETA: Record<FiltroBandeja, string> = {
  TODOS: "Todas",
  LISTA_PARA_CREAR: "Listas para crear",
  PENDIENTE_CONFIRMACION: "Requieren confirmación",
  BLOQUEADA: "Bloqueadas",
  CREADA: "Con orden creada",
  ERROR: "Con error",
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
}

function casoNombrado(texto: string, casos: string[]): string | null {
  const hallado = texto.match(/sol-\d{3}/i)?.[0]?.toLowerCase()
  if (!hallado) return null
  return casos.find((caso) => caso.toLowerCase() === hallado) ?? null
}

function casoDesconocido(texto: string): string | null {
  return texto.match(/sol-\d{3}/i)?.[0]?.toLowerCase() ?? null
}

function filtrar(filtro: FiltroBandeja): AccionSoporte {
  return { tipo: "filtrar", filtro, etiqueta: ETIQUETA[filtro] }
}

export function responderSoporte(
  pregunta: string,
  contexto: { casoAbierto: string | null; casos: string[] },
): RespuestaSoporte {
  const texto = normalizar(pregunta)
  const nombrado = casoNombrado(pregunta, contexto.casos)
  const desconocido = nombrado ? null : casoDesconocido(pregunta)
  const abierto = contexto.casoAbierto

  if (desconocido) {
    const lista = contexto.casos.length > 0 ? contexto.casos.join(", ") : "ninguno"
    return {
      texto: `No existe ${desconocido}. Los casos de esta mesa son: ${lista}.`,
      acciones: contexto.casos.slice(0, 6).map((item) => ({ tipo: "abrir", caso: item })),
    }
  }

  if (/como (se usa|usar|funciona)|que es mesa|guia|tutorial|ayuda/.test(texto)) {
    return {
      texto: "Mesa es la cola de solicitudes. Cada tarjeta trae el estado que ya calcularon los controles. Abres una, hablas del caso que tienes delante y la orden solo nace cuando pulsas «Confirmo y creo la orden». La guía recorre eso en cuatro pasos.",
      acciones: [{ tipo: "guia" }],
    }
  }

  if (/bloquead/.test(texto)) {
    return {
      texto: "Una solicitud bloqueada tiene un dato que impide emitir la orden: el proveedor no está en el maestro, o la aprobación no vale para ese centro. No se puede confirmar para saltárselo. El motivo está al pie de la tarjeta y, dentro del caso, en el control que falló.",
      acciones: [filtrar("BLOQUEADA")],
    }
  }

  if (/confirm/.test(texto)) {
    return {
      texto: "Cuando un control encuentra una diferencia, Mesa enfrenta los dos valores y espera tu botón. Pulsar «Confirmo y creo la orden» es lo que autoriza la compra. Si escribes otro mensaje antes, esa confirmación caduca y no se crea nada.",
      acciones: [filtrar("PENDIENTE_CONFIRMACION")],
    }
  }

  if (/lista|listas para crear|en orden|pasan/.test(texto) && /crear|pasan|listas/.test(texto)) {
    return {
      texto: "Lista para crear significa que los diez controles pasaron. Puedes pedirle al agente que arme la orden. Si ningún control pide confirmación, la crea en el SAP simulado.",
      acciones: [filtrar("LISTA_PARA_CREAR")],
    }
  }

  if (/no se pud(?:o|ieron) leer|con error|errores de lectura/.test(texto)) {
    return {
      texto: "Un caso con error no se pudo leer: falta un archivo o el paquete no es válido. El motivo está al pie de la tarjeta. No se puede crear la orden hasta corregir eso.",
      acciones: [filtrar("ERROR")],
    }
  }

  if (/orden(es)? creada|ya creada|con orden/.test(texto)) {
    return {
      texto: "Las que ya tienen número de orden aparecen con el filtro «Con orden creada». Abrir una te muestra la ficha y el hash de la evidencia.",
      acciones: [filtrar("CREADA")],
    }
  }

  if (/proces|crea(r| la orden)|ejecut/.test(texto)) {
    const caso = nombrado ?? abierto
    if (!caso) {
      return {
        texto: "Dime qué solicitud quieres procesar, por ejemplo «procesa sol-001». El agente trabaja sobre el caso que está abierto, y el botón de abajo es el que le escribe.",
        acciones: contexto.casos.slice(0, 6).map((item) => ({ tipo: "abrir", caso: item })),
      }
    }
    return {
      texto: `Puedo pedirle al agente que procese ${caso}. Leerá el paquete, validará los controles y, si hace falta tu decisión, dejará el bloque de confirmación. No crea la orden por su cuenta cuando un control la pide.`,
      acciones: [{ tipo: "enviar", caso, texto: `Procesa ${caso} y créala solo si todo está en orden` }],
    }
  }

  if (/herramienta|tarjeta del agente|que (hizo|lee)/.test(texto)) {
    return {
      texto: "Cada vez que el agente lee el paquete o valida, el chat muestra una tarjeta con el nombre de la herramienta y los argumentos. Ábrela para ver el dato que usó, no un resumen inventado.",
      acciones: abierto ? [{ tipo: "abrir", caso: abierto }] : [],
    }
  }

  if (nombrado) {
    return {
      texto: `Puedo abrir ${nombrado} para que veas sus controles, el borrador de la orden y la conversación.`,
      acciones: [{ tipo: "abrir", caso: nombrado }],
    }
  }

  return {
    texto: "Puedo explicarte la cola, los bloqueos y la confirmación, filtrar la bandeja o pedirle al agente que procese un caso. Prueba con «muéstrame las bloqueadas» o «procesa sol-001».",
    acciones: [filtrar("BLOQUEADA"), filtrar("PENDIENTE_CONFIRMACION"), { tipo: "guia" }],
  }
}
