import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { PlayerProfile, UpdatePlayerBody } from '@domino/shared';
import { ApiError, api, isUnreachable, setApiToken } from '../lib/api';
import { resyncPush } from '../lib/push';
import { load, save } from '../lib/storage';

interface LocalIdentity {
  nickname: string;
  avatarId: string;
}

interface ProfileStore {
  token: string | null;
  profile: PlayerProfile | null;
  /** O que foi escolhido no aparelho — vale mesmo sem servidor (treino offline). */
  local: LocalIdentity | null;
  /** Servidor respondeu na última tentativa. */
  online: boolean;
  register: (identity: LocalIdentity) => Promise<void>;
  sync: () => Promise<void>;
  update: (body: UpdatePlayerBody) => Promise<void>;
  claim: (code: string) => Promise<void>;
  setProfile: (profile: PlayerProfile) => void;
  /** Apaga a conta no servidor e esquece a identidade neste aparelho (senão o app recadastraria sozinho). */
  deleteAccount: () => Promise<void>;
}

const initialToken = load<string | null>('dm:token', null);
setApiToken(initialToken);

/** Renova o token quando ele tem mais que isso (vence em 365 dias). */
const RENEW_AFTER_MS = 7 * 24 * 60 * 60_000;

/** Data de emissão do JWT (só lê, não confere assinatura: quem confere é o servidor). */
const issuedAt = (token: string): number | null => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as { iat?: unknown };
    return typeof payload.iat === 'number' ? payload.iat * 1000 : null;
  } catch {
    return null;
  }
};

/** 401 em que o jogador antigo não tem mais volta: dá pra recadastrar sem perder nada. */
const identityGone = (err: ApiError) =>
  err.status === 404 || (err.status === 401 && (err.code === 'player_not_found' || err.code === 'token_revoked'));

export const useProfile = create<ProfileStore>((set, get) => {
  const setToken = (token: string | null) => {
    setApiToken(token);
    save('dm:token', token);
    set({ token });
  };
  const setLocal = (local: LocalIdentity) => {
    save('dm:local', local);
    set({ local });
  };
  // Um cadastro/sincronização por vez: chamadas simultâneas (abertura do app, evento online, socket) criavam contas duplicadas.
  let registering: Promise<void> | null = null;
  let syncing: Promise<void> | null = null;
  /** Inscrição de push reenviada nesta sessão (pode ter sido trocada pelo navegador enquanto o app estava fechado). */
  let pushResynced = false;

  return {
    token: initialToken,
    profile: load<PlayerProfile | null>('dm:profile', null),
    local: load<LocalIdentity | null>('dm:local', null),
    online: navigator.onLine,

    setProfile: (profile) => {
      save('dm:profile', profile);
      setLocal({ nickname: profile.nickname, avatarId: profile.avatarId });
      set({ profile, online: true });
    },

    register: (identity) => {
      registering ??= (async () => {
        setLocal(identity);
        try {
          const res = await api.createPlayer(identity);
          setToken(res.token);
          get().setProfile(res.player);
          void resyncPush().catch(() => undefined);
        } catch (err) {
          // Sem servidor dá pra treinar offline; o cadastro é refeito no próximo sync.
          if (isUnreachable(err)) set({ online: false });
          else throw err;
        }
      })().finally(() => {
        registering = null;
      });
      return registering;
    },

    sync: () => {
      syncing ??= (async () => {
        const { token, local } = get();
        try {
          if (token) {
            get().setProfile(await api.me());
            if (!pushResynced) {
              pushResynced = true;
              void resyncPush().catch(() => undefined);
            }
            const iat = issuedAt(token);
            if (iat !== null && Date.now() - iat > RENEW_AFTER_MS) setToken((await api.renewToken()).token);
          } else if (local) await get().register(local);
        } catch (err) {
          if (!(err instanceof ApiError)) {
            console.error('[perfil] falha ao sincronizar', err);
            return;
          }
          if (isUnreachable(err)) set({ online: false });
          else if (identityGone(err)) {
            // Banco zerado ou jogador levado pra outro aparelho: cadastra de novo com a identidade local.
            setToken(null);
            if (local) await get().register(local).catch((e: unknown) => console.error('[perfil] recadastro falhou', e));
          } else if (err.status === 401) {
            // Token recusado sem ser caso de recadastro (segredo trocado, vencido): não joga a identidade fora.
            // Guarda uma cópia e segue offline; consertando o servidor, o mesmo token volta a valer.
            if (token) save('dm:token:old', token);
            set({ online: false });
          }
        }
      })().finally(() => {
        syncing = null;
      });
      return syncing;
    },

    update: async (body) => {
      const local = get().local;
      if (!get().token) {
        // Sem conta no servidor só apelido e personagem ficam no aparelho.
        const { pushPrefs: _, ...identity } = body;
        if (local) setLocal({ ...local, ...identity });
        return;
      }
      // Só grava localmente o que o servidor aceitou (apelido recusado não fica no aparelho).
      get().setProfile(await api.updateMe(body));
    },

    claim: async (code) => {
      const res = await api.claim(code.trim().toUpperCase());
      setToken(res.token);
      get().setProfile(res.player);
      void resyncPush().catch(() => undefined);
    },

    deleteAccount: async () => {
      await api.deleteMe();
      setToken(null);
      save('dm:local', null);
      save('dm:offline', null);
      set({ local: null, profile: null });
    },
  };
});

export const useIdentity = () =>
  useProfile(
    useShallow((s) => ({
      nickname: s.profile?.nickname ?? s.local?.nickname ?? 'Mané',
      avatarId: s.profile?.avatarId ?? s.local?.avatarId ?? 'veterano',
      tag: s.profile?.tag ?? null,
    })),
  );
