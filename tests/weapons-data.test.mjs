import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { WEAPONS, WEAPON_BY_ID, WEAPON_IDS, DEFAULT_WEAPON } from '../src/data/weapons.js';
import { FORMS } from '../src/data/forms.js';
import { createProgress } from '../src/systems/progress.js';
import { TREASURE } from '../src/systems/tuning-upgrade.js';
import {
  weaponStats, itemTitle, withSubject, unlockedStage, isUnlocked, normalizeItem, previewRows, kindOf, isWeaponKind,
} from '../src/systems/weapons.js';
import {
  tryUpgrade, sellPrice, upgradeCost, tablePrice, upgradeOdds, chanceText, treasureStats, equip, sell,
} from '../src/systems/treasure.js';
import { buy, buyPrice, buyBlocker, shopCatalog, shopLevels, lockedText, blockerText } from '../src/systems/shop.js';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} ≠ ${b}`);
const rich = (yoryeok = 10_000_000) => Object.assign(createProgress(), { yoryeok });
const MAX = TREASURE.success.length;
const formOfStage = (stage) => FORMS.find((f) => f.stage === stage).id;

// ---- 데이터 8행 ----
test('무기 데이터는 8행이고 id가 겹치지 않으며 진열 순서와 해금 단계가 1·2·2·3·3·4·4·5다', () => {
  assert.equal(WEAPONS.length, 8);
  assert.equal(new Set(WEAPON_IDS).size, 8);
  assert.equal(DEFAULT_WEAPON, 'yeouiju');
  assert.deepEqual(WEAPON_IDS, ['yeouiju', 'fan', 'sword', 'mirror', 'beads', 'seal', 'gourd', 'bell']);
  assert.deepEqual(WEAPONS.map((w) => w.unlockStage), [1, 2, 2, 3, 3, 4, 4, 5]);
  assert.deepEqual(WEAPONS.map((w) => w.order), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(WEAPONS.map((w) => w.name), ['여의주', '학우선', '도목검', '팔괘경', '염주', '옥인', '단호로', '삼청령']);
  assert.deepEqual(WEAPONS.map((w) => w.hanja), ['如意珠', '鶴羽扇', '桃木劍', '八卦鏡', '念珠', '玉印', '丹葫蘆', '三清鈴']);
  for (const w of WEAPONS) {
    assert.equal(WEAPON_BY_ID[w.id], w);
    assert.equal(w.priceMult, 1, `${w.id} 가격 배율은 모두 1.0(결정 D4)`);
    for (const key of ['line', 'strong', 'weak']) assert.ok(w[key].length > 0, `${w.id}.${key}`);
    assert.ok(w.cdMult > 0 && w.abilityBase > 0 && w.hit > 0, w.id);
  }
});

test('요괴가 떨어뜨리는 보물은 여의주뿐이다(결정 D2)', () => {
  assert.deepEqual(WEAPONS.filter((w) => w.droppable).map((w) => w.id), ['yeouiju']);
});

// ---- weaponStats: 2-2의 개수 표 스냅숏 ----
const COUNTS = {
  yeouiju: [1, 1, 2, 4, 4, 6, 8, 12, 12, 18, 18, 24, 24, 32, 32, 40],
  fan: [3, 3, 6, 6, 6, 6, 6, 9, 9, 9, 9, 9, 9, 12, 12, 15],
  mirror: [1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 4, 4, 4, 4, 4],
  sword: [1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 4, 4, 4, 4, 4],
  beads: [2, 2, 2, 3, 3, 4, 5, 5, 5, 7, 7, 8, 8, 8, 8, 8],
  gourd: [1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3],
  bell: [1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3],
  seal: [1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3],
};

test('weaponStats 8종 × 레벨 0~15의 개수가 설계 2-2 표와 같다', () => {
  for (const kind of WEAPON_IDS) {
    assert.deepEqual(Array.from({ length: MAX + 1 }, (_, level) => weaponStats({ kind, level }).count), COUNTS[kind], kind);
  }
});

test('모든 무기가 TREASURE.levels 한 표를 읽는다: 방향·방향당·속도·파워가 같고 파워는 레벨마다 오른다', () => {
  for (const kind of WEAPON_IDS) {
    for (let level = 0; level <= MAX; level++) {
      const s = weaponStats({ kind, level });
      const [ways, perWay, speedMult, powerMult, h] = TREASURE.levels[level];
      assert.deepEqual([s.ways, s.perWay, s.speedMult, s.H], [ways, perWay, speedMult, h], `${kind} +${level}`);
      near(s.P, TREASURE.damageBase * powerMult, `${kind} +${level} P`);
      near(s.B, s.abilityBase * s.P, `${kind} +${level} B`);
      assert.equal(s.kind, kind);
      assert.equal(s.level, level);
      assert.ok(s.hitDamage > 0 && s.cooldown > 0, `${kind} +${level}`);
      if (level > 0) {
        const prev = weaponStats({ kind, level: level - 1 });
        assert.ok(s.P >= prev.P && s.count >= prev.count && s.hitDamage >= prev.hitDamage, `${kind} +${level}은 낮아지지 않는다`);
        assert.equal(s.cooldown, prev.cooldown, '쿨타임은 레벨과 무관');
      }
    }
  }
});

test('레벨 0의 쿨타임·사거리·피해는 설계 2-2, 속도는 변경 이력 14를 따른다', () => {
  const at0 = (kind) => weaponStats({ kind, level: 0 });
  const cd = CONFIG.combat.cooldown;
  const expected = { yeouiju: 1.0, fan: 1.0, mirror: 1.8, sword: 1.3, beads: 1.2, gourd: 1.6, bell: 1.5, seal: 2.0 };
  for (const kind of WEAPON_IDS) near(at0(kind).cooldown, cd * expected[kind], kind);
  assert.deepEqual(['yeouiju', 'fan', 'mirror', 'sword', 'gourd', 'bell', 'seal'].map((k) => at0(k).reach), [360, 200, 470, 260, 220, 150, 270]);
  // 속도: 처음 값(520·470·570·360)을 1/2(2026-11-23)로 줄이고 같은 날 다시 1/2로 줄였다. 즉발·궤도·찍기·고리(0)는 그대로다.
  assert.deepEqual(WEAPON_IDS.map((k) => at0(k).speed), [130, 117.5, 142.5, 0, 0, 0, 90, 0]);
  const original = { yeouiju: 520, fan: 470, sword: 570, gourd: 360 };
  for (const [kind, speed] of Object.entries(original)) near(at0(kind).speed, speed * 0.25, kind);
  near(at0('yeouiju').hitDamage, 1.0);
  near(at0('fan').hitDamage, 0.65);
  near(at0('sword').hitDamage, 0.6);
  near(at0('mirror').hitDamage, 1.5);
  near(at0('beads').contactDamage, 0.4);
  near(at0('beads').burstDamage, 0.8);
  near(at0('gourd').hitDamage, 0.6);
  near(at0('gourd').poolDps, 0.9);
  near(at0('bell').hitDamage, 0.5);
  near(at0('seal').hitDamage, 2.6);
  assert.deepEqual(WEAPON_IDS.map((k) => at0(k).abilityBase), [1.0, 0.6, 0.9, 1.0, 0.6, 1.4, 0.8, 0.6]);
});

test('개수에 K(방향당 발사)를 곱하는 무기는 +15에서 한 번 피해가 K배가 된다', () => {
  const s15 = (kind) => weaponStats({ kind, level: MAX });
  const P = 4.6; // +15 파워 배율
  near(s15('mirror').hitDamage, 1.5 * 5 * P);
  near(s15('sword').hitDamage, 0.6 * 5 * P);
  near(s15('beads').contactDamage, 0.4 * 5 * P);
  near(s15('beads').burstDamage, 0.8 * 5 * P);
  near(s15('gourd').poolDps, 0.9 * 5 * P);
  near(s15('bell').hitDamage, 0.5 * 5 * P);
  near(s15('seal').hitDamage, 2.6 * 5 * P);
  near(s15('fan').hitDamage, 0.65 * P, '학우선은 깃 수(3K)가 K를 받고 깃 한 장 피해에는 곱하지 않는다');
});

test('무기별 성장 공식: 부채 각도·광선 폭과 조준 보정·웅덩이·고리·인장', () => {
  const at = (kind, level) => weaponStats({ kind, level });
  assert.deepEqual([0, 3, 5, 6, 9, 11, 15].map((l) => at('fan', l).spreadDeg), [50, 60, 70, 80, 100, 120, 120]);
  assert.deepEqual([0, 7, 8, 15].map((l) => at('mirror', l).aimSnapDeg), [0, 0, 6, 20].map((v) => v), '+8부터 조준 보정(20° × H)');
  assert.deepEqual([0, 2, 7, 15].map((l) => at('mirror', l).halfWidth), [7, 10, 13, 19]);
  assert.deepEqual([0, 5, 10, 15].map((l) => at('gourd', l).poolRadius), [45, 55, 65, 75]);
  near(at('gourd', 0).poolDuration, 2.0);
  near(at('gourd', 10).poolDuration, 3.0);
  near(at('gourd', 15).poolDuration, 3.5, '상한 3.5초');
  assert.equal(at('gourd', 15).poolMax, 6);
  assert.deepEqual([0, 5, 10, 14, 15].map((l) => at('bell', l).ringMaxRadius), [150, 175, 200, 220, 225]);
  assert.equal(at('bell', 15).reach, 225, '삼청령 사거리는 고리 최대 반경');
  near(at('bell', 0).spreadSec, 0.3);
  near(at('bell', 0).gapSec, 0.12);
  near(at('seal', 0).slamPad, 12);
  near(at('seal', 10).slamPad, 20);
  assert.deepEqual([at('seal', 0).delaySec, at('seal', 0).sense, at('seal', 0).coneDeg, at('seal', 0).fallback], [0.35, 270, 35, 200]);
  assert.equal(at('sword', 0).fanDeg, 12);
  assert.equal(at('beads', 15).count, 8);
  assert.deepEqual([at('beads', 0).orbitSizeMult, at('beads', 0).orbitPad, at('beads', 0).burstMult, at('beads', 0).rehitSec], [1.3, 24, 1.8, 0.45]);
});

test('유도: 날아가는 무기(여의주·학우선·도목검·단호로)만 휘고, 학우선은 절반, 나머지 무기의 homing은 0이다', () => {
  for (const level of [0, 7, 8, 15]) {
    const h = TREASURE.levels[level][4];
    near(weaponStats({ kind: 'yeouiju', level }).homing, h);
    near(weaponStats({ kind: 'fan', level }).homing, h * 0.5);
    near(weaponStats({ kind: 'sword', level }).homing, h);
    near(weaponStats({ kind: 'gourd', level }).homing, h);
    for (const kind of ['mirror', 'beads', 'seal', 'bell']) {
      assert.equal(weaponStats({ kind, level }).homing, 0, kind);
      assert.equal(weaponStats({ kind, level }).H, h, `${kind}은 레벨 표의 H를 따로 읽을 수 있다`);
    }
  }
});

test('weaponStats: kind가 없거나 모르는 값이면 여의주, 레벨이 이상하면 RangeError', () => {
  assert.deepEqual(weaponStats({ level: 3 }), weaponStats({ kind: 'yeouiju', level: 3 }));
  assert.deepEqual(weaponStats({ kind: 'banana', level: 3 }), weaponStats({ kind: 'yeouiju', level: 3 }));
  assert.deepEqual(weaponStats({ kind: 'constructor', level: 1 }), weaponStats({ kind: 'yeouiju', level: 1 }), '객체 기본 속성 이름도 여의주');
  for (const bad of [-1, 16, 1.5, '3', null, undefined, NaN]) assert.throws(() => weaponStats({ kind: 'fan', level: bad }), RangeError, String(bad));
  assert.throws(() => weaponStats(null), RangeError);
  assert.equal(kindOf({ kind: 'bell' }), 'bell');
  assert.equal(kindOf(null), 'yeouiju');
  assert.equal(isWeaponKind('seal'), true);
  assert.equal(isWeaponKind('toString'), false);
  assert.equal(isWeaponKind(undefined), false);
});

test('treasureStats(level)는 여의주의 weaponStats와 같은 값을 돌려주는 호환 함수다', () => {
  for (let level = 0; level <= MAX; level++) {
    const old = treasureStats(level);
    const s = weaponStats({ kind: 'yeouiju', level });
    near(old.damage, s.P);
    assert.deepEqual([old.ways, old.perWay, old.speedMult, old.homing, old.shots], [s.ways, s.perWay, s.speedMult, s.homing, s.count]);
  }
  assert.throws(() => treasureStats(16), RangeError);
});

// ---- 이름·화면 문구 ----
test('itemTitle: +10부터 칭호가 붙고 모든 무기가 같은 칭호 단어를 쓴다', () => {
  assert.equal(itemTitle({ kind: 'yeouiju', level: 7 }), '+7 여의주');
  assert.equal(itemTitle({ kind: 'fan', level: 12 }), '+12 천둥 학우선');
  assert.equal(itemTitle({ level: 10 }), '+10 바람 여의주', 'kind가 없으면 여의주');
  assert.equal(itemTitle({ kind: 'seal', level: 15 }), '+15 용왕 옥인');
  assert.equal(itemTitle({ kind: 'gourd', level: 0 }), '+0 단호로');
  assert.deepEqual([10, 11, 12, 13, 14, 15].map((level) => itemTitle({ kind: 'bell', level })), [
    '+10 바람 삼청령', '+11 번개 삼청령', '+12 천둥 삼청령', '+13 폭풍 삼청령', '+14 하늘 삼청령', '+15 용왕 삼청령']);
  assert.throws(() => itemTitle({ kind: 'fan', level: null }), RangeError);
});

test('withSubject: 받침에 맞춰 주격 조사를 붙인다', () => {
  assert.deepEqual(WEAPONS.map((w) => withSubject(w.name)), ['여의주가', '학우선이', '도목검이', '팔괘경이', '염주가', '옥인이', '단호로가', '삼청령이']);
  assert.equal(withSubject('abc'), 'abc이(가)');
});

test('previewRows: 모든 무기·레벨에서 라벨이 같은 순서로 나오고 글자가 비어 있지 않다', () => {
  for (const kind of WEAPON_IDS) {
    const base = previewRows({ kind, level: 0 }).map(([label]) => label);
    assert.ok(base.length >= 3, kind);
    assert.equal(new Set(base).size, base.length, `${kind} 라벨 중복 없음`);
    for (let level = 0; level <= MAX; level++) {
      const rows = previewRows({ kind, level });
      assert.deepEqual(rows.map(([label]) => label), base, `${kind} +${level}`);
      for (const [, value] of rows) assert.ok(typeof value === 'string' && value.length > 0 && !value.includes('NaN') && !value.includes('undefined'), `${kind} +${level}: ${value}`);
    }
  }
  assert.deepEqual(previewRows({ level: 0 }), [['발사 방향', '1'], ['방향당 구슬', '1개'], ['속도', '×1.00'], ['파워', '×1.00'], ['유도', '없음']]);
  assert.deepEqual(previewRows({ kind: 'fan', level: 3 }).slice(0, 2), [['바람 깃', '6장'], ['부채 각도', '60°']]);
});

// ---- 경제: 모든 무기가 같은 표 ----
function scripted(...values) {
  const queue = [...values];
  return () => (queue.length ? queue.shift() : 0.5);
}

test('모든 무기·레벨의 성공률·깨짐·파편이 여의주와 같다(결정 D3)', () => {
  const rolls = [0, 0.05, 0.1, 0.3, 0.5, 0.6, 0.899, 0.9, 0.95, 0.999];
  for (const kind of WEAPON_IDS) {
    for (let level = 0; level < MAX; level++) {
      for (const a of rolls) for (const b of rolls) {
        const want = tryUpgrade({ kind: 'yeouiju', level }, { rng: scripted(a, b) });
        const got = tryUpgrade({ kind, level }, { rng: scripted(a, b) });
        assert.deepEqual(got, want, `${kind} +${level} rolls ${a},${b}`);
      }
    }
    assert.throws(() => tryUpgrade({ kind, level: MAX }), RangeError, `${kind} 최고 레벨`);
  }
});

test('upgradeOdds: 세 확률의 합은 100이고 성공은 TREASURE.success, 깨짐은 실패 중 깨질 몫이다', () => {
  for (let level = 0; level < MAX; level++) {
    const odds = upgradeOdds(level);
    near(odds.success + odds.fail + odds.break, 100, `+${level}`);
    assert.equal(odds.success, TREASURE.success[level]);
    near(odds.break, (100 - TREASURE.success[level]) * TREASURE.breakOnFailure[level] / 100);
    assert.ok(odds.fail >= 0 && odds.break >= 0);
  }
  assert.deepEqual(upgradeOdds(0), { success: 90, fail: 10, break: 0 });
  assert.deepEqual(upgradeOdds(5), { success: 60, fail: 32, break: 8 });
  assert.deepEqual(upgradeOdds(14), { success: 10, fail: 0, break: 90 });
  assert.throws(() => upgradeOdds(MAX), RangeError);
  assert.throws(() => upgradeOdds(-1), RangeError);
});

test('chanceText: 이 결과가 나올 확률 한 줄(소수 첫째 자리까지)', () => {
  assert.equal(chanceText('success', upgradeOdds(0)), '성공 확률 90%');
  assert.equal(chanceText('success', upgradeOdds(4)), '성공 확률 70%');
  assert.equal(chanceText('fail', upgradeOdds(0)), '실패 확률 10%');
  assert.equal(chanceText('break', upgradeOdds(5)), '깨질 확률 8%');
  assert.equal(chanceText('break', upgradeOdds(6)), '깨질 확률 11.3%');
  assert.equal(chanceText('fail', upgradeOdds(6)), '실패 확률 33.8%');
  assert.equal(chanceText('break', upgradeOdds(14)), '깨질 확률 90%');
  assert.throws(() => chanceText('great', upgradeOdds(0)), RangeError);
  assert.throws(() => chanceText('success', null), RangeError);
});

test('가격표 4-2: 모든 무기 +0~+5의 판매가·구매가·강화비가 같다', () => {
  for (const kind of WEAPON_IDS) {
    const levels = shopLevels();
    assert.deepEqual(levels.map((level) => tablePrice(level, kind)), [5, 11, 26, 58, 132, 300], kind);
    assert.deepEqual(levels.map((level) => sellPrice({ kind, level })), [5, 11, 26, 58, 132, 300], kind);
    assert.deepEqual(levels.map((level) => buyPrice(kind, level)), [13, 28, 65, 145, 330, 750], kind);
    assert.deepEqual(levels.map((level) => upgradeCost({ kind, level })), [2, 4, 7, 14, 29, 58], kind);
  }
  assert.equal(upgradeCost({ kind: 'fan', level: MAX }), Infinity);
  assert.deepEqual([0, 5, 10, 15].map((l) => sellPrice({ level: l })), [5, 300, 5000, 100000], 'kind가 없으면 여의주');
  assert.equal(sellPrice(5), 300, '옛 호출(레벨 숫자)도 그대로');
  assert.equal(upgradeCost(4), 29);
  for (const bad of [-1, 16, 1.5, '1', null, undefined, NaN]) {
    assert.throws(() => sellPrice(bad), RangeError, `sellPrice(${String(bad)})`);
    assert.throws(() => upgradeCost(bad), RangeError, `upgradeCost(${String(bad)})`);
  }
});

test('상점 구매는 무기마다 { kind, level, paid } 한 줄을 보관함에 넣는다', () => {
  for (const [kind, stage] of [['yeouiju', 1], ['fan', 2], ['sword', 2], ['mirror', 3], ['beads', 3], ['seal', 4], ['gourd', 4], ['bell', 5]]) {
    const p = rich(5000);
    p.discovered = [formOfStage(stage)];
    const r = buy(p, kind, 2);
    assert.deepEqual(r, { ok: true, kind, level: 2, price: 65 }, kind);
    assert.deepEqual(p.inventory, [{ kind, level: 2, paid: 65 }]);
    assert.equal(p.yoryeok, 5000 - 65);
  }
});

// ---- 본전 상한 4-4 ----
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const unlockAll = (p) => { p.discovered = [formOfStage(5)]; return p; };

test('4-4: 모든 무기·+0~+5에서 사서 +15까지 강화(성공만)해 팔아도 받는 요력이 들인 요력보다 많지 않다', () => {
  for (const kind of WEAPON_IDS) {
    for (const from of shopLevels()) {
      const p = unlockAll(rich());
      const start = p.yoryeok;
      assert.ok(buy(p, kind, from).ok, `${kind} +${from} 구매`);
      assert.ok(equip(p, 0));
      while (p.treasure.level < MAX) {
        p.yoryeok -= upgradeCost(p.treasure);
        assert.equal(tryUpgrade(p.treasure, { rng: () => 0 }).result, 'success');
      }
      sell(p, 'equipped');
      assert.ok(p.yoryeok <= start, `${kind} +${from} → +15: 이익 ${p.yoryeok - start}`);
    }
  }
});

test('4-4: 난수(실패·깨짐 섞임)로 강화해도 이익이 없다(모든 무기, 가격 배율 1·1.5·2)', () => {
  const original = Object.fromEntries(WEAPONS.map((w) => [w.id, w.priceMult]));
  try {
    for (const mult of [1, 1.5, 2]) {
      for (const w of WEAPONS) w.priceMult = mult;
      const rng = mulberry(0xb0a7 + mult * 10);
      for (let trial = 0; trial < 400; trial++) {
        const kind = WEAPON_IDS[trial % WEAPON_IDS.length];
        const from = shopLevels()[Math.floor(rng() * shopLevels().length)];
        const p = unlockAll(rich());
        const start = p.yoryeok;
        assert.ok(buy(p, kind, from).ok);
        assert.ok(equip(p, 0));
        const attempts = 1 + Math.floor(rng() * 40);
        for (let i = 0; i < attempts && p.treasure && p.treasure.level < MAX; i++) {
          p.yoryeok -= upgradeCost(p.treasure);
          if (tryUpgrade(p.treasure, { rng }).result === 'break') p.treasure = null;
        }
        if (p.treasure) sell(p, 'equipped');
        assert.ok(p.yoryeok <= start, `배율 ${mult} ${kind} trial ${trial}: 이익 ${p.yoryeok - start}`);
      }
    }
  } finally {
    for (const w of WEAPONS) w.priceMult = original[w.id];
  }
});

test('드롭 여의주(paid 없음)는 표 판매가 그대로라 강화해서 팔면 이익이다', () => {
  const p = rich(0);
  p.treasure = { kind: 'yeouiju', level: 0 };
  let spent = 0;
  while (p.treasure.level < 5) {
    spent += upgradeCost(p.treasure);
    assert.equal(tryUpgrade(p.treasure, { rng: () => 0 }).result, 'success');
  }
  assert.equal(sell(p, 'equipped'), 300);
  assert.ok(300 > spent);
  assert.equal(sellPrice({ kind: 'yeouiju', level: 5 }), 300);
});

test('가격 배율이 1이 아니면 판매가·강화비·구매가가 함께 바뀐다(자리만 있는 값 검증)', () => {
  const fan = WEAPON_BY_ID.fan;
  try {
    fan.priceMult = 2;
    assert.equal(tablePrice(5, 'fan'), 600);
    assert.equal(sellPrice({ kind: 'fan', level: 5 }), 600);
    assert.equal(upgradeCost({ kind: 'fan', level: 5 }), 115, '강화비는 첫 레벨 비용(1.8) × 배율 × 2^레벨을 한 번만 반올림');
    assert.equal(buyPrice('fan', 5), 1500);
    assert.equal(tablePrice(5, 'yeouiju'), 300, '다른 무기는 그대로');
  } finally {
    fan.priceMult = 1;
  }
});

// ---- 해금 5-1 ----
test('unlockedStage: 발견한 형태의 최고 단계, 역진화로 다시 잠기지 않는다', () => {
  assert.equal(unlockedStage(createProgress()), 1);
  assert.equal(unlockedStage(null), 1);
  assert.equal(unlockedStage({ discovered: ['mimul'] }), 1);
  assert.equal(unlockedStage({ discovered: ['no-such-form', 7, null] }), 1, '모르는 형태는 무시');
  for (const stage of [2, 3, 4, 5]) assert.equal(unlockedStage({ discovered: [formOfStage(1), formOfStage(stage)] }), stage);
  const devolved = { stage: 2, discovered: [formOfStage(5), formOfStage(2)] };
  assert.equal(unlockedStage(devolved), 5, '지금 단계가 내려가도 닿은 최고 단계가 남는다');
  assert.equal(unlockedStage({ stage: 3, discovered: [] }), 3, '발견 목록이 없어도 지금 단계는 바닥');
  const custom = [{ id: 'x', stage: 4 }];
  assert.equal(unlockedStage({ discovered: ['x'] }, custom), 4);
});

test('isUnlocked와 상점 카드의 locked: 단계마다 정해진 무기가 열린다', () => {
  const opens = { 1: ['yeouiju'], 2: ['yeouiju', 'fan', 'sword'], 3: ['yeouiju', 'fan', 'sword', 'mirror', 'beads'],
    4: ['yeouiju', 'fan', 'sword', 'mirror', 'beads', 'seal', 'gourd'], 5: WEAPON_IDS };
  for (const stage of [1, 2, 3, 4, 5]) {
    const p = createProgress();
    p.discovered = [formOfStage(stage)];
    const open = WEAPON_IDS.filter((kind) => isUnlocked(p, kind));
    assert.deepEqual(open, opens[stage], `단계 ${stage}`);
    const cards = shopCatalog(p);
    assert.deepEqual(cards.filter((c) => !c.locked).map((c) => c.kind), opens[stage], `카드 ${stage}`);
    for (const card of cards) assert.equal(card.unlockStage, WEAPON_BY_ID[card.kind].unlockStage);
  }
  assert.equal(isUnlocked(createProgress(), 'banana'), false);
  assert.equal(isUnlocked(createProgress(), undefined), false);
  assert.deepEqual(shopCatalog().filter((c) => !c.locked).map((c) => c.kind), ['yeouiju'], 'progress를 안 줘도 처음 상태');
});

test('잠긴 무기를 사려 하면 locked로 막고 요력·보관함이 그대로다', () => {
  const p = rich();
  const snapshot = structuredClone(p);
  for (const kind of WEAPON_IDS.filter((k) => k !== 'yeouiju')) {
    assert.equal(buyBlocker(p, kind, 0), 'locked', kind);
    assert.deepEqual(buy(p, kind, 0), { ok: false, reason: 'locked' });
  }
  assert.deepEqual(p, snapshot);
  p.discovered = [formOfStage(3)];
  assert.equal(buyBlocker(p, 'mirror', 0), null);
  assert.equal(buyBlocker(p, 'bell', 0), 'locked');
  assert.ok(buy(p, 'mirror', 0).ok);
  assert.equal(buy(p, 'bell', 0).reason, 'locked');
});

test('막힘 이유의 우선순위: 레벨 → 없는 보물 → 잠김 → 가득 참 → 요력 부족', () => {
  const p = rich(0);
  assert.equal(buyBlocker(p, 'bell', 99), 'level');
  assert.equal(buyBlocker(p, 'banana', 0), 'kind');
  assert.equal(buyBlocker(p, 'banana', 99), 'level');
  assert.equal(buyBlocker(p, 'bell', 0), 'locked', '잠김이 요력 부족보다 먼저');
  assert.equal(buyBlocker(p, 'yeouiju', 0), 'funds');
  for (let i = 0; i < TREASURE.inventorySlots; i++) p.inventory.push({ kind: 'yeouiju', level: 0 });
  assert.equal(buyBlocker(p, 'yeouiju', 0), 'full');
  assert.throws(() => buyPrice('banana', 0), RangeError);
  assert.throws(() => buyPrice('fan', 6), RangeError);
  for (const reason of ['level', 'kind', 'locked', 'full', 'funds']) assert.ok(blockerText[reason].length > 0, reason);
  assert.equal(lockedText('fan'), '2단계에 닿으면 열려요');
  assert.equal(lockedText('bell'), '5단계에 닿으면 열려요');
});

test('옛 호출 buy(state, level)·buyPrice(level)·buyBlocker(state, level)은 여의주로 본다', () => {
  const p = rich(1000);
  assert.equal(buyPrice(3), 145);
  assert.equal(buyBlocker(p, 3), null);
  assert.deepEqual(buy(p, 3), { ok: true, kind: 'yeouiju', level: 3, price: 145 });
});

// ---- normalizeItem ----
test('normalizeItem: kind 보정·잘못된 레벨 버림·paid 정리', () => {
  assert.deepEqual(normalizeItem({ level: 7 }), { kind: 'yeouiju', level: 7 });
  assert.deepEqual(normalizeItem({ kind: 'unknown', level: 4 }), { kind: 'yeouiju', level: 4 }, '모르는 kind도 물건은 남긴다');
  assert.deepEqual(normalizeItem({ kind: 'seal', level: 15, paid: 90 }), { kind: 'seal', level: 15, paid: 90 });
  assert.deepEqual(normalizeItem({ kind: 'fan', level: 0, paid: 0 }), { kind: 'fan', level: 0, paid: 0 });
  for (const bad of ['5', NaN, -5, Infinity, null, 'x', {}]) assert.deepEqual(normalizeItem({ kind: 'fan', level: 1, paid: bad }), { kind: 'fan', level: 1 }, `paid ${String(bad)}`);
  for (const bad of [99, 16, -1, 1.5, '3', null, undefined, NaN]) assert.equal(normalizeItem({ kind: 'fan', level: bad }), null, `level ${String(bad)}`);
  for (const bad of [null, undefined, 5, 'x', [], true]) assert.equal(normalizeItem(bad), null, String(bad));
  const raw = { kind: 'fan', level: 2 };
  normalizeItem(raw);
  assert.deepEqual(raw, { kind: 'fan', level: 2 }, '입력을 고치지 않는다');
});
