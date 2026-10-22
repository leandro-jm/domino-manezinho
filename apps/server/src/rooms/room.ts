import { randomInt, randomUUID } from 'node:crypto';
import {
  SEATS,
  applyMove,
  createMatch,
  dealtHands,
  getPlayerView,
  isLegal,
  startNextHand,
  type MatchState,
  type Move,
  type Seat,
} from '@domino/engine';
import {
  BOT_PERSONAS,
  ERROR_CODES,
  emoteText,
  isBotLevel,
  quickFillLevel,
  type BotLevel,
  type PublicPlayer,
  type RoomSettings,
  type RoomSnapshot,
  type RoomStatus,
  type SeatOccupant,
} from '@domino/shared';
import { secureRng } from '../codes';
import type { Timings } from '../config';
import { RateLimiter } from '../limits';
import type { FinishedMatch, HandRecord } from '../persistence';
import type { BotRunner } from './bots';
import { CLOSE_REASONS, ERR, RoomError } from './errors';
import { heaviestMove, sanitizeMove } from './moves';
import type { Notifier } from './notifier';
import { reviveMatch, type SavedRoom, type SavedSlot } from './saved';
import { NamedTimers } from './timers';
import type { BotSlot, HumanSlot, Slot, TypedServer } from './types';

export interface RoomDeps {
  io: TypedServer;
  timings: Timings;
  bots: BotRunner;
  notifier: Notifier;
  /** Jogadores atualizados, ou null se o resultado ficou pendente (banco fora) para gravar depois. */
  persist: (m: FinishedMatch) => Promise<PublicPlayer[] | null>;
  isVisible: (playerId: string) => boolean;
  /** Jogador deixou de pertencer à mesa (cadeira liberada ou mesa fechada). */
  onPlayerGone: (playerId: string, room: Room) => void;
  onClose: (room: Room) => void;
  log: (msg: string, err?: unknown) => void;
}

export class Room {
  ownerId: string;
  settings: RoomSettings;
  status: RoomStatus = 'waiting';
  fillAt: number | null = null;
  match: MatchState | null = null;
  turnDeadline: number | null = null;
  closed = false;
  readonly seats: [Slot | null, Slot | null, Slot | null, Slot | null] = [null, null, null, null];

  private startedAt = new Date();
  private hands: HandRecord[] = [];
  private finishing = false;
  private turnToken = 0;
  private turnKey = '';
  private readonly timers = new NamedTimers(
    (name, err) => this.deps.log(`erro no timer ${name} da mesa ${this.code}`, err),
    () => !this.closed,
  );
  private readonly emotes: RateLimiter;
  /** Id da partida em andamento (idempotência ao gravar). */
  private matchId: string | null = null;
  /** Depois de restaurar a mesa, carência extra para os jogadores reconectarem antes do bot assumir. */
  private restoredUntil = 0;

  constructor(
    readonly code: string,
    owner: PublicPlayer,
    settings: RoomSettings,
    readonly quick: boolean,
    private readonly deps: RoomDeps,
  ) {
    this.emotes = new RateLimiter(1, deps.timings.emoteCooldownMs);
    this.ownerId = owner.id;
    this.settings = settings;
    if (quick) {
      this.fillAt = Date.now() + deps.timings.quickFillMs;
      this.timers.set('fill', deps.timings.quickFillMs, () => this.fillWithBots());
    }
  }

  get channel(): string {
    return `room:${this.code}`;
  }

  // ---------- consultas ----------

  seatOf(playerId: string): Seat | null {
    const seat = SEATS.find((s) => {
      const slot = this.seats[s];
      return slot?.kind === 'human' && slot.player.id === playerId;
    });
    return seat ?? null;
  }

  private human(playerId: string): { seat: Seat; slot: HumanSlot } | null {
    const seat = this.seatOf(playerId);
    return seat === null ? null : { seat, slot: this.seats[seat] as HumanSlot };
  }

