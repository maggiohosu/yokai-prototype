// 보호권 선택 상태 기계와 저장·복구(사용자 지시 2026-11-24, docs/plan.md 변경 이력 23).
// 한 번씩 누르는 강화에서 퇴화(본체)·깨짐(보물)이 추첨되고 보호권이 1장 이상이면 결과를 확정하지 않고 pendingProtect로 저장한다.
// 굴림은 선택 전에 끝나 있고 선택은 결과만 바꾼다: 창을 닫거나 새로고침해도 다시 굴리지 못하고, 다시 열면 같은 선택창이 뜬다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FORMS } from '../src/data/forms.js';
import { createProgress } from '../src/systems/progress.js';
import { SAVE } from '../src/systems/tuning-evolution.js';
import { ENHANCE, TREASURE } from '../src/systems/tuning-upgrade.js';
import { applyDegradeChoice, autoEnhance, canDevolve, devolveSteps, normalizeDevolve, tryEnhance } from '../src/systems/enhance.js';
import { hasPendingChoice, normalizePendingProtect, protectPrompt, settleProtect } from '../src/systems/protect.js';
import { tryUpgrade, upgradeTreasure } from '../src/systems/treasure.js';
import { normalizeAutoPolicy, loadProgress, normalizeProgress, saveProgress, slotKey } from '../src/state/save.js';

const formOfStage = (stage) => FORMS.find((form) => form.stage === stage).id;

function rolls(...values) {
  return () => {
    assert.ok(values.length, '예정한 횟수보다 많이 추첨했다');
    return values.shift();
  };
}

function memoryStorage() {
  const map = new Map();
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
}

// 본체: +5 시도(인덱스 4)에서 퇴화가 나오는 굴림. 총 성공 70이라 0.8은 실패, 퇴화 몫 33.3%라 0.33은 퇴화.
const degradeRoll = () => rolls(0.8, 0.33);

function bodyPending(protect = 2) {
  const p = createProgress();
  p.enh.growth = 4;
  p.protect = protect;
  tryEnhance(p, 'growth', { rng: degradeRoll() });
  return p;
}

// 보물: +6 시도(레벨 5)에서 깨짐이 나오는 굴림. 성공 60%라 0.9는 실패, 실패 중 깨짐 20%라 0.1은 깨짐.
function treasureReady(protect = 1, level = 5) {
  const p = createProgress();
  p.treasure = { level };
  p.protect = protect;
  return p;
}
const breakRoll = () => rolls(0.9, 0.1);

test('본체 · 보호권 있음 · 사용: 보호권 1장을 쓰고 강화 레벨을 지킨다(결과 실패, 퇴화 아님)', () => {
  const p = bodyPending(2);
  assert.deepEqual(p.pendingProtect, { kind: 'body', stat: 'growth' });
  assert.equal(hasPendingChoice(p), true);
  assert.deepEqual(protectPrompt(p), { kind: 'body', stat: 'growth', level: 4, protect: 2, canUse: true });
  const outcome = settleProtect(p, true);
  assert.deepEqual(outcome, { ok: true, used: true, kind: 'body', stat: 'growth', result: 'fail', protectedUsed: true, from: 4, to: 4 });
  assert.equal(p.protect, 1);
  assert.equal(p.enh.growth, 4);
  assert.equal(p.pendingProtect, undefined);
  assert.equal(p.pendingDegrade, undefined);
  assert.equal(p.pity, 5, '천장은 굴림 때 이미 쌓였다');
  assert.equal(hasPendingChoice(p), false);
  assert.deepEqual(settleProtect(p, true), { ok: false }, '같은 선택을 두 번 확정할 수 없다');
});

test('본체 · 보호권 있음 · 그냥 받기: 보호권은 그대로이고 퇴화가 확정돼 A/B 선택으로 이어진다', () => {
  const p = bodyPending(2);
  const outcome = settleProtect(p, false);
  assert.deepEqual(outcome, { ok: true, used: false, kind: 'body', stat: 'growth', result: 'degrade', needsChoice: true, from: 4, to: 4 });
  assert.equal(p.protect, 2);
  assert.equal(p.pendingProtect, undefined);
  assert.equal(p.pendingDegrade, 'growth');
  assert.equal(hasPendingChoice(p), true, '퇴화 선택이 남았다');
  assert.deepEqual(applyDegradeChoice(p, 'A', 'growth'), { ok: true });
  assert.equal(p.enh.growth, 3);
  assert.equal(hasPendingChoice(p), false);
});

test('본체 · 보호권 없음: 묻지 않고 바로 퇴화(pendingProtect 없이 pendingDegrade)', () => {
  const p = bodyPending(0);
  assert.equal(p.pendingProtect, undefined);
  assert.equal(p.pendingDegrade, 'growth');
  assert.equal(protectPrompt(p), null);
  assert.deepEqual(settleProtect(p, false), { ok: false });
});

