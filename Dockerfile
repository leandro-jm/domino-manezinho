# Dominó Manezinho — servidor (API + Socket.IO) servindo também o PWA já construído.
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
# OpenSSL: usado pelo motor de migração do Prisma.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
# PWA e servidor empacotado em JS (dist/main.js, com os pacotes do workspace e o client do Prisma dentro).
RUN pnpm --filter @domino/web build && pnpm --filter @domino/server build
# Só o servidor com as dependências de produção: sem o web, sem tsx/vite/vitest, sem o código das outras partes.
# Com os scripts de instalação: o do @prisma/engines baixa aqui o motor de migração (o usuário node não escreve lá).
RUN pnpm --filter @domino/server deploy --prod --legacy /prod/server

FROM base AS runtime
ENV NODE_ENV=production PORT=3001 WEB_DIST=/app/web STATE_DIR=/app/state
COPY --from=build /prod/server /app/server
COPY --from=build /app/apps/web/dist /app/web
# Pasta do estado (mesas em andamento e resultados pendentes), montada como volume; a única gravável.
RUN mkdir -p /app/state && chown node:node /app/state
# Sem root: o código fica só-leitura para o processo do servidor.
USER node
WORKDIR /app/server
EXPOSE 3001
# Processo de pé (o banco fora não conta: as mesas seguem em memória). Vale pro Docker, Swarm e Dokploy.
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
# Aplica as migrações pendentes e sobe o servidor (binários direto, sem o pnpm baixar nada como usuário node).
# `exec node` deixa o Node como processo principal: o SIGTERM do `docker stop` chega nele e as mesas são salvas.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]
