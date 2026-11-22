import test from 'node:test';
import assert from 'node:assert/strict';
import { FORMS, FORM_BY_ID } from '../src/data/forms.js';
import { STEMS } from '../src/data/stems.js';
import { TREASURE } from '../src/systems/tuning-upgrade.js';
import { ABILITIES, ABILITY_IDS, ABILITY_LEVEL, ABILITY_RESIST } from '../src/systems/tuning-abilities.js';
import {
  abilityIdOfForm, abilityLabel, abilityName, abilityOf, abilityRuntime, abilityValues, lv, lvInt, resist, resisted, screenToSim,
} from '../src/systems/abilities.js';

// 설계 4-3 표를 그대로 옮긴 스냅샷: [능력][수치] = [1단계…5단계]. tuning-abilities.js와 같아야 한다.
const TABLE = {
  chain: { hops: [1, 1, 2, 2, 3], range: [90, 100, 110, 125, 140], falloff: [0.50, 0.55, 0.60, 0.65, 0.70] },
  charm: { duration: [2.0, 2.5, 3.0, 3.5, 4.5], cooldown: [3.0, 2.6, 2.2, 1.8, 1.4], allies: [1, 1, 2, 2, 3] },
  homing: { strength: [0.40, 0.55, 0.70, 0.85, 1.00], turn: [1.00, 1.10, 1.25, 1.40, 1.60], retarget: [120, 140, 160, 190, 220] },
  orbit: { count: [1, 2, 2, 3, 4], damage: [0.50, 0.60, 0.70, 0.80, 1.00], regen: [3.0, 2.5, 2.0, 1.6, 1.2] },
  pierce: { extra: [1, 1, 2, 2, 3], keep: [0.70, 0.75, 0.80, 0.85, 0.90] },
  mark: { amp: [15, 20, 25, 30, 40], duration: [2.0, 2.5, 3.0, 3.5, 4.0] },
  boomerang: { damage: [0.60, 0.70, 0.80, 0.90, 1.00], pierce: [1, 1, 2, 2, 3], rangeBonus: [0, 10, 15, 20, 25] },
  fear: { duration: [1.0, 1.3, 1.6, 2.0, 2.5] },
  burn: { total: [0.6, 0.8, 1.0, 1.3, 1.6], duration: [1.5, 2.0, 2.5, 3.0, 3.5] },
  split: { count: [2, 2, 3, 3, 4], damage: [0.40, 0.45, 0.50, 0.55, 0.60], range: [120, 130, 150, 170, 200] },
  zone: {
    radius: [40, 50, 60, 70, 85], duration: [1.5, 2.0, 2.5, 3.0, 3.5], slow: [0.20, 0.25, 0.30, 0.35, 0.40],
    dps: [0.20, 0.25, 0.30, 0.35, 0.40], clouds: [3, 3, 4, 5, 6],
  },
  explode: { radius: [40, 50, 60, 75, 90], damage: [0.50, 0.55, 0.60, 0.70, 0.80] },
  freeze: { duration: [0.6, 0.8, 1.0, 1.3, 1.6] },
  drain: { rate: [0.10, 0.13, 0.16, 0.20, 0.25] },
  vortex: { radius: [80, 95, 110, 130, 150], pull: [60, 75, 90, 110, 130], duration: [0.8, 1.0, 1.2, 1.4, 1.6], count: [2, 2, 3, 3, 4] },
  gust: { distance: [40, 55, 70, 90, 110], areaRadius: [0, 0, 0, 40, 60] },
};
// 표의 강화 레벨·상한 열
const SCALE = {
  chain: { hops: ['int', 6], range: ['lv', 220] },
  charm: { duration: ['lv', 8.0], allies: ['int10', 4] },
  homing: { turn: ['lv', 2.4], strength: [null, 1.0] },
  orbit: { count: ['int', 6], regen: ['div', null] },
  pierce: { extra: ['int', 6] },
  mark: { amp: ['lv', 80], duration: ['lv', 6.4] },
  boomerang: { pierce: ['int', 5] },
  fear: { duration: ['lv', 4.0] },
  burn: { duration: ['lv', 5.6] },
  split: { count: ['int', 6], range: ['lv', 280] },
  zone: { radius: ['lv', 130], slow: [null, 0.40], clouds: [null, 6] },
  explode: { radius: ['lv', 140] },
  freeze: { duration: ['lv', 2.6] },
  drain: { rate: ['lv', 0.40] },
  vortex: { radius: ['lv', 220], count: [null, 4] },
  gust: { distance: ['lv', 180] },
};

test('4-3 표와 tuning-abilities.js가 같다(수치 스냅샷)', () => {
  assert.deepEqual(ABILITY_IDS.sort(), Object.keys(TABLE).sort(), '능력 16종');
  for (const [id, stats] of Object.entries(TABLE)) {
    for (const [key, list] of Object.entries(stats)) {
      assert.deepEqual(ABILITIES[id][key], list, id + '.' + key);
    }
  }
  assert.equal(ABILITY_IDS.length, 16);
});

