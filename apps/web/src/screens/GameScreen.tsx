import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Move, Side, Tile } from '@domino/engine';
import { legalMovesForView, teamOf } from '@domino/engine';
import { useShallow } from 'zustand/react/shallow';
import { Avatar } from '../components/Avatar';
import { Board2D } from '../components/Board2D';
import { SceneBoundary } from '../components/SceneBoundary';
import { Dialog } from '../components/Dialog';
import { SettingsForm } from '../components/SettingsForm';
import { TileFace } from '../components/TileFace';
import { hintText } from '../game/describe';
import { layoutBoard } from '../game/layout';
import { backdropStyle, randomBackdrop } from '../lib/backdrop';
import { hasWebGL, resolveQuality, useSettings } from '../lib/settings';
import { reportError } from '../lib/report';
import { useWakeLock } from '../lib/wakeLock';
import { useOnline } from '../store/online';
import { useTable } from '../store/table';
import { Announcer } from './game/Announcer';
import { EmoteMenu } from './game/EmoteMenu';
import { KibitzBubbles, useKibitzers } from './game/kibitzers';
import { ResultOverlay } from './game/ResultOverlay';
import { SeatBadges } from './game/SeatBadges';
import { TurnTimer } from './game/TurnTimer';
import { useTableEffects } from './game/useTableEffects';

const Scene = lazy(() => import('../three/Scene').then((m) => ({ default: m.Scene })));

