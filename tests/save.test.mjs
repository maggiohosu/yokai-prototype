import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgress } from '../src/systems/progress.js';
import {
  saveProgress, loadProgress, loadProgressWithStatus, clearSave, normalizeProgress, FORM_ID_ALIASES,
  SLOT_COUNT, slotKey, CURRENT_SLOT_KEY, getCurrentSlot, setCurrentSlot, listSlots, summarizeSlot, startNewSlot, migrateLegacySave,
} from '../src/state/save.js';
import { FORMS } from '../src/data/forms.js';
import { evolutionCatalog } from '../src/systems/levelup.js';
import { devolve } from '../src/systems/evolution.js';

function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    m,
  };
}

test('저장 후 불러오기 왕복', () => {
  const s = fakeStorage();
  const p = createProgress();
  p.yoryeok = 321;
  p.formId = 'littleSnake';
  p.stage = 2;
  p.diet.east = 7;
  p.enh.growth = 4;
  p.inventory = [{ type: 'yeouiju', level: 3 }];
  p.treasure = { type: 'yeouiju', level: 5 };
  p.discovered = ['baem'];
  assert.equal(saveProgress(p, s), true);
  assert.ok(s.m.has(slotKey(1)), '지금 슬롯(기본 1번)에 저장한다');
  assert.equal(s.m.has('yokai-proto-v1'), false, '예전 단일 키에는 쓰지 않는다');
  assert.equal(JSON.parse(s.m.get(slotKey(1))).version, 1);
  const r = loadProgressWithStatus(s);
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.progress, p);
});

test('저장 없음 -> 새로 시작', () => {
  const r = loadProgressWithStatus(fakeStorage());
  assert.equal(r.status, 'new');
  assert.deepEqual(r.progress, createProgress());
});

test('손상된 JSON / 버전 불일치 / 구조 이상 -> 새로 시작', () => {
  for (const bad of ['{not json', '{"version":999,"progress":{}}', '{"version":1}', 'null', '"x"', '[]']) {
    const r = loadProgressWithStatus(fakeStorage({ 'yokai-proto-v1': bad }));
    assert.equal(r.status, 'corrupt', bad);
    assert.deepEqual(r.progress, createProgress());
  }
});

test('일부 필드 이상은 기본값으로 보정', () => {
  const p = normalizeProgress({ yoryeok: 'x', stage: 2, diet: { east: 3, west: 'a' }, inventory: 5, discovered: ['a', 1] });
  assert.equal(p.yoryeok, 0);
  assert.equal(p.stage, 1);
  assert.equal(p.diet.east, 3);
  assert.equal(p.diet.west, 0);
  assert.deepEqual(p.inventory, []);
  assert.deepEqual(p.discovered, ['a']);
});

test('저장소 예외/없음 처리', () => {
  const thrower = { getItem() { throw new Error('x'); }, setItem() { throw new Error('quota'); }, removeItem() {} };
  assert.equal(saveProgress(createProgress(), thrower), false);
  assert.deepEqual(loadProgress(thrower), createProgress());
  assert.equal(saveProgress(createProgress(), null), false);
});

test('clearSave', () => {
  const s = fakeStorage();
  saveProgress(createProgress(), s);
  clearSave(s);
  assert.equal(loadProgressWithStatus(s).status, 'new');
});

test('퇴화 선택 전과 B 선택 후의 대기 상태가 각각 저장·복원된다', () => {
  const s = fakeStorage();
  for (const pending of [{ pendingDegrade: 'growth' }, { pendingDevolve: true }]) {
    const p = { ...createProgress(), formId: 'littleSnake', stage: 2, ...pending };
    assert.ok(saveProgress(p, s));
    assert.deepEqual(loadProgress(s), p);
  }
});

test('알 수 없는 강화 항목, 잘못된 대기 값, 1단계 역진화는 버린다', () => {
  const p = normalizeProgress({ formId: 'littleSnake', stage: 2, pendingDegrade: 'nope', pendingDevolve: 'true' });
  assert.equal(p.pendingDegrade, undefined);
  assert.equal(p.pendingDevolve, undefined);
  assert.equal(normalizeProgress({ formId: 'mimul', stage: 1, pendingDevolve: true }).pendingDevolve, undefined);
});

test('형태나 단계가 없거나 서로 맞지 않으면 미물 1단계로 복구한다', () => {
  for (const raw of [
    { formId: 'ghost', stage: 3 }, { formId: 'littleSnake', stage: 3 },
    { stage: 2 }, { formId: 'littleSnake' }, { formId: 'littleSnake', stage: '2' },
  ]) {
    const p = normalizeProgress({ ...raw, yoryeok: 321, pendingDevolve: true });
    assert.equal(p.formId, 'mimul');
    assert.equal(p.stage, 1);
    assert.equal(p.pendingDevolve, undefined);
    assert.equal(p.yoryeok, 321);
  }
});

