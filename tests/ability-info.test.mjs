import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { FORMS, FORM_BY_ID } from '../src/data/forms.js';
import { STEMS } from '../src/data/stems.js';
import { WEAPON_IDS } from '../src/data/weapons.js';
import { ABILITY_GUIDES, ABILITY_GUIDE_IDS, WEAPON_COMBOS } from '../src/data/ability-guides.js';
import { ABILITIES, ABILITY_IDS } from '../src/systems/tuning-abilities.js';
import { abilityValues, resisted } from '../src/systems/abilities.js';
import { createProgress } from '../src/systems/progress.js';
import { boosterMult } from '../src/game/booster.js';
import {
  LOCKED_NAME, NO_ABILITY_TEXT, abilityBrief, equippedWeapon, formatStat,
} from '../src/systems/ability-brief.js';

const UNITS = ['sec', 'count', 'dist', 'pct', 'pctRaw', 'mult', 'num'];

function progressWith(treasure, patch = {}) {
  return Object.assign(createProgress(), { treasure }, patch);
}

test('능력 16종 모두 사용 방법 글이 있다(요약 1줄 + 사용 방법 2~4줄)', () => {
  assert.equal(ABILITY_IDS.length, 16);
  assert.deepEqual([...ABILITY_GUIDE_IDS].sort(), [...ABILITY_IDS].sort(), '능력 표와 안내 글의 id가 같아야 한다');
  for (const id of ABILITY_IDS) {
    const guide = ABILITY_GUIDES[id];
    assert.ok(guide, id);
    assert.ok(typeof guide.summary === 'string' && guide.summary.length > 0, id + ' 요약');
    assert.ok(Array.isArray(guide.use) && guide.use.length >= 2 && guide.use.length <= 4, id + ' 사용 방법 줄 수');
    for (const line of guide.use) assert.ok(typeof line === 'string' && line.trim().length > 8, id + ' 사용 방법 문장');
    assert.ok(guide.stats.length >= 1, id + ' 수치 칸');
    for (const spec of guide.stats) {
      assert.ok(Array.isArray(ABILITIES[id][spec.key]), id + '.' + spec.key + '는 능력 표의 배열이어야 한다');
      assert.ok(UNITS.includes(spec.unit), id + '.' + spec.key + ' 단위');
      assert.ok(spec.label, id + '.' + spec.key + ' 이름');
    }
  }
});

test('줄기 16개가 모두 안내 글이 있는 능력을 가리킨다', () => {
  assert.equal(STEMS.length, 16);
  for (const stem of STEMS) assert.ok(ABILITY_GUIDES[stem.ability], stem.id + ' ' + stem.ability);
});

test('무기 조합 글은 모르는 능력·무기를 가리키지 않고 여의주(기준)는 적지 않는다', () => {
  for (const [id, row] of Object.entries(WEAPON_COMBOS)) {
    assert.ok(ABILITIES[id], id);
    for (const [kind, text] of Object.entries(row)) {
      assert.ok(WEAPON_IDS.includes(kind) && kind !== 'yeouiju', id + ' × ' + kind);
      assert.ok(typeof text === 'string' && text.length > 3, id + ' × ' + kind + ' 글');
    }
  }
});

test('미물(줄기 없음)은 능력 없음 안내와 부스터 보정만 있다', () => {
  const p = progressWith(null);
  const brief = abilityBrief('mimul', p);
  assert.equal(brief.hasAbility, false);
  assert.equal(brief.ability, null);
  assert.equal(brief.note, NO_ABILITY_TEXT);
  assert.deepEqual(brief.stats, []);
  assert.deepEqual(brief.usage, []);
  assert.equal(brief.stemName, '줄기 없음');
  assert.equal(brief.boost.stemMult, 1);
  assert.equal(brief.boost.mult, boosterMult(p, FORM_BY_ID.mimul));
});