  humans(): HumanSlot[] {
    return this.seats.filter((s): s is HumanSlot => s?.kind === 'human');
  }

  private isTurnOf(seat: Seat): boolean {
    const m = this.match;
    return this.status === 'playing' && !!m && !m.hand.result && m.hand.turn === seat;
  }

  freeSeats(): Seat[] {
    return SEATS.filter((s) => this.seats[s] === null);
  }

  /** Reconexão automática só para quem caiu, não para quem saiu nem quando outra aba já está na mesa. */
  wantsRebind(playerId: string): boolean {
    const h = this.human(playerId);
    return !!h && h.slot.socketId === null && !h.slot.left;
  }

  snapshot(): RoomSnapshot {
    const occupant = (slot: Slot | null): SeatOccupant | null => {
      if (!slot) return null;
      if (slot.kind === 'bot') return { kind: 'bot', level: slot.level, nickname: slot.nickname, avatarId: slot.avatarId };
      return { kind: 'human', player: slot.player, connected: slot.socketId !== null };
    };
    return {
      code: this.code,
      ownerId: this.ownerId,
      settings: this.settings,
      seats: this.seats.map(occupant) as RoomSnapshot['seats'],
      status: this.status,
      turnDeadline: this.turnDeadline,
      quick: this.quick,
      fillAt: this.fillAt,
    };
  }

  // ---------- envio ----------

  broadcast(): void {
    if (this.closed) return;
    this.deps.io.to(this.channel).emit('room:state', this.snapshot());
  }

  private sendView(seat: Seat): void {
    const slot = this.seats[seat];
    if (!this.match || slot?.kind !== 'human' || !slot.socketId) return;
    this.deps.io.to(slot.socketId).emit('game:view', getPlayerView(this.match, seat));
  }

  private sendViews(): void {
    for (const s of SEATS) this.sendView(s);
  }

  // ---------- timers ----------

  private botDelay(): number {
    const [min, max] = this.deps.timings.botDelayMs;
    return min + Math.random() * (max - min);
  }

  // ---------- entrada e saída ----------

  private requireOwner(playerId: string): void {
    if (playerId !== this.ownerId) throw new RoomError(ERR.notOwner);
  }

  private requireLobby(): void {
    if (this.status === 'playing') throw new RoomError(ERR.notWaiting);
  }

  /** Cadeira que o jogador pegaria ao entrar; lança erro se não dá pra entrar. */
  seatFor(playerId: string): Seat {
    const mine = this.seatOf(playerId);
    if (mine !== null) return mine;
    if (this.status === 'playing') throw new RoomError(ERR.playing);
    const seat =
      this.freeSeats()[0] ??
      // Mesa cheia de bots: o humano toma o lugar do último bot.
      [...SEATS].reverse().find((s) => this.seats[s]?.kind === 'bot');
    if (seat === undefined) throw new RoomError(ERR.full);
    return seat;
  }

  /** Senta o jogador (ou religa a cadeira dele) e amarra o socket à mesa. */
  join(player: PublicPlayer, socketId: string): Seat {
    const mine = this.seatOf(player.id);
    if (mine !== null) {
      this.bind(mine, socketId);
      return mine;
    }
    const seat = this.seatFor(player.id);
    this.seats[seat] = { kind: 'human', player, socketId: null, disconnectedAt: null, left: false };
    this.bind(seat, socketId);
    if (this.quick && this.status === 'waiting' && this.humans().length === 4) this.begin();
    return seat;
  }

  private bind(seat: Seat, socketId: string): void {
    const slot = this.seats[seat] as HumanSlot;
    const { io } = this.deps;
    const old = slot.socketId;
    if (old && old !== socketId) {
      io.to(old).emit('room:closed', CLOSE_REASONS.otherTab);
      io.in(old).socketsLeave(this.channel);
    }
    slot.socketId = socketId;
    slot.disconnectedAt = null;
    slot.left = false;
    io.in(socketId).socketsJoin(this.channel);
    this.timers.clear(`leave:${slot.player.id}`);
    this.timers.clear('abandon');
    // Se era a vez dele, cancela o bot substituto e devolve o relógio.
    if (this.isTurnOf(seat)) this.schedule();
    this.broadcast();
    this.sendView(seat);
  }

