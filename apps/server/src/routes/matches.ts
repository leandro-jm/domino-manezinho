import type { MatchDetail, MatchPage } from '@domino/shared';
import type { FastifyInstance } from 'fastify';
import { requirePlayerId } from '../auth';
import type { AppContext } from '../context';
import { badRequest, notFound } from '../errors';
import { listMatches, matchDetail } from '../history';

export const matchRoutes = (app: FastifyInstance, ctx: AppContext): void => {
  const { db, tokens } = ctx;

  app.get('/api/matches', async (req): Promise<MatchPage> => {
    const playerId = await requirePlayerId(req, tokens);
    const raw = (req.query as { before?: string }).before;
    const before = raw === undefined ? undefined : new Date(raw);
    if (before && Number.isNaN(before.getTime())) throw badRequest('Data inválida.');
    return listMatches(db, playerId, before);
  });

  app.get('/api/matches/:id', async (req): Promise<MatchDetail> => {
    const playerId = await requirePlayerId(req, tokens);
    const { id } = req.params as { id: string };
    // Quem não jogou recebe o mesmo 404 de partida inexistente: não dá pra sondar id.
    const match = await matchDetail(db, id, playerId);
    if (!match) throw notFound('Não achei essa partida.');
    return match;
  });
};
