import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { createProgress } from '../src/systems/progress.js';
import { enhanceCost, getEnhanceOdds } from '../src/systems/enhance.js';
import { ENHANCE } from '../src/systems/tuning-upgrade.js';
import { evolutionCost } from '../src/systems/evolution.js';
import {
  bodyCost, createRunLevel, pauseOptions, cheapestCost, shouldPause, afterPause, applyBody,
  quickEnhanceCost, earnedThisRun, pauseGap, pauseGauge, pickQuickCards, applyQuickCard, allQuickCards,
  evolveOnly, evolveReady, deferEvolve, evolveDeferred, growthView,
} from '../src/systems/levelup.js';
import { FORMS } from '../src/data/forms.js';

const L = CONFIG.levelUp;
const MAX_ENH = ENHANCE.success.length; // 능력 최고 레벨(강화 레벨 20 지시 뒤에는 20)

function setup(yoryeok = 0, patch = {}) {
  const progress = Object.assign(createProgress(), { yoryeok }, patch);
  return { progress, run: createRunLevel(progress) };
}

test('bodyCost는 기본 비용에서 시작해 번마다 enhanceCostGrowth(2)배로 늘어난다', () => {
  assert.equal(CONFIG.enhanceCostGrowth, 2);
  assert.equal(bodyCost(0), L.bodyBaseCost);
  assert.equal(bodyCost(1), Math.round(L.bodyBaseCost * CONFIG.enhanceCostGrowth));
  assert.equal(bodyCost(3), Math.round(L.bodyBaseCost * CONFIG.enhanceCostGrowth ** 3));
  assert.deepEqual([0, 1, 2, 3, 4].map(bodyCost), [30, 60, 120, 240, 480]);
  for (let n = 0; n < 8; n++) assert.ok(bodyCost(n + 1) > bodyCost(n));
});

test('createRunLevel은 빈 판 상태를 만들고 판 시작 잔액을 baseYoryeok로 저장한다', () => {
  const run = createRunLevel();
  assert.deepEqual(run, {
    bodyLevel: 0, baseYoryeok: 0, spent: 0, nextPauseAt: null, pauseFromEarned: 0, lastPauseSec: -Infinity,
  });
  assert.notEqual(createRunLevel(), run);
  const carried = createRunLevel(Object.assign(createProgress(), { yoryeok: 5000 }));
  assert.equal(carried.baseYoryeok, 5000);
  // 첫 멈춤 기준은 시작 잔액이 아니라 번 요력 0에서 잰다.
  assert.equal(carried.nextPauseAt, pauseGap(cheapestCost(Object.assign(createProgress(), { yoryeok: 5000 }), carried)));
});

test('pauseOptions는 진화·몸집·능력 순서로 비용과 확률을 담는다', () => {
  const { progress, run } = setup(0);
  const [evolve, body, ability] = pauseOptions(progress, run);
  assert.deepEqual(evolve, { kind: 'evolve', cost: evolutionCost(2), available: true });
  assert.deepEqual(body, { kind: 'body', cost: bodyCost(0), mult: L.bodyMult });
  assert.equal(ability.kind, 'ability');
  assert.deepEqual(ability.stats.map((s) => s.stat), ['growth', 'speed', 'vitality']);
  for (const s of ability.stats) {
    assert.equal(s.level, 0);
    assert.equal(s.cost, enhanceCost(0));
    assert.deepEqual(s.odds, getEnhanceOdds(progress, s.stat));
  }
});

test('5단계에서는 진화를 고를 수 없고 몸집 비용은 강화 횟수를 따라간다', () => {
  const { progress, run } = setup(0, { stage: 5 });
  run.bodyLevel = 2;
  const [evolve, body] = pauseOptions(progress, run);
  assert.equal(evolve.available, false);
  assert.equal(body.cost, bodyCost(2));
});

