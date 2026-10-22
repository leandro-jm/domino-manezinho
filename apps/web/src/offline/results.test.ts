import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PracticeResultBody } from '@domino/shared';

const practice = vi.fn();
const setProfile = vi.fn();

vi.mock('../lib/api', async (orig) => ({ ...(await orig<typeof import('../lib/api')>()), api: { practice } }));
vi.mock('../store/profile', () => ({ useProfile: { getState: () => ({ token: 'tok', setProfile }) } }));

const { ApiError } = await import('../lib/api');
const { flushPracticeResults, reportPractice } = await import('./results');

const result = (won: boolean): PracticeResultBody => ({ won, carrocas: 0, laelos: 0, cruzadas: 0 });
const stored = () => JSON.parse(localStorage.getItem('dm:practice:pending') ?? '[]') as PracticeResultBody[];

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  });
  practice.mockReset();
  setProfile.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('fila de treinos', () => {
  it('sem rede guarda o resultado e manda quando a conexão volta', async () => {
    practice.mockRejectedValue(new ApiError('sem rede', 0));
    await reportPractice(result(true));
    expect(stored()).toEqual([result(true)]);

    practice.mockResolvedValue({ id: 'eu' });
    await flushPracticeResults();
    expect(practice).toHaveBeenLastCalledWith(result(true));
    expect(setProfile).toHaveBeenCalledWith({ id: 'eu' });
    expect(stored()).toEqual([]);
  });

  it('resultado recusado pelo servidor sai da fila; os outros seguem', async () => {
    practice.mockRejectedValue(new ApiError('sem rede', 0));
    await reportPractice(result(false));
    await reportPractice(result(true));
    practice.mockRejectedValueOnce(new ApiError('inválido', 400)).mockResolvedValue({ id: 'eu' });
    await flushPracticeResults();
    expect(practice).toHaveBeenLastCalledWith(result(true));
    expect(stored()).toEqual([]);
  });
});
