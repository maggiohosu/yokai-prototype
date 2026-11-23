// 보패 출처·강화 확률(사용자 지시 2026-11-24, docs/plan.md 변경 이력 24).
// 상점 보패(학우선·도목검·팔괘경·염주)는 강화 성공률이 여의주의 70%, 대요괴 보패(옥인·단호로·삼청령)는 50%, 여의주는 그대로다.
// 상점은 여의주 + 보패 4종만 팔고, 대요괴 보패 3종은 대요괴를 잡아야 나온다. 실패했을 때 깨질 몫·비용·판매가는 그대로다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WEAPONS, WEAPON_BY_ID, SHOP_BOPAE, HERALD_BOPAE, SUCCESS_MULT } from '../src/data/weapons.js';
import { createProgress } from '../src/systems/progress.js';
import { TREASURE } from '../src/systems/tuning-upgrade.js';
import { isShopKind, isUnlocked, normalizeItem } from '../src/systems/weapons.js';
import { successRate, treasureTable, tryUpgrade, upgradeCost, upgradeOdds, tablePrice, sellPrice } from '../src/systems/treasure.js';
import { buy, buyBlocker, shopCatalog } from '../src/systems/shop.js';
import { grantHeraldBopae, heldItems } from '../src/systems/heraldReward.js';
import { loadProgress, saveProgress, slotKey } from '../src/state/save.js';
import { SAVE } from '../src/systems/tuning-evolution.js';

