import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { FORMS, FORM_BY_ID } from '../src/data/forms.js';
import { createProgress } from '../src/systems/progress.js';
import { buildChoices, evolutionCost } from '../src/systems/evolution.js';
import { enhanceCost } from '../src/systems/enhance.js';
import {
  allQuickCards, applyQuickCard, bodyCost, createRunLevel, earnedThisRun, evolutionCatalog,
  pickQuickCards, quickEnhanceCost, QUICK_STAT_NAMES,
} from '../src/systems/levelup.js';

const L = CONFIG.levelUp;

function setup(yoryeok, patch = {}) {
  const progress = Object.assign(createProgress(), { yoryeok }, patch);
  return { progress, run: createRunLevel(progress) };
}

// 시드 있는 난수: 같은 시드면 같은 카드가 나온다.
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const kinds = (cards) => cards.map((card) => card.kind);

test('살 수 있는 카드가 없으면 빈 배열(멈추지 않는다)', () => {
  const { progress, run } = setup(0);
  assert.deepEqual(pickQuickCards(progress, run, FORMS), []);
  progress.yoryeok = Math.min(bodyCost(0), quickEnhanceCost(0)) - 1;
  assert.deepEqual(pickQuickCards(progress, run, FORMS), []);
});

test('요력이 모자란 카드는 뽑히지 않는다: 몸집·능력만 살 수 있으면 진화 카드는 없다', () => {
  const { progress, run } = setup(evolutionCost(2) - 1);
  for (let seed = 1; seed <= 30; seed++) {
    const cards = pickQuickCards(progress, run, FORMS, { rng: seeded(seed) });
    assert.ok(cards.length >= 1);
    assert.ok(cards.every((card) => card.cost <= progress.yoryeok));
    assert.ok(!kinds(cards).includes('evolve'));
  }
});

test('진화를 살 수 있으면 진화 선택지를 모두 보여 주고(네 종족 포함) 진화하지 않을 카드 한 장을 곁들인다', () => {
  const { progress, run } = setup(5000);
  for (let seed = 1; seed <= 40; seed++) {
    const cards = pickQuickCards(progress, run, FORMS, { rng: seeded(seed) });
    const evolve = cards.filter((card) => card.kind === 'evolve');
    const alt = cards.filter((card) => card.kind !== 'evolve');
    assert.ok(evolve.length >= 3, '진화 선택지 3장 이상');
    assert.equal(alt.length, 1, '진화하지 않을 카드 한 장');
    assert.ok(['body', 'ability'].includes(alt[0].kind));
    assert.deepEqual(kinds(cards), [...kinds(evolve), alt[0].kind], '진화 → 몸집·능력 순');
    assert.equal(new Set(cards.map((card) => card.id)).size, cards.length, '같은 카드가 두 번 나오면 안 된다');
    // 종족 자유 선택: 방위 네 곳을 모두 고를 수 있다
    assert.deepEqual([...new Set(evolve.filter((card) => !card.unknown).map((card) => card.form.dir))].sort(), ['east', 'north', 'south', 'west']);
    assert.ok(evolve.some((card) => card.unknown), '미지의 진화도 있다');
  }
});

test('진화를 살 수 없으면 종류가 겹치지 않는 3장(몸집·능력)이 나온다', () => {
  const { progress, run } = setup(5000, { stage: 4, formId: 'gumiho' }); // 5단계 진화 8,000
  for (let seed = 1; seed <= 20; seed++) {
    const cards = pickQuickCards(progress, run, FORMS, { rng: seeded(seed) });
    assert.ok(!kinds(cards).includes('evolve'));
    assert.equal(cards.length, L.quickCardCount);
    assert.deepEqual(kinds(cards), ['body', 'ability', 'ability']);
  }
});

test('종류가 모자라면 같은 종류로 채운다(5단계: 진화 없음 → 몸집 + 능력 2장)', () => {
  const { progress, run } = setup(5000, { stage: 5 });
  for (let seed = 1; seed <= 20; seed++) {
    const cards = pickQuickCards(progress, run, FORMS, { rng: seeded(seed) });
    assert.equal(cards.length, 3);
    assert.deepEqual(kinds(cards), ['body', 'ability', 'ability']);
    assert.equal(new Set(cards.map((card) => card.id)).size, 3, '같은 카드가 두 번 나오면 안 된다');
  }
});

