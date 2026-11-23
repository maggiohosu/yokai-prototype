import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { createProgress } from '../src/systems/progress.js';
import { TREASURE } from '../src/systems/tuning-upgrade.js';
import { saveProgress, loadProgress, normalizeProgress } from '../src/state/save.js';
import { SAVE } from '../src/systems/tuning-evolution.js';
import { sellPrice, upgradeCost, sell, equip, addToInventory, tryUpgrade, saleValue, hasPaid } from '../src/systems/treasure.js';
import {
  buyPrice, buyBlocker, shopCatalog, shopLevels, buy, blockerText,
} from '../src/systems/shop.js';

const SHOP = CONFIG.shop;

const rich = (yoryeok = 1_000_000) => Object.assign(createProgress(), { yoryeok });

test('상점은 여의주와 보패 4종(학우선·도목검·팔괘경·염주)을 해금 단계 순서로 진열하고 카드마다 +0~+5를 낮은 레벨부터 담는다', () => {
  assert.deepEqual(shopLevels(), [0, 1, 2, 3, 4, 5]);
  const catalog = shopCatalog(rich());
  assert.deepEqual(catalog.map((card) => card.kind), ['yeouiju', 'fan', 'sword', 'mirror', 'beads'], '옥인·단호로·삼청령은 대요괴로만 얻는다(변경 이력 24)');
  assert.deepEqual(catalog.map((card) => card.unlockStage), [1, 2, 2, 3, 3]);
  for (const card of catalog) {
    assert.deepEqual(card.levels.map((x) => x.level), [0, 1, 2, 3, 4, 5], card.kind);
    const prices = card.levels.map((x) => x.price);
    for (let i = 1; i < prices.length; i++) assert.ok(prices[i] > prices[i - 1], card.kind);
  }
});

test('구매가 = 같은 레벨 판매가 × 2.5(반올림)', () => {
  assert.equal(SHOP.priceMult, 2.5);
  for (const level of shopLevels()) assert.equal(buyPrice(level), Math.round(sellPrice(level) * 2.5));
  assert.deepEqual(shopLevels().map(buyPrice), [13, 28, 65, 145, 330, 750]);
});

test('팔지 않는 레벨(범위 밖·정수 아님)은 가격을 묻거나 사려 해도 거절한다', () => {
  const p = rich();
  for (const bad of [-1, 6, 15, 1.5, '1', null, undefined, NaN]) {
    assert.throws(() => buyPrice(bad), RangeError, String(bad));
    assert.equal(buyBlocker(p, bad), 'level');
    assert.deepEqual(buy(p, bad), { ok: false, reason: 'level' });
  }
  assert.equal(p.yoryeok, 1_000_000);
  assert.deepEqual(p.inventory, []);
});

test('사면 요력이 구매가만큼 빠지고 보관함에 { kind, level, paid }가 들어간다', () => {
  const p = rich(1000);
  const r = buy(p, 3);
  assert.deepEqual(r, { ok: true, kind: 'yeouiju', level: 3, price: 145 });
  assert.equal(p.yoryeok, 1000 - 145);
  assert.deepEqual(p.inventory, [{ kind: 'yeouiju', level: 3, paid: 145 }]);
  assert.equal(p.treasure, null, '장착은 하지 않는다(보관함에서 고른다)');
  assert.equal(equip(p, 0), true, '산 여의주는 그대로 장착할 수 있다');
  assert.equal(p.treasure.level, 3);
});

test('사서 바로 팔면 모든 레벨에서 손해다(보관함에서 팔기·장착 후 팔기 둘 다)', () => {
  for (const level of shopLevels()) {
    for (const route of ['inventory', 'equipped']) {
      const p = rich(100_000);
      const before = p.yoryeok;
      assert.ok(buy(p, level).ok);
      if (route === 'equipped') assert.ok(equip(p, 0));
      assert.ok(sell(p, route === 'equipped' ? 'equipped' : 0) > 0);
      assert.ok(p.yoryeok < before, `+${level} ${route}: ${before} → ${p.yoryeok}`);
      assert.equal(before - p.yoryeok, buyPrice(level) - sellPrice(level));
    }
  }
});

test('구매가는 모든 레벨에서 판매가보다 크고 그 차이가 1 이상이다(반올림이 손해를 지우지 않는다)', () => {
  for (const level of shopLevels()) {
    assert.ok(buyPrice(level) >= sellPrice(level) + 1, `+${level}`);
    assert.ok(buyPrice(level) >= sellPrice(level) * 2, `+${level} 2배 이상`);
  }
});

test('같은 여의주를 연달아 사고팔아도 요력이 늘지 않는다', () => {
  const p = rich(1_000_000);
  const start = p.yoryeok;
  for (let i = 0; i < 50; i++) {
    const level = i % 3;
    assert.ok(buy(p, level).ok);
    sell(p, 0);
  }
  assert.ok(p.yoryeok < start);
});