export function GameScreen({ onExit, turnSeconds }: { onExit: () => void; turnSeconds?: number }) {
  // Só o que a tela usa: "quem está falando" muda o tempo todo e não pode redesenhar a mesa inteira.
  const { view, seats, actions, emotes, turnDeadline, canRematch, lastMove, mode, analysis } = useTable(
    useShallow((s) => ({
      view: s.view,
      seats: s.seats,
      actions: s.actions,
      emotes: s.emotes,
      turnDeadline: s.turnDeadline,
      canRematch: s.canRematch,
      lastMove: s.lastMove,
      mode: s.mode,
      analysis: s.analysis,
    })),
  );
  const socketUp = useOnline((s) => s.connected);
  const offline = mode === 'online' && !socketUp;
  const settings = useSettings(
    useShallow((s) => ({
      quality: s.quality,
      highContrast: s.highContrast,
      topView: s.topView,
      largeTiles: s.largeTiles,
      sound: s.sound,
      set: s.set,
    })),
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ text: string; info: boolean } | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [lookAround, setLookAround] = useState(false);
  const [hinted, setHinted] = useState<Move | null>(null);
  const [hinting, setHinting] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const errorTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** Atalhos de teclado; trocado a cada render pra enxergar o estado atual. */
  const keys = useRef<(e: KeyboardEvent) => void>(() => undefined);
  useWakeLock();
  useTableEffects(view);

  // Fundo ilustrado da partida (aparece na mesa 2D e enquanto a 3D carrega): um novo a cada jogo.
  const [backdrop, setBackdrop] = useState(randomBackdrop);
  const lastHand = useRef(view?.handNumber ?? 1);
  useEffect(() => {
    const hand = view?.handNumber ?? 1;
    if (hand < lastHand.current) setBackdrop(randomBackdrop()); // revanche: partida nova
    lastHand.current = hand;
  }, [view?.handNumber]);
  // Cena 3D resiliente: se o WebGL cair, recarrega; caindo de novo, baixa a qualidade; na terceira, mesa 2D.
  const [sceneKey, setSceneKey] = useState(0);
  const [sceneFailed, setSceneFailed] = useState(false);
  const lostAt = useRef<number[]>([]);
  /** Aviso rápido acima da mão: erro em vermelho, informação (dica) em neutro. */
  const toast = useCallback((text: string, ms = 4000, info = false) => {
    setNotice({ text, info });
    clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setNotice(null), ms);
  }, []);
  const onContextLost = useCallback(() => {
    const now = Date.now();
    lostAt.current = [...lostAt.current.filter((t) => now - t < 60_000), now];
    const n = lostAt.current.length;
    if (n >= 3) {
      useSettings.getState().set({ quality: '2d' });
      toast('A placa de vídeo não aguentou: passei pra mesa 2D. Dá pra voltar na engrenagem ⚙️.', 6000);
      return;
    }
    if (n === 2) {
      useSettings.getState().set({ quality: 'baixa' });
      toast('A mesa 3D caiu de novo: baixei a qualidade.');
    } else toast('A mesa 3D caiu, recarregando…');
    setTimeout(() => setSceneKey((k) => k + 1), 300);
  }, [toast]);
  const onSceneError = useCallback(
    (err: unknown) => {
      console.error('[mesa 3D] falhou', err);
      reportError('scene', err);
      setSceneFailed(true);
      toast('A mesa 3D não carregou; seguindo na mesa 2D.', 6000);
    },
    [toast],
  );
  const webgl = hasWebGL() && settings.quality !== '2d' && !sceneFailed;
  const perus = !webgl ? 3 : { baixa: 2, media: 4, alta: 5 }[resolveQuality(settings.quality)];
  useKibitzers(view, seats, perus, analysis);

  const moves = useMemo(() => (view ? legalMovesForView(view) : []), [view]);
  const layout = useMemo(() => (view ? layoutBoard(view.board, view.log) : null), [view]);
  const lastPlayedId = lastMove?.move.type === 'play' ? lastMove.move.tileId : null;

  useEffect(() => {
    setSelected(null);
    setHinted(null);
  }, [view?.log.length, view?.handNumber]);

  // Chegou a vez: a câmera volta pra mesa sozinha.
  const isMyTurn = !!view && !view.result && view.turn === view.seat;
  useEffect(() => {
    if (isMyTurn) setLookAround(false);
  }, [isMyTurn]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!view || !layout || !actions) return <div className="center-screen">Arrumando a mesa…</div>;

  const mine = teamOf(view.seat);
  const myTurn = !view.result && view.turn === view.seat;
  const mustPass = moves.length === 1 && moves[0]!.type === 'pass';
  const playableIds = new Set(moves.flatMap((m) => (m.type === 'play' ? [m.tileId] : [])));
  const selectedSides = moves.flatMap((m) => (m.type === 'play' && m.tileId === selected ? [m.side] : []));
  const quality = resolveQuality(settings.quality);
  // Pontas que dá pra tocar: as da pedra escolhida, ou a saída quando a mesa está vazia.
  const pickable: Side[] = selectedSides.length ? selectedSides : view.board.length === 0 && myTurn ? ['left'] : [];
  const me = seats[view.seat];

  const send = async (move: Move) => {
    setSelected(null);
    const err = await actions.play(move);
    if (err) toast(err, 3000);
  };

  const askHint = async () => {
    if (!actions.hint || hinting) return;
    setHinting(true);
    const move = await actions.hint();
    setHinting(false);
    // A dica chegou depois de a vez passar: não serve mais.
    const still =
      move &&
      moves.some((m) => m.type === move.type && (m.type === 'pass' || (move.type === 'play' && m.tileId === move.tileId && m.side === move.side)));
    if (!move || !still) return toast('O Monstro não conseguiu pensar a tempo. Tenta de novo.', 3000);
    setHinted(move);
    toast(`💡 ${hintText(move, view.board)}`, 6000, true);
  };
  const hintedTile = hinted?.type === 'play' ? hinted.tileId : null;

  const tapTile = (tile: Tile) => {
    if (!myTurn || !playableIds.has(tile.id)) return;
    const options = moves.filter((m): m is Extract<Move, { type: 'play' }> => m.type === 'play' && m.tileId === tile.id);
    if (options.length === 1) void send(options[0]!);
    else setSelected(selected === tile.id ? null : tile.id);
  };

  const pickSide = (side: Side) => {
    if (selected === null) {
      const only = moves.find((m) => m.type === 'play');
      if (only && view.board.length === 0) void send(only);
      return;
    }
    void send({ type: 'play', seat: view.seat, tileId: selected, side });
  };

  // Teclado: 1 a 7 escolhem a pedra, P passa, ←/→ escolhem a ponta e D pede dica (no treino).
  keys.current = (e) => {
    const target = e.target as HTMLElement;
    if (showSettings || confirmExit || e.ctrlKey || e.metaKey || e.altKey) return;
    if (target.closest('input, select, textarea, [role="dialog"][aria-modal="true"]')) return;
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= view.myHand.length) {
      e.preventDefault();
      tapTile(view.myHand[n - 1]!);
    } else if ((e.key === 'p' || e.key === 'P') && myTurn && mustPass) {
      e.preventDefault();
      void send(moves[0]!);
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && selectedSides.length > 1) {
      e.preventDefault();
      pickSide(e.key === 'ArrowLeft' ? 'left' : 'right');
    } else if ((e.key === 'd' || e.key === 'D') && actions.hint && myTurn && moves.length > 1) {
      e.preventDefault();
      void askHint();
    }
  };

  const leave = () => {
    actions.leave();
    onExit();
  };

  const myEmote = [...emotes].reverse().find((e) => e.seat === view.seat);
  const largeTile = settings.largeTiles ? 58 : 44;
  const endValue = (side: Side) => layout.ends.find((e) => e.side === side)?.value;

  return (
    <div className="game-screen" data-contrast={settings.highContrast ? 'high' : 'normal'} style={backdropStyle(backdrop, 0.35)}>
      <div className="stage">
        {webgl ? (
          <SceneBoundary key={sceneKey} onError={onSceneError}>
          <Suspense fallback={<div className="center-screen">Carregando a Praça XV…</div>}>
            <Scene
              view={view}
              layout={layout}
              pickableSides={pickable}
              onPickSide={pickSide}
              lastPlayedId={lastPlayedId}
              quality={quality}
              highContrast={settings.highContrast}
              topView={settings.topView}
              perus={perus}
              lookAround={lookAround}
              onContextLost={onContextLost}
            />
          </Suspense>
          </SceneBoundary>
        ) : (
          <Board2D layout={layout} pickableSides={pickable} onPickSide={pickSide} lastPlayedId={lastPlayedId} />
        )}
      </div>

      <Announcer />
      <SeatBadges view={view} seats={seats} emotes={emotes} memory={showMemory && !!actions.hint} />
      <KibitzBubbles floating={webgl} />

      <header className="game-top">
        <button className="btn icon" aria-label="Sair da mesa" onClick={() => (view.winner !== null ? leave() : setConfirmExit(true))}>
          ←
        </button>
        <div className="scoreboard" aria-label="Placar">
          <span className="us">Nós {view.scores[mine]}</span>
          <span className="sep">×</span>
          <span className="them">{view.scores[mine === 0 ? 1 : 0]} Eles</span>
          <small>
            mão {view.handNumber} · até {view.config.targetScore}
            {view.config.scoring === 'pontos' ? ' pts' : ''}
          </small>
        </div>
        <div className="top-actions">
          {webgl && perus > 0 && (
            <button
              className={`btn icon ${lookAround ? 'is-on' : ''}`}
              aria-label="Olhar a roda"
              aria-pressed={lookAround}
              title="Olhar a roda"
              onClick={() => setLookAround(!lookAround)}
            >
              👀
            </button>
          )}
          <button className="btn icon" aria-label="Configurações" title="Configurações" onClick={() => setShowSettings(true)}>
            ⚙️
          </button>
          <button
            className="btn icon"
            aria-label={settings.sound ? 'Desligar som' : 'Ligar som'}
            aria-pressed={settings.sound}
            onClick={() => settings.set({ sound: !settings.sound })}
          >
            {settings.sound ? '🔊' : '🔇'}
          </button>
        </div>
      </header>

      {offline && <div className="conn-banner" role="status">Reconectando com a praça…</div>}
      {notice && (
        <div className={`toast ${notice.info ? 'is-info' : ''}`} role={notice.info ? 'status' : 'alert'}>
          {notice.text}
        </div>
      )}

      <footer className={`hud ${myTurn ? 'is-turn' : ''}`}>
        {turnDeadline && myTurn && turnSeconds && <TurnTimer deadline={turnDeadline} total={turnSeconds} />}
        <div className="hud-row">
          <div className="hud-me">
            {myEmote && <div className="speech">{myEmote.text}</div>}
            <Avatar id={me?.avatarId ?? 'veterano'} size={60} />
            <div>
              <strong>{me?.nickname ?? 'Tu'}</strong>
              <div className="hud-status">
                {view.result ? 'Fim da mão' : myTurn ? (mustPass ? 'Não tem pedra… toc-toc!' : 'Tua vez!') : `Vez de ${seats[view.turn]?.nickname ?? '…'}`}
              </div>
            </div>
          </div>
          {actions.hint && (
            <button
              className={`btn icon ${showMemory ? 'is-on' : ''}`}
              aria-label="Memória da mesa"
              aria-pressed={showMemory}
              title="Memória da mesa"
              onClick={() => setShowMemory(!showMemory)}
            >
              🧠
            </button>
          )}
          {actions.hint && myTurn && moves.length > 1 && (
            <button className="btn icon" aria-label="Dica" title="Dica do Monstro" disabled={hinting} onClick={() => void askHint()}>
              {hinting ? '…' : '💡'}
            </button>
          )}
          <EmoteMenu onSend={actions.emote} />
        </div>

        {selectedSides.length > 1 && (
          <div className="side-chooser" role="group" aria-label="Escolher a ponta">
            {selectedSides.map((side) => (
              <button
                key={side}
                className={`btn primary ${hinted?.type === 'play' && hinted.tileId === selected && hinted.side === side ? 'is-hint' : ''}`}
                onClick={() => pickSide(side)}
              >
                {side === 'left' ? '◀' : ''} Na ponta do {endValue(side)} {side === 'right' ? '▶' : ''}
              </button>
            ))}
          </div>
        )}

        <div className="hand" role="group" aria-label="Tuas pedras (teclas 1 a 7)">
          {view.myHand.map((t) => {
            const playable = myTurn && playableIds.has(t.id);
            return (
              <button
                key={t.id}
                className={`hand-tile ${playable ? 'is-playable' : ''} ${selected === t.id ? 'is-selected' : ''} ${hintedTile === t.id ? 'is-hint' : ''}`}
                disabled={!playable}
                onClick={() => tapTile(t)}
                aria-label={`Pedra ${t.a} e ${t.b}${playable ? ', pode jogar' : ''}`}
              >
                <TileFace top={t.a} bottom={t.b} width={largeTile} />
              </button>
            );
          })}
          {mustPass && myTurn && (
            <button className="btn primary pass-btn" onClick={() => void send(moves[0]!)}>
              Toc-toc (passar)
            </button>
          )}
        </div>
      </footer>

      {view.result && (
        <ResultOverlay
          view={view}
          seats={seats}
          canRematch={canRematch}
          onNext={actions.nextHand}
          onRematch={actions.rematch ? () => void actions.rematch!() : undefined}
          onLeave={leave}
          analysis={analysis}
        />
      )}

      {showSettings && (
        <Dialog label="Configurações" className="settings-sheet" onClose={() => setShowSettings(false)}>
          <h2>Configurações</h2>
          <SettingsForm />
          <div className="overlay-actions">
            <button className="btn primary" onClick={() => setShowSettings(false)}>
              Pronto
            </button>
          </div>
        </Dialog>
      )}

      {confirmExit && (
        <Dialog label="Sair da mesa" onClose={() => setConfirmExit(false)}>
          <h2>Vai largar a mesa?</h2>
          <p>{mode === 'online' ? 'Um bot segura tua vez até tu voltar.' : 'A partida fica salva pra continuar depois.'}</p>
          <div className="overlay-actions">
            <button className="btn primary" onClick={() => setConfirmExit(false)}>
              Fico
            </button>
            <button className="btn" onClick={leave}>
              Sair
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