test('능력치가 모두 최고이고 5단계면 몸집 카드 한 장뿐', () => {
  const { progress, run } = setup(5000, { stage: 5 });
  for (const stat of Object.keys(progress.enh)) progress.enh[stat] = 10;
  const cards = pickQuickCards(progress, run, FORMS);
  assert.deepEqual(kinds(cards), ['body']);
});

test('무작위: 시드마다 진화 후보와 능력치가 달라진다', () => {
  const { progress, run } = setup(5000);
  const evolveIds = new Set();
  const stats = new Set();
  for (let seed = 1; seed <= 60; seed++) {
    for (const card of pickQuickCards(progress, run, FORMS, { rng: seeded(seed) })) {
      if (card.kind === 'evolve') evolveIds.add(card.id);
      if (card.kind === 'ability') stats.add(card.stat);
    }
  }
  assert.ok(evolveIds.size >= 2, '진화 카드가 한 가지뿐: ' + [...evolveIds]);
  assert.equal(stats.size, 3);
});

test('진화 카드의 후보는 EvolveView(buildChoices)와 같다: 구체 형태 2장 + 미지(???)', () => {
  const { progress, run } = setup(5000);
  progress.diet.south = 50;
  const flat = () => 0.5; // 동점 처리용 난수를 고정해 두 호출의 순서를 같게 한다
  const expected = buildChoices(progress, evolutionCatalog(FORMS), { rng: flat });
  const cards = allQuickCards(progress, run, FORMS, { rng: flat }).filter((card) => card.kind === 'evolve');
  assert.equal(cards.length, expected.length);
  assert.deepEqual(cards.map((card) => card.unknown), expected.map((choice) => !!choice.unknown));
  assert.deepEqual(
    cards.filter((card) => !card.unknown).map((card) => card.form.id),
    expected.filter((choice) => !choice.unknown).map((choice) => choice.form.id),
  );
  assert.equal(cards[0].form.id, 'littleBird'); // 식성 1위 방위(남)의 새끼
  assert.equal(cards.find((card) => card.unknown).form, null);
  for (const card of cards) assert.equal(card.cost, evolutionCost(2));
});

test('evolutionCatalog는 next를 from으로 뒤집고 이미 from이 있으면 그대로 둔다', () => {
  const catalog = evolutionCatalog(FORMS);
  assert.ok(catalog.find((form) => form.id === 'littleSnake').from.includes('mimul'));
  assert.ok(catalog.find((form) => form.id === 'hillFox').from.includes('littleSnake'));
  assert.strictEqual(evolutionCatalog(FORMS), catalog, '같은 배열은 캐시한다');
  const withFrom = [{ id: 'a', stage: 1, from: ['x'] }];
  assert.deepEqual(evolutionCatalog(withFrom)[0].from, ['x']);
});

test('진화 카드: 비용 차감, 형태·단계·등급 교체, 식성 초기화, 판 지출에 기록', () => {
  const { progress, run } = setup(500);
  progress.diet.west = 40;
  const card = allQuickCards(progress, run, FORMS).find((c) => c.kind === 'evolve' && !c.unknown);
  const result = applyQuickCard(progress, run, card, FORMS, { rng: seeded(7) });
  assert.equal(result.kind, 'evolve');
  assert.equal(result.cost, evolutionCost(2));
  assert.equal(result.form.id, card.form.id);
  assert.equal(progress.formId, card.form.id);
  assert.equal(progress.stage, 2);
  assert.equal(progress.grade, result.grade);
  assert.equal(progress.yoryeok, 500 - evolutionCost(2));
  assert.deepEqual(progress.diet, { east: 0, west: 0, south: 0, north: 0 });
  assert.equal(run.spent, evolutionCost(2));
  assert.equal(earnedThisRun(progress, run), 0);
});

test('미지의 진화 카드는 탭할 때 결정된다: 다음 단계 형태 중 하나', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const { progress, run } = setup(500);
    const card = allQuickCards(progress, run, FORMS).find((c) => c.unknown);
    // 첫 난수가 비슷한 연속 시드를 피하려고 시드를 흩뿌린다(후보가 24종이라 첫 난수가 형태를 정한다).
    const result = applyQuickCard(progress, run, card, FORMS, { rng: seeded(Math.imul(seed, 2654435761) >>> 0) });
    assert.equal(FORM_BY_ID[result.form.id].stage, 2);
    assert.equal(progress.formId, result.form.id);
    seen.add(result.form.id);
  }
  assert.ok(seen.size >= 2, '미지의 진화가 늘 같은 형태');
});

