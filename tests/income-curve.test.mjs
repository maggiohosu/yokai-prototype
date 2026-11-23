import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { preyValue } from '../src/systems/rules.js';
import { heraldBonusYoryeok } from '../src/systems/herald.js';
import { createResonanceState, recordMeal } from '../src/systems/resonance.js';
import { GRADE_MULT } from '../src/systems/tuning-evolution.js';
import { INCOME_RUNS } from './fixtures-income.mjs';

// 요력 보상 곡선 재설계(docs/plan.md 변경 이력 18, docs/balance-v4.md 18절)의 분당 요력 범위 시험.
// 고정 자료(tests/fixtures-income.mjs)는 실제 판(봇, 노말)의 먹기 기록이다. 같은 기록에 옛 식(절대 크기)과 새 식(내 크기 대비)을 모두 적용해 분당 요력의 비율을 본다.
// 옛 식은 이 시험 안에 상수로 박아 둔다(설정에서 지웠다): 10 × (크기 / (20/3))^1.6 × 단계 배율(1·4·16·48·128) × 등급 × (보물 처치 1.5) × (특수 적 8).
const LEGACY = { base: 10, ref: 20 / 3, exp: 1.6, stage: { 1: 1, 2: 4, 3: 16, 4: 48, 5: 128 } };

const legacyGain = (m) => Math.max(1, Math.round(LEGACY.base * (m.size / LEGACY.ref) ** LEGACY.exp * LEGACY.stage[m.stage] * GRADE_MULT[m.grade]
  * (m.treasure ? CONFIG.score.treasureMult : 1) * (m.special ? CONFIG.special.rewardMult : 1)));
const newGain = (m) => preyValue({ size: m.size, stage: m.stage, grade: m.grade, special: !!m.special, killedByTreasure: !!m.treasure, mySize: m.mySize, myStage: m.myStage });

// 한 판의 요력 합: 기본 요력 + 대요괴 보너스 + 공명 보너스(아군이 먹은 것은 기본 요력만 내 것이다).
function total(run, gainOf) {
  const state = createResonanceState();
  let sum = 0;
  for (const [t, size, stage, grade, special, treasure, ally, herald, dir, mySize] of run.meals) {
    const m = { size, stage, grade, special, treasure, mySize, myStage: run.stage };
    const g = gainOf(m);
    sum += g;
    if (ally) continue;
    if (herald) sum += heraldBonusYoryeok(g);
    const hit = recordMeal(state, { dir, gain: g }, t);
    if (hit) sum += hit.bonus;
  }
  return sum;
}

// 단계(들)의 분당 요력 = 각 판의 (요력 합 / window)의 평균
function perMinute(stages, gainOf) {
  const runs = INCOME_RUNS.filter((r) => stages.includes(r.stage));
  assert.ok(runs.length >= 4 * stages.length, `${stages} 판 수`);
  return runs.reduce((a, r) => a + total(r, gainOf) / r.window * 60, 0) / runs.length;
}
const ratio = (stages) => perMinute(stages, newGain) / perMinute(stages, legacyGain);

test('고정 자료: 단계마다 4판, 먹기 기록의 단계·시각이 정상이다', () => {
  for (const stage of [1, 2, 3, 4, 5]) assert.equal(INCOME_RUNS.filter((r) => r.stage === stage).length, 4);
  for (const run of INCOME_RUNS) {
    assert.ok(run.window > 0 && run.meals.length >= 3, `${run.stage}단계 ${run.seed}`);
    let last = 0;
    for (const [t, size, stage, grade, , , , , , mySize] of run.meals) {
      assert.ok(t >= last && t <= run.window, '시각 순서');
      last = t;
      assert.ok(size > 0 && mySize > 0 && stage >= 1 && stage <= 5 && GRADE_MULT[grade] > 0);
    }
  }
});

test('1~3단계 분당 요력은 옛 식과 ±15% 안이다(초반 손맛 유지): 세 단계를 합친 값', () => {
  const r = ratio([1, 2, 3]);
  assert.ok(r >= 0.85 && r <= 1.15, `1~3단계 합계 비율 ${r.toFixed(2)}`);
});

test('1~3단계는 단계별로도 옛 식의 0.6~1.4배다(단계마다 먹는 크기 분포가 달라 한 base로 ±15%를 모두 맞출 수는 없다)', () => {
  for (const stage of [1, 2, 3]) {
    const r = ratio([stage]);
    assert.ok(r >= 0.6 && r <= 1.4, `${stage}단계 비율 ${r.toFixed(2)}`);
  }
});

test('4단계 분당 요력은 옛 식의 40~65%다(목표 상한 60%를 약간 넘는다: 21판 중앙값끼리 67%·판별 63%, 사용자 결정 ×24 유지. 나보다 높은 단계 먹이는 배율 상한 48이라 5단계 ×176이 4단계 판의 5단계 먹이를 키우지 않는다)', () => {
  const r = ratio([4]);
  assert.ok(r >= 0.4 && r <= 0.65, `4단계 비율 ${r.toFixed(2)}`);
});

test('aboveStageCap: 4단계 이하 판의 5단계 먹이는 상한 ×48이라 상한이 없을 때(×176)보다 4단계 비율이 낮고, 5단계 판은 영향이 없다', () => {
  const cap = CONFIG.score.aboveStageCap;
  assert.equal(cap, 48);
  const run4 = INCOME_RUNS.filter((r) => r.stage === 4);
  assert.ok(run4.some((r) => r.meals.some((m) => m[2] === 5)), '4단계 판 고정 자료에 5단계 먹이가 있다');
  CONFIG.score.aboveStageCap = Infinity;
  const uncapped4 = ratio([4]), uncapped5 = ratio([5]);
  CONFIG.score.aboveStageCap = cap;
  assert.ok(ratio([4]) < uncapped4, `${ratio([4]).toFixed(2)} < ${uncapped4.toFixed(2)}`);
  assert.equal(ratio([5]), uncapped5);
});

test('5단계 배율은 ×176이고 4단계 ×24, 1~3단계 ×1·4·16은 그대로다', () => {
  assert.deepEqual(CONFIG.score.stageMult, { 1: 1, 2: 4, 3: 16, 4: 24, 5: 176 });
});

test('5단계 분당 요력은 옛 식의 25~45%다(배율 ×176, 비율은 배율에 거의 비례한다: 24판 합쳐 ×128 25%, ×160 30%, ×176 32%, ×192 35%, ×224 40%)', () => {
  const r = ratio([5]);
  assert.ok(r >= 0.25 && r <= 0.45, `5단계 비율 ${r.toFixed(2)}`);
});

test('단계가 오를수록 옛 식 대비 비율은 내려간다: 1~3단계 > 4단계 > 5단계', () => {
  assert.ok(ratio([1, 2, 3]) > ratio([4]));
  assert.ok(ratio([4]) > ratio([5]));
});
