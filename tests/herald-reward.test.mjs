import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONFIG } from '../src/config.js';
import { createProgress } from '../src/systems/progress.js';
import { HERALD_BOPAE, SHOP_BOPAE, WEAPONS } from '../src/data/weapons.js';
import { TREASURE } from '../src/systems/tuning-upgrade.js';
import { sellPrice } from '../src/systems/treasure.js';
import { buy } from '../src/systems/shop.js';
import { normalizeProgress, loadProgress, saveProgress, slotKey } from '../src/state/save.js';
import { SAVE } from '../src/systems/tuning-evolution.js';
import { BOPAE, grantHeraldBopae, heldBopaeKinds, heldItems, heraldRewardText, missingBopae } from '../src/systems/heraldReward.js';

const MAX = TREASURE.success.length;
const NAMES = { fan: '학우선', sword: '도목검', mirror: '팔괘경', beads: '염주', seal: '옥인', gourd: '단호로', bell: '삼청령' };
const SEVEN = ['fan', 'sword', 'mirror', 'beads', 'seal', 'gourd', 'bell'];
const HERALD = ['seal', 'gourd', 'bell']; // 상점에 없고 대요괴로만 나오는 보패(변경 이력 24)
const SHOP4 = ['fan', 'sword', 'mirror', 'beads']; // 상점 보패: 대요괴 보패를 다 가진 뒤에 보너스로 나온다