test('보호권이 없는데 쓰려 하면 거절하고 상태를 그대로 둔다(저장이 손상돼 대기만 남은 경우)', () => {
  const p = bodyPending(1);
  p.protect = 0;
  assert.deepEqual(protectPrompt(p), { kind: 'body', stat: 'growth', level: 4, protect: 0, canUse: false });
  assert.deepEqual(settleProtect(p, true), { ok: false, reason: 'none' });
  assert.deepEqual(p.pendingProtect, { kind: 'body', stat: 'growth' });
  assert.equal(settleProtect(p, false).ok, true, '그냥 받기는 언제든 가능하다');
});

test('보물 · 보호권 있음: 깨짐이 나와도 확정하지 않고 선택을 기다린다. 보물·파편·보호권은 그대로다', () => {
  const p = treasureReady(2);
  const outcome = upgradeTreasure(p, { rng: breakRoll() });
  assert.deepEqual(outcome, { result: 'break', from: 5, to: 5, shards: 5, needsProtect: true });
  assert.deepEqual(p.pendingProtect, { kind: 'treasure', from: 5 });
  assert.equal(p.treasure.level, 5, '보물은 아직 그대로');
  assert.equal(p.shards, 0);
  assert.equal(p.protect, 2);
  assert.deepEqual(protectPrompt(p), { kind: 'treasure', level: 5, shards: 5, protect: 2, canUse: true });
  assert.throws(() => upgradeTreasure(p, { rng: rolls() }), /보호권/, '선택 전에는 다시 강화할 수 없다');
});

test('보물 · 사용: 보호권 1장으로 +5 그대로 남는다(파편 없음)', () => {
  const p = treasureReady(2);
  upgradeTreasure(p, { rng: breakRoll() });
  assert.deepEqual(settleProtect(p, true), { ok: true, used: true, kind: 'treasure', result: 'protected', from: 5, to: 5, shards: 0 });
  assert.equal(p.treasure.level, 5);
  assert.equal(p.protect, 1);
  assert.equal(p.shards, 0);
  assert.equal(p.pendingProtect, undefined);
});

test('보물 · 그냥 받기: 보물이 깨지고 시도한 레벨만큼 파편을 받는다. 보호권은 그대로', () => {
  const p = treasureReady(2);
  upgradeTreasure(p, { rng: breakRoll() });
  assert.deepEqual(settleProtect(p, false), { ok: true, used: false, kind: 'treasure', result: 'break', from: 5, to: null, shards: 5 });
  assert.equal(p.treasure, null);
  assert.equal(p.shards, 5 * TREASURE.shardsPerLevel);
  assert.equal(p.protect, 2);
});

test('보물 · 보호권 없음: 묻지 않고 바로 깨진다(기존 규칙). 성공·실패는 보호권과 무관하다', () => {
  const none = treasureReady(0);
  const broken = upgradeTreasure(none, { rng: breakRoll() });
  assert.deepEqual(broken, { result: 'break', from: 5, to: null, shards: 5 });
  assert.equal(none.treasure, null);
  assert.equal(none.shards, 5);
  assert.equal(none.pendingProtect, undefined);
  // 보호권이 있어도 성공(성향 점수 +)과 실패(유지)에는 선택창이 없다.
  const lucky = treasureReady(3);
  const before = lucky.alignment;
  assert.equal(upgradeTreasure(lucky, { rng: rolls(0.1) }).result, 'success');
  assert.equal(lucky.treasure.level, 6);
  assert.ok(lucky.alignment > before, '성공하면 성향 점수가 오른다');
  assert.equal(lucky.pendingProtect, undefined);
  const plain = treasureReady(3);
  assert.equal(upgradeTreasure(plain, { rng: rolls(0.9, 0.5) }).result, 'fail');
  assert.equal(plain.treasure.level, 5);
  assert.equal(plain.pendingProtect, undefined);
  assert.throws(() => upgradeTreasure(createProgress(), { rng: rolls() }), /보물/);
});

test('tryUpgrade: canProtect를 주지 않으면 예전과 같다(깨지면 level null)', () => {
  const item = { level: 5 };
  assert.deepEqual(tryUpgrade(item, { rng: breakRoll() }), { result: 'break', from: 5, to: null, shards: 5 });
  assert.equal(item.level, null);
  const guarded = { level: 5, paid: 100 };
  const outcome = tryUpgrade(guarded, { rng: breakRoll(), canProtect: true });
  assert.equal(outcome.needsProtect, true);
  assert.equal(guarded.level, 5);
  assert.ok(guarded.paid > 100, '시도한 강화비는 보호해도 본전 한도에 더해진다');
});

