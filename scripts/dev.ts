import path from "node:path"

const raiz = path.resolve(import.meta.dir, "..")

const build = Bun.spawn(["bun", "x", "vite", "build", "--watch"], {
  cwd: raiz,
  stdout: "inherit",
  stderr: "inherit",
})

// El servidor sirve web/dist, así que espera a que exista el primer build.
const indice = path.join(raiz, "web", "dist", "index.html")
for (let intento = 0; intento < 120; intento++) {
  if (await Bun.file(indice).exists()) break
  await Bun.sleep(500)
}

const server = Bun.spawn(["bun", "--watch", "src/server.ts"], {
  cwd: raiz,
  stdout: "inherit",
  stderr: "inherit",
})

function cerrar(): void {
  build.kill()
  server.kill()
  process.exit(0)
}

process.on("SIGINT", cerrar)
process.on("SIGTERM", cerrar)

await server.exited
build.kill()
