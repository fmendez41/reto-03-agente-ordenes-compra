FROM oven/bun:1.4
WORKDIR /app

# Las dependencias van en su propia capa: mientras no cambien package.json ni el
# lockfile, un cambio de código no vuelve a instalar nada. Antes el COPY . . iba
# justo antes del install y cualquier edición invalidaba la capa entera.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["bun", "src/server.ts"]