const MAX = TREASURE.success.length;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} ≠ ${b}`);

// 레벨별 성공률(%): +0 → +1 … +14 → +15. 문서(변경 이력 24)의 표와 같은 값을 따로 적었다.
const YEOUIJU = [90, 85, 80, 75, 70, 60, 55, 50, 45, 40, 30, 25, 20, 15, 10];
const SHOP = [63, 59.5, 56, 52.5, 49, 42, 38.5, 35, 31.5, 28, 21, 17.5, 14, 10.5, 7];
const HERALD = [45, 42.5, 40, 37.5, 35, 30, 27.5, 25, 22.5, 20, 15, 12.5, 10, 7.5, 5];
const GROUPS = [
  { name: '여의주', kinds: ['yeouiju'], mult: 1, rates: YEOUIJU },
  { name: '상점 보패', kinds: ['fan', 'sword', 'mirror', 'beads'], mult: 0.7, rates: SHOP },
  { name: '대요괴 보패', kinds: ['seal', 'gourd', 'bell'], mult: 0.5, rates: HERALD },
];

function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), m };
}

test('출처 값: 상점 4종·대요괴 3종, 배율은 이름 있는 값(SUCCESS_MULT)', () => {
  assert.deepEqual(SUCCESS_MULT, { base: 1, shop: 0.7, herald: 0.5 });
  for (const g of GROUPS) {
    for (const kind of g.kinds) assert.equal(WEAPON_BY_ID[kind].successMult, g.mult, kind);
  }
  assert.deepEqual(WEAPONS.filter((w) => w.source === 'shop').map((w) => w.id), ['yeouiju', ...SHOP_BOPAE]);
  assert.deepEqual(WEAPONS.filter((w) => w.source === 'herald').map((w) => w.id), HERALD_BOPAE);
  for (const w of WEAPONS) assert.ok(w.source === 'shop' || w.source === 'herald', w.id);
  assert.deepEqual(HERALD_BOPAE, ['seal', 'gourd', 'bell']);
  assert.deepEqual(SHOP_BOPAE, ['fan', 'sword', 'mirror', 'beads']);
  for (const id of HERALD_BOPAE) assert.equal(WEAPON_BY_ID[id].unlockStage, null, `${id}: 상점 단계가 없다`);
});

test('레벨별 성공률 = 여의주 × 배율(+0~+14 전부), 소수 첫째 자리까지', () => {
  assert.deepEqual(TREASURE.success, YEOUIJU, '여의주 표는 그대로');
  for (const g of GROUPS) {
    for (const kind of g.kinds) {
      for (let level = 0; level < MAX; level++) {
        assert.equal(successRate(level, kind), g.rates[level], `${kind} +${level} → +${level + 1}`);
        assert.equal(successRate(level, kind), Math.round(TREASURE.success[level] * g.mult * 10) / 10);
        assert.ok(Number.isInteger(Math.round(successRate(level, kind) * 10)), '소수 한 자리');
      }
    }
  }
  assert.equal(successRate(3), 75, 'kind를 안 주면 여의주');
  assert.equal(successRate(3, 'banana'), 75, '모르는 종류도 여의주로 본다(옛 저장 호환)');
  assert.throws(() => successRate(MAX, 'fan'), RangeError);
  assert.throws(() => successRate(-1, 'fan'), RangeError);
  assert.throws(() => successRate(1.5, 'fan'), RangeError);
});

test('upgradeOdds(level, kind): 성공만 배율이 곱해지고, 깨질 몫(실패 중 비율)은 그대로라 깨짐·유지는 남은 확률에서 나뉜다', () => {
  for (const g of GROUPS) {
    for (const kind of g.kinds) {
      for (let level = 0; level < MAX; level++) {
        const odds = upgradeOdds(level, kind);
        near(odds.success + odds.fail + odds.break, 100, `${kind} +${level}`);
        assert.equal(odds.success, g.rates[level]);
        near(odds.break, (100 - g.rates[level]) * TREASURE.breakOnFailure[level] / 100, `${kind} +${level} 깨짐`);
        assert.ok(odds.fail >= -1e-9 && odds.break >= 0, `${kind} +${level}`);
        // 실패 중 깨질 몫 자체는 무기와 무관하다
        if (odds.success < 100) near(odds.break / (100 - odds.success), TREASURE.breakOnFailure[level] / 100, `${kind} +${level} 몫`);
      }
    }
  }
  assert.deepEqual(upgradeOdds(5), upgradeOdds(5, 'yeouiju'));
  assert.deepEqual(upgradeOdds(0), { success: 90, fail: 10, break: 0 });
  assert.deepEqual(upgradeOdds(5, 'fan'), { success: 42, fail: 46.4, break: 11.6 });
  near(upgradeOdds(5, 'seal').break, 14, '+5 대요괴 보패: 실패 70% 중 20%');
  assert.deepEqual(upgradeOdds(14, 'sword'), { success: 7, fail: 0, break: 93 });
  assert.deepEqual(upgradeOdds(14, 'bell'), { success: 5, fail: 0, break: 95 });
  assert.throws(() => upgradeOdds(MAX, 'fan'), RangeError);
});

test('확률표(treasureTable)는 고른 무기의 실제 확률을 보여 주고, 비용은 무기와 무관하게 같다', () => {
  const base = treasureTable('yeouiju');
  for (const g of GROUPS) {
    for (const kind of g.kinds) {
      const rows = treasureTable(kind);
      assert.equal(rows.length, 15);
      assert.deepEqual(rows.map((r) => r.success), g.rates, kind);
      rows.forEach((r, level) => {
        near(r.success + r.fail + r.break, 100, `${kind} +${level}`);
        assert.equal(r.cost, upgradeCost({ kind, level }));
        assert.equal(r.cost, base[level].cost, `${kind} +${level} 강화비는 그대로`);
        assert.equal(r.to, level + 1);
      });
    }
  }
  assert.deepEqual(treasureTable().map((r) => r.success), YEOUIJU, '인자가 없으면 여의주');
});

test('판매가·강화비·깨질 몫(breakOnFailure)은 무기와 무관하게 그대로다', () => {
  assert.deepEqual(TREASURE.breakOnFailure, [0, 0, 0, 0, 0, 20, 25, 30, 35, 40, 60, 70, 80, 90, 100]);
  for (const w of WEAPONS) {
    for (let level = 0; level <= MAX; level++) {
      assert.equal(tablePrice(level, w.id), tablePrice(level, 'yeouiju'), `${w.id} +${level} 표 판매가`);
      assert.equal(sellPrice({ kind: w.id, level }), sellPrice({ kind: 'yeouiju', level }), `${w.id} +${level} 판매가`);
      if (level < MAX) assert.equal(upgradeCost({ kind: w.id, level }), upgradeCost({ kind: 'yeouiju', level }), `${w.id} +${level} 강화비`);
    }
  }
});

test('실제 굴림: 성공 경계가 무기마다 그 무기의 성공률이고 실패 뒤 깨짐 굴림은 breakOnFailure 그대로다', () => {
  const roll = (kind, level, a, b) => {
    const queue = [a, b];
    return tryUpgrade({ kind, level }, { rng: () => (queue.length ? queue.shift() : 0.5) });
  };
  // +0 → +1 : 여의주 90, 상점 63, 대요괴 45
  for (const [kind, rate] of [['yeouiju', 90], ['fan', 63], ['seal', 45]]) {
    assert.equal(roll(kind, 0, (rate - 0.01) / 100, 0).result, 'success', `${kind} 경계 아래`);
    assert.equal(roll(kind, 0, rate / 100, 0).result, 'fail', `${kind} 경계 위 (+0은 깨지지 않는다)`);
  }
  // +5 → +6 : 깨질 몫 20%. 성공 구간 밖(여의주 60 / 상점 42 / 대요괴 30)에서 두 번째 굴림이 0.2 미만이면 깨진다.
  for (const [kind, rate] of [['yeouiju', 60], ['mirror', 42], ['gourd', 30]]) {
    assert.equal(roll(kind, 5, rate / 100 - 1e-9, 0.9).result, 'success', kind);
    assert.deepEqual(roll(kind, 5, rate / 100, 0.19), { result: 'break', from: 5, to: null, shards: 5 }, kind);
    assert.equal(roll(kind, 5, rate / 100, 0.2).result, 'fail', kind);
  }
});

test('모의 굴림 10만 번: 무기 종류별 실제 성공 비율이 표의 성공률과 ±0.8%p 안이다', () => {
  for (const [kind, levels] of [['yeouiju', [0, 7, 12]], ['sword', [0, 7, 12]], ['beads', [3, 9]], ['seal', [0, 7, 12]], ['bell', [3, 9]]]) {
    for (const level of levels) {
      const rng = lcg(0x5eed + level * 31 + kind.length);
      let success = 0;
      let broke = 0;
      const N = 100_000;
      for (let i = 0; i < N; i++) {
        const r = tryUpgrade({ kind, level }, { rng }).result;
        if (r === 'success') success++;
        else if (r === 'break') broke++;
      }
      const odds = upgradeOdds(level, kind);
      assert.ok(Math.abs(success / N * 100 - odds.success) < 0.8, `${kind} +${level} 성공 ${success / N * 100} vs ${odds.success}`);
      assert.ok(Math.abs(broke / N * 100 - odds.break) < 0.8, `${kind} +${level} 깨짐 ${broke / N * 100} vs ${odds.break}`);
    }
  }
});

test('이미 상점에서 산 옥인·단호로·삼청령을 가진 저장은 그대로 가진다: 읽기·강화·판매·저장 왕복', () => {
  const s = fakeStorage();
  const p = createProgress();
  p.treasure = { kind: 'seal', level: 4, paid: 700 };
  p.inventory = [{ kind: 'gourd', level: 2, paid: 65 }, { kind: 'bell', level: 0 }];
  assert.equal(saveProgress(p, s), true);
  assert.equal(JSON.parse(s.m.get(slotKey(1))).version, 1);
  assert.equal(SAVE.version, 1);
  const loaded = loadProgress(s);
  assert.deepEqual(loaded.treasure, { kind: 'seal', level: 4, paid: 700 });
  assert.deepEqual(loaded.inventory, [{ kind: 'gourd', level: 2, paid: 65 }, { kind: 'bell', level: 0 }]);
  assert.deepEqual(normalizeItem({ kind: 'seal', level: 4, paid: 700 }), { kind: 'seal', level: 4, paid: 700 });
  // 대요괴 보패도 강화할 수 있고(성공률만 50%) 팔 수 있다
  assert.equal(tryUpgrade(loaded.treasure, { rng: () => 0.349 }).result, 'success', '+4 → +5 옥인은 70%의 절반인 35%');
  assert.equal(loaded.treasure.level, 5);
  assert.equal(sellPrice(loaded.inventory[0]), Math.min(tablePrice(2), 65));
  // 대요괴 보상이 가진 것을 빼앗지 않는다
  for (let n = 0; n < 20; n++) {
    const copy = structuredClone(loaded);
    grantHeraldBopae(copy, { rng: lcg(9 + n) });
    assert.deepEqual(heldItems(copy).filter((it) => ['seal', 'gourd', 'bell'].includes(it.kind)).map((it) => it.kind).sort(), ['bell', 'gourd', 'seal']);
  }
  // 상점은 더 이상 이 셋을 팔지 않는다
  for (const kind of HERALD_BOPAE) assert.equal(buyBlocker(p, kind, 0), 'kind');
});

test('상점: 학우선(2단계)·도목검(2단계)·팔괘경(3단계)·염주(3단계)만 단계별로 열린다. 옥인·단호로·삼청령은 5단계에서도 없다', () => {
  const stageOf = { yeouiju: 1, fan: 2, sword: 2, mirror: 3, beads: 3 };
  for (const stage of [1, 2, 3, 4, 5]) {
    const p = Object.assign(createProgress(), { yoryeok: 1e9, discovered: [], stage });
    const cards = shopCatalog(p);
    assert.deepEqual(cards.map((c) => c.kind), ['yeouiju', 'fan', 'sword', 'mirror', 'beads'], `단계 ${stage} 진열`);
    for (const card of cards) assert.equal(card.locked, stageOf[card.kind] > stage, `${card.kind} @${stage}`);
    for (const kind of HERALD_BOPAE) {
      assert.equal(isUnlocked(p, kind), false);
      assert.equal(isShopKind(kind), false);
      assert.deepEqual(buy(p, kind, 0), { ok: false, reason: 'kind' }, `${kind} @${stage}`);
    }
    for (const kind of Object.keys(stageOf)) assert.equal(isShopKind(kind), true, kind);
  }
});

test('대요괴 보상으로 나온 보패는 여의주 배율로 강화된다(옥인 50%, 염주(보너스) 70%)', () => {
  const p = createProgress();
  p.treasure = null;
  p.inventory = [];
  const first = grantHeraldBopae(p, { rng: () => 0 });
  assert.equal(first.kind, 'seal');
  assert.equal(successRate(0, first.kind), 45);
  const withHerald = Object.assign(createProgress(), { inventory: [{ kind: 'seal', level: 0 }, { kind: 'gourd', level: 0 }, { kind: 'bell', level: 0 }] });
  const bonus = grantHeraldBopae(withHerald, { rng: () => 0.99 });
  assert.equal(bonus.kind, 'beads');
  assert.equal(bonus.source, 'shop');
  assert.equal(successRate(0, bonus.kind), 63);
});

test('연결: 상점·확률표 화면이 고른 무기의 확률을 읽고, 새 단계 알림은 상점 보패만 센다', () => {
  const hub = readFileSync(new URL('../src/ui/HubView.js', import.meta.url), 'utf8');
  assert.ok(hub.includes('upgradeOdds(item.level, kindOf(item))'), '강화 결과 문구의 확률은 장착한 무기 것');
  assert.ok(hub.includes('upgradeOddsTable(item.level, kindOf(item))'), '다음 강화 확률은 장착한 무기 것');
  assert.ok(hub.includes('upgradeOdds(outcome.from, kind)'), '보호권 선택 뒤 문구도 그 무기 것');
  assert.ok(hub.includes('treasureTable(weapon.id)'), '확률표는 고른 무기 것');
  assert.ok(!hub.includes('모든 보물의 강화 확률은 같아요'), '예전 안내(모든 무기 같은 확률)는 없다');
  assert.ok(hub.includes('SUCCESS_MULT.shop') && hub.includes('SUCCESS_MULT.herald'), '상점 안내가 배율 값을 읽는다');
  const fx = readFileSync(new URL('../src/game/fx.js', import.meta.url), 'utf8');
  assert.ok(fx.includes("w.source === 'shop'"), '새 보패 알림은 상점에서 파는 무기만');
});
