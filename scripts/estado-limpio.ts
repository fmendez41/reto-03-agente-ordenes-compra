import { rmSync } from "node:fs"
import path from "node:path"

const raiz = path.resolve(import.meta.dir, "..")
const puerto = Number(process.env.PORT ?? 3000)

try {
  const respuesta = await fetch(`http://127.0.0.1:${puerto}/api/health`)
  if (respuesta.ok) {
    console.error(`Hay un servidor en el puerto ${puerto}. Deténlo antes de limpiar out/.`)
    process.exit(1)
  }
} catch {
  // No hay servidor. Se puede limpiar la carpeta del servidor.
}

rmSync(path.join(raiz, "out"), { recursive: true, force: true })
console.log("out/ quedó vacío. El demo escribe en out-demo/ y las pruebas usan un directorio temporal.")
console.log("Siguiente paso: bun run dev")