test('보관함이 가득 차면 구매 불가: 요력과 보관함이 그대로다', () => {
  const p = rich();
  for (let i = 0; i < TREASURE.inventorySlots; i++) assert.ok(addToInventory(p, { level: 0 }));
  const snapshot = structuredClone(p);
  for (const level of shopLevels()) {
    assert.equal(buyBlocker(p, level), 'full');
    assert.deepEqual(buy(p, level), { ok: false, reason: 'full' });
  }
  assert.deepEqual(p, snapshot);
});

test('장착 칸의 여의주는 보관함 자리를 쓰지 않는다: 보관함이 4칸이면 아직 살 수 있고 5칸이 되면 막힌다', () => {
  const p = rich();
  p.treasure = { level: 2 };
  for (let i = 0; i < TREASURE.inventorySlots - 1; i++) assert.ok(addToInventory(p, { level: 1 }));
  assert.equal(buyBlocker(p, 0), null);
  assert.ok(buy(p, 0).ok);
  assert.equal(p.inventory.length, TREASURE.inventorySlots);
  assert.equal(buy(p, 0).reason, 'full');
});

test('요력이 모자라면 구매 불가, 딱 구매가만큼이면 살 수 있고 잔액은 0이다', () => {
  for (const level of shopLevels()) {
    const price = buyPrice(level);
    const poor = rich(price - 1);
    assert.equal(buyBlocker(poor, level), 'funds');
    assert.deepEqual(buy(poor, level), { ok: false, reason: 'funds' });
    assert.equal(poor.yoryeok, price - 1);
    assert.deepEqual(poor.inventory, []);
    const exact = rich(price);
    assert.deepEqual(buy(exact, level), { ok: true, kind: 'yeouiju', level, price });
    assert.equal(exact.yoryeok, 0);
    assert.equal(exact.inventory.length, 1);
  }
});

test('요력이 이상한 값(NaN·undefined)이면 구매하지 않는다', () => {
  for (const bad of [NaN, undefined, null]) {
    const p = rich();
    p.yoryeok = bad;
    assert.equal(buyBlocker(p, 0), 'funds');
    assert.equal(buy(p, 0).ok, false);
    assert.deepEqual(p.inventory, []);
  }
});

test('보관함이 가득 찬 채 요력도 모자라면 가득 참을 먼저 알린다', () => {
  const p = rich(0);
  for (let i = 0; i < TREASURE.inventorySlots; i++) addToInventory(p, { level: 0 });
  assert.equal(buyBlocker(p, 5), 'full');
});

test('막힌 이유마다 안내 문구가 있다', () => {
  for (const reason of ['level', 'full', 'funds']) assert.ok(blockerText[reason]?.length > 0, reason);
});

test('상점 수치는 CONFIG.shop에 있다(판당 재고 한도는 없다)', () => {
  assert.deepEqual(SHOP, { priceMult: 2.5, minLevel: 0, maxLevel: 5 });
});

// 사서 강화해 팔아도 들인 요력(구매가 + 강화비)보다 많이 받지 못한다(본전 상한: 판매가 = min(표 판매가, paid)).
test('사서 +5까지 강화해 팔아도 들인 요력보다 많이 받지 못한다', () => {
  const p = rich(100_000);
  const start = p.yoryeok;
  assert.ok(buy(p, 0).ok);
  assert.ok(equip(p, 0));
  while (p.treasure.level < SHOP.maxLevel) {
    p.yoryeok -= upgradeCost(p.treasure.level);
    assert.equal(tryUpgrade(p.treasure, { rng: () => 0 }).result, 'success');
  }
  assert.ok(saleValue(p.treasure) < sellPrice(SHOP.maxLevel), '표 판매가보다 본전이 낮아 본전까지만 받는다');
  assert.ok(sell(p, 'equipped') > 0);
  assert.ok(p.yoryeok <= start, `${start} → ${p.yoryeok}`);
});

// ---- 본전 상한 보강(S7): 판매가 규칙, paid 누적, 드롭 여의주, 저장 ----
function seeded(initial) {
  let seed = initial;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), m };
}

test('판매가: 상점품은 min(표 판매가, paid), 드롭 여의주(paid 없음)는 표 판매가', () => {
  assert.equal(saleValue({ level: 5 }), 300);
  assert.equal(saleValue({ level: 5, paid: 750 }), 300, '비싸게 샀어도 표 판매가보다 더 받지는 못한다');
  assert.equal(saleValue({ level: 5, paid: 55 }), 55, '표 판매가가 높아도 들인 요력까지만');
  assert.equal(saleValue({ level: 0, paid: 0 }), 0);
  assert.equal(hasPaid({ level: 1 }), false);
  assert.equal(hasPaid({ level: 1, paid: 0 }), true);
  for (const bad of ['5', NaN, -1, null, Infinity]) assert.equal(hasPaid({ level: 1, paid: bad }), false, String(bad));
  assert.equal(saleValue({ level: 5, paid: 'x' }), 300, '값이 이상하면 상한을 적용하지 않는다(저장을 읽을 때 이미 버린다)');
});

