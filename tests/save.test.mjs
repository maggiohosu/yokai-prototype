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
  p.formId = 'baem';
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
  assert.equal(p.stage, 2);
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