test('최고 레벨 능력치는 비용이 Infinity이고 확률이 모두 0이다', () => {
  const { progress, run } = setup(0);
  progress.enh.growth = MAX_ENH;
  const stat = pauseOptions(progress, run)[2].stats[0];
  assert.equal(stat.cost, Infinity);
  assert.deepEqual(stat.odds, { success: 0, great: 0, fail: 0, degrade: 0 });
});

test('cheapestCost는 고를 수 있는 가장 싼 카드 비용이다(능력 +1 카드는 quickEnhanceCostMult배)', () => {
  const a = setup(0);
  assert.equal(cheapestCost(a.progress, a.run), Math.min(quickEnhanceCost(0), bodyCost(0), evolutionCost(2)));
  assert.equal(quickEnhanceCost(0), Math.round(enhanceCost(0) * L.quickEnhanceCostMult));
  assert.ok(quickEnhanceCost(3) > enhanceCost(3));

  // 능력치가 모두 최고여도 1단계에는 진화(100)가 있어 가장 싼 카드는 몸집 강화 4번째(480)보다 싸다.
  const b = setup(0);
  for (const stat of Object.keys(b.progress.enh)) b.progress.enh[stat] = MAX_ENH;
  b.run.bodyLevel = 4;
  assert.equal(cheapestCost(b.progress, b.run), evolutionCost(2));
  assert.equal(quickEnhanceCost(MAX_ENH), Infinity);
  // 2단계 이상은 몸집·능력 카드가 없어 다음 진화 비용뿐이고, 5단계는 살 카드가 없다.
  for (const [stage, cost] of [[2, 400], [3, 2000], [4, 16000], [5, Infinity]]) {
    const c = setup(0, { stage });
    assert.equal(cheapestCost(c.progress, c.run), cost, stage + '단계');
  }
});

test('pauseGap은 가장 싼 카드 값에 비례하되 하한·상한으로 자른다', () => {
  assert.equal(pauseGap(1), L.pauseGapMin);
  assert.equal(pauseGap(1e9), L.pauseGapMax);
  assert.equal(pauseGap(1000), Math.min(L.pauseGapMax, Math.max(L.pauseGapMin, Math.round(1000 * L.minGapRatio))));
  let prev = 0;
  for (const cost of [1, 30, 100, 300, 1000, 5000]) {
    const gap = pauseGap(cost);
    assert.ok(gap >= prev && gap >= L.pauseGapMin && gap <= L.pauseGapMax);
    prev = gap;
  }
});

test('shouldPause: 첫 기준은 번 요력 기준으로 정하고, 요력이 모자라면 멈추지 않는다', () => {
  const { progress, run } = setup(0);
  const cheapest = cheapestCost(progress, run);
  assert.equal(shouldPause(progress, run, 100), false);
  assert.equal(run.nextPauseAt, pauseGap(cheapest));
  progress.yoryeok = cheapest - 1;
  assert.equal(shouldPause(progress, run, 100), false);
  progress.yoryeok = Math.max(cheapest, run.nextPauseAt);
  assert.equal(shouldPause(progress, run, 100), true);
});

test('shouldPause: 이미 정한 기준은 다시 바꾸지 않는다', () => {
  const { progress, run } = setup(1000);
  progress.yoryeok += 600; // 이번 판에서 600을 벌었다
  run.nextPauseAt = 500;
  assert.equal(shouldPause(progress, run, 100), true);
  assert.equal(run.nextPauseAt, 500);
  run.nextPauseAt = 601;
  assert.equal(shouldPause(progress, run, 100), false);
});

test('shouldPause: 번 요력이 기준을 넘어도 살 수 있는 카드가 없으면 멈추지 않는다', () => {
  const { progress, run } = setup(0);
  run.nextPauseAt = 10;
  progress.yoryeok = 20; // 번 요력 20 ≥ 10이지만 가장 싼 카드(30)를 못 산다
  assert.equal(shouldPause(progress, run, 100), false);
  progress.yoryeok = cheapestCost(progress, run);
  assert.equal(shouldPause(progress, run, 100), true);
});

