import type { PublicPlayer, PushKind } from '@domino/shared';
import { RateLimiter } from '../limits';
import { PUSH_TITLE, type PushService } from '../push';

export const roomUrl = (code: string): string => `/sala/${code}`;

/** Textos e regras de quando mandar push a partir da mesa. */
export class Notifier {
  private readonly turnPush: RateLimiter;

  constructor(
    private readonly push: PushService,
    turnDebounceMs: number,
    private readonly log: (msg: string, err?: unknown) => void = () => {},
  ) {
    this.turnPush = new RateLimiter(1, turnDebounceMs);
  }

  private send(playerId: string, body: string, code: string, tag: string, kind: PushKind): Promise<number> {
    return this.push
      .sendToPlayer(playerId, { title: PUSH_TITLE, body, url: roomUrl(code), tag: `${tag}-${code}` }, kind)
      .catch((err) => {
        this.log('falha ao mandar push', err);
        return 0;
      });
  }

  invite(from: PublicPlayer, toId: string, code: string): Promise<number> {
    return this.send(toId, `${from.nickname} te chamou pra uma partida na Praça XV!`, code, 'convite', 'invite');
  }

  roomFull(playerId: string, code: string): void {
    void this.send(playerId, 'Sala completa, bora jogar!', code, 'sala', 'full');
  }

  yourTurn(player: PublicPlayer, code: string, now = Date.now()): void {
    if (!this.turnPush.take(player.id, now)) return;
    void this.send(player.id, `Tua vez, ${player.nickname}!`, code, 'vez', 'turn');
  }
}