test('모르는 형태는 null, progress가 없어도 죽지 않는다', () => {
  assert.equal(abilityBrief('nope', createProgress()), null);
  const brief = abilityBrief('crane', undefined);
  assert.equal(brief.hasAbility, true);
  assert.equal(brief.weapon.kind, 'yeouiju');
  assert.equal(brief.weapon.level, 0);
});

test('형태 170종+1행 모두 안내 데이터를 만들 수 있고, 줄기가 있으면 수치가 능력 표 값과 같다', () => {
  const p = progressWith({ kind: 'yeouiju', level: 9 });
  let withAbility = 0;
  for (const form of FORMS) {
    const brief = abilityBrief(form.id, p);
    assert.ok(brief, form.id);
    assert.equal(brief.name, form.name);
    assert.equal(brief.stage, form.stage);
    assert.ok(brief.dirName.length > 0 && brief.stemName.length > 0, form.id);
    if (!form.stem) {
      assert.equal(brief.hasAbility, false, form.id);
      continue;
    }
    withAbility++;
    const id = brief.ability.id;
    assert.equal(ABILITIES[id].stem, form.stem, form.id + ' 줄기와 능력이 맞아야 한다');
    assert.equal(brief.ability.name, ABILITIES[id].name);
    assert.ok(brief.usage.length >= 2 && brief.usage.length <= 4, form.id);
    assert.ok(brief.resist.text.startsWith('상위 단계 적'), form.id);
    assert.ok(brief.boost.text.startsWith('부스터'), form.id);
    const values = abilityValues(id, form.stage, 9);
    assert.equal(brief.stats.length, ABILITY_GUIDES[id].stats.length);
    for (const row of brief.stats) assert.equal(row.value, values[row.key], form.id + '.' + row.key);
  }
  assert.equal(withAbility, FORMS.length - 1, '미물만 능력이 없다');
});

test('단계가 오르면 수치가 오른다: 빙결 지속 새끼 거북(2단계) < 현구(3단계) < 현무(5단계)', () => {
  const p = progressWith(null);
  const seconds = (id) => abilityBrief(id, p).stats.find((s) => s.key === 'duration').value;
  assert.equal(seconds('littleTurtle'), 0.8);
  assert.equal(seconds('darkTurtle'), 1.0);
  assert.equal(seconds('hyeonmu'), 1.6);
});

test('장착 무기 레벨이 수치를 올리고, 올랐을 때만 기본 값을 곁들인다', () => {
  const low = abilityBrief('darkTurtle', progressWith({ kind: 'yeouiju', level: 0 })).stats[0];
  const high = abilityBrief('darkTurtle', progressWith({ kind: 'yeouiju', level: 15 })).stats[0];
  assert.equal(low.text, '1초');
  assert.equal(low.baseText, null);
  assert.equal(high.text, '1.6초');
  assert.equal(high.baseText, '1초');
  assert.match(abilityBrief('darkTurtle', progressWith({ kind: 'yeouiju', level: 15 })).basis, /3단계 · \+15/);
});

test('정수 수치는 +5·+10·+15에서 오른다(뇌쇄 튐 횟수), 상한이 있다', () => {
  const hops = (level) => abilityBrief('imugi', progressWith({ kind: 'yeouiju', level })).stats[0].value;
  assert.equal(hops(0), 2);
  assert.equal(hops(4), 2);
  assert.equal(hops(5), 3);
  assert.equal(hops(15), 5);
});