test('shouldPause: 실제 시간 쿨다운이 지나야 다시 멈춘다', () => {
  const { progress, run } = setup(1000);
  progress.yoryeok += 600;
  run.nextPauseAt = 500;
  run.lastPauseSec = 50;
  assert.equal(shouldPause(progress, run, 50 + L.pauseCooldownSec - 0.01), false);
  assert.equal(shouldPause(progress, run, 50 + L.pauseCooldownSec), true);
});

test('afterPause: 멈춘 시각을 기록하고 다음 기준을 번 요력 기준으로 최소 간격만큼 올린다', () => {
  const { progress, run } = setup(100);
  progress.yoryeok += 40; // 이번 판에서 40을 벌었다
  const cheapest = cheapestCost(progress, run);
  afterPause(progress, run, 42);
  assert.equal(run.lastPauseSec, 42);
  assert.equal(run.nextPauseAt, 40 + pauseGap(cheapest));
  assert.equal(run.pauseFromEarned, 40);
  // 같은 요력으로는 곧바로 다시 멈추지 않는다.
  assert.equal(shouldPause(progress, run, 43), false);
  progress.yoryeok += pauseGap(cheapest);
  assert.equal(shouldPause(progress, run, 42 + L.pauseCooldownSec), true);
});

test('요력을 써도 번 요력은 줄지 않는다(쓴 만큼 더해서 센다)', () => {
  const { progress, run } = setup(100);
  progress.yoryeok += 60;
  assert.equal(earnedThisRun(progress, run), 60);
  applyBody(progress, run);
  assert.equal(earnedThisRun(progress, run), 60);
  assert.equal(run.spent, bodyCost(0));
});

// --- 리뷰 지적 1: 잔액 5000을 들고 시작하면 첫 기준이 6750이 되어 판 안 선택이 한 번도 안 열린다 ---
// --- 리뷰 지적 2: 잔액 400 모으는 중 먹이 하나마다 멈춘다 ---
// 먹이 하나(+prey 요력)를 1초마다 먹는 판을 흉내 낸다. 멈추면 첫 카드를 골라 적용하고 afterPause를 부른다.
// 1단계의 멈춤 간격 규칙을 보려고 진화 카드는 고르지 않는다(진화하면 2단계 이상이 되어 규칙이 진화 전용으로 바뀐다, 아래 별도 시험).
function simulateRun(startBalance, prey, seconds, rng = () => 0.5) {
  const { progress, run } = setup(startBalance);
  const pauses = [];
  for (let t = 1; t <= seconds; t++) {
    progress.yoryeok += prey;
    if (!shouldPause(progress, run, t)) continue;
    const cards = pickQuickCards(progress, run, FORMS, { rng });
    assert.ok(cards.length > 0, '멈췄다면 살 수 있는 카드가 있어야 한다');
    const card = cards.find((c) => c.kind !== 'evolve') ?? cards[0];
    const result = applyQuickCard(progress, run, card, FORMS, { rng });
    assert.ok(result, '고른 카드는 적용돼야 한다');
    afterPause(progress, run, t);
    pauses.push({ t, earned: earnedThisRun(progress, run), balance: progress.yoryeok });
  }
  return { progress, run, pauses };
}

test('잔액 5000으로 시작해도 첫 선택이 몇 번 먹지 않아 열린다(기준은 번 요력 기준, 상한 이하)', () => {
  const { progress, run } = setup(5000);
  assert.equal(shouldPause(progress, run, 1), false);
  assert.ok(run.nextPauseAt > 0 && run.nextPauseAt <= L.pauseGapMax, '첫 기준 ' + run.nextPauseAt);
  // 옛 방식이라면 5000 + 5000 × 0.35 = 6750이 되어 이 판에서 6750 - 5000 = 1750을 벌어야 했다.
  const need = run.nextPauseAt;
  progress.yoryeok = 5000 + need - 1;
  assert.equal(shouldPause(progress, run, 100), false);
  progress.yoryeok = 5000 + need;
  assert.equal(shouldPause(progress, run, 100), true);

  const sim = simulateRun(5000, 8, 60);
  assert.ok(sim.pauses.length >= 1, '60초 동안 한 번도 안 열렸다');
  assert.ok(sim.pauses[0].t <= Math.ceil(need / 8), '첫 멈춤이 너무 늦다: ' + sim.pauses[0].t + '초');
});

