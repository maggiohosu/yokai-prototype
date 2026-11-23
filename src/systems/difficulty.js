import { CONFIG } from '../config.js';

export const DIFFICULTY = CONFIG.difficulty;

export const normalizeDifficulty = (id) => (DIFFICULTY.ids.includes(id) ? id : DIFFICULTY.default);

function scaleWeights(weights, mark, multiplier) {
  const scaled = weights.map((w, i) => (mark(i) ? w * multiplier : w));
  const sum = scaled.reduce((a, b) => a + b, 0);
  return sum > 0 ? scaled.map((w) => w / sum) : scaled;
}

// 적 단계 가중치(인덱스 0 = 1단계)를 난이도에 맞게 바꾼다. 이지는 낮은 단계, 노말·하드는 높은 단계의 가중치를 높인다.
export function stageWeightsFor(playerStage, difficulty, table = CONFIG.enemy.stageWeights) {
  const stage = Math.min(CONFIG.pace.maxStage, Math.max(1, Math.round(playerStage) || 1));
  const weights = table[stage];
  if (!weights) return null;
  if (difficulty === 'easy') return scaleWeights(weights, i => i + 1 < stage, DIFFICULTY.mult);
  const strong = DIFFICULTY.strongMult * (difficulty === 'hard' ? DIFFICULTY.mult : 1);
  return scaleWeights(weights, i => i + 1 > stage, strong);
}

// 기존 이지·하드 크기 보정은 같은 단계에만 붙는다. 추가 큰 적 보정은 노말·하드의 모든 단계에 붙는다.
export function sizeWeightsFor(weights, difficulty, sameStage = true) {
  if (difficulty === 'easy') return sameStage ? scaleWeights(weights, i => i === 0, DIFFICULTY.mult) : weights;
  const strong = DIFFICULTY.strongMult * (difficulty === 'hard' && sameStage ? DIFFICULTY.mult : 1);
  return scaleWeights(weights, i => i === weights.length - 1, strong);
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
