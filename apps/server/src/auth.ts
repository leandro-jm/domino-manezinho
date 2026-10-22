import { SignJWT, jwtVerify } from 'jose';
import type { FastifyRequest } from 'fastify';
import { unauthorized } from './errors';

export interface TokenClaims {
  playerId: string;
  /** Versão do token (Player.tokenVersion na emissão); tokens antigos não têm e valem como 0. */
  version: number;
}

export interface TokenService {
  sign(playerId: string, version: number): Promise<string>;
  /** Só confere assinatura e validade; null se o token não presta. */
  verify(token: string): Promise<TokenClaims | null>;
  /** tokenVersion atual do jogador, ou null se ele não existe mais. */
  versionOf(playerId: string): Promise<number | null>;
}

/** Códigos que o cliente usa para decidir o que fazer com um 401. */
export const AUTH_ERRORS = {
  invalid: 'token_invalid',
  revoked: 'token_revoked',
  notFound: 'player_not_found',
} as const;

export const createTokenService = (secret: string, versionOf: TokenService['versionOf']): TokenService => {
  const key = new TextEncoder().encode(secret);
  return {
    sign: (playerId, version) =>
      new SignJWT({ ver: version })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(playerId)
        .setIssuedAt()
        .setExpirationTime('365d')
        .sign(key),
    verify: async (token) => {
      try {
        const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
        if (typeof payload.sub !== 'string') return null;
        return { playerId: payload.sub, version: typeof payload.ver === 'number' ? payload.ver : 0 };
      } catch {
        return null;
      }
    },
    versionOf,
  };
};

export const bearerToken = (req: FastifyRequest): string | null => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
};

/** playerId do token, ou null se não veio token. Token inválido, revogado ou de jogador apagado é erro. */
export const optionalPlayerId = async (req: FastifyRequest, tokens: TokenService): Promise<string | null> => {
  const token = bearerToken(req);
  if (!token) return null;
  const claims = await tokens.verify(token);
  if (!claims) throw unauthorized('Token inválido ou vencido.', AUTH_ERRORS.invalid);
  const current = await tokens.versionOf(claims.playerId);
  if (current === null) throw unauthorized('Jogador não encontrado. Cria teu jogador de novo.', AUTH_ERRORS.notFound);
  if (current !== claims.version) throw unauthorized('Esse jogador foi levado pra outro aparelho.', AUTH_ERRORS.revoked);
  return claims.playerId;
};

export const requirePlayerId = async (req: FastifyRequest, tokens: TokenService): Promise<string> => {
  const id = await optionalPlayerId(req, tokens);
  if (!id) throw unauthorized();
  return id;
};