test('이전 저장본의 대표 효과(signature)는 같은 레벨의 생명력(vitality)으로 옮기고 signature는 지운다', () => {
  const old = createProgress();
  old.enh = { growth: 3, speed: 2, signature: 7 };
  const s = fakeStorage();
  s.setItem('yokai-proto-v1', JSON.stringify({ version: 1, savedAt: 1, progress: old }));
  const loaded = loadProgress(s);
  assert.deepEqual(loaded.enh, { growth: 3, speed: 2, vitality: 7 });
  assert.equal('signature' in loaded.enh, false);
  // 다시 저장해도 signature는 돌아오지 않는다.
  saveProgress(loaded, s);
  assert.deepEqual(JSON.parse(s.m.get(slotKey(1))).progress.enh, { growth: 3, speed: 2, vitality: 7 });
});

test('저장본에 vitality가 이미 있으면 그 값을 쓰고, 퇴화 대기 중인 signature도 vitality로 바꾼다', () => {
  const p = normalizeProgress({ enh: { growth: 1, speed: 1, signature: 9, vitality: 4 }, pendingDegrade: 'signature' });
  assert.deepEqual(p.enh, { growth: 1, speed: 1, vitality: 4 });
  assert.equal(p.pendingDegrade, 'vitality');
  const other = normalizeProgress({ enh: { signature: 'x' }, pendingDegrade: 'speed' });
  assert.deepEqual(other.enh, { growth: 0, speed: 0, vitality: 0 });
  assert.equal(other.pendingDegrade, 'speed');
});

// ---- 형태 171행으로 늘어난 뒤의 저장 호환(설계 6-1) ----
const LEGACY_FORMS = {
  mimul: 1, littleSnake: 2, littleTiger: 2, littleBird: 2, littleTurtle: 2,
  hillFox: 3, imugi: 3, crane: 3, boYi: 3, skyHound: 3, whiteDeer: 3, biFang: 3, dokkaebi: 3, attendant: 3,
  waterSpirit: 3, dueoksini: 3, darkTurtle: 3,
};

test('기존 17종으로 만든 옛 저장(formId, stage, discovered 17개)이 그대로 불러와진다', () => {
  const discovered = Object.keys(LEGACY_FORMS);
  assert.equal(discovered.length, 17);
  for (const [formId, stage] of Object.entries(LEGACY_FORMS)) {
    const s = fakeStorage();
    const p = { ...createProgress(), formId, stage, discovered: discovered.slice(), yoryeok: 777, grade: 'B' };
    assert.ok(saveProgress(p, s));
    const r = loadProgressWithStatus(s);
    assert.equal(r.status, 'ok', formId);
    assert.equal(r.progress.formId, formId);
    assert.equal(r.progress.stage, stage);
    assert.deepEqual(r.progress.discovered, discovered);
    assert.deepEqual(r.progress, p);
  }
  assert.equal(JSON.parse(fakeStorage({ 'yokai-proto-v1': JSON.stringify({ version: 1, progress: createProgress() }) }).m.get('yokai-proto-v1')).version, 1);
});

test('새 형태(4·5단계 포함)도 id와 단계가 맞으면 복구되고, 단계가 틀리면 미물로 돌아간다', () => {
  for (const [formId, stage] of [['gumiho', 4], ['cheonho', 5], ['hwalsa', 1], ['gyebyeon', 2]]) {
    const p = normalizeProgress({ formId, stage, yoryeok: 5 });
    assert.equal(p.formId, formId);
    assert.equal(p.stage, stage);
  }
  assert.equal(normalizeProgress({ formId: 'cheonho', stage: 4 }).formId, 'mimul');
  assert.equal(normalizeProgress({ formId: 'gumiho', stage: 5 }).stage, 1);
});

test('pendingDevolve인 2단계 저장은 같은 줄기 1단계로 역진화한다', () => {
  const catalog = evolutionCatalog(FORMS);
  const loaded = normalizeProgress({ formId: 'littleSnake', stage: 2, pendingDevolve: true });
  assert.equal(loaded.pendingDevolve, true);
  const r = devolve(loaded, catalog);
  assert.equal(r.form.id, 'hwalsa'); // E1에 1단계 뿌리가 있다
  assert.equal(loaded.stage, 1);
  const tiger = devolve(normalizeProgress({ formId: 'littleTiger', stage: 2, pendingDevolve: true }), catalog);
  assert.equal(tiger.form.id, 'namo'); // W1은 뿌리가 없어 같은 방위 첫째
});