test('새로고침 복구(본체): 저장했다 다시 읽어도 같은 선택창이고, 선택은 굴림 없이 결과만 바꾼다', () => {
  const storage = memoryStorage();
  const p = bodyPending(2);
  assert.equal(saveProgress(p, storage, 1), true);
  const loaded = loadProgress(storage, 1);
  assert.deepEqual(loaded.pendingProtect, { kind: 'body', stat: 'growth' });
  assert.equal(loaded.pity, 5);
  assert.equal(loaded.protect, 2);
  assert.deepEqual(protectPrompt(loaded), protectPrompt(p));
  // 다시 연 뒤 새 시도·연속 강화는 막혀 있고, 선택만 가능하다.
  assert.throws(() => tryEnhance(loaded, 'growth', { rng: rolls() }), /보호권/);
  assert.equal(autoEnhance(loaded, 'growth', { rng: rolls() }).reason, 'protect');
  const outcome = settleProtect(loaded, true); // 어떤 rng도 받지 않는다: 다시 굴릴 수 없다
  assert.equal(outcome.result, 'fail');
  assert.equal(loaded.protect, 1);
  // 선택 뒤 다시 저장·읽기: 대기가 사라진다.
  saveProgress(loaded, storage, 1);
  assert.equal(loadProgress(storage, 1).pendingProtect, undefined);
});

test('새로고침 복구(보물): 같은 선택창이 뜨고 그냥 받기를 하면 보물이 깨진다', () => {
  const storage = memoryStorage();
  const p = treasureReady(1);
  upgradeTreasure(p, { rng: breakRoll() });
  saveProgress(p, storage, 1);
  const loaded = loadProgress(storage, 1);
  assert.deepEqual(loaded.pendingProtect, { kind: 'treasure', from: 5 });
  assert.equal(loaded.treasure.level, 5);
  assert.equal(settleProtect(loaded, false).result, 'break');
  assert.equal(loaded.treasure, null);
  assert.equal(loaded.shards, 5);
});

test('저장 호환: SAVE.key·SAVE.version은 그대로(1)이고 새 필드가 없으면 기본값으로 읽는다', () => {
  assert.equal(SAVE.version, 1);
  assert.equal(SAVE.key, 'yokai-proto-v1');
  const storage = memoryStorage();
  saveProgress(createProgress(), storage, 1);
  const saved = JSON.parse(storage.getItem(slotKey(1)));
  assert.equal(saved.version, 1);
  assert.equal(saved.progress.pendingProtect, undefined);
  assert.equal(saved.progress.autoEnhance, undefined);
  // 옛 저장(새 필드 없음)을 읽어도 그대로 유효하다.
  const old = normalizeProgress({ yoryeok: 5, protect: 2, pendingDegrade: 'growth', pendingDevolve: true, stage: 1 });
  assert.equal(old.pendingProtect, undefined);
  assert.equal(old.pendingDegrade, 'growth');
  assert.equal(old.pendingDevolve, undefined, '1단계에서는 역진화를 예약할 수 없다(기존 규칙)');
});

test('보호권 대기 정규화: 레벨·장착 보물과 맞지 않거나 모양이 이상하면 버린다', () => {
  const base = createProgress();
  base.treasure = { level: 5 };
  assert.deepEqual(normalizePendingProtect({ kind: 'body', stat: 'speed' }, base), { kind: 'body', stat: 'speed' });
  assert.deepEqual(normalizePendingProtect({ kind: 'treasure', from: 5 }, base), { kind: 'treasure', from: 5 });
  for (const raw of [null, 'x', {}, { kind: 'body' }, { kind: 'body', stat: 'nope' }, { kind: 'treasure' }, { kind: 'treasure', from: 4 }, { kind: 'treasure', from: '5' }, { kind: 'other' }]) {
    assert.equal(normalizePendingProtect(raw, base), undefined, JSON.stringify(raw));
  }
  assert.equal(normalizePendingProtect({ kind: 'treasure', from: 5 }, createProgress()), undefined, '장착한 보물이 없다');
  const maxed = createProgress();
  maxed.enh.growth = ENHANCE.outcomes.length;
  assert.equal(normalizePendingProtect({ kind: 'body', stat: 'growth' }, maxed), undefined, '최고 레벨에서는 퇴화가 나올 수 없다');
  // 보호권 대기와 퇴화 선택이 함께 저장돼 있으면 보호권 쪽이 앞선다(퇴화 선택은 그다음에 다시 생긴다).
  const both = normalizeProgress({ enh: { growth: 4 }, protect: 1, pendingProtect: { kind: 'body', stat: 'growth' }, pendingDegrade: 'growth' });
  assert.deepEqual(both.pendingProtect, { kind: 'body', stat: 'growth' });
  assert.equal(both.pendingDegrade, undefined);
});

