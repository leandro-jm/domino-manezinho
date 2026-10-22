import { beforeEach, describe, expect, it, vi } from 'vitest';

const data = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => data.get(k) ?? null,
  setItem: (k: string, v: string) => void data.set(k, v),
  removeItem: (k: string) => void data.delete(k),
});
const deleteMe = vi.fn(async () => ({}));
vi.mock('../lib/api', async (orig) => ({ ...(await orig<typeof import('../lib/api')>()), api: { deleteMe } }));

const { useProfile } = await import('./profile');

beforeEach(() => {
  data.clear();
  deleteMe.mockClear();
});

describe('perfil', () => {
  it('apagar a conta esquece a identidade no aparelho (senão o app recadastraria sozinho)', async () => {
    data.set('dm:offline', '{"treino":true}');
    useProfile.setState({ token: 'tok', local: { nickname: 'Saindo', avatarId: 'mane' } });
    await useProfile.getState().deleteAccount();
    expect(deleteMe).toHaveBeenCalledOnce();
    expect(useProfile.getState()).toMatchObject({ token: null, local: null, profile: null });
    expect(data.has('dm:token')).toBe(false);
    expect(data.has('dm:local')).toBe(false);
    expect(data.has('dm:offline')).toBe(false);
  });

  it('sem conta no servidor, só apelido e personagem ficam no aparelho', async () => {
    useProfile.setState({ token: null, local: { nickname: 'Offline', avatarId: 'mane' } });
    await useProfile.getState().update({ nickname: 'Novo', pushPrefs: { turn: false } });
    expect(useProfile.getState().local).toEqual({ nickname: 'Novo', avatarId: 'mane' });
    expect(JSON.parse(data.get('dm:local')!)).toEqual({ nickname: 'Novo', avatarId: 'mane' });
  });
});