test('피해 비율 칸에는 기준 피해에 곱한 실제 값이 붙고, 등급 배율이 반영된다', () => {
  const pC = progressWith({ kind: 'yeouiju', level: 0 }, { grade: 'C' });
  const pS = progressWith({ kind: 'yeouiju', level: 0 }, { grade: 'S' });
  const c = abilityBrief('myeongsa', pC); // S4 폭염
  const s = abilityBrief('myeongsa', pS);
  const damageRow = (b) => b.stats.find((row) => row.key === 'damage');
  assert.equal(c.ability.id, 'explode');
  assert.equal(c.baseDamage.value, 1);
  assert.equal(s.baseDamage.value, 1.6);
  assert.equal(damageRow(c).damageText, '피해 약 ' + (damageRow(c).value * 1));
  assert.ok(damageRow(s).damageText.startsWith('피해 약 '));
  assert.equal(c.stats.find((row) => row.key === 'radius').damageText, null);
});

test('상위 단계 적 저항: 지속·크기 능력은 단계마다 절반, 피해 능력은 그대로', () => {
  const p = progressWith(null);
  const freeze = abilityBrief('darkTurtle', p); // 3단계 빙결 1.0초 → 0.5 → 0.25 → 0.125(0.15 미만이라 안 걸림)
  assert.equal(freeze.resist.kind, 'time');
  assert.deepEqual(freeze.resist.steps.map((s) => s.blocked), [false, false, true]);
  assert.equal(freeze.resist.steps[0].text, '0.5초');
  assert.match(freeze.resist.text, /1단계 위 0\.5초 · 2단계 위 0\.3초 · 3단계 위 걸리지 않음/);
  // 화면 안내가 실제 판정과 같다: 걸리는 마지막 단계와 안 걸리는 첫 단계
  assert.ok(resisted('freeze', 'duration', 1.0, 2) > 0);
  assert.equal(resisted('freeze', 'duration', 1.0, 3), 0);
  const zone = abilityBrief('attendant', p); // 크기(둔화)
  assert.equal(zone.resist.kind, 'size');
  assert.match(zone.resist.text, /둔화가/);
  const chain = abilityBrief('imugi', p);
  assert.equal(chain.resist.kind, 'none');
  assert.match(chain.resist.text, /상관없이/);
  assert.match(abilityBrief('biFang', p).resist.text, /총 화상 피해도/, '작열은 총 피해도 준다는 말이 붙는다');
});

test('보패를 꼈을 때만 그 무기와의 조합 한 줄이 나온다(그대로 칸·여의주는 생략)', () => {
  const imugi = (treasure) => abilityBrief('imugi', progressWith(treasure)); // 뇌쇄
  assert.equal(imugi({ kind: 'yeouiju', level: 2 }).combo, null);
  assert.equal(imugi(null).combo, null);
  const fan = imugi({ kind: 'fan', level: 2 });
  assert.equal(fan.combo.weaponName, '학우선');
  assert.match(fan.combo.text, /최대 2번/);
  assert.equal(fan.weapon.kind, 'fan');
  // 빙결 × 학우선은 표에서 '그대로' 칸이라 줄이 없다. 단호로는 줄이 있다.
  assert.equal(abilityBrief('darkTurtle', progressWith({ kind: 'fan', level: 1 })).combo, null);
  assert.match(abilityBrief('darkTurtle', progressWith({ kind: 'gourd', level: 1 })).combo.text, /웅덩이/);
  // 모르는 무기는 여의주로 읽는다
  assert.equal(equippedWeapon({ treasure: { kind: 'zzz', level: 3 } }).kind, 'yeouiju');
});

test('보패 기준 피해는 무기의 능력 기준 피해(abilityBase)를 쓴다', () => {
  const brief = abilityBrief('imugi', progressWith({ kind: 'fan', level: 0 }));
  assert.equal(brief.baseDamage.value, 0.6); // 학우선 abilityBase 0.6 × P 1.0 × 등급 C 1.0
  assert.match(brief.baseDamage.label, /능력 기준 피해/);
});