function lcg(seed = 1) {
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
// kinds를 장착 칸 → 보관함 순으로 채운 진행(보관함은 5칸을 넘겨도 직접 채워 시험한다).
function withItems(items) {
  const p = createProgress();
  const [first, ...rest] = items;
  p.treasure = first ?? null;
  p.inventory = rest;
  return p;
}
const item = (kind, level = 0, extra = {}) => ({ kind, level, ...extra });

test('보패는 여의주를 뺀 7종이고 이름이 데이터와 같다', () => {
  assert.deepEqual(BOPAE, SEVEN);
  assert.deepEqual(BOPAE, WEAPONS.filter((w) => w.id !== 'yeouiju').map((w) => w.id));
  for (const w of WEAPONS) if (w.id !== 'yeouiju') assert.equal(w.name, NAMES[w.id]);
  assert.deepEqual(HERALD_BOPAE, HERALD);
  assert.deepEqual(SHOP_BOPAE, SHOP4);
  assert.deepEqual([...SHOP_BOPAE, ...HERALD_BOPAE].sort(), [...SEVEN].sort(), '두 출처가 7종을 나눈다');
});

test('아무것도 없으면 대요괴 보패 3종 중 하나가 +0으로 나와 장착된다', () => {
  const p = createProgress();
  const r = grantHeraldBopae(p, { bonusYoryeok: 100, rng: () => 0 });
  assert.equal(r.type, 'new');
  assert.equal(r.kind, 'seal');
  assert.equal(r.source, 'herald');
  assert.equal(r.placed, 'equipped');
  assert.deepEqual(p.treasure, { kind: 'seal', level: 0 });
  assert.deepEqual(p.inventory, []);
  assert.equal(p.yoryeok, 0, '새 보패는 요력을 더하지 않는다');
  assert.equal(r.yoryeok, 0);
});

test('장착 칸이 차 있으면 보관함에 들어가고 장착은 그대로다', () => {
  const p = withItems([item('yeouiju', 4)]);
  const r = grantHeraldBopae(p, { rng: () => 0.99 });
  assert.equal(r.type, 'new');
  assert.equal(r.kind, 'bell');
  assert.equal(r.placed, 'inventory');
  assert.deepEqual(p.treasure, item('yeouiju', 4));
  assert.deepEqual(p.inventory, [item('bell', 0)]);
});

test('대요괴 보패 3종이 같은 확률로 뽑힌다(rng 구간마다 하나씩, 모의 추첨도 고르다). 상점 보패는 이 단계에서 나오지 않는다', () => {
  // 구간 경계: i/3 바로 위가 i번째 대요괴 보패
  for (let i = 0; i < HERALD.length; i++) {
    const p = createProgress();
    assert.equal(grantHeraldBopae(p, { rng: () => (i + 0.5) / 3 }).kind, HERALD[i]);
  }
  assert.equal(grantHeraldBopae(createProgress(), { rng: () => 1 }).kind, 'bell', 'rng가 1이어도 범위를 벗어나지 않는다');
  assert.equal(grantHeraldBopae(createProgress(), { rng: () => NaN }).kind, 'seal', 'rng가 이상해도 깨지지 않는다');
  // 모의 추첨: 3종이 각각 1/3 근처, 상점 보패는 한 번도 없다
  const rng = lcg(20261123);
  const N = 12000;
  const count = Object.fromEntries(HERALD.map((k) => [k, 0]));
  for (let i = 0; i < N; i++) count[grantHeraldBopae(createProgress(), { rng }).kind]++;
  for (const k of HERALD) assert.ok(Math.abs(count[k] / N - 1 / 3) < 0.015, k + ' ' + count[k] / N);
  assert.equal(HERALD.reduce((sum, k) => sum + count[k], 0), N);
});

test('추첨 순서: 대요괴 보패 3종 → 상점 보패 4종(보너스) → 가진 보패 +1 강화 → 요력', () => {
  const p = createProgress();
  p.inventory = [];
  const rng = lcg(31);
  const log = [];
  // 장착 칸 1 + 보관함 5 = 6자리. 처음 3번은 대요괴 보패, 그다음 3번은 상점 보패다.
  for (let n = 0; n < 6; n++) log.push(grantHeraldBopae(p, { rng }));
  assert.deepEqual(log.map((r) => r.type), Array(6).fill('new'));
  assert.deepEqual(log.slice(0, 3).map((r) => r.source), ['herald', 'herald', 'herald']);
  assert.deepEqual(log.slice(0, 3).map((r) => r.kind).sort(), [...HERALD].sort(), '3번에 전용 3종이 하나씩');
  assert.deepEqual(log.slice(3).map((r) => r.source), ['shop', 'shop', 'shop']);
  for (const r of log.slice(3)) assert.ok(SHOP4.includes(r.kind), r.kind);
  assert.equal(new Set(heldItems(p).map((it) => it.kind)).size, 6, '중복 없음');
  // 자리가 가득 찼다: 7종째(남은 상점 보패 1종)는 놓을 수 없어 강화로 바뀐다
  const next = grantHeraldBopae(p, { rng });
  assert.equal(next.type, 'enhance');
  assert.equal(next.full, true);
  // 모두 최대 레벨이면 요력
  for (const it of heldItems(p)) it.level = MAX;
  const last = grantHeraldBopae(p, { bonusYoryeok: 50, rng });
  assert.equal(last.type, 'yoryeok');
  assert.equal(last.amount, 100);
});

test('대요괴 보패를 다 가졌으면 안 가진 상점 보패 중에서 같은 확률로 뽑아 +0으로 준다(보너스)', () => {
  const make = () => withItems([item('seal', 2), item('gourd', 0), item('bell', 5), item('yeouiju', 3)]);
  assert.deepEqual(missingBopae(make(), HERALD_BOPAE), []);
  assert.deepEqual(missingBopae(make()), SHOP4);
  for (let i = 0; i < SHOP4.length; i++) {
    const p = make();
    const r = grantHeraldBopae(p, { rng: () => (i + 0.5) / 4 });
    assert.equal(r.type, 'new');
    assert.equal(r.kind, SHOP4[i]);
    assert.equal(r.source, 'shop');
    assert.equal(r.placed, 'inventory');
    assert.deepEqual(p.inventory.at(-1), item(SHOP4[i], 0), '+0, paid 없음');
    assert.equal(p.yoryeok, 0);
  }
  // 이미 가진 상점 보패(상점에서 산 것)는 다시 나오지 않는다
  const q = make();
  q.inventory.push(item('mirror', 1, { paid: 40 }));
  assert.deepEqual(missingBopae(q), ['fan', 'sword', 'beads']);
  const rng = lcg(11);
  for (let n = 0; n < 300; n++) assert.notEqual(grantHeraldBopae(structuredClone(q), { rng }).kind, 'mirror');
  // 모의 추첨: 4종이 고르다
  const count = Object.fromEntries(SHOP4.map((k) => [k, 0]));
  const N = 12000;
  for (let i = 0; i < N; i++) count[grantHeraldBopae(make(), { rng }).kind]++;
  for (const k of SHOP4) assert.ok(Math.abs(count[k] / N - 1 / 4) < 0.015, k + ' ' + count[k] / N);
});

test('이미 가진 보패는 다시 나오지 않는다(장착 칸·보관함 모두, 여의주는 보패로 세지 않는다)', () => {
  const p = withItems([item('mirror', 2), item('fan', 1), item('yeouiju', 0)]);
  assert.deepEqual([...heldBopaeKinds(p)].sort(), ['fan', 'mirror']);
  assert.deepEqual(missingBopae(p), ['sword', 'beads', 'seal', 'gourd', 'bell']);
  const rng = lcg(7);
  for (let i = 0; i < 400; i++) {
    const copy = structuredClone(p);
    const r = grantHeraldBopae(copy, { rng });
    assert.equal(r.type, 'new');
    assert.ok(HERALD.includes(r.kind), '대요괴 보패가 남아 있으면 그것부터: ' + r.kind);
    assert.ok(!['mirror', 'fan'].includes(r.kind), r.kind);
  }
  // 전용 3종 중 하나(옥인)를 이미 가졌으면 나머지 둘만 나온다
  const withSeal = withItems([item('seal', 4), item('mirror', 2)]);
  for (let i = 0; i < 400; i++) assert.ok(['gourd', 'bell'].includes(grantHeraldBopae(structuredClone(withSeal), { rng }).kind));
});

test('여러 번 받아도 같은 보패가 두 개 생기지 않는다(자리가 찰 때까지 새 종류만, 그 뒤는 강화)', () => {
  const p = createProgress();
  const rng = lcg(99);
  const slots = 1 + TREASURE.inventorySlots;
  for (let n = 1; n <= slots; n++) {
    const r = grantHeraldBopae(p, { rng });
    assert.equal(r.type, 'new', n + '번째는 새 보패');
    const kinds = heldItems(p).map((it) => it.kind);
    assert.equal(new Set(kinds).size, kinds.length, '중복 없음');
    assert.equal(kinds.length, n);
  }
  assert.equal(p.inventory.length, TREASURE.inventorySlots);
  // 자리가 가득 찼다: 이제는 새 보패를 놓을 수 없어 가진 보패를 강화한다. 개수·종류는 그대로.
  const before = heldItems(p).map((it) => it.kind).sort();
  for (let n = 0; n < 30; n++) {
    const r = grantHeraldBopae(p, { rng });
    assert.equal(r.type, 'enhance');
    assert.equal(r.full, true);
    assert.deepEqual(heldItems(p).map((it) => it.kind).sort(), before);
  }
});

test('가진 목록의 보패 종류와 개수를 지우지 않는다(상점에서 산 것도 가진 것으로 센다)', () => {
  const p = createProgress();
  p.yoryeok = 1e9;
  p.stage = 5;
  assert.equal(buy(p, 'fan', 0).ok, true);
  assert.deepEqual(missingBopae(p), SEVEN.filter((k) => k !== 'fan'));
  // 상점에서는 이제 옥인을 팔지 않는다. 예전에 산 옥인이 저장에 있으면 그대로 가진 것으로 센다.
  assert.deepEqual(buy(p, 'seal', 0), { ok: false, reason: 'kind' });
  p.inventory.push({ kind: 'seal', level: 3, paid: 90 });
  assert.deepEqual(missingBopae(p), SEVEN.filter((k) => !['fan', 'seal'].includes(k)));
  for (let n = 0; n < 50; n++) {
    const copy = structuredClone(p);
    const r = grantHeraldBopae(copy, { rng: lcg(3 + n) });
    assert.notEqual(r.kind, 'seal');
    assert.notEqual(r.kind, 'fan');
    assert.deepEqual(copy.inventory.find((it) => it.kind === 'seal'), { kind: 'seal', level: 3, paid: 90 }, '산 옥인은 그대로(빼앗지 않는다)');
  }
});

test('보관함이 가득 차 있으면 +0 여의주(드롭품) 하나를 판 값(표 판매가)을 요력으로 받고 그 자리에 보패를 넣는다', () => {
  const p = withItems([item('yeouiju', 7)]);
  p.inventory = [item('yeouiju', 0), item('yeouiju', 0), item('yeouiju', 3), item('yeouiju', 0, { paid: 5 }), item('yeouiju', 0)];
  p.yoryeok = 50;
  const price = sellPrice(item('yeouiju', 0));
  const r = grantHeraldBopae(p, { rng: () => 0 });
  assert.equal(r.type, 'new');
  assert.equal(r.kind, 'seal');
  assert.equal(r.placed, 'inventory');
  assert.equal(r.soldYoryeok, price);
  assert.equal(r.yoryeok, price);
  assert.equal(p.yoryeok, 50 + price);
  assert.equal(p.inventory.length, TREASURE.inventorySlots, '칸 수는 5를 넘지 않는다');
  assert.equal(p.inventory.at(-1).kind, 'seal');
  // 지운 것은 맨 앞의 +0 여의주 하나뿐: +3 여의주·상점에서 산 +0 여의주·장착한 것은 그대로
  assert.deepEqual(p.treasure, item('yeouiju', 7));
  assert.equal(p.inventory.filter((it) => it.kind === 'yeouiju').length, 4);
  assert.ok(p.inventory.some((it) => it.level === 3));
  assert.ok(p.inventory.some((it) => it.paid === 5));
  assert.match(heraldRewardText(r), /보패 획득: 옥인/);
});

test('보관함이 가득 차고 치울 +0 여의주도 없으면 가진 보패를 +1 강화한다(여의주는 강화하지 않는다)', () => {
  const p = withItems([item('yeouiju', 2)]);
  p.inventory = [item('sword', 4), item('yeouiju', 1), item('yeouiju', 1), item('yeouiju', 1), item('yeouiju', 1)];
  const r = grantHeraldBopae(p, { rng: () => 0.5 });
  assert.deepEqual({ type: r.type, kind: r.kind, from: r.from, to: r.to, full: r.full }, { type: 'enhance', kind: 'sword', from: 4, to: 5, full: true });
  assert.equal(p.inventory[0].level, 5);
  assert.equal(p.treasure.level, 2);
  assert.equal(p.inventory.length, TREASURE.inventorySlots);
});

test('7종을 모두 가졌으면 가진 보패 중 하나를 같은 확률로 +1 강화한다', () => {
  const make = () => withItems(SEVEN.map((k, i) => item(k, i)));
  const all = make();
  assert.deepEqual(missingBopae(all), []);
  for (let i = 0; i < SEVEN.length; i++) {
    const p = make();
    const r = grantHeraldBopae(p, { rng: () => (i + 0.5) / 7 });
    assert.equal(r.type, 'enhance');
    assert.equal(r.kind, SEVEN[i]);
    assert.equal(r.from, i);
    assert.equal(r.to, i + 1);
    assert.equal(r.full, false);
    assert.equal(heldItems(p).find((it) => it.kind === SEVEN[i]).level, i + 1);
    assert.equal(heldItems(p).length, 7, '개수 그대로');
    assert.equal(r.yoryeok, 0);
  }
  // 모의 추첨: 7종이 고르게 뽑힌다
  const rng = lcg(5);
  const count = Object.fromEntries(SEVEN.map((k) => [k, 0]));
  const N = 14000;
  for (let i = 0; i < N; i++) count[grantHeraldBopae(withItems(SEVEN.map((k) => item(k, 0))), { rng }).kind]++;
  for (const k of SEVEN) assert.ok(Math.abs(count[k] / N - 1 / 7) < 0.012, k + ' ' + count[k] / N);
});

test('강화 대상이 최대 레벨이면 다른 보패를 강화한다(최대 레벨 것은 절대 뽑히지 않는다)', () => {
  for (const rv of [0, 0.2, 0.5, 0.8, 0.999]) {
    const p = withItems(SEVEN.map((k) => item(k, k === 'fan' || k === 'bell' ? MAX : 3)));
    const r = grantHeraldBopae(p, { rng: () => rv });
    assert.equal(r.type, 'enhance');
    assert.ok(!['fan', 'bell'].includes(r.kind), r.kind);
    assert.equal(r.to, 4);
    assert.equal(p.treasure.level, MAX);
  }
  // 하나만 남았으면 그것을 강화한다
  const p = withItems(SEVEN.map((k) => item(k, k === 'gourd' ? MAX - 1 : MAX)));
  const r = grantHeraldBopae(p, { rng: () => 0 });
  assert.equal(r.kind, 'gourd');
  assert.equal(r.to, MAX);
  assert.equal(p.inventory.find((it) => it.kind === 'gourd').level, MAX);
});

test('보패 7종이 모두 최대 레벨이면 이 대요괴 보너스 요력 × yoryeokMult만큼 요력을 받는다', () => {
  const p = withItems(SEVEN.map((k) => item(k, MAX)));
  p.yoryeok = 10;
  const r = grantHeraldBopae(p, { bonusYoryeok: 1234, rng: () => 0.4 });
  assert.equal(CONFIG.herald.reward.yoryeokMult, 2);
  assert.deepEqual({ type: r.type, amount: r.amount, yoryeok: r.yoryeok, full: r.full }, { type: 'yoryeok', amount: 2468, yoryeok: 2468, full: false });
  assert.equal(p.yoryeok, 10 + 2468);
  assert.ok(heldItems(p).every((it) => it.level === MAX), '보패는 그대로');
  // 배수는 설정을 따른다. 보너스가 이상한 값이면 0
  const saved = CONFIG.herald.reward.yoryeokMult;
  try {
    CONFIG.herald.reward.yoryeokMult = 5;
    assert.equal(grantHeraldBopae(withItems(SEVEN.map((k) => item(k, MAX))), { bonusYoryeok: 10 }).amount, 50);
  } finally {
    CONFIG.herald.reward.yoryeokMult = saved;
  }
  for (const bonusYoryeok of [NaN, -5, undefined]) assert.equal(grantHeraldBopae(withItems(SEVEN.map((k) => item(k, MAX))), { bonusYoryeok }).amount, 0);
});

test('가득 찬 보관함에 여의주뿐이고 치울 것도 없으면 요력을 받는다(보패 강화는 없다)', () => {
  const p = withItems([item('yeouiju', 5)]);
  p.inventory = Array.from({ length: TREASURE.inventorySlots }, () => item('yeouiju', 2));
  const r = grantHeraldBopae(p, { bonusYoryeok: 300, rng: () => 0 });
  assert.deepEqual({ type: r.type, amount: r.amount, full: r.full }, { type: 'yoryeok', amount: 600, full: true });
  assert.equal(p.yoryeok, 600);
  assert.equal(p.inventory.length, TREASURE.inventorySlots);
  assert.match(heraldRewardText(r), /가득/);
});

test('결과 문구: 새 보패는 "보패 획득: 팔괘경", 강화·요력도 한 줄로 나온다', () => {
  assert.equal(heraldRewardText({ type: 'new', name: '팔괘경', soldYoryeok: 0 }), '보패 획득: 팔괘경');
  assert.equal(heraldRewardText({ type: 'enhance', name: '도목검', from: 4, to: 5, full: false }), '보패 강화: 도목검 +4 → +5');
  assert.match(heraldRewardText({ type: 'enhance', name: '도목검', from: 4, to: 5, full: true }), /가득.*도목검 \+4 → \+5/);
  assert.equal(heraldRewardText({ type: 'yoryeok', amount: 80, full: false }), '보패 대신 요력 +80');
  assert.equal(heraldRewardText(null), '');
  const r = grantHeraldBopae(createProgress(), { rng: () => 1.5 / 3 });
  assert.equal(heraldRewardText(r), '보패 획득: 단호로');
  const bonus = grantHeraldBopae(withItems(HERALD.map((k) => item(k, 0))), { rng: () => 2.5 / 4 });
  assert.equal(heraldRewardText(bonus), '보패 획득: 팔괘경');
});

test('받은 보패는 저장되고 다시 읽어도 남는다(저장 키·SAVE.version 그대로, 새 필드 없음)', () => {
  const s = fakeStorage();
  const p = createProgress();
  p.treasure = item('yeouiju', 3);
  const r = grantHeraldBopae(p, { rng: () => 1.5 / 3 });
  assert.equal(r.kind, 'gourd');
  assert.equal(saveProgress(p, s), true);
  assert.equal(JSON.parse(s.m.get(slotKey(1))).version, 1);
  assert.equal(SAVE.version, 1);
  const loaded = loadProgress(s);
  assert.deepEqual(loaded.treasure, item('yeouiju', 3));
  assert.deepEqual(loaded.inventory, [item('gourd', 0)]);
  // 강화 결과도 저장된다
  const q = normalizeProgress(JSON.parse(s.m.get(slotKey(1))).progress);
  q.inventory = [item('gourd', 0)];
  grantHeraldBopae(q, { rng: () => 0 });
  for (const it of heldItems(q)) assert.deepEqual(Object.keys(it).sort(), ['kind', 'level'], '물건에 새 필드를 만들지 않는다');
  assert.equal(heldItems(q).length, 3);
  // 가득 차서 강화로 바뀐 결과도 그대로 저장·복원
  const full = withItems([item('yeouiju', 1), item('fan', 2), item('yeouiju', 1), item('yeouiju', 1), item('yeouiju', 1), item('yeouiju', 1)]);
  grantHeraldBopae(full, { rng: () => 0 });
  const s2 = fakeStorage();
  saveProgress(full, s2);
  assert.equal(loadProgress(s2).inventory.find((it) => it.kind === 'fan').level, 3);
});

test('연결: 대요괴 처치는 보패를 주고 곧바로 저장하며 효과음을 낸다(예전 여의주 추가 굴림은 없다)', () => {
  const play = readFileSync(new URL('../src/scenes/PlayScene.js', import.meta.url), 'utf8');
  const body = play.slice(play.indexOf('slayHerald(meal)'), play.indexOf('// 공명 연쇄(resonance.js)'));
  assert.ok(body.includes('grantHeraldBopae(this.progress'), '보패 추첨');
  assert.ok(body.indexOf('grantHeraldBopae') < body.indexOf('this.saveProgress(this.progress)'), '받은 뒤 바로 저장');
  assert.ok(body.includes("sfx.play('weapon-unlock'"), '획득 효과음');
  assert.ok(body.includes('heraldRewardText(reward)') && body.includes('heraldNotice('), '위쪽 안내 줄 한 곳에만 알린다');
  assert.ok(!play.includes('heraldExtraDropChance') && !play.includes('giveTreasure'), '예전 여의주 추가 굴림이 남아 있지 않다');
  assert.ok(play.includes('if (meal.byAlly || this.stress) return;'), '매혹한 요괴가 먹은 것·시험 판은 보상이 없다');
});