  /** room:leave. Esperando: libera a cadeira. Jogando: fica como desconectado. */
  leave(playerId: string): void {
    const h = this.human(playerId);
    if (!h) return;
    if (this.status !== 'playing') {
      this.removeHuman(h.seat);
      return;
    }
    if (h.slot.socketId) this.deps.io.in(h.slot.socketId).socketsLeave(this.channel);
    this.markDisconnected(h.seat);
    h.slot.left = true;
    // Todo humano foi embora de vez: não deixa bots jogando sozinhos (custa CPU, ninguém assiste).
    if (this.humans().every((x) => x.left)) {
      this.close(CLOSE_REASONS.empty);
      return;
    }
    this.broadcast();
  }

  /** Socket caiu. */
  disconnected(playerId: string, socketId: string): void {
    const h = this.human(playerId);
    if (!h || h.slot.socketId !== socketId) return;
    this.markDisconnected(h.seat);
    if (this.status !== 'playing') {
      this.timers.set(`leave:${playerId}`, this.deps.timings.disconnectGraceMs, () => {
        // Partida começou durante a carência: a cadeira fica, um bot joga por ele.
        if (this.status === 'playing') return;
        const again = this.human(playerId);
        if (again && again.slot.socketId === null) this.removeHuman(again.seat);
      });
    }
    this.broadcast();
  }

  private markDisconnected(seat: Seat): void {
    const slot = this.seats[seat] as HumanSlot;
    slot.socketId = null;
    slot.disconnectedAt ??= Date.now();
    if (this.isTurnOf(seat)) this.schedule();
    if (this.humans().every((h) => h.socketId === null)) {
      this.timers.set('abandon', this.deps.timings.roomAbandonMs, () => this.close(CLOSE_REASONS.abandoned));
    }
  }

  /** Tira o humano da cadeira; passa a dona da mesa adiante ou fecha se não sobrou humano. */
  private removeHuman(seat: Seat): void {
    const slot = this.seats[seat];
    if (slot?.kind !== 'human') return;
    if (slot.socketId) this.deps.io.in(slot.socketId).socketsLeave(this.channel);
    this.seats[seat] = null;
    this.timers.clear(`leave:${slot.player.id}`);
    this.deps.onPlayerGone(slot.player.id, this);
    const rest = this.humans();
    if (!rest.length) {
      this.close(CLOSE_REASONS.empty);
      return;
    }
    if (this.ownerId === slot.player.id) {
      this.ownerId = (rest.find((h) => h.socketId) ?? rest[0]!).player.id;
    }
    this.broadcast();
  }

  // ---------- arrumação da mesa (só fora de partida) ----------

  sit(playerId: string, seat: Seat): void {
    this.requireLobby();
    const h = this.human(playerId);
    if (!h) throw new RoomError(ERR.notSeated, ERROR_CODES.lostSeat);
    if (!SEATS.includes(seat)) throw new RoomError(ERR.seatTaken);
    if (h.seat === seat) return;
    if (this.seats[seat]) throw new RoomError(ERR.seatTaken);
    this.seats[seat] = h.slot;
    this.seats[h.seat] = null;
    this.broadcast();
  }

  setBot(playerId: string, seat: Seat, level: BotLevel | null): void {
    this.requireOwner(playerId);
    this.requireLobby();
    if (!SEATS.includes(seat)) throw new RoomError(ERR.seatTaken);
    if (level !== null && !isBotLevel(level)) throw new RoomError('Nível de bot desconhecido.');
    const current = this.seats[seat];
    if (current?.kind === 'human') throw new RoomError(ERR.seatHuman);
    if (level === null) {
      this.seats[seat] = null;
    } else if (current?.kind === 'bot') {
      current.level = level;
    } else {
      this.seats[seat] = this.newBot(level);
    }
    this.broadcast();
  }

