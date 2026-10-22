import type { PlayerStats } from './protocol';

export interface Achievement {
  id: string;
  icon: string;
  label: string;
  description: string;
  /** Número das estatísticas que conta pra essa medalha. */
  stat: keyof PlayerStats;
  goal: number;
}

/** Medalhas tiradas das estatísticas que o servidor já guarda (online e treino). */
export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'estreia', icon: '🎉', label: 'Estreia', description: 'Ganhou a primeira partida online.', stat: 'wins', goal: 1 },
  { id: 'embalado', icon: '🔥', label: 'Embalado', description: 'Ganhou 3 partidas online seguidas.', stat: 'bestStreak', goal: 3 },
  { id: 'carroceiro', icon: '🛞', label: 'Carroceiro', description: 'Bateu de carroça 5 vezes.', stat: 'carrocas', goal: 5 },
  { id: 'laelo', icon: '🎯', label: 'Lá-e-ló de mestre', description: 'Bateu de lá-e-ló 3 vezes.', stat: 'laelos', goal: 3 },
  { id: 'cruzada', icon: '➕', label: 'Cruzada!', description: 'Bateu de cruzada (essa é rara).', stat: 'cruzadas', goal: 1 },
  { id: 'treinado', icon: '🤖', label: 'Treinou bonito', description: 'Ganhou 10 treinos contra os bots.', stat: 'practiceWins', goal: 10 },
  { id: 'fregues', icon: '☕', label: 'Freguês da praça', description: 'Jogou 25 partidas online.', stat: 'games', goal: 25 },
  { id: 'veterano', icon: '🏛️', label: 'Veterano da Praça XV', description: 'Jogou 100 partidas online.', stat: 'games', goal: 100 },
];

export interface AchievementProgress extends Achievement {
  /** Quanto já tem (no máximo o objetivo). */
  current: number;
  done: boolean;
}

export const achievementProgress = (stats: PlayerStats): AchievementProgress[] =>
  ACHIEVEMENTS.map((a) => {
    const current = Math.min(stats[a.stat], a.goal);
    return { ...a, current, done: current >= a.goal };
  });