test('강화 레벨 적용 방식과 상한이 표와 같다', () => {
  for (const [id, keys] of Object.entries(SCALE)) {
    for (const [key, [kind, cap]] of Object.entries(keys)) {
      if (kind) assert.equal(ABILITIES[id].scale[key], kind, id + '.' + key + ' scale');
      if (cap != null) assert.equal(ABILITIES[id].cap[key], cap, id + '.' + key + ' cap');
    }
  }
  assert.equal(ABILITIES.orbit.floor.regen, 0.8, '진주 재생 최소 0.8');
  assert.deepEqual(ABILITY_LEVEL, { perLevel: 0.04, intEvery: 5, maxLevel: 15 });
  assert.deepEqual(ABILITY_RESIST, { base: 0.5, minSec: 0.15, minRatio: 0.1 });
});

test('저항을 받는 수치: 지속(time) = 빙결·매혹·위협·작열·파사인, 크기(size) = 선무 둔화·와류 끌기·대풍 거리', () => {
  const times = [['charm', 'duration'], ['mark', 'duration'], ['fear', 'duration'], ['burn', 'duration'], ['freeze', 'duration']];
  const sizes = [['zone', 'slow'], ['vortex', 'pull'], ['gust', 'distance']];
  for (const [id, key] of times) assert.equal(ABILITIES[id].resist[key], 'time', id);
  for (const [id, key] of sizes) assert.equal(ABILITIES[id].resist[key], 'size', id);
  const resisting = ABILITY_IDS.flatMap((id) => Object.keys(ABILITIES[id].resist).map((key) => id + '.' + key));
  assert.equal(resisting.length, times.length + sizes.length, '피해 능력에는 저항이 없다');
});

test('lv(15)=1.6, lvInt(15)=3, r(2)=0.25', () => {
  assert.equal(lv(0), 1);
  assert.ok(Math.abs(lv(15) - 1.6) < 1e-12);
  assert.equal(lvInt(0), 0);
  assert.equal(lvInt(4), 0);
  assert.equal(lvInt(5), 1);
  assert.equal(lvInt(10), 2);
  assert.equal(lvInt(15), 3);
  assert.equal(lvInt(10, 10), 1, '동시 아군은 +10에서 +1');
  assert.equal(lvInt(9, 10), 0);
  assert.equal(resist(0), 1);
  assert.equal(resist(1), 0.5);
  assert.equal(resist(2), 0.25);
  assert.equal(resist(-3), 1, '하위 단계 적에게 더 세지지는 않는다');
  assert.equal(lv(99), lv(15), '레벨은 0~15로 자른다');
});

test('abilityValues: 단계·레벨별 수치와 상한', () => {
  const chain1 = abilityValues('chain', 1, 0);
  assert.equal(chain1.hops, 1);
  assert.equal(chain1.range, 90);
  const chain5 = abilityValues('chain', 5, 15);
  assert.equal(chain5.hops, 6, '3 + lvInt(15)=3 → 상한 6');
  assert.equal(chain5.range, 220, '140 × 1.6 = 224 → 상한 220');
  assert.ok(Math.abs(abilityValues('charm', 5, 15).duration - 7.2) < 1e-9);
  assert.equal(abilityValues('charm', 5, 10).allies, 4, '3 + 1');
  assert.equal(abilityValues('charm', 3, 10).allies, 3);
  assert.equal(abilityValues('orbit', 5, 15).count, 6, '4 + 3 → 상한 6');
  assert.equal(abilityValues('orbit', 5, 15).regen, 0.8, '1.2 ÷ 1.6 = 0.75 → 최소 0.8');
  assert.ok(Math.abs(abilityValues('orbit', 1, 15).regen - 3.0 / 1.6) < 1e-9, '3.0 ÷ 1.6 = 1.875');
  assert.equal(abilityValues('homing', 5, 15).turn, 2.4, '1.6 × 1.6 = 2.56 → 상한 2.4');
  assert.equal(abilityValues('homing', 5, 0).strength, 1.0);
  assert.ok(Math.abs(abilityValues('freeze', 5, 15).duration - 2.56) < 1e-9, '1.6 × 1.6');
  assert.equal(abilityValues('drain', 5, 15).rate, 0.4);
  assert.equal(abilityValues('mark', 5, 15).amp, 64);
  assert.equal(abilityValues('zone', 5, 15).radius, 130);
  assert.equal(abilityValues('zone', 5, 15).clouds, 6);
  assert.equal(abilityValues('vortex', 5, 15).radius, 220);
  assert.ok(Math.abs(abilityValues('gust', 5, 15).distance - 176) < 1e-9);
  assert.equal(abilityValues('nothing', 1, 0), null);
  assert.equal(abilityValues('chain', 9, -4).hops, 3, '단계는 1~5, 레벨은 0~15로 자른다');
});