  private newBot(level: BotLevel): BotSlot {
    const used = new Set(this.seats.flatMap((s) => (s?.kind === 'bot' ? [s.nickname] : [])));
    const free = BOT_PERSONAS.filter((p) => !used.has(p.nickname));
    const persona = free[randomInt(free.length || 1)] ?? BOT_PERSONAS[0]!;
    return { kind: 'bot', level, nickname: persona.nickname, avatarId: persona.avatarId };
  }

  updateSettings(playerId: string, settings: RoomSettings): void {
    this.requireOwner(playerId);
    this.requireLobby();
    this.settings = settings;
    this.broadcast();
  }

  private fillWithBots(): void {
    if (this.status !== 'waiting') return;
    const humans = this.humans();
    if (!humans.length) return;
    const avg = humans.reduce((s, h) => s + h.player.rating, 0) / humans.length;
    const level = quickFillLevel(avg);
    for (const s of this.freeSeats()) this.seats[s] = this.newBot(level);
    this.begin();
  }

  start(playerId: string): void {
    this.requireOwner(playerId);
    this.requireLobby();
    if (this.freeSeats().length) throw new RoomError(ERR.needFour);
    this.begin();
  }

  rematch(playerId: string): void {
    this.requireOwner(playerId);
    if (this.status !== 'finished') throw new RoomError(ERR.notFinished);
    if (this.freeSeats().length) throw new RoomError(ERR.rematchMissing);
    this.begin();
  }

  // ---------- partida ----------

  private begin(): void {
    this.timers.clear('fill');
    this.fillAt = null;
    this.timers.clearPrefix('leave:');
    this.match = createMatch(this.settings.config, randomInt(2 ** 32), secureRng);
    this.matchId = randomUUID();
    this.startedAt = new Date();
    this.hands = [];
    this.finishing = false;
    this.turnKey = '';
    this.status = 'playing';
    for (const h of this.humans()) {
      if (!this.deps.isVisible(h.player.id)) this.deps.notifier.roomFull(h.player.id, this.code);
    }
    this.afterChange();
  }

  private afterChange(): void {
    this.schedule();
    this.broadcast();
    this.sendViews();
  }

  move(playerId: string, socketId: string, raw: unknown): void {
    const h = this.human(playerId);
    if (!h) throw new RoomError(ERR.notSeated, ERROR_CODES.lostSeat);
    if (h.slot.socketId !== socketId) throw new RoomError(ERR.otherTab, ERROR_CODES.lostSeat);
    const match = this.match;
    if (this.status !== 'playing' || !match || match.winner !== null) throw new RoomError(ERR.noMatch);
    if (match.hand.result) throw new RoomError(ERR.handOver);
    if (match.hand.turn !== h.seat) throw new RoomError(ERR.notYourTurn);
    const move = sanitizeMove(raw, h.seat);
    if (!move || !isLegal(match, move)) throw new RoomError(ERR.illegal);
    this.apply(move);
  }

  private apply(move: Move): void {
    const match = applyMove(this.match!, move);
    this.match = match;
    // A jogada como ficou no histórico (lado normalizado), igual pra todo mundo.
    this.deps.io.to(this.channel).emit('game:move', match.hand.log[match.hand.log.length - 1]!);
    const { hand } = match;
    if (hand.result) {
      const dealt = dealtHands(hand).map((h) => h.map((t) => t.id));
      this.hands.push({ number: hand.number, result: hand.result, log: hand.log, dealt });
    }
    this.afterChange();
  }