test('시작 잔액이 0이든 400이든 5000이든 1e6이든 판 안 선택이 계속 열린다', () => {
  for (const start of [0, 400, 5000, 1e6]) {
    const { pauses } = simulateRun(start, 8, 200);
    assert.ok(pauses.length >= 3, `start=${start}: 200초에 ${pauses.length}번뿐`);
  }
});

test('잔액 400을 들고 먹이 하나(+8)씩 먹어도 먹이마다 멈추지 않는다', () => {
  const seconds = 120;
  const { pauses } = simulateRun(400, 8, seconds);
  assert.ok(pauses.length >= 2, '너무 드물다: ' + pauses.length);
  // 실제 시간 쿨다운 때문에 최대 seconds / cooldown 번
  assert.ok(pauses.length <= Math.floor(seconds / L.pauseCooldownSec), '너무 잦다: ' + pauses.length);
  assert.ok(pauses.length < seconds / 4, '먹이 몇 개마다 멈추면 안 된다');
  for (let i = 1; i < pauses.length; i++) {
    assert.ok(pauses[i].t - pauses[i - 1].t >= L.pauseCooldownSec, '쿨다운 위반');
    assert.ok(pauses[i].earned - pauses[i - 1].earned >= L.pauseGapMin, '번 요력 간격이 하한 미만');
  }
});

test('먹이 하나가 크게(+60) 들어오면 한 번 멈추고, 이어서 바로 다시 멈추지 않는다', () => {
  const { progress, run } = setup(0);
  shouldPause(progress, run, 1);
  progress.yoryeok += 60;
  assert.equal(shouldPause(progress, run, 10), true);
  afterPause(progress, run, 10);
  assert.equal(shouldPause(progress, run, 11), false);
  assert.equal(shouldPause(progress, run, 100), false);
});

test('pauseGauge: 번 요력과 잔액 중 모자란 쪽을 보여주고, 멈출 때가 되면 가득 찬다', () => {
  const { progress, run } = setup(0);
  shouldPause(progress, run, 1);
  let g = pauseGauge(progress, run);
  assert.deepEqual(g, { current: 0, target: pauseGap(cheapestCost(progress, run)) });
  progress.yoryeok = 10;
  g = pauseGauge(progress, run);
  assert.ok(g.current > 0 && g.current < g.target);
  progress.yoryeok = 5000;
  g = pauseGauge(progress, run);
  assert.equal(g.current, g.target);
  assert.equal(shouldPause(progress, run, 10), true);
  // 잔액만 많고 번 요력이 적은 판 시작: 가득 차지 않는다.
  const rich = setup(5000);
  assert.equal(pauseGauge(rich.progress, rich.run).current, 0);
});

test('applyBody: 요력을 차감하고 비용은 번마다 늘어난다', () => {
  const { progress, run } = setup(1000);
  const first = applyBody(progress, run);
  assert.deepEqual(first, { cost: bodyCost(0), mult: L.bodyMult });
  assert.equal(run.bodyLevel, 1);
  assert.equal(progress.yoryeok, 1000 - bodyCost(0));
  const second = applyBody(progress, run);
  assert.equal(second.cost, bodyCost(1));
  assert.ok(second.cost > first.cost);
  assert.equal(run.bodyLevel, 2);
  assert.equal(progress.yoryeok, 1000 - bodyCost(0) - bodyCost(1));
});

test('applyBody: 요력이 부족하면 null이고 아무것도 바뀌지 않는다', () => {
  const { progress, run } = setup(bodyCost(0) - 1);
  assert.equal(applyBody(progress, run), null);
  assert.equal(progress.yoryeok, bodyCost(0) - 1);
  assert.equal(run.bodyLevel, 0);
  // 비용과 같은 요력이면 살 수 있고 0이 된다.
  progress.yoryeok = bodyCost(0);
  assert.ok(applyBody(progress, run));
  assert.equal(progress.yoryeok, 0);
});

