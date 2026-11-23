import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { FORMS, FORM_BY_ID } from '../src/data/forms.js';
import { createProgress } from '../src/systems/progress.js';
import { buildChoices, evolutionCost } from '../src/systems/evolution.js';
import { enhanceCost } from '../src/systems/enhance.js';
import { ENHANCE, statUpgradeText } from '../src/systems/tuning-upgrade.js';
import {
  allQuickCards, applyQuickCard, bodyCost, createRunLevel, earnedThisRun, evolutionCatalog,
  pickQuickCards, quickEnhanceCost, quickStatNote, QUICK_STAT_NAMES, rerollQuickCards, rerollsLeft,
} from '../src/systems/levelup.js';

const L = CONFIG.levelUp;
const MAX_ENH = ENHANCE.outcomes.length; // 능력 최고 레벨(강화 레벨 20 지시 뒤에는 20)

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

test('1단계에서 진화를 살 수 없으면 종류가 겹치지 않는 3장(몸집·능력)이 나온다', () => {
  const { progress, run } = setup(evolutionCost(2) - 1); // 진화 100에 1 모자람(몸집 30·능력 +1 30은 살 수 있다)
  for (let seed = 1; seed <= 20; seed++) {
    const cards = pickQuickCards(progress, run, FORMS, { rng: seeded(seed) });
    assert.ok(!kinds(cards).includes('evolve'));
    assert.equal(cards.length, L.quickCardCount);
    assert.deepEqual(kinds(cards), ['body', 'ability', 'ability']);
  }
});

test('종류가 모자라면 같은 종류로 채운다(1단계, 진화를 못 사면 몸집 + 능력 2장)', () => {
  const { progress, run } = setup(evolutionCost(2) - 1);
  for (let seed = 1; seed <= 20; seed++) {
    const cards = pickQuickCards(progress, run, FORMS, { rng: seeded(seed) });
    assert.equal(cards.length, 3);
    assert.deepEqual(kinds(cards), ['body', 'ability', 'ability']);
    assert.equal(new Set(cards.map((card) => card.id)).size, 3, '같은 카드가 두 번 나오면 안 된다');
  }
});

test('2단계 이상은 진화를 살 수 없으면 카드가 없다(몸집·능력으로 채우지 않는다), 5단계는 늘 없다', () => {
  for (const [stage, formId, yoryeok] of [[2, 'littleSnake', 399], [3, 'hillFox', 1999], [4, 'gumiho', 15999], [5, 'cheonho', 1e9]]) {
    const { progress, run } = setup(yoryeok, { stage, formId });
    for (let seed = 1; seed <= 10; seed++) assert.deepEqual(pickQuickCards(progress, run, FORMS, { rng: seeded(seed) }), [], stage + '단계');
  }
});

test('1단계에서 진화를 못 사고 능력치가 모두 최고면 몸집 카드 한 장뿐', () => {
  const { progress, run } = setup(evolutionCost(2) - 1);
  for (const stat of Object.keys(progress.enh)) progress.enh[stat] = MAX_ENH;
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
  const { progress, run } = setup(1e9);
  let last = 0;
  for (let i = 0; i < MAX_ENH; i++) {
    const result = applyQuickCard(progress, run, { kind: 'ability', stat: 'speed' }, FORMS);
    assert.ok(result.cost > last);
    last = result.cost;
  }
  assert.equal(progress.enh.speed, MAX_ENH);
  const before = progress.yoryeok;
  assert.equal(applyQuickCard(progress, run, { kind: 'ability', stat: 'speed' }, FORMS), null);
  assert.equal(progress.yoryeok, before);
  const broke = setup(quickEnhanceCost(0) - 1);
  assert.equal(applyQuickCard(broke.progress, broke.run, { kind: 'ability', stat: 'growth' }, FORMS), null);
  assert.equal(broke.progress.enh.growth, 0);
});