  /** Arma o próximo passo: jogada de bot, relógio do humano, próxima mão ou fim. */
  private schedule(): void {
    this.timers.clear('turn');
    const token = ++this.turnToken;
    const match = this.match;
    if (!match || this.status !== 'playing') return;
    const guard = (fn: () => void) => () => {
      if (token === this.turnToken && this.match === match) fn();
    };

    if (match.hand.result) {
      this.turnDeadline = null;
      if (match.winner !== null) {
        void this.finish();
        return;
      }
      this.timers.set(
        'turn',
        this.deps.timings.nextHandMs,
        guard(() => {
          this.match = startNextHand(match, secureRng);
          this.afterChange();
        }),
      );
      return;
    }

    const seat = match.hand.turn;
    const slot = this.seats[seat];
    if (!slot) return;
    const key = `${match.hand.number}:${match.hand.log.length}`;
    const newTurn = key !== this.turnKey;
    this.turnKey = key;

    if (slot.kind === 'bot') {
      this.turnDeadline = null;
      this.timers.set('turn', this.botDelay(), guard(() => void this.botPlay(seat, slot.level, token)));
      return;
    }

    const now = Date.now();
    if (newTurn || this.turnDeadline === null) {
      this.turnDeadline = now + this.settings.turnSeconds * this.deps.timings.turnMsPerSecond;
      if (!this.deps.isVisible(slot.player.id)) this.deps.notifier.yourTurn(slot.player, this.code);
    }
    let delay = this.turnDeadline - now;
    if (slot.socketId === null && slot.disconnectedAt !== null) {
      // Caiu: depois da carência um bot amador joga por ele, no ritmo de bot.
      const graceLeft = Math.max(slot.disconnectedAt + this.deps.timings.disconnectGraceMs, this.restoredUntil) - now;
      delay = Math.min(delay, Math.max(graceLeft, this.botDelay()));
    }
    this.timers.set(
      'turn',
      delay,
      guard(() => {
        const current = this.seats[seat];
        if (current?.kind === 'human' && current.socketId === null) void this.botPlay(seat, 'amador', token);
        else this.apply(heaviestMove(match, seat));
      }),
    );
  }

  private async botPlay(seat: Seat, level: BotLevel, token: number): Promise<void> {
    const match = this.match!;
    let move: Move;
    try {
      move = await this.deps.bots.choose(getPlayerView(match, seat), level);
      if (!isLegal(match, move)) move = heaviestMove(match, seat);
    } catch (err) {
      this.deps.log(`bot falhou na mesa ${this.code}`, err);
      move = heaviestMove(match, seat);
    }
    // Enquanto o bot pensava a mesa pode ter mudado (fechou, humano voltou e jogou, revanche).
    if (token !== this.turnToken || this.match !== match) return;
    this.apply(move);
  }

  private async finish(): Promise<void> {
    if (this.finishing || !this.match) return;
    this.finishing = true;
    const match = this.match;
    const record: FinishedMatch = {
      id: this.matchId ?? randomUUID(),
      roomCode: this.code,
      config: match.config,
      startedAt: this.startedAt,
      endedAt: new Date(),
      winner: match.winner!,
      scores: match.scores,
      seats: SEATS.map((seat) => {
        const slot = this.seats[seat];
        return {
          seat,
          playerId: slot?.kind === 'human' ? slot.player.id : null,
          botLevel: slot?.kind === 'bot' ? slot.level : null,
          botNickname: slot?.kind === 'bot' ? slot.nickname : null,
          botAvatarId: slot?.kind === 'bot' ? slot.avatarId : null,
        };
      }),
      hands: this.hands,
    };
    try {
      // null: banco fora, resultado na fila; o rating novo chega depois por applyPlayers.
      const updated = await this.deps.persist(record);
      if (updated) this.applyPlayers(updated, false);
    } catch (err) {
      this.deps.log(`falha ao gravar partida da mesa ${this.code}`, err);
    }
    if (this.closed || this.match !== match) return;
    this.status = 'finished';
    this.turnDeadline = null;
    // Quem caiu e não voltou perde a cadeira; a mesa fica pronta pra revanche.
    for (const s of SEATS) {
      const slot = this.seats[s];
      if (slot?.kind === 'human' && slot.socketId === null) this.removeHuman(s);
      if (this.closed) return;
    }
    this.broadcast();
  }