test('FORM_ID_ALIASES: 지금은 비어 있고, 옛 id가 생기면 형태 검사 전에 새 id로 바꾼다', () => {
  assert.deepEqual(FORM_ID_ALIASES, {});
  FORM_ID_ALIASES.oldFox = 'hillFox';
  try {
    const p = normalizeProgress({ formId: 'oldFox', stage: 3, discovered: ['oldFox', 'imugi'] });
    assert.equal(p.formId, 'hillFox');
    assert.deepEqual(p.discovered, ['hillFox', 'imugi']);
  } finally {
    delete FORM_ID_ALIASES.oldFox;
  }
});

// ---- 저장 슬롯 3칸 ----
const raw = (progress, savedAt = 1000) => JSON.stringify({ version: 1, savedAt, progress });

test('슬롯은 3칸이고 키가 서로 다르다', () => {
  assert.equal(SLOT_COUNT, 3);
  const keys = [1, 2, 3].map(slotKey);
  assert.equal(new Set(keys).size, 3);
  assert.ok(!keys.includes('yokai-proto-v1'));
});

test('슬롯마다 따로 저장·불러오기·지우기가 된다', () => {
  const s = fakeStorage();
  const a = { ...createProgress(), yoryeok: 11 };
  const b = { ...createProgress(), yoryeok: 22, formId: 'littleSnake', stage: 2 };
  assert.ok(saveProgress(a, s, 1));
  assert.ok(saveProgress(b, s, 3));
  assert.equal(loadProgress(s, 1).yoryeok, 11);
  assert.equal(loadProgress(s, 3).yoryeok, 22);
  assert.equal(loadProgressWithStatus(s, 2).status, 'new');
  assert.ok(clearSave(s, 3));
  assert.equal(loadProgressWithStatus(s, 3).status, 'new');
  assert.equal(loadProgress(s, 1).yoryeok, 11, '다른 슬롯은 그대로');
});

test('잘못된 슬롯 번호는 저장·지우기·기억을 거절한다', () => {
  const s = fakeStorage();
  for (const bad of [0, 4, -1, 1.5, '1', null, NaN]) {
    assert.equal(saveProgress(createProgress(), s, bad), false, String(bad));
    assert.equal(clearSave(s, bad), false);
    assert.equal(setCurrentSlot(bad, s), false);
    assert.equal(startNewSlot(bad, s), false);
  }
  assert.equal([...s.m.keys()].some((k) => k.includes('slot')), false);
});

test('지금 슬롯 기억: 기본 1번, 고른 번호를 기억하고, 자동 저장은 그 슬롯에 쓴다', () => {
  const s = fakeStorage();
  assert.equal(getCurrentSlot(s), 1);
  assert.ok(setCurrentSlot(2, s));
  assert.equal(s.m.get(CURRENT_SLOT_KEY), '2');
  assert.equal(getCurrentSlot(s), 2);
  const p = { ...createProgress(), yoryeok: 77 };
  assert.ok(saveProgress(p, s));
  assert.ok(s.m.has(slotKey(2)));
  assert.equal(s.m.has(slotKey(1)), false);
  assert.equal(loadProgress(s).yoryeok, 77, '인수 없이 불러와도 지금 슬롯(2번)을 읽는다');
  s.m.set(CURRENT_SLOT_KEY, '9');
  assert.equal(getCurrentSlot(s), 1, '범위 밖이면 1번');
  s.m.set(CURRENT_SLOT_KEY, 'x');
  assert.equal(getCurrentSlot(s), 1);
  assert.equal(getCurrentSlot(null), 1);
});

test('예전 단일 저장본은 처음 읽을 때 1번 슬롯으로 옮겨지고 옛 키는 사라진다', () => {
  const old = { ...createProgress(), yoryeok: 4321, formId: 'littleSnake', stage: 2, grade: 'B' };
  const s = fakeStorage({ 'yokai-proto-v1': raw(old, 555) });
  const r = loadProgressWithStatus(s);
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.progress, old);
  assert.equal(s.m.has('yokai-proto-v1'), false);
  assert.equal(JSON.parse(s.m.get(slotKey(1))).savedAt, 555, '저장 시각도 그대로 옮겨진다');
  assert.equal(loadProgress(s, 1).yoryeok, 4321);
  assert.equal(loadProgressWithStatus(s, 2).status, 'new');
});

test('옮기기는 한 번만: 1번 슬롯을 지워도 옛 저장본이 되살아나지 않는다', () => {
  const s = fakeStorage({ 'yokai-proto-v1': raw({ ...createProgress(), yoryeok: 9 }) });
  assert.equal(loadProgress(s, 1).yoryeok, 9);
  assert.ok(clearSave(s, 1));
  assert.equal(loadProgressWithStatus(s, 1).status, 'new');
  assert.equal(migrateLegacySave(s), false);
});

