import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SavedResult } from './results';
import type { SavedRoom } from './rooms/saved';

export const STATE_VERSION = 1;

/** Tudo que vive só em memória e não pode sumir num reinício: mesas em andamento e resultados ainda não gravados. */
export interface SavedState {
  version: typeof STATE_VERSION;
  savedAt: string;
  rooms: SavedRoom[];
  pendingResults: SavedResult[];
}

/**
 * Arquivo de estado do servidor (num volume, em produção). Escrita atômica: grava num temporário e renomeia,
 * então um desligamento no meio da escrita nunca deixa o arquivo pela metade.
 */
export class StateStore {
  private readonly file: string;

  constructor(
    dir: string,
    private readonly log: (msg: string, err?: unknown) => void,
  ) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, 'estado.json');
  }

  load(): SavedState | null {
    let raw: string;
    try {
      raw = readFileSync(this.file, 'utf8');
    } catch {
      return null;
    }
    try {
      const state = JSON.parse(raw) as SavedState;
      if (state?.version !== STATE_VERSION || !Array.isArray(state.rooms) || !Array.isArray(state.pendingResults)) {
        this.log(`arquivo de estado em formato desconhecido, ignorando: ${this.file}`);
        return null;
      }
      return state;
    } catch (err) {
      this.log(`arquivo de estado corrompido, ignorando: ${this.file}`, err);
      return null;
    }
  }

  /** Síncrono de propósito: roda no desligamento e no tratamento de erro fatal, onde não dá pra esperar. */
  save(state: Omit<SavedState, 'version' | 'savedAt'>): void {
    const tmp = `${this.file}.tmp`;
    const body: SavedState = { version: STATE_VERSION, savedAt: new Date().toISOString(), ...state };
    try {
      writeFileSync(tmp, JSON.stringify(body));
      renameSync(tmp, this.file);
    } catch (err) {
      this.log('não deu pra salvar o estado do servidor', err);
    }
  }
}
