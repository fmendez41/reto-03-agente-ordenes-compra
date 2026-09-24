const puerto = process.env.PORT ?? "3000"
const subdominio = process.env.TUNNEL_SUBDOMAIN ?? "oc-periferia-reto03"

// localtunnel cierra la conexión cada pocos minutos. Este supervisor la vuelve
// a abrir pidiendo siempre el mismo subdominio, para que el link no cambie.
while (true) {
  const proceso = Bun.spawn(
    ["npx", "--yes", "localtunnel", "--port", puerto, "--subdomain", subdominio],
    { stdout: "inherit", stderr: "inherit" },
  )
  const codigo = await proceso.exited
  console.log(`\nEl túnel se cerró (código ${codigo}). Reabriendo en 3 segundos…`)
  await Bun.sleep(3000)
}