test('1번 슬롯이 이미 있으면 옛 저장본이 덮어쓰지 않는다(옛 키도 지우지 않는다)', () => {
  const s = fakeStorage({ 'yokai-proto-v1': raw({ ...createProgress(), yoryeok: 1 }) });
  s.m.set(slotKey(1), raw({ ...createProgress(), yoryeok: 2 }));
  assert.equal(loadProgress(s, 1).yoryeok, 2);
  assert.ok(s.m.has('yokai-proto-v1'));
});

test('옛 저장본이 없으면 아무것도 옮기지 않고, 표시 뒤에 생긴 옛 키는 건드리지 않는다', () => {
  const s = fakeStorage();
  assert.equal(migrateLegacySave(s), false);
  assert.equal(loadProgressWithStatus(s).status, 'new');
  assert.equal(migrateLegacySave(null), false);
  s.m.set('yokai-proto-v1', raw(createProgress()));
  assert.equal(loadProgressWithStatus(s, 1).status, 'new');
});

test('슬롯 요약: 형태 id·이름·단계·등급·요력·마지막 저장 시각', () => {
  const s = fakeStorage();
  s.m.set(slotKey(1), raw({ ...createProgress(), yoryeok: 123, formId: 'littleSnake', stage: 2, grade: 'A' }, 1700000000000));
  const sum = summarizeSlot(1, s);
  const form = FORMS.find((f) => f.id === 'littleSnake');
  assert.deepEqual(sum, {
    slot: 1, status: 'ok', formId: 'littleSnake', formName: form.name, stage: 2, grade: 'A', yoryeok: 123, savedAt: 1700000000000,
  });
  const empty = summarizeSlot(2, s);
  assert.equal(empty.status, 'empty');
  assert.equal(empty.formId, null);
  assert.equal(empty.savedAt, null);
});

test('saveProgress가 남기는 savedAt이 요약에 보인다', () => {
  const s = fakeStorage();
  const before = Date.now();
  saveProgress({ ...createProgress(), yoryeok: 5 }, s, 3);
  const sum = summarizeSlot(3, s);
  assert.equal(sum.status, 'ok');
  assert.ok(sum.savedAt >= before && sum.savedAt <= Date.now());
});

test('손상된 슬롯은 corrupt로 요약되고 다른 슬롯은 영향이 없다', () => {
  const s = fakeStorage();
  s.m.set(slotKey(1), '{not json');
  s.m.set(slotKey(2), '{"version":999,"progress":{}}');
  s.m.set(slotKey(3), raw({ ...createProgress(), yoryeok: 8 }));
  const list = listSlots(s);
  assert.deepEqual(list.map((x) => x.status), ['corrupt', 'corrupt', 'ok']);
  assert.equal(list[2].yoryeok, 8);
  assert.equal(list[0].formName, null);
});

test('listSlots는 항상 3칸이고 번호가 1~3이다', () => {
  const list = listSlots(fakeStorage());
  assert.deepEqual(list.map((x) => x.slot), [1, 2, 3]);
  assert.deepEqual(list.map((x) => x.status), ['empty', 'empty', 'empty']);
});

test('startNewSlot은 처음 상태를 저장하고 그 슬롯을 지금 슬롯으로 기억한다(기존 저장은 덮어쓴다)', () => {
  const s = fakeStorage();
  saveProgress({ ...createProgress(), yoryeok: 999 }, s, 2);
  assert.ok(startNewSlot(2, s));
  assert.equal(getCurrentSlot(s), 2);
  assert.deepEqual(loadProgress(s), createProgress());
  assert.equal(summarizeSlot(2, s).status, 'ok');
});

test('startNewSlot은 저장소가 막히면 false를 돌려준다', () => {
  const thrower = { getItem: () => null, setItem() { throw new Error('quota'); }, removeItem() {} };
  assert.equal(startNewSlot(2, thrower), false);
  assert.equal(startNewSlot(2, null), false);
});

test('저장소가 없거나 막혀 있어도 슬롯 함수는 던지지 않는다', () => {
  const thrower = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
  assert.deepEqual(listSlots(thrower).map((x) => x.status), ['corrupt', 'corrupt', 'corrupt']);
  assert.deepEqual(listSlots(null).map((x) => x.status), ['empty', 'empty', 'empty']);
  for (const st of [thrower, null]) {
    assert.equal(getCurrentSlot(st), 1);
    assert.equal(setCurrentSlot(2, st), false);
    assert.equal(saveProgress(createProgress(), st, 1), false);
  }
});

test('슬롯별로도 형태·단계 보정이 그대로 적용된다', () => {
  const s = fakeStorage();
  s.m.set(slotKey(2), raw({ formId: 'ghost', stage: 3, yoryeok: 40 }));
  const sum = summarizeSlot(2, s);
  assert.equal(sum.formId, 'mimul');
  assert.equal(sum.stage, 1);
  assert.equal(sum.yoryeok, 40);
});
