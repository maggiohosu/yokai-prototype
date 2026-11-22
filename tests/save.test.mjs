import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgress } from '../src/systems/progress.js';
import { saveProgress, loadProgress, loadProgressWithStatus, clearSave, normalizeProgress } from '../src/state/save.js';

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
  assert.ok(s.m.has('yokai-proto-v1'));
  assert.equal(JSON.parse(s.m.get('yokai-proto-v1')).version, 1);
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
  assert.deepEqual(JSON.parse(s.m.get('yokai-proto-v1')).progress.enh, { growth: 3, speed: 2, vitality: 7 });
});

test('저장본에 vitality가 이미 있으면 그 값을 쓰고, 퇴화 대기 중인 signature도 vitality로 바꾼다', () => {
  const p = normalizeProgress({ enh: { growth: 1, speed: 1, signature: 9, vitality: 4 }, pendingDegrade: 'signature' });
  assert.deepEqual(p.enh, { growth: 1, speed: 1, vitality: 4 });
  assert.equal(p.pendingDegrade, 'vitality');
  const other = normalizeProgress({ enh: { signature: 'x' }, pendingDegrade: 'speed' });
  assert.deepEqual(other.enh, { growth: 0, speed: 0, vitality: 0 });
  assert.equal(other.pendingDegrade, 'speed');
});
