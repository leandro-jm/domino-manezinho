import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from '../src/db';
import { TEST_DATABASE_URL } from '../vitest.config';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Cria o banco domino_test se faltar e aplica as migrations. */
export default async function setup(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL);
  const name = url.pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`Nome de banco de teste estranho: ${name}`);
  const adminUrl = process.env.TEST_ADMIN_DATABASE_URL ?? Object.assign(new URL(url), { pathname: '/postgres' }).toString();
  const admin = createDb(adminUrl);
  try {
    const rows = await admin.$queryRaw<unknown[]>`SELECT 1 FROM pg_database WHERE datname = ${name}`;
    if (!rows.length) await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.$disconnect();
  }
  execFileSync(resolve(root, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });
}
