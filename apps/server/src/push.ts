import webpush from 'web-push';
import type { PushKind } from '@domino/shared';
import type { Db } from './db';

export interface PushPayload {
  title: string;
  body: string;
  /** Caminho do app para abrir ao tocar na notificação, ex.: /sala/ABCDE. */
  url: string;
  tag: string;
}

export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Envia uma notificação; deve lançar erro com `statusCode` quando o serviço recusa. */
export type PushSender = (target: PushTarget, payload: string) => Promise<void>;

export const PUSH_TITLE = 'Dominó Manezinho';

/** Coluna do jogador que liga cada tipo de notificação. */
const PREF_COLUMN = { turn: 'pushTurn', invite: 'pushInvite', full: 'pushFull' } as const satisfies Record<PushKind, string>;

export class PushService {
  private readonly sender: PushSender | null;

  constructor(
    private readonly db: Db,
    vapid: { publicKey: string; privateKey: string; subject: string } | null,
    sender?: PushSender,
    private readonly log: (msg: string, err?: unknown) => void = () => {},
  ) {
    this.publicKey = vapid?.publicKey ?? (sender ? 'test-public-key' : null);
    if (sender) this.sender = sender;
    else if (vapid) {
      const vapidDetails = { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey };
      this.sender = async (target, payload) => {
        // Sem timeout, serviço de push lento segurava o pedido de convite pendurado.
        await webpush.sendNotification(target, payload, { vapidDetails, TTL: 120, timeout: 10_000 });
      };
    } else this.sender = null;
  }

  readonly publicKey: string | null;

  get enabled(): boolean {
    return this.sender !== null;
  }

  /**
   * Manda para todas as inscrições do jogador; apaga as que o navegador já descartou. Retorna quantas foram.
   * Com `kind`, só manda se o jogador deixou esse tipo de aviso ligado.
   */
  async sendToPlayer(playerId: string, payload: PushPayload, kind?: PushKind): Promise<number> {
    if (!this.sender) return 0;
    const subs = await this.db.pushSubscription.findMany({
      where: { playerId, ...(kind && { player: { [PREF_COLUMN[kind]]: true } }) },
    });
    const body = JSON.stringify(payload);
    let delivered = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await this.sender!({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
          delivered++;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await this.db.pushSubscription.deleteMany({ where: { endpoint: s.endpoint } });
          } else this.log(`push falhou (${status ?? '?'})`, err);
        }
      }),
    );
    return delivered;
  }
}
