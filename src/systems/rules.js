import { CONFIG } from '../config.js';
import { enemyEvolutionCost, gradeMultiplier, topDietDir } from './evolution.js';

export { topDietDir };

// Phaser 의존 없는 순수 규칙. 적 72마리 × 템포 3배에서도 호출이 가볍도록 할당 없이 계산한다.
export function stageOf(actor) {
  return actor.stage ?? 1;
}

// 하위 단계가 상위 단계를 먹으려면 상위보다 몇 배 커야 하는가. 단계 차 Δ에 따라 stageOverride + stageOverrideStep × (Δ - 1)배
// (사용자 결정 2026-11-23: 단계 차 1·2·3·4에 2·3·4·5배). 먹기 판정은 이 함수 한 곳에서만 단계 차를 본다.
export function stageOverrideMult(stageGap) {
  const { stageOverride, stageOverrideStep = 0 } = CONFIG.eating;
  return stageOverride + stageOverrideStep * (Math.max(1, stageGap) - 1);
}

// a가 b를 먹을 수 있는가(겹침은 보지 않는다).
export function canEat(a, b, { reversed = false } = {}) {
  const sa = stageOf(a), sb = stageOf(b);
  const { ratio } = CONFIG.eating;
  if (sa === sb) return a.size >= b.size * (reversed ? 1 : ratio);
  if (sa > sb) return b.size < a.size * stageOverrideMult(sa - sb);
  return a.size >= b.size * stageOverrideMult(sb - sa);
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

// 먹이 점수 = 요력. 먹이가 내 몸에 비해 클수록, 높은 단계일수록 크게 오른다(변경 이력 18).
//   size    먹이 크기(보물에 깎이기 전 처음 크기, combat.rewardSizeOf)
//   mySize  먹는 순간 먹는 쪽(플레이어·적)의 크기. 없거나 0 이하면 sizeRef(시작 크기)로 본다.
//   myStage 먹는 쪽의 단계. 먹이가 나보다 높은 단계면 단계 배율은 score.aboveStageCap을 넘지 못한다(없으면 상한 없음).
export function preyValue({ size, stage = 1, grade = 'C', special = false, killedByTreasure = false, mySize, myStage }) {
  const s = CONFIG.score;
  const mine = mySize > 0 ? mySize : s.sizeRef;
  let mult = s.stageMult[stage] ?? 1;
  if (myStage > 0 && stage > myStage) mult = Math.min(mult, s.aboveStageCap);
  let v = s.base * Math.pow(size / mine, s.relExp) * mult * (gradeMultiplier(grade) ?? 1);
  if (killedByTreasure) v *= s.treasureMult;
  if (special) v *= CONFIG.special.rewardMult;
  return Math.max(1, Math.round(v));
}

// 적이 먹어서 쌓는 요력(적의 자가 진화·몸집 강화용). 변경 이력 18 이전의 절대 크기 식 그대로다: 플레이어 요력 곡선이 바뀌어도 적의 성장 속도는 같다(CONFIG.enemyScore).
export function enemyPreyValue({ size, stage = 1, grade = 'C', special = false }) {
  const s = CONFIG.enemyScore;
  let v = s.base * Math.pow(size / s.sizeRef, s.sizeExp) * (s.stageMult[stage] ?? 1) * (gradeMultiplier(grade) ?? 1);
  if (special) v *= CONFIG.special.rewardMult;
  return Math.max(1, Math.round(v));
}

// preyValue에 그대로 넘길 수 있는 먹이 정보. 플레이어·적 모두 같은 모양으로 읽는다. mySize는 먹는 쪽의 먹기 직전 크기다.
export function preyInfoOf(actor, killedByTreasure = false, mySize) {
  return {
    size: actor.size,
    stage: stageOf(actor),
    grade: actor.grade,
    special: !!actor.special,
    killedByTreasure,
    dir: actor.dir,
    mySize,
  };
}

// ---- 적의 성장(먹기 → 요력 → 진화·몸집 강화) ----
export function newDiet() {
  return { east: 0, west: 0, south: 0, north: 0 };
}

// 몸집 강화 비용: bodyBaseCost × enhanceCostGrowth^레벨(모든 강화가 같은 배수로 비싸진다, 변경 이력 18)
export function bodyCostAt(level) {
  return CONFIG.levelUp.bodyBaseCost * Math.pow(CONFIG.enhanceCostGrowth, level);
}

// 다음 단계 형태 하나(적의 자가 진화, 3택을 쓰지 않는다). 식성 1위 방위가 지금 방위와 같으면 지금 줄기의 다음 단계 중 무작위,
// 다르면 그 방위 줄기 4개의 입구 중 무작위. 줄기를 모르면(형태 id가 없으면) 같은 방위의 다음 단계 중 무작위. 다음 단계가 없으면 null.
export function pickEvolution(actor, forms, rng = Math.random) {
  const next = stageOf(actor) + 1;
  const pool = forms.filter((form) => form.stage === next);
  if (pool.length === 0) return null;
  const cur = actor.formId ? forms.find((form) => form.id === actor.formId) : null;
  const top = topDietDir(actor.diet ?? newDiet(), actor.dir);
  let list = [];
  if (top && top !== actor.dir) list = pool.filter((form) => form.dir === top && form.entry);
  else if (cur?.stem) list = pool.filter((form) => form.stem === cur.stem);
  if (!list.length) list = pool.filter((form) => form.dir === (top ?? actor.dir));
  if (!list.length) list = pool;
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

// 요력이 쌓인 적이 지금 할 일: 'evolve' | 'body' | null. 진화가 우선이다.
// playerStage를 주면 적의 자가 진화 상한은 min(pace.maxStage, 플레이어 단계 + enemy.selfEvolveLead)다(5단계 용이 2단계 판에 안 생기게).
// 안 주면 pace.maxStage까지다.
export function nextProgress(actor, playerStage) {
  const stage = stageOf(actor);
  const top = CONFIG.pace.maxStage;
  const limit = Number.isFinite(playerStage) ? Math.min(top, Math.max(1, playerStage) + CONFIG.enemy.selfEvolveLead) : top;
  if (stage < limit && actor.yoryeok >= enemyEvolutionCost(stage + 1)) return 'evolve';
  if (actor.yoryeok >= bodyCostAt(actor.bodyLevel ?? 0)) return 'body';
  return null;
}
