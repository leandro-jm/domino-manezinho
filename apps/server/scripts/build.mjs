/**
 * Empacota o servidor em JS pra produção (sem tsx nem devDependencies na imagem): o código do servidor,
 * os pacotes do workspace (@domino/*) e o client gerado do Prisma vão juntos; as dependências de
 * produção ficam de fora e vêm do node_modules.
 * Uso: pnpm --filter @domino/server build
 */
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies)
  .filter((name) => !name.startsWith('@domino/'))
  .flatMap((name) => [name, `${name}/*`]);

await build({
  entryPoints: { main: 'src/main.ts', 'bot.worker': 'src/rooms/bot.worker.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external,
  sourcemap: true,
  // Dependência CommonJS embutida que chame require() continua funcionando dentro do ESM.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  logLevel: 'info',
});
