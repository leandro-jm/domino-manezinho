import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

export type Db = PrismaClient;

/**
 * Pool com limites de tempo: com o banco travado, sem eles cada pedido ficava pendurado para sempre e
 * as requisições se acumulavam. O jogo em si roda em memória e segue sem o banco.
 */
export const createDb = (databaseUrl: string): Db =>
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrl,
      max: 10,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      query_timeout: 15_000,
      statement_timeout: 15_000,
    }),
  });