test('장착 칸이 비었거나 레벨이 이상하면 기본 여의주 +0으로 읽는다', () => {
  assert.deepEqual(equippedWeapon(createProgress()), { kind: 'yeouiju', name: '여의주', level: 0, equipped: false, label: '여의주 +0 (기본)' });
  assert.equal(equippedWeapon({ treasure: { kind: 'bell', level: 99 } }).level, 0);
  assert.equal(equippedWeapon({ treasure: { kind: 'bell', level: 99 } }).equipped, false);
  assert.equal(equippedWeapon({ treasure: { kind: 'bell', level: 4 } }).label, '+4 삼청령');
});

test('부스터 보정은 booster.js의 배율과 같다(줄기 보정 + 이동 속도 강화)', () => {
  const p = progressWith(null);
  p.enh.speed = 5;
  for (const id of ['hyeonmu', 'baekho', 'cheongnyong', 'mimul']) {
    const form = FORM_BY_ID[id];
    const brief = abilityBrief(id, p);
    assert.equal(brief.boost.mult, boosterMult(p, form), id);
    assert.equal(brief.boost.speedLevel, 5);
    assert.match(brief.boost.text, new RegExp('×' + String(Number(brief.boost.mult.toFixed(2)))));
  }
  assert.equal(abilityBrief('hyeonmu', p).boost.tone, '평균보다 느린 줄기');
  assert.equal(abilityBrief('baekho', p).boost.tone, '평균보다 빠른 줄기');
  assert.ok(Math.abs(abilityBrief('hyeonmu', p).boost.mult - (CONFIG.booster.baseMult * 0.9 + CONFIG.booster.perSpeedLevel * 5)) < 1e-9);
});

test('미발견 형태(locked)는 이름·줄기·능력을 ???로 가리고 수치·사용 방법·조합을 비운다', () => {
  const brief = abilityBrief('hyeonmu', progressWith({ kind: 'bell', level: 5 }), { locked: true });
  assert.equal(brief.locked, true);
  assert.equal(brief.name, LOCKED_NAME);
  assert.equal(brief.hanja, '');
  assert.equal(brief.stemName, LOCKED_NAME);
  assert.equal(brief.ability.name, LOCKED_NAME);
  assert.equal(brief.ability.summary, LOCKED_NAME);
  assert.deepEqual(brief.stats, []);
  assert.deepEqual(brief.usage, []);
  assert.equal(brief.combo, null);
  assert.equal(brief.resist, null);
  assert.equal(brief.boost, null);
  assert.equal(brief.stage, 5, '단계·방위는 도감 카드에도 보이므로 그대로 둔다');
  assert.equal(brief.dirName, '북녘');
});

test('진화 선택지를 미리 보면 후보 단계와 현재 무기를 사용하고 진행 상태를 보존한다', () => {
  const p = progressWith({ kind: 'gourd', level: 5 }, { formId: 'littleTurtle', stage: 2, yoryeok: 400 });
  const before = structuredClone(p);
  const brief = abilityBrief('darkTurtle', p);
  assert.equal(brief.basis, '3단계 · +5 단호로 기준');
  assert.equal(brief.stats.find(row => row.key === 'duration').value, 1.2);
  assert.deepEqual(p, before);
});

test('수치 글자 규칙', () => {
  assert.equal(formatStat({ unit: 'sec' }, 1.0), '1초');
  assert.equal(formatStat({ unit: 'sec' }, 1.976), '2초');
  assert.equal(formatStat({ unit: 'sec' }, 0.6), '0.6초');
  assert.equal(formatStat({ unit: 'count', suffix: '마리' }, 3), '3마리');
  assert.equal(formatStat({ unit: 'dist' }, 179.2), '179');
  assert.equal(formatStat({ unit: 'pct' }, 0.65), '65%');
  assert.equal(formatStat({ unit: 'pctRaw' }, 24), '+24%');
  assert.equal(formatStat({ unit: 'mult' }, 1.6), '×1.6');
  assert.equal(formatStat({ unit: 'dist', zeroText: '없음' }, 0), '없음');
  assert.equal(formatStat({ unit: 'dist', zeroText: '없음' }, 40), '40');
});
