import { useEffect, useRef } from 'react';
import type { PlayerView } from '@domino/engine';
import { teamOf } from '@domino/engine';
import { DEFAULT_AVATAR_ID, EMOTES } from '@domino/shared';
import { relativeSeat } from '../../game/seats';
import { music } from '../../lib/music';
import { useSettings } from '../../lib/settings';
import { sound, vibrate } from '../../lib/sound';
import { voice } from '../../lib/voice';
import { useTable } from '../../store/table';

/** Estéreo da fala pela cadeira relativa a mim: 1 direita, 2 parceiro (em frente), 3 esquerda. */
const VOICE_PAN = [0, 0.5, 0, -0.5] as const;
/** Sons e vibração a partir das mudanças da mesa. */
export function useTableEffects(view: PlayerView | null) {
  const lastMove = useTable((s) => s.lastMove);
  const emotes = useTable((s) => s.emotes);
  const tableAvatars = useTable((s) => s.seats.map((x) => x?.avatarId ?? '').join(','));
  // Frases que já estavam na mesa antes da tela abrir não falam de novo.
  const heard = useRef(Math.max(0, ...useTable.getState().emotes.map((e) => e.key)));
  const myTurn = !!view && !view.result && view.turn === view.seat;
  const winner = view?.winner ?? null;

  useEffect(() => {
    if (!lastMove) return;
    if (lastMove.move.type === 'pass') sound.pass();
    else sound.clack(!!useTable.getState().view?.result);
  }, [lastMove]);

  useEffect(() => {
    if (myTurn) {
      sound.turn();
      vibrate(60);
    }
  }, [myTurn, view?.log.length]);

  useEffect(() => {
    if (winner !== null && view) sound.fanfare(winner === teamOf(view.seat));
  }, [winner]);

  // Liga/desliga junto com o mudo da mesa e as preferências (start só toca se tudo estiver ligado).
  const soundOn = useSettings((st) => st.sound);
  const musicOn = useSettings((st) => st.music);
  const ambienceOn = useSettings((st) => st.ambience);
  useEffect(() => {
    sound.startAmbience();
    music.start();
    return () => {
      sound.stopAmbience();
      music.stop();
    };
  }, [soundOn, musicOn, ambienceOn]);

  useEffect(() => {
    voice.preload(tableAvatars.split(',').filter(Boolean), EMOTES.map((e) => e.id));
  }, [tableAvatars]);

  // Cada frase nova fala com a voz do personagem, vindo do lado onde ele senta, e a boca mexe só enquanto fala.
  useEffect(() => {
    const { seats, view: v, setSpeaking } = useTable.getState();
    for (const e of emotes) {
      if (e.key <= heard.current) continue;
      heard.current = e.key;
      const rel = v ? relativeSeat(e.seat, v.seat) : 0;
      void voice
        .say({ avatarId: seats[e.seat]?.avatarId ?? DEFAULT_AVATAR_ID, emoteId: e.emoteId, text: e.text, pan: VOICE_PAN[rel] })
        .then((seconds) => setSpeaking(e.seat, seconds * 1000));
    }
  }, [emotes]);
}