test('판 안 진화 카드는 5단계 미만이면 나오고 비용은 다음 단계 비용이다(400 / 2,000 / 16,000), 2단계 이상은 진화 카드뿐이다', () => {
  assert.equal(L.evolveMaxStage, 5);
  for (const [stage, cost] of [[1, 100], [2, 400], [3, 2000], [4, 16000]]) {
    const { progress, run } = setup(20000, { stage, formId: { 1: 'mimul', 2: 'littleSnake', 3: 'hillFox', 4: 'gumiho' }[stage] });
    const all = allQuickCards(progress, run, FORMS);
    const evolveCards = all.filter((card) => card.kind === 'evolve');
    if (stage >= 2) assert.equal(all.length, evolveCards.length, stage + '단계: 몸집·능력 카드는 없다');
    else assert.ok(all.length > evolveCards.length, '1단계: 몸집·능력 카드도 있다');
    assert.ok(evolveCards.length >= 3, stage + '단계: 진화 카드 3장 이상');
    // 종족 자유 선택: 네 종족(방위)을 모두 고를 수 있다
    assert.deepEqual([...new Set(evolveCards.filter((card) => !card.unknown).map((card) => card.form.dir))].sort(), ['east', 'north', 'south', 'west'], stage + '단계: 네 종족');
    for (const card of evolveCards) assert.equal(card.cost, cost, stage + '단계 비용');
    assert.equal(pauseOptions(progress, run)[0].available, true);
    assert.equal(pauseOptions(progress, run)[0].cost, cost);
  }
  const top = setup(10000, { stage: 5, formId: 'cheonho' });
  assert.equal(allQuickCards(top.progress, top.run, FORMS).filter((card) => card.kind === 'evolve').length, 0);
  assert.equal(pauseOptions(top.progress, top.run)[0].available, false);
});

test('4단계 진화 카드를 적용하면 16,000을 내고 5단계 형태가 된다(8,000으로는 못 산다)', () => {
  const poor = setup(8500, { stage: 4, formId: 'gumiho' });
  poor.progress.diet.east = 10;
  assert.deepEqual(pickQuickCards(poor.progress, poor.run, FORMS), [], '요력 16,000이 안 되면 카드가 없다');
  const { progress, run } = setup(16500, { stage: 4, formId: 'gumiho' });
  progress.diet.east = 10;
  const card = allQuickCards(progress, run, FORMS).find((c) => c.kind === 'evolve' && !c.unknown);
  const result = applyQuickCard(progress, run, card, FORMS, { rng: () => 0.5 });
  assert.equal(result.kind, 'evolve');
  assert.equal(result.cost, 16000);
  assert.equal(progress.stage, 5);
  assert.equal(progress.yoryeok, 500);
  assert.equal(run.spent, 16000);
});

// ---- 2단계 이상은 진화만(사용자 지시 2026-11-24, 변경 이력 21) ----
const STAGE_FORMS = { 2: 'littleSnake', 3: 'hillFox', 4: 'gumiho', 5: 'cheonho' };

test('evolveOnly: 2단계부터 진화 전용이다(설정값 levelUp.evolveOnlyFromStage)', () => {
  assert.equal(L.evolveOnlyFromStage, 2);
  assert.deepEqual([1, 2, 3, 4, 5].map((stage) => evolveOnly({ stage })), [false, true, true, true, true]);
});