test('모든 능력은 단계가 오를수록 주 수치가 오르거나 같다(사용자 결정)', () => {
  for (const id of ABILITY_IDS) {
    for (const [key, list] of Object.entries(ABILITIES[id])) {
      if (!Array.isArray(list)) continue;
      const rising = key !== 'cooldown' && key !== 'regen';
      for (let i = 1; i < 5; i++) {
        if (rising) assert.ok(list[i] >= list[i - 1], id + '.' + key + ' 단계 ' + (i + 1));
        else assert.ok(list[i] <= list[i - 1], id + '.' + key + ' 단계 ' + (i + 1) + '(짧을수록 좋다)');
      }
    }
  }
});

test('resisted: 지속은 0.5^Δ를 곱하고 0.15초 미만이면 0, 크기는 r이 0.1 미만이면 0', () => {
  assert.equal(resisted('freeze', 'duration', 1.0, 0), 1.0);
  assert.equal(resisted('freeze', 'duration', 1.0, 1), 0.5);
  assert.equal(resisted('freeze', 'duration', 1.0, 2), 0.25);
  assert.equal(resisted('freeze', 'duration', 0.6, 2), 0.15, '0.15는 걸린다(미만만 막는다)');
  assert.equal(resisted('freeze', 'duration', 0.6, 3), 0, '0.075초는 걸지 않는다');
  assert.equal(resisted('freeze', 'duration', 1.0, 3), 0, '0.125초는 걸지 않는다');
  assert.equal(resisted('vortex', 'pull', 100, 2), 25);
  assert.equal(resisted('vortex', 'pull', 100, 3), 12.5);
  assert.equal(resisted('vortex', 'pull', 100, 4), 0, 'r = 0.0625 < 0.1 → 끌지 않는다');
  assert.equal(resisted('gust', 'distance', 80, 4), 0);
  assert.equal(resisted('zone', 'slow', 0.4, 3), 0.05);
  assert.equal(resisted('chain', 'range', 100, 3), 100, '저항이 없는 수치는 그대로');
  assert.equal(resisted('explode', 'damage', 0.5, 4), 0.5);
});

test('능력은 형태의 줄기에서 온다: 16줄기 모두 능력이 있고 stems.js와 표가 서로 맞는다', () => {
  assert.equal(STEMS.length, 16);
  for (const stem of STEMS) {
    assert.ok(ABILITIES[stem.ability], stem.id + ' 능력 ' + stem.ability);
    assert.equal(ABILITIES[stem.ability].stem, stem.id);
  }
  assert.equal(new Set(STEMS.map((s) => s.ability)).size, 16, '줄기마다 서로 다른 능력');
  assert.equal(abilityOf(FORM_BY_ID.mimul), null, 'mimul은 능력 없음');
  assert.equal(abilityRuntime(FORM_BY_ID.mimul, 5), null);
  assert.equal(abilityLabel(FORM_BY_ID.mimul), '');
  assert.equal(abilityIdOfForm(FORM_BY_ID.gumiho), 'charm');
  assert.equal(abilityName(FORM_BY_ID.gumiho), '매혹');
  assert.equal(abilityLabel(FORM_BY_ID.gumiho), '능력: 매혹');
  assert.equal(abilityLabel(FORM_BY_ID.baekho), '능력: 관통');
  assert.equal(abilityLabel(FORM_BY_ID.hyeonmu), '능력: 빙결');
  for (const form of FORMS) {
    if (form.id === 'mimul') continue;
    assert.ok(abilityOf(form), form.id + '은 능력이 있다');
    const rt = abilityRuntime(form, 0);
    assert.equal(rt.stage, form.stage, form.id + ' 능력 단계 = 형태 단계');
  }
});

test('능력 단계는 형태 단계를 따른다: 같은 줄기에서 5단계가 1단계보다 세다', () => {
  const low = abilityRuntime(FORM_BY_ID.hwalsa, 0);
  const high = abilityRuntime(FORM_BY_ID.cheongnyong, 0);
  assert.equal(low.id, 'chain');
  assert.equal(high.id, 'chain');
  assert.ok(high.hops > low.hops);
  assert.ok(high.range > low.range);
  assert.ok(high.falloff > low.falloff);
});

test('여의주 레벨 15에서 모든 능력이 레벨 0보다 약해지지 않는다', () => {
  for (const id of ABILITY_IDS) {
    for (let stage = 1; stage <= 5; stage++) {
      const base = abilityValues(id, stage, 0);
      const top = abilityValues(id, stage, TREASURE.success.length);
      for (const [key, list] of Object.entries(ABILITIES[id])) {
        if (!Array.isArray(list)) continue;
        if (key === 'regen') assert.ok(top[key] <= base[key], id + '.' + key);
        else assert.ok(top[key] >= base[key], id + '.' + key + ' 단계 ' + stage);
      }
    }
  }
});

test('screenToSim: 화면 초 × 템포 × 속도 곡선', () => {
  assert.equal(screenToSim(2, 3.9, 1.5), 2 * 3.9 * 1.5);
  assert.equal(screenToSim(1, 3.9), 3.9);
  assert.equal(screenToSim(0, 3.9, 1.5), 0);
});
