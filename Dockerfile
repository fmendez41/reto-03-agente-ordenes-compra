FROM oven/bun:1.4
WORKDIR /app
COPY package.json ./
COPY . .
RUN bun install
RUN bun run build
ENV PORT=3000
EXPOSE 3000
CMD ["bun", "src/server.ts"]