test('2단계 이상: 몸집·능력 카드는 만들 수도, 살 수도, 적용할 수도 없다(요력이 넘쳐도)', () => {
  for (const stage of [2, 3, 4, 5]) {
    const { progress, run } = setup(1e6, { stage, formId: STAGE_FORMS[stage] });
    const all = allQuickCards(progress, run, FORMS);
    assert.ok(all.every((card) => card.kind === 'evolve'), stage + '단계');
    assert.equal(all.length > 0, stage < 5, stage + '단계 진화 카드 유무');
    const picked = pickQuickCards(progress, run, FORMS, { rng: () => 0.5 });
    assert.ok(picked.every((card) => card.kind === 'evolve'), stage + '단계 뽑힌 카드');
    // 옛 카드 객체를 직접 넘겨도 아무것도 바뀌지 않는다
    for (const card of [{ kind: 'body', id: 'body' }, { kind: 'ability', id: 'ability:growth', stat: 'growth' }]) {
      assert.equal(applyQuickCard(progress, run, card, FORMS), null, stage + '단계 ' + card.kind);
    }
    assert.equal(progress.yoryeok, 1e6);
    assert.equal(run.bodyLevel, 0);
    assert.deepEqual(progress.enh, { growth: 0, speed: 0, vitality: 0 });
  }
});

test('2단계 이상: 진화 카드뿐이라 다른 카드를 곁들이지 않는다(1단계는 몸집·능력 한 장을 곁들인다)', () => {
  const one = setup(5000);
  assert.ok(pickQuickCards(one.progress, one.run, FORMS, { rng: () => 0.5 }).some((card) => card.kind !== 'evolve'));
  for (const stage of [2, 3, 4]) {
    const { progress, run } = setup(20000, { stage, formId: STAGE_FORMS[stage] });
    const cards = pickQuickCards(progress, run, FORMS, { rng: () => 0.5 });
    assert.ok(cards.length >= 3, stage + '단계: 진화 선택지 3장 이상');
    assert.ok(cards.every((card) => card.kind === 'evolve'));
    assert.equal(new Set(cards.map((card) => card.id)).size, cards.length);
  }
});

test('2단계 이상 shouldPause: 요력이 다음 진화 비용에 닿으면 멈추고, 번 요력 간격·몸집·능력 비용은 보지 않는다', () => {
  for (const [stage, cost] of [[2, 400], [3, 2000], [4, 16000]]) {
    const { progress, run } = setup(0, { stage, formId: STAGE_FORMS[stage] });
    progress.yoryeok = cost - 1;
    assert.equal(shouldPause(progress, run, 100), false, stage + '단계 1 모자람');
    assert.equal(evolveReady(progress), false);
    progress.yoryeok = cost;
    assert.equal(evolveReady(progress), true);
    assert.equal(shouldPause(progress, run, 100), true, stage + '단계 딱 닿음');
  }
  // 시작 잔액이 넉넉해도(번 요력 0) 비용에 닿았으면 바로 멈춘다
  const rich = setup(5000, { stage: 2, formId: 'littleSnake' });
  assert.equal(earnedThisRun(rich.progress, rich.run), 0);
  assert.equal(shouldPause(rich.progress, rich.run, 100), true);
});

test('2단계 이상 shouldPause: 실제 시간 쿨다운이 지나야 하고, 5단계는 멈추지 않는다', () => {
  const { progress, run } = setup(5000, { stage: 2, formId: 'littleSnake' });
  run.lastPauseSec = 50;
  assert.equal(shouldPause(progress, run, 50 + L.pauseCooldownSec - 0.01), false);
  assert.equal(shouldPause(progress, run, 50 + L.pauseCooldownSec), true);
  const top = setup(1e9, { stage: 5, formId: 'cheonho' });
  assert.equal(evolveReady(top.progress), false);
  assert.equal(shouldPause(top.progress, top.run, 1e6), false, '5단계는 다음 진화가 없다');
  assert.deepEqual(pickQuickCards(top.progress, top.run, FORMS), []);
});