  /** Rating/estatísticas novos (resultado gravado agora ou mais tarde, se tinha ficado pendente). */
  applyPlayers(players: readonly PublicPlayer[], broadcast = true): void {
    for (const p of players) {
      const h = this.human(p.id);
      if (h) h.slot.player = p;
    }
    if (broadcast) this.broadcast();
  }

  /** Id da partida atual (para casar um resultado gravado tarde com a mesa certa). */
  get currentMatchId(): string | null {
    return this.matchId;
  }

  // ---------- reinício do servidor ----------

  toSaved(): SavedRoom {
    return {
      code: this.code,
      ownerId: this.ownerId,
      settings: this.settings,
      quick: this.quick,
      status: this.status,
      seats: this.seats.map((s): SavedSlot | null =>
        !s ? null : s.kind === 'bot' ? s : { kind: 'human', player: s.player, left: s.left },
      ),
      match: this.match,
      matchId: this.matchId,
      startedAt: this.startedAt.toISOString(),
      hands: this.hands,
    };
  }

  /**
   * Remonta a mesa salva antes do reinício. Todos começam desconectados; quem reconectar dentro de
   * `graceMs` volta pra mesma cadeira (o socket.io do app reconecta sozinho e pede a mesa de novo).
   */
  static restore(saved: SavedRoom, deps: RoomDeps, graceMs: number): Room {
    const owner = { id: saved.ownerId } as PublicPlayer;
    const room = new Room(saved.code, owner, saved.settings, saved.quick, deps);
    const now = Date.now();
    room.status = saved.status;
    room.match = saved.match ? reviveMatch(saved.match) : null;
    room.matchId = saved.matchId;
    room.startedAt = new Date(saved.startedAt);
    room.hands = saved.hands;
    room.restoredUntil = now + graceMs;
    saved.seats.forEach((s, i) => {
      room.seats[i as Seat] = !s
        ? null
        : s.kind === 'bot'
          ? s
          : { kind: 'human', player: s.player, socketId: null, disconnectedAt: now, left: s.left };
    });
    if (room.status !== 'waiting') {
      room.timers.clear('fill');
      room.fillAt = null;
    }
    if (room.status === 'playing') {
      room.schedule();
    } else {
      // Fora de partida: quem não voltar na carência larga a cadeira.
      for (const h of room.humans()) {
        const id = h.player.id;
        room.timers.set(`leave:${id}`, graceMs, () => {
          const again = room.human(id);
          if (again && again.slot.socketId === null) room.removeHuman(again.seat);
        });
      }
    }
    room.timers.set('abandon', Math.max(graceMs, deps.timings.roomAbandonMs), () => room.close(CLOSE_REASONS.abandoned));
    return room;
  }

  /** Para os relógios sem avisar ninguém: o servidor vai reiniciar e a mesa foi salva para voltar igual. */
  suspend(): void {
    if (this.closed) return;
    this.closed = true;
    this.timers.clearAll();
  }

  // ---------- resto ----------

  emote(playerId: string, emoteId: unknown): void {
    const seat = this.seatOf(playerId);
    if (seat === null || typeof emoteId !== 'string' || !emoteText(emoteId)) return;
    if (!this.emotes.take(playerId)) return;
    this.deps.io.to(this.channel).emit('chat:emote', { seat, emoteId });
  }

  close(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.timers.clearAll();
    const { io } = this.deps;
    io.to(this.channel).emit('room:closed', reason);
    io.in(this.channel).socketsLeave(this.channel);
    for (const h of this.humans()) this.deps.onPlayerGone(h.player.id, this);
    this.deps.onClose(this);
  }
}
