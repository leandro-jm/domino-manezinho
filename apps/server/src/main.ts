import { buildServer } from './app';

try {
  process.loadEnvFile();
} catch {
  // sem .env: usa o ambiente
}

const { app, ctx } = await buildServer({ logger: true });
const { port, host } = ctx.config;

if (!ctx.push.enabled) app.log.warn('VAPID não configurado: push desligado (rode `pnpm --filter @domino/server vapid`).');
if (!ctx.config.stateDir) app.log.warn('STATE_DIR não configurado: reiniciar o servidor fecha as mesas em andamento.');

// Promessa rejeitada sem dono: registra e segue (as mesas continuam). Antes derrubava o processo inteiro.
process.on('unhandledRejection', (err) => app.log.error({ err }, 'promessa rejeitada sem tratamento'));
// Exceção sem dono deixa o processo em estado incerto: salva mesas e resultados e sai; o Docker sobe de novo
// e o estado volta do arquivo.
process.on('uncaughtException', (err) => {
  app.log.fatal({ err }, 'erro fatal, salvando o estado e saindo');
  try {
    ctx.saveState();
  } finally {
    process.exit(1);
  }
});

await app.listen({ port, host });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info(`${signal}: salvando as mesas e desligando...`);
    void app.close().then(() => process.exit(0));
  });
}
