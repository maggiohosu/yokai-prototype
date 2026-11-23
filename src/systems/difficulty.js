import { CONFIG } from '../config.js';

export const DIFFICULTY = CONFIG.difficulty;

export const normalizeDifficulty = (id) => (DIFFICULTY.ids.includes(id) ? id : DIFFICULTY.default);

function scaleWeights(weights, mark) {
  const scaled = weights.map((w, i) => (mark(i) ? w * DIFFICULTY.mult : w));
  const sum = scaled.reduce((a, b) => a + b, 0);
  return sum > 0 ? scaled.map((w) => w / sum) : scaled;
}

// 적 단계 가중치(인덱스 0 = 1단계)를 난이도에 맞게 바꾼다. 이지는 플레이어보다 낮은 단계, 하드는 높은 단계를 늘린다.
export function stageWeightsFor(playerStage, difficulty, table = CONFIG.enemy.stageWeights) {
  const stage = Math.min(CONFIG.pace.maxStage, Math.max(1, Math.round(playerStage) || 1));
  const weights = table[stage];
  if (!weights) return null;
  if (difficulty === 'easy') return scaleWeights(weights, (i) => i + 1 < stage);
  if (difficulty === 'hard') return scaleWeights(weights, (i) => i + 1 > stage);
  return weights;
}

// 크기 구간 가중치(작은/비슷한/큰)를 난이도에 맞게 바꾼다. 이지는 작은 적, 하드는 큰 적 구간을 늘린다.
export function sizeWeightsFor(weights, difficulty) {
  if (difficulty === 'easy') return scaleWeights(weights, (i) => i === 0);
  if (difficulty === 'hard') return scaleWeights(weights, (i) => i === weights.length - 1);
  return weights;
}

export const hasLives = (difficulty) => difficulty === 'hard';

export function livesFor(difficulty) {
  return hasLives(difficulty) ? DIFFICULTY.hardLives : null;
}

export function onRunEnd(progress, outcome) {
  const start = livesFor(progress.difficulty);
  if (start === null) return { livesLeft: null, erased: false };
  const lives = progress.lives ?? start;
  const livesLeft = outcome === 'defeat' ? Math.max(0, lives - 1) : lives;
  return { livesLeft, erased: livesLeft === 0 };
}