test('최고 레벨 능력치는 카드로 나오지 않는다', () => {
  const { progress, run } = setup(5000);
  progress.enh.speed = MAX_ENH;
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

// ---- 다시 뽑기(계획서 '변경 이력 5'): 한 판에 CONFIG.reroll.perRun번, 요력은 들지 않고 같은 조건으로 새로 뽑는다 ----
const ids = (cards) => cards.map((card) => card.id).sort().join('|');

test('다시 뽑기 설정: 한 판에 1번이 기본이고, 판마다 새 run이라 판마다 다시 생긴다', () => {
  assert.equal(CONFIG.reroll.perRun, 1);
  const { progress, run } = setup(5000);
  assert.equal(rerollsLeft(run), 1);
  assert.equal(rerollsLeft({}), 1, 'rerollsLeft가 없는 옛 run도 기본 횟수로 본다');
  assert.equal(rerollsLeft(undefined), 1);
  // 쓴 뒤에도 새 판(새 run)은 다시 1번이다
  rerollQuickCards(progress, run, FORMS, { rng: seeded(1) });
  assert.equal(rerollsLeft(run), 0);
  assert.equal(rerollsLeft(createRunLevel(progress)), 1);
});

test('다시 뽑기: 한 번 쓰면 남은 횟수 0, 두 번째는 null이고 카드·요력·run이 그대로다', () => {
  const { progress, run } = setup(evolutionCost(2) - 1);
  const first = pickQuickCards(progress, run, FORMS, { rng: seeded(3) });
  const result = rerollQuickCards(progress, run, FORMS, { rng: seeded(4), previous: first });
  assert.ok(result);
  assert.equal(result.left, 0);
  assert.equal(rerollsLeft(run), 0);
  const snapshot = JSON.stringify({ progress, run });
  assert.equal(rerollQuickCards(progress, run, FORMS, { rng: seeded(5), previous: result.cards }), null);
  assert.equal(JSON.stringify({ progress, run }), snapshot, '실패한 뒤 아무것도 바뀌지 않는다');
});

test('다시 뽑기는 요력을 쓰지 않고, 같은 조건(살 수 있는 카드 규칙)으로 새로 뽑는다', () => {
  for (const [yoryeok, patch] of [[5000, {}], [evolutionCost(2) - 1, {}], [60, {}]]) {
    for (let seed = 1; seed <= 25; seed++) {
      const { progress, run } = setup(yoryeok, patch);
      const before = JSON.stringify(progress);
      const first = pickQuickCards(progress, run, FORMS, { rng: seeded(seed) });
      const result = rerollQuickCards(progress, run, FORMS, { rng: seeded(seed + 1000), previous: first });
      assert.ok(result, '뽑을 카드가 있으면 새로 뽑힌다');
      assert.equal(JSON.stringify(progress), before, '요력도 진행도 그대로');
      assert.ok(result.cards.length >= 1);
      assert.ok(result.cards.every((card) => card.cost <= progress.yoryeok), '살 수 있는 카드만');
      assert.equal(new Set(result.cards.map((card) => card.id)).size, result.cards.length, '같은 카드가 두 번 나오면 안 된다');
      // 진화를 살 수 있는지 여부(= 진화 카드가 있는지)는 처음 조건과 같다
      assert.equal(kinds(result.cards).includes('evolve'), kinds(first).includes('evolve'));
    }
  }
});

test('다시 뽑기: 지금 화면과 다른 구성이 나온다(바뀔 여지가 있을 때)', () => {
  for (const yoryeok of [5000, evolutionCost(2) - 1]) {
    for (let seed = 1; seed <= 40; seed++) {
      const { progress, run } = setup(yoryeok);
      const first = pickQuickCards(progress, run, FORMS, { rng: seeded(seed) });
      const result = rerollQuickCards(progress, run, FORMS, { rng: seeded(seed * 7 + 1), previous: first });
      assert.equal(result.changed, true);
      assert.notEqual(ids(result.cards), ids(first), '요력 ' + yoryeok + ' seed ' + seed);
    }
  }
});

test('다시 뽑기: 고를 수 있는 구성이 하나뿐이면 그대로 돌려주고 횟수는 쓰지 않는다', () => {
  const { progress, run } = setup(evolutionCost(2) - 1);
  for (const stat of Object.keys(progress.enh)) progress.enh[stat] = MAX_ENH;
  const first = pickQuickCards(progress, run, FORMS);
  assert.deepEqual(kinds(first), ['body']);
  const result = rerollQuickCards(progress, run, FORMS, { previous: first });
  assert.equal(result.changed, false);
  assert.deepEqual(kinds(result.cards), ['body']);
  assert.equal(result.left, 1);
  assert.equal(rerollsLeft(run), 1, '바뀐 게 없으면 횟수를 아끼게 한다');
});

test('다시 뽑기: 살 수 있는 카드가 없으면 null이고 횟수도 그대로', () => {
  const { progress, run } = setup(0);
  assert.equal(rerollQuickCards(progress, run, FORMS, { previous: [] }), null);
  assert.equal(rerollsLeft(run), 1);
});

test('다시 뽑기 횟수는 설정값을 따른다(0이면 처음부터 쓸 수 없다, 3이면 세 번)', () => {
  const saved = CONFIG.reroll.perRun;
  try {
    CONFIG.reroll.perRun = 0;
    const none = setup(5000);
    assert.equal(rerollsLeft(none.run), 0);
    assert.equal(rerollQuickCards(none.progress, none.run, FORMS), null);
    CONFIG.reroll.perRun = 3;
    const three = setup(evolutionCost(2) - 1);
    let previous = pickQuickCards(three.progress, three.run, FORMS, { rng: seeded(9) });
    for (let n = 1; n <= 3; n++) {
      const result = rerollQuickCards(three.progress, three.run, FORMS, { rng: seeded(20 + n), previous });
      assert.ok(result, n + '번째');
      assert.equal(result.left, 3 - n);
      previous = result.cards;
    }
    assert.equal(rerollQuickCards(three.progress, three.run, FORMS, { previous }), null);
  } finally {
    CONFIG.reroll.perRun = saved;
  }
});

test('다시 뽑은 카드도 탭하면 그대로 적용된다(요력 차감·결과는 예전 카드와 같은 규칙)', () => {
  const { progress, run } = setup(evolutionCost(2) - 1);
  const first = pickQuickCards(progress, run, FORMS, { rng: seeded(11) });
  const { cards } = rerollQuickCards(progress, run, FORMS, { rng: seeded(12), previous: first });
  const card = cards.find((c) => c.kind === 'body');
  const result = applyQuickCard(progress, run, card, FORMS);
  assert.deepEqual(result, { kind: 'body', cost: bodyCost(0), mult: L.bodyMult });
  assert.equal(progress.yoryeok, evolutionCost(2) - 1 - bodyCost(0));
});

// ---- 능력 +1 카드 문구는 정비 화면과 같은 계산이다(+10 이후 레벨당 효과가 절반, 변경 이력 22) ----
test('quickStatNote: 지금 → 다음 레벨의 실제 효과이고 statUpgradeText(정비 화면)와 글자가 같다', () => {
  for (const stat of ENHANCE.stats) {
    for (let level = 0; level < MAX_ENH; level++) {
      assert.equal(quickStatNote(stat, level), statUpgradeText(stat, level, false), stat + ' Lv ' + level);
    }
  }
  assert.equal(quickStatNote('growth', 0), '먹을 때 자라는 양 +0% → +8%');
  assert.equal(quickStatNote('growth', 9), '먹을 때 자라는 양 +72% → +80%');
  assert.equal(quickStatNote('growth', 10), '먹을 때 자라는 양 +80% → +84%', '+10 이후는 레벨당 효과가 절반이다');
  assert.equal(quickStatNote('speed', 0), '이동 속도 +0% → +4%');
  assert.equal(quickStatNote('speed', 10), '이동 속도 +40% → +42%');
  assert.match(quickStatNote('vitality', 10), /^굶을 때 쓸 생명력 10초 → 10\.3초$/);
  assert.equal(quickStatNote('growth'), quickStatNote('growth', 0), '레벨을 안 주면 0레벨이다');
  assert.equal(quickStatNote('unknown', 3), '');
});

test('능력 +1 카드의 레벨로 문구를 만든다: +10 이후 카드의 효과 차이가 절반으로 보인다', () => {
  const { progress, run } = setup(1e9);
  progress.enh.growth = 10;
  const card = allQuickCards(progress, run, FORMS).find((c) => c.kind === 'ability' && c.stat === 'growth');
  assert.equal(card.level, 10);
  assert.equal(quickStatNote(card.stat, card.level), '먹을 때 자라는 양 +80% → +84%');
  const before = allQuickCards(setup(1e9).progress, run, FORMS).find((c) => c.kind === 'ability' && c.stat === 'growth');
  assert.equal(quickStatNote(before.stat, before.level), '먹을 때 자라는 양 +0% → +8%');
});
