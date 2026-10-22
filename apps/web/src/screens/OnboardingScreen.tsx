import { useState } from 'react';
import { useLocation } from 'wouter';
import { DEFAULT_AVATAR_ID, NICKNAME_MAX, avatarById, validateNickname } from '@domino/shared';
import { Avatar } from '../components/Avatar';
import { AvatarPicker } from '../components/AvatarPicker';
import { useProfile } from '../store/profile';

export function OnboardingScreen() {
  const { register, claim } = useProfile();
  const existing = useProfile((s) => (s.token ? s.profile : null));
  const [, navigate] = useLocation();
  const [avatarId, setAvatarId] = useState(DEFAULT_AVATAR_ID);
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [transfer, setTransfer] = useState(false);
  const [code, setCode] = useState('');

  /** Já tem jogador neste aparelho: trocar sem querer jogava fora rating e estatísticas. */
  const replaceOk = () =>
    !existing ||
    window.confirm(
      `Este aparelho já tem o jogador ${existing.nickname}#${existing.tag}. Continuar troca ele por outro, e ele só volta com um código de transferência. Continuar?`,
    );

  const done = () => {
    const next = sessionStorage.getItem('dm:after-onboarding');
    sessionStorage.removeItem('dm:after-onboarding');
    navigate(next ?? '/', { replace: true });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateNickname(nickname);
    if (!check.ok) return setError(check.error);
    if (!replaceOk()) return;
    setBusy(true);
    setError(null);
    try {
      await register({ nickname: check.nickname, avatarId });
      done();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replaceOk()) return;
    setBusy(true);
    setError(null);
    try {
      await claim(code);
      done();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="screen onboarding">
      <div className="hero">
        <Avatar id={avatarId} size={96} />
        <div>
          <h1>Chega mais, mané!</h1>
          <p>A mesa de concreto da Praça XV tá te esperando. Escolhe teu personagem e como a turma vai te chamar.</p>
        </div>
      </div>

      {!transfer ? (
        <form onSubmit={submit} className="card">
          <label className="field">
            <span>Apelido</span>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={NICKNAME_MAX}
              placeholder="Ex.: Zé da Lagoa"
              autoComplete="nickname"
              required
            />
          </label>
          <h2 className="section-title">Personagem: {avatarById(avatarId).name}</h2>
          <p className="muted">{avatarById(avatarId).blurb}</p>
          <AvatarPicker value={avatarId} onChange={setAvatarId} wins={0} />
          {error && <p className="error">{error}</p>}
          <button className="btn primary block" disabled={busy}>
            {busy ? 'Sentando à mesa…' : 'Bora pra praça!'}
          </button>
          <button type="button" className="btn link" onClick={() => setTransfer(true)}>
            Já jogo em outro aparelho
          </button>
        </form>
      ) : (
        <form onSubmit={submitCode} className="card">
          <p>
            No outro aparelho, abre <strong>Perfil → Levar perfil pra outro aparelho</strong> e digita aqui o código.
          </p>
          <label className="field">
            <span>Código</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={8}
              placeholder="ABCD2345"
              autoCapitalize="characters"
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn primary block" disabled={busy}>
            Trazer meu perfil
          </button>
          <button type="button" className="btn link" onClick={() => setTransfer(false)}>
            Voltar
          </button>
        </form>
      )}
    </main>
  );
}
