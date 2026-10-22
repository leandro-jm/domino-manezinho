import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useOnline } from '../store/online';
import { Avatar } from './Avatar';

/** Sem resposta, o convite some sozinho (a mesa pode ter enchido). */
const INVITE_TTL_MS = 45_000;

/** "Fulano te chamou pra mesa": aparece em qualquer tela do app aberto. */
export function InviteToast() {
  const invite = useOnline((s) => s.invite);
  const dismiss = useOnline((s) => s.dismissInvite);
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (!invite) return;
    const t = setTimeout(dismiss, INVITE_TTL_MS);
    return () => clearTimeout(t);
  }, [invite, dismiss]);

  if (!invite || location === `/sala/${invite.code}`) return null;
  return (
    <div className="invite-toast" role="alertdialog" aria-label="Convite pra mesa">
      <Avatar id={invite.from.avatarId} size={40} />
      <p>
        <strong>{invite.from.nickname}</strong> te chamou pra mesa <strong className="code">{invite.code}</strong>
      </p>
      <div className="invite-actions">
        <button
          className="btn small primary"
          onClick={() => {
            dismiss();
            navigate(`/sala/${invite.code}`);
          }}
        >
          Entrar
        </button>
        <button className="btn small" onClick={dismiss}>
          Agora não
        </button>
      </div>
    </div>
  );
}