test('상점품을 강화하면 시도마다 강화비가 paid에 더해진다(성공·실패 모두)', () => {
  const orb = { level: 0, paid: 13 };
  assert.equal(tryUpgrade(orb, { rng: () => 0 }).result, 'success');
  assert.equal(orb.paid, 13 + upgradeCost(0));
  assert.equal(tryUpgrade(orb, { rng: () => 0.99 }).result, 'fail');
  assert.equal(orb.level, 1);
  assert.equal(orb.paid, 13 + upgradeCost(0) + upgradeCost(1));
});

test('드롭 여의주(paid 없음)는 강화해도 paid가 생기지 않는다', () => {
  const orb = { level: 0 };
  tryUpgrade(orb, { rng: () => 0 });
  assert.equal('paid' in orb, false);
});

test('사서 강화해서 팔아도 이익은 0 이하다(모든 레벨에서 +15까지, 운이 가장 좋은 경로)', () => {
  for (const from of shopLevels()) {
    for (const target of [from, 5, 10, 15].filter((t) => t >= from)) {
      const p = rich(1_000_000);
      const start = p.yoryeok;
      assert.ok(buy(p, from).ok);
      assert.ok(equip(p, 0));
      while (p.treasure.level < target) {
        p.yoryeok -= upgradeCost(p.treasure.level);
        assert.equal(tryUpgrade(p.treasure, { rng: () => 0 }).result, 'success');
      }
      sell(p, 'equipped');
      assert.ok(p.yoryeok <= start, `+${from} 구매 → +${target} 판매: 이익 ${p.yoryeok - start}`);
    }
  }
});

test('사서 강화해서 팔면 실패·깨짐이 섞여도 이익이 0 이하다(난수 시험)', () => {
  const rng = seeded(0x5ee7);
  for (let trial = 0; trial < 600; trial++) {
    const from = shopLevels()[trial % shopLevels().length];
    const p = rich(1_000_000);
    const start = p.yoryeok;
    assert.ok(buy(p, from).ok);
    assert.ok(equip(p, 0));
    const attempts = 1 + Math.floor(rng() * 30);
    for (let i = 0; i < attempts && p.treasure && p.treasure.level < TREASURE.success.length; i++) {
      p.yoryeok -= upgradeCost(p.treasure.level);
      if (tryUpgrade(p.treasure, { rng }).result === 'break') p.treasure = null;
    }
    if (p.treasure) sell(p, 'equipped');
    assert.ok(p.yoryeok <= start, `trial ${trial}: 이익 ${p.yoryeok - start}`);
  }
});

test('보관함에서 팔아도, 장착해서 팔아도 같은 상한을 받는다', () => {
  const p = rich();
  assert.ok(buy(p, 0).ok);
  assert.ok(buy(p, 0).ok);
  assert.ok(equip(p, 0));
  assert.equal(sell(p, 'equipped'), sellPrice(0));
  assert.equal(sell(p, 0), sellPrice(0));
});

test('드롭 여의주는 그대로 강화해 팔면 이익이다(핵심 재미 유지)', () => {
  const p = rich(0);
  p.treasure = { level: 0 };
  let spent = 0;
  while (p.treasure.level < 5) {
    spent += upgradeCost(p.treasure.level);
    assert.equal(tryUpgrade(p.treasure, { rng: () => 0 }).result, 'success');
  }
  const received = sell(p, 'equipped');
  assert.equal(received, sellPrice(5));
  assert.ok(received > spent, `드롭 +0 → +5 판매: 받은 ${received}, 쓴 ${spent}`);
});

test('상점품 표시(paid)는 저장했다 불러와도 유지되고, 이상한 값은 버린다', () => {
  const storage = fakeStorage();
  const p = rich(5000);
  assert.ok(buy(p, 2).ok);
  p.treasure = { level: 4, paid: 77.5 };
  p.inventory.push({ level: 1 });
  assert.ok(saveProgress(p, storage));
  const loaded = loadProgress(storage);
  assert.deepEqual(loaded.inventory, [{ kind: 'yeouiju', level: 2, paid: 65 }, { kind: 'yeouiju', level: 1 }]);
  assert.deepEqual(loaded.treasure, { kind: 'yeouiju', level: 4, paid: 77.5 });
  assert.equal(saleValue(loaded.inventory[0]), sellPrice(2), '표 판매가 26이 산 값 65보다 작아 26');
  const dirty = normalizeProgress({
    treasure: { level: 3, paid: 'x' },
    inventory: [{ level: 1, paid: -5 }, { level: 2, paid: NaN }, { level: 0, paid: 0 }],
  });
  assert.deepEqual(dirty.treasure, { kind: 'yeouiju', level: 3 });
  assert.deepEqual(dirty.inventory, [{ kind: 'yeouiju', level: 1 }, { kind: 'yeouiju', level: 2 }, { kind: 'yeouiju', level: 0, paid: 0 }]);
});

test('저장 버전은 1 그대로다(버전이 다르면 슬롯을 버리므로 바꾸지 않는다)', () => {
  assert.equal(SAVE.version, 1);
  const storage = fakeStorage();
  saveProgress(rich(), storage);
  const [key] = [...storage.m.keys()].filter((k) => k.includes('slot'));
  assert.equal(JSON.parse(storage.m.get(key)).version, 1);
});

