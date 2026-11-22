import { CONFIG } from '../config.js';
import { evolutionCost, gradeMultiplier } from './evolution.js';

const DIRS = ['east', 'west', 'south', 'north'];

// Phaser 의존 없는 순수 규칙. 적 72마리 × 템포 3배에서도 호출이 가볍도록 할당 없이 계산한다.
export function stageOf(actor) {
  return actor.stage ?? 1;
}

// a가 b를 먹을 수 있는가(겹침은 보지 않는다).
export function canEat(a, b, { reversed = false } = {}) {
  const sa = stageOf(a), sb = stageOf(b);
  const { ratio, stageOverride } = CONFIG.eating;
  if (sa === sb) return a.size >= b.size * (reversed ? 1 : ratio);
  if (sa > sb) return b.size < a.size * stageOverride;
  return a.size >= b.size * stageOverride;
}

// 두 원이 겹치고 한쪽이 다른 쪽을 먹을 수 있으면 [먹는 쪽, 먹히는 쪽], 아니면 null.
export function eatPair(a, b, opts) {
  const dx = a.x - b.x, dy = a.y - b.y, reach = a.size + b.size;
  if (dx * dx + dy * dy >= reach * reach) return null;
  const aEats = canEat(a, b, opts), bEats = canEat(b, a, opts);
  if (aEats && bEats) return a.size >= b.size ? [a, b] : [b, a];
  if (aEats) return [a, b];
  if (bEats) return [b, a];
  return null;
}

// 보물로 역전된 적(reversed)이 나보다 작아졌으면 단계와 상관없이 닿는 순간 내가 먹는다.
// combat.hit의 '역전' 표시와 같은 조건이라, 표시가 나오면 닿았을 때 반드시 플레이어가 먹는다.
export function reversalPair(player, enemy) {
  if (!enemy.reversed || enemy.size >= player.size) return null;
  const dx = player.x - enemy.x, dy = player.y - enemy.y, reach = player.size + enemy.size;
  return dx * dx + dy * dy < reach * reach ? [player, enemy] : null;
}

// 먹이 점수 = 요력. 크고 높은 단계일수록 크게 오른다.
export function preyValue({ size, stage = 1, grade = 'C', special = false, killedByTreasure = false }) {
  const s = CONFIG.score;
  let v = s.base * Math.pow(size / s.sizeRef, s.sizeExp) * (s.stageMult[stage] ?? 1) * (gradeMultiplier(grade) ?? 1);
  if (killedByTreasure) v *= s.treasureMult;
  if (special) v *= CONFIG.special.rewardMult;
  return Math.max(1, Math.round(v));
}

// preyValue에 그대로 넘길 수 있는 먹이 정보. 플레이어·적 모두 같은 모양으로 읽는다.
export function preyInfoOf(actor, killedByTreasure = false) {
  return {
    size: actor.size,
    stage: stageOf(actor),
    grade: actor.grade,
    special: !!actor.special,
    killedByTreasure,
    dir: actor.dir,
  };
}

// ---- 적의 성장(먹기 → 요력 → 진화·몸집 강화) ----
export function newDiet() {
  return { east: 0, west: 0, south: 0, north: 0 };
}

// 몸집 강화 비용: bodyBaseCost × bodyCostGrowth^레벨
export function bodyCostAt(level) {
  const l = CONFIG.levelUp;
  return l.bodyBaseCost * Math.pow(l.bodyCostGrowth, level);
}

// 식성 1위 방위. fallback이 동률 후보면 fallback을 우선한다. 식성이 모두 0이고 fallback도 없으면 null.
export function topDietDir(diet, fallback = null) {
  let best = DIRS.includes(fallback) ? fallback : null;
  let bestValue = best ? diet[best] ?? 0 : 0;
  for (const dir of DIRS) {
    const value = diet[dir] ?? 0;
    if (value > bestValue) {
      best = dir;
      bestValue = value;
    }
  }
  return best;
}

// 다음 단계 형태 하나. 1→2는 식성 1위 방위의 새끼, 2→3은 같은 방위의 3종 중 무작위. 다음 단계가 없으면 null.
export function pickEvolution(actor, forms, rng = Math.random) {
  const next = stageOf(actor) + 1;
  const pool = forms.filter((form) => form.stage === next);
  if (pool.length === 0) return null;
  const dir = stageOf(actor) === 1 ? topDietDir(actor.diet ?? newDiet(), actor.dir) : actor.dir;
  const same = pool.filter((form) => form.dir === dir);
  const list = same.length ? same : pool;
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

// 요력이 쌓인 적이 지금 할 일: 'evolve' | 'body' | null. 진화가 우선이다.
export function nextProgress(actor) {
  const stage = stageOf(actor);
  if (stage < 3 && actor.yoryeok >= evolutionCost(stage + 1)) return 'evolve';
  if (actor.yoryeok >= bodyCostAt(actor.bodyLevel ?? 0)) return 'body';
  return null;
}
