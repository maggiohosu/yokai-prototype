import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONFIG } from '../src/config.js';
import { createProgress } from '../src/systems/progress.js';
import { WEAPONS } from '../src/data/weapons.js';
import { TREASURE } from '../src/systems/tuning-upgrade.js';
import { sellPrice } from '../src/systems/treasure.js';
import { buy } from '../src/systems/shop.js';
import { normalizeProgress, loadProgress, saveProgress, slotKey } from '../src/state/save.js';
import { SAVE } from '../src/systems/tuning-evolution.js';
import { BOPAE, grantHeraldBopae, heldBopaeKinds, heldItems, heraldRewardText, missingBopae } from '../src/systems/heraldReward.js';

const MAX = TREASURE.success.length;
const NAMES = { fan: '학우선', sword: '도목검', mirror: '팔괘경', beads: '염주', seal: '옥인', gourd: '단호로', bell: '삼청령' };
const SEVEN = ['fan', 'sword', 'mirror', 'beads', 'seal', 'gourd', 'bell'];

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
});

test('아무것도 없으면 7종 중 하나가 +0으로 나와 장착된다', () => {
  const p = createProgress();
  const r = grantHeraldBopae(p, { bonusYoryeok: 100, rng: () => 0 });
  assert.equal(r.type, 'new');
  assert.equal(r.kind, 'fan');
  assert.equal(r.placed, 'equipped');
  assert.deepEqual(p.treasure, { kind: 'fan', level: 0 });
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

test('안 가진 보패 중에서 같은 확률로 뽑는다(rng 구간마다 하나씩, 모의 추첨도 고르다)', () => {
  // 구간 경계: i/7 바로 위가 i번째 보패
  for (let i = 0; i < SEVEN.length; i++) {
    const p = createProgress();
    assert.equal(grantHeraldBopae(p, { rng: () => (i + 0.5) / 7 }).kind, SEVEN[i]);
  }
  assert.equal(grantHeraldBopae(createProgress(), { rng: () => 1 }).kind, 'bell', 'rng가 1이어도 범위를 벗어나지 않는다');
  assert.equal(grantHeraldBopae(createProgress(), { rng: () => NaN }).kind, 'fan', 'rng가 이상해도 깨지지 않는다');
  // 모의 추첨: 7종이 각각 1/7 근처
  const rng = lcg(20261123);
  const N = 14000;
  const count = Object.fromEntries(SEVEN.map((k) => [k, 0]));
  for (let i = 0; i < N; i++) count[grantHeraldBopae(createProgress(), { rng }).kind]++;
  for (const k of SEVEN) assert.ok(Math.abs(count[k] / N - 1 / 7) < 0.012, k + ' ' + count[k] / N);
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
    assert.ok(!['mirror', 'fan'].includes(r.kind), r.kind);
  }
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
  assert.equal(buy(p, 'seal', 0).ok, true);
  assert.deepEqual(missingBopae(p), SEVEN.filter((k) => k !== 'seal'));
  const r = grantHeraldBopae(p, { rng: lcg(3) });
  assert.notEqual(r.kind, 'seal');
  assert.equal(heldItems(p).filter((it) => it.kind === 'seal').length, 1);
});

test('보관함이 가득 차 있으면 +0 여의주(드롭품) 하나를 판 값(표 판매가)을 요력으로 받고 그 자리에 보패를 넣는다', () => {
  const p = withItems([item('yeouiju', 7)]);
  p.inventory = [item('yeouiju', 0), item('yeouiju', 0), item('yeouiju', 3), item('yeouiju', 0, { paid: 5 }), item('yeouiju', 0)];
  p.yoryeok = 50;
  const price = sellPrice(item('yeouiju', 0));
  const r = grantHeraldBopae(p, { rng: () => 0 });
  assert.equal(r.type, 'new');
  assert.equal(r.kind, 'fan');
  assert.equal(r.placed, 'inventory');
  assert.equal(r.soldYoryeok, price);
  assert.equal(r.yoryeok, price);
  assert.equal(p.yoryeok, 50 + price);
  assert.equal(p.inventory.length, TREASURE.inventorySlots, '칸 수는 5를 넘지 않는다');
  assert.equal(p.inventory.at(-1).kind, 'fan');
  // 지운 것은 맨 앞의 +0 여의주 하나뿐: +3 여의주·상점에서 산 +0 여의주·장착한 것은 그대로
  assert.deepEqual(p.treasure, item('yeouiju', 7));
  assert.equal(p.inventory.filter((it) => it.kind === 'yeouiju').length, 4);
  assert.ok(p.inventory.some((it) => it.level === 3));
  assert.ok(p.inventory.some((it) => it.paid === 5));
  assert.match(heraldRewardText(r), /보패 획득: 학우선/);
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
  const r = grantHeraldBopae(createProgress(), { rng: () => 2.5 / 7 });
  assert.equal(heraldRewardText(r), '보패 획득: 팔괘경');
});

test('받은 보패는 저장되고 다시 읽어도 남는다(저장 키·SAVE.version 그대로, 새 필드 없음)', () => {
  const s = fakeStorage();
  const p = createProgress();
  p.treasure = item('yeouiju', 3);
  const r = grantHeraldBopae(p, { rng: () => 3.5 / 7 });
  assert.equal(r.kind, 'beads');
  assert.equal(saveProgress(p, s), true);
  assert.equal(JSON.parse(s.m.get(slotKey(1))).version, 1);
  assert.equal(SAVE.version, 1);
  const loaded = loadProgress(s);
  assert.deepEqual(loaded.treasure, item('yeouiju', 3));
  assert.deepEqual(loaded.inventory, [item('beads', 0)]);
  // 강화 결과도 저장된다
  const q = normalizeProgress(JSON.parse(s.m.get(slotKey(1))).progress);
  q.inventory = [item('beads', 0)];
  grantHeraldBopae(q, { rng: () => 0 });
  assert.deepEqual(Object.keys(q.inventory[0]).sort(), ['kind', 'level'], '물건에 새 필드를 만들지 않는다');
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
