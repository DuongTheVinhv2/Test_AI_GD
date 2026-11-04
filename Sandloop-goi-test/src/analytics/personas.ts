import type { PersonaDef } from './types';

/**
 * The four skill groups of the GD data export (gd/csv, table 02), with the quit behaviour read back from table 03:
 * after a lost attempt about 20 % of the players stop for good, after a clear about 2 % leave the game.
 */
export const DEFAULT_PERSONAS: PersonaDef[] = [
  {
    id: 'random', name: 'Ngẫu nhiên', color: '#9aa7c2', share: 0.1,
    policy: 'random', lookDepth: 0, reserveSlots: 0, thinkMin: 0.5, thinkMax: 1.0, miss: 0,
    quitAfterLoss: 0.2, leaveAfterWin: 0.02, adProb: 0.35, buyProb: 0.15, waitProb: 0.3,
  },
  {
    id: 'casual', name: 'Phổ thông', color: '#3d9bff', share: 0.4,
    policy: 'exposed', lookDepth: 0, reserveSlots: 0, thinkMin: 0.6, thinkMax: 1.0, miss: 0,
    quitAfterLoss: 0.2, leaveAfterWin: 0.02, adProb: 0.4, buyProb: 0.2, waitProb: 0.25,
  },
  {
    id: 'careful', name: 'Cẩn thận', color: '#1f9d55', share: 0.35,
    policy: 'exposed', lookDepth: 1, reserveSlots: 1, thinkMin: 0.6, thinkMax: 1.4, miss: 0.04,
    quitAfterLoss: 0.2, leaveAfterWin: 0.02, adProb: 0.4, buyProb: 0.2, waitProb: 0.25,
  },
  {
    id: 'planner', name: 'Chơi giỏi', color: '#e8860c', share: 0.15,
    policy: 'exposed', lookDepth: 4, reserveSlots: 0, thinkMin: 0.4, thinkMax: 0.8, miss: 0.01,
    quitAfterLoss: 0.2, leaveAfterWin: 0.02, adProb: 0.4, buyProb: 0.25, waitProb: 0.25,
  },
];

export const PERSONA_COLORS = ['#3d9bff', '#1f9d55', '#e8860c', '#d6372c', '#9a71cc', '#00a3a3', '#c2569b', '#7b87a3'];

export const clonePersonas = (p: PersonaDef[]): PersonaDef[] => JSON.parse(JSON.stringify(p)) as PersonaDef[];

export function newPersona(index: number): PersonaDef {
  return {
    id: `p${Date.now().toString(36)}${index}`, name: `Nhóm mới ${index + 1}`, color: PERSONA_COLORS[index % PERSONA_COLORS.length], share: 0.1,
    policy: 'exposed', lookDepth: 0, reserveSlots: 0, thinkMin: 0.6, thinkMax: 1.2, miss: 0.05,
    quitAfterLoss: 0.2, leaveAfterWin: 0.02, adProb: 0.4, buyProb: 0.2, waitProb: 0.25,
  };
}
