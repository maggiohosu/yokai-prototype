import { CONFIG } from '../config.js';
import { effectiveLevel } from './enhance-curve.js';

const V = CONFIG.vitality;

// 생명력 최대치(초) = baseSec + 레벨당 perLevelSec × 효과 레벨(enhance-curve.effectiveLevel: +10까지 1레벨 1, 그 위는 절반). +10에서 10초, +20에서 13초.
export function vitalityMax(level = 0) {
  return V.baseSec + V.perLevelSec * effectiveLevel(level);
}

export function createVitality(max) {
  return { state: 'grace', value: max, sinceMeal: 0, drainStart: max, speedMult: 1, settleRate: 0 };
}

// 접촉해서 직접 삼킨 먹이만 부른다. 무기로 줄이기 전의 보상 크기와 구분한다.
export function feedVitality(hunger, preySize, playerSize, max) {
  const ratio = preySize / playerSize;
  let share = V.smallMealRestore;
  if (ratio >= V.bigMealRatio) share = 1;
  else if (ratio >= V.smallMealRatio) share = V.similarMealRestore;
  hunger.value = Math.min(max, hunger.value + max * share);
  if (hunger.state !== 'grace') hunger.settleRate = (hunger.speedMult - 1) / V.settleSec;
  hunger.sinceMeal = 0;
  hunger.state = 'grace';
}

// 발사체가 빈 게이지를 맞힌 경우에만 몸집 피해를 준다. 맞아도 마지막 식사 시각은 그대로다.
export function hitVitality(hunger) {
  if (hunger.value <= 0) return true;
  hunger.value = Math.max(0, hunger.value - V.hitDrainSec);
  return false;
}

// 실제 플레이 시간만 받는다. 한 프레임에서 두 경계를 넘어도 몸이 줄어들 시간만 반환한다.
export function stepHunger(hunger, elapsed, max) {
  hunger.value = Math.min(hunger.value, max);
  const graceLeft = Math.max(0, V.hungerGraceSec - hunger.sinceMeal);
  hunger.sinceMeal += elapsed;
  if (hunger.sinceMeal < V.hungerGraceSec) {
    hunger.speedMult = Math.max(1, hunger.speedMult - hunger.settleRate * elapsed);
    return 0;
  }
  if (hunger.state === 'grace') hunger.drainStart = hunger.value;
  const drain = Math.max(0, elapsed - graceLeft);
  const remaining = hunger.value;
  hunger.value = Math.max(0, remaining - drain);
  if (hunger.value > 0) {
    hunger.state = 'draining';
    hunger.speedMult = 1 + (V.drainingSpeed - 1) * (1 - hunger.value / hunger.drainStart);
    return 0;
  }
  hunger.state = 'starving';
  hunger.speedMult = V.starvingSpeed;
  return Math.max(0, drain - remaining);
}

export function starvingSize(size, seconds, stage) {
  const stageStart = stage === 1 ? CONFIG.player.startSize : CONFIG.levelUp.evolveResetSize;
  const floor = Math.max(stageStart, CONFIG.special.deathSize);
  if (size <= floor) return size;
  return Math.max(floor, size * (1 - V.shrinkPerSec) ** seconds);
}