test('역진화 예약 수: true 또는 2 이상의 정수로 읽고, 내릴 수 있는 단계(stage−1)까지만 인정한다', () => {
  assert.equal(devolveSteps({ pendingDevolve: true }), 1);
  assert.equal(devolveSteps({ pendingDevolve: 3 }), 3);
  assert.equal(devolveSteps({}), 0);
  assert.equal(devolveSteps({ pendingDevolve: 'x' }), 0);
  assert.equal(normalizeDevolve(true, 3), true);
  assert.equal(normalizeDevolve(2, 4), 2);
  assert.equal(normalizeDevolve(9, 4), 3, '4단계에서는 최대 3단계');
  assert.equal(normalizeDevolve(1, 4), true);
  for (const raw of [0, -1, 1.5, 'x', null, undefined, false]) assert.equal(normalizeDevolve(raw, 4), undefined, String(raw));
  assert.equal(normalizeDevolve(true, 1), undefined, '1단계는 내릴 단계가 없다');
  assert.equal(canDevolve({ stage: 3, pendingDevolve: 2 }), false);
  assert.equal(canDevolve({ stage: 3, pendingDevolve: true }), true);
  assert.equal(canDevolve({ stage: 1 }), false);
  // 저장 왕복
  const storage = memoryStorage();
  saveProgress(Object.assign(createProgress(), { formId: formOfStage(2), stage: 2, pendingDevolve: true }), storage, 1);
  assert.equal(loadProgress(storage, 1).pendingDevolve, true);
  assert.equal(normalizeProgress({ formId: formOfStage(5), stage: 5, pendingDevolve: 3 }).pendingDevolve, 3);
});

test('연속 강화 방침(마지막으로 고른 값)은 저장되고 다음에 열 때 먼저 골라 둔다. 알 수 없는 값은 버린다', () => {
  assert.deepEqual(normalizeAutoPolicy({ degrade: 'B', protect: 'use' }), { degrade: 'B', protect: 'use' });
  for (const raw of [null, 'A', {}, { degrade: 'C', protect: 'use' }, { degrade: 'A', protect: 'maybe' }, { degrade: 'A' }]) {
    assert.equal(normalizeAutoPolicy(raw), undefined, JSON.stringify(raw));
  }
  const storage = memoryStorage();
  const p = createProgress();
  p.autoEnhance = { degrade: 'B', protect: 'skip' };
  saveProgress(p, storage, 1);
  assert.deepEqual(loadProgress(storage, 1).autoEnhance, { degrade: 'B', protect: 'skip' });
  assert.equal(normalizeProgress({ autoEnhance: { degrade: 'Z', protect: 'use' } }).autoEnhance, undefined);
});

test('연속 강화가 끝난 저장 상태는 일관된다: 보호권 선택창 대기가 남지 않고, 퇴화 선택은 역진화 불가로 멈췄을 때만 남는다', () => {
  let seed = 99;
  const rng = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  let stoppedByDevolve = 0;
  for (const [degrade, useProtect] of [['A', true], ['A', false], ['B', true], ['B', false]]) {
    const p = Object.assign(createProgress(), { formId: formOfStage(5), stage: 5, yoryeok: 1e12, protect: 4 });
    p.enh.growth = 8;
    const { reason } = autoEnhance(p, 'growth', { rng, degrade, useProtect });
    const label = degrade + (useProtect ? ' 자동 사용' : ' 쓰지 않기') + ' ' + reason;
    assert.equal(p.pendingProtect, undefined, label + ' 선택창 대기가 없다');
    if (reason === 'devolve') {
      stoppedByDevolve++;
      assert.equal(degrade, 'B');
      assert.equal(p.pendingDegrade, 'growth', label + ' 한 번씩 고르는 창으로 이어진다');
      assert.equal(devolveSteps(p), 4, '5단계에서 4번 예약하면 더 내릴 단계가 없다');
    } else {
      assert.ok(['batch', 'max'].includes(reason), label);
      assert.equal(p.pendingDegrade, undefined, label);
    }
    const copy = normalizeProgress(JSON.parse(JSON.stringify(p)));
    assert.deepEqual(copy.enh, p.enh);
    assert.equal(copy.protect, p.protect);
    assert.equal(copy.pendingDevolve, p.pendingDevolve);
    assert.equal(copy.pendingDegrade, p.pendingDegrade);
  }
  assert.ok(stoppedByDevolve >= 1, '이 시드에서는 B 방침이 역진화 불가로 한 번은 멈춘다');
});