test('진화 카드는 요력이 모자라거나 이미 5단계면 적용되지 않는다', () => {
  const poor = setup(evolutionCost(2) - 1);
  const card = { kind: 'evolve', cost: evolutionCost(2), choice: { unknown: true }, unknown: true, form: null };
  assert.equal(applyQuickCard(poor.progress, poor.run, card, FORMS), null);
  assert.equal(poor.progress.stage, 1);
  assert.equal(poor.progress.yoryeok, evolutionCost(2) - 1);
  const top = setup(5000, { stage: 5 });
  assert.equal(applyQuickCard(top.progress, top.run, card, FORMS), null);
  assert.equal(top.progress.yoryeok, 5000);
});

test('몸집 카드: 확정으로 요력만 쓰고 mult를 돌려준다(이번 판 레벨만 오른다)', () => {
  const { progress, run } = setup(100);
  const result = applyQuickCard(progress, run, { kind: 'body', id: 'body' }, FORMS);
  assert.deepEqual(result, { kind: 'body', cost: bodyCost(0), mult: L.bodyMult });
  assert.equal(progress.yoryeok, 100 - bodyCost(0));
  assert.equal(run.bodyLevel, 1);
  assert.equal(progress.stage, 1);
  assert.deepEqual(progress.enh, { growth: 0, speed: 0, vitality: 0 });
});

test('능력 +1 카드: 실패·퇴화 없이 확정 +1, 비용은 quickEnhanceCostMult × enhanceCost', () => {
  for (const stat of ['growth', 'speed', 'vitality']) {
    const { progress, run } = setup(1000);
    progress.enh[stat] = 4;
    progress.pity = 25;
    const cost = Math.round(enhanceCost(4) * L.quickEnhanceCostMult);
    const result = applyQuickCard(progress, run, { kind: 'ability', stat }, FORMS);
    assert.deepEqual(result, { kind: 'ability', cost, stat, from: 4, to: 5 });
    assert.equal(progress.enh[stat], 5);
    assert.equal(progress.yoryeok, 1000 - cost);
    assert.equal(progress.pity, 25, '천장 카운터는 건드리지 않는다');
    assert.equal(progress.pendingDegrade, undefined);
  }
});

test('능력 +1 카드: 같은 카드를 거듭 사면 비용이 오르고, 요력이 모자라면 null, 최고 레벨은 안 팔린다', () => {
  const { progress, run } = setup(100000);
  let last = 0;
  for (let i = 0; i < 10; i++) {
    const result = applyQuickCard(progress, run, { kind: 'ability', stat: 'speed' }, FORMS);
    assert.ok(result.cost > last);
    last = result.cost;
  }
  assert.equal(progress.enh.speed, 10);
  const before = progress.yoryeok;
  assert.equal(applyQuickCard(progress, run, { kind: 'ability', stat: 'speed' }, FORMS), null);
  assert.equal(progress.yoryeok, before);
  const broke = setup(quickEnhanceCost(0) - 1);
  assert.equal(applyQuickCard(broke.progress, broke.run, { kind: 'ability', stat: 'growth' }, FORMS), null);
  assert.equal(broke.progress.enh.growth, 0);
});

test('최고 레벨 능력치는 카드로 나오지 않는다', () => {
  const { progress, run } = setup(5000);
  progress.enh.speed = 10;
  const cards = allQuickCards(progress, run, FORMS);
  assert.ok(!cards.some((card) => card.kind === 'ability' && card.stat === 'speed'));
  assert.equal(cards.filter((card) => card.kind === 'ability').length, 2);
});

test('능력 카드의 stat은 모두 한국어 이름이 있다(영문 키가 그대로 보이지 않는다)', () => {
  const { progress, run } = setup(5000);
  const stats = allQuickCards(progress, run, FORMS).filter((card) => card.kind === 'ability').map((card) => card.stat);
  assert.ok(stats.includes('vitality'));
  for (const stat of stats) assert.match(QUICK_STAT_NAMES[stat] ?? '', /[가-힣]/, stat);
  assert.equal(QUICK_STAT_NAMES.vitality, '생명력');
});

test('카드 id는 겹치지 않고 비용은 모두 유한하다', () => {
  const { progress, run } = setup(5000);
  const cards = allQuickCards(progress, run, FORMS);
  assert.equal(new Set(cards.map((card) => card.id)).size, cards.length);
  assert.ok(cards.every((card) => Number.isFinite(card.cost) && card.cost > 0));
});