test('[계속 모으기]: 그 단계에서는 다시 멈추지 않고, 단계가 오르면 다시 묻는다', () => {
  const { progress, run } = setup(5000, { stage: 2, formId: 'littleSnake' });
  assert.equal(evolveDeferred(progress, run), false);
  assert.equal(shouldPause(progress, run, 10), true);
  deferEvolve(progress, run, 10);
  assert.equal(evolveDeferred(progress, run), true);
  assert.equal(run.lastPauseSec, 10);
  for (const t of [11, 20, 1000, 1e6]) assert.equal(shouldPause(progress, run, t), false, t + '초');
  assert.equal(progress.yoryeok, 5000, '요력은 그대로다');
  assert.equal(evolveReady(progress), true, '진화는 언제든 할 수 있다(HUD 단추)');
  // HUD 단추로 진화 → 3단계: 다시 묻는다(요력이 아직 3단계 비용 2,000 이상일 때, 쿨다운 뒤)
  const card = allQuickCards(progress, run, FORMS).find((c) => c.kind === 'evolve' && !c.unknown);
  assert.ok(applyQuickCard(progress, run, card, FORMS, { rng: () => 0.5 }));
  afterPause(progress, run, 30);
  assert.equal(progress.stage, 3);
  assert.equal(progress.yoryeok, 5000 - 400);
  assert.equal(evolveDeferred(progress, run), false);
  assert.equal(shouldPause(progress, run, 30 + L.pauseCooldownSec - 1), false, '쿨다운');
  assert.equal(shouldPause(progress, run, 30 + L.pauseCooldownSec), true);
});

test('연속 진화: 2 → 3 → 4 → 5단계를 요력이 닿을 때마다 한 번씩만 묻는다', () => {
  const { progress, run } = setup(0, { stage: 2, formId: 'littleSnake' });
  const asked = [];
  let t = 0;
  while (t < 5000 && progress.stage < 5) {
    t += 1;
    progress.yoryeok += 100; // 1초에 요력 100
    if (!shouldPause(progress, run, t)) continue;
    asked.push([progress.stage, t, progress.yoryeok]);
    const card = pickQuickCards(progress, run, FORMS, { rng: () => 0.5 }).find((c) => !c.unknown);
    assert.ok(applyQuickCard(progress, run, card, FORMS, { rng: () => 0.5 }));
    afterPause(progress, run, t);
  }
  assert.equal(progress.stage, 5);
  assert.deepEqual(asked.map(([stage]) => stage), [2, 3, 4]);
  // 비용이 닿는 순간 바로 물었다(1초에 100씩 모으므로 비용보다 100 안쪽으로만 넘친다).
  for (const [stage, , yoryeok] of asked) assert.ok(yoryeok >= evolutionCost(stage + 1) && yoryeok < evolutionCost(stage + 1) + 100, stage + '단계 질문 시점 요력 ' + yoryeok);
  assert.equal(evolveReady(progress), false);
});

test('growthView: 1단계는 예전 게이지, 2단계 이상은 다음 진화까지 남은 요력, 5단계는 숨긴다', () => {
  const one = setup(0);
  assert.deepEqual(growthView(one.progress, one.run), { mode: 'pause', ...pauseGauge(one.progress, one.run) });
  const two = setup(150, { stage: 2, formId: 'littleSnake' });
  assert.deepEqual(growthView(two.progress, two.run), { mode: 'evolve', cost: 400, current: 150, remain: 250, ready: false });
  two.progress.yoryeok = 399.2;
  assert.equal(growthView(two.progress, two.run).remain, 1, '남은 요력은 올림이다');
  two.progress.yoryeok = 400;
  assert.deepEqual(growthView(two.progress, two.run), { mode: 'evolve', cost: 400, current: 400, remain: 0, ready: true });
  two.progress.yoryeok = 9000;
  assert.deepEqual(growthView(two.progress, two.run), { mode: 'evolve', cost: 400, current: 400, remain: 0, ready: true });
  const four = setup(1000, { stage: 4, formId: 'gumiho' });
  assert.deepEqual(growthView(four.progress, four.run), { mode: 'evolve', cost: 16000, current: 1000, remain: 15000, ready: false });
  const top = setup(1e6, { stage: 5, formId: 'cheonho' });
  assert.deepEqual(growthView(top.progress, top.run), { mode: 'off' });
});
