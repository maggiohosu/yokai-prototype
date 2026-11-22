import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgress } from '../src/systems/progress.js';
import {
  saveProgress, slotKey, getCurrentSlot, setCurrentSlot, loadProgressWithStatus, summarizeSlot, canSave,
} from '../src/state/save.js';
import { FORMS } from '../src/data/forms.js';
import { formatLastPlayed, slotCard, confirmText, createTitleModel } from '../src/ui/TitleView.js';

function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    m,
  };
}

const NOW = Date.UTC(2026, 10, 23, 12, 0, 0);
const snake = FORMS.find((f) => f.id === 'littleSnake');
const filled = (patch = {}) => ({ ...createProgress(), formId: 'littleSnake', stage: 2, grade: 'B', yoryeok: 1234, ...patch });
const ids = (card) => card.actions.map((a) => a.id);

test('마지막 플레이 시각: 방금 전 · 분 · 시간 · 일 · 오래되면 날짜', () => {
  assert.equal(formatLastPlayed(NOW, NOW), '방금 전');
  assert.equal(formatLastPlayed(NOW - 59_000, NOW), '방금 전');
  assert.equal(formatLastPlayed(NOW - 60_000, NOW), '1분 전');
  assert.equal(formatLastPlayed(NOW - 59 * 60_000, NOW), '59분 전');
  assert.equal(formatLastPlayed(NOW - 3 * 3600_000, NOW), '3시간 전');
  assert.equal(formatLastPlayed(NOW - 23 * 3600_000, NOW), '23시간 전');
  assert.equal(formatLastPlayed(NOW - 2 * 86400_000, NOW), '2일 전');
  assert.equal(formatLastPlayed(NOW - 6 * 86400_000, NOW), '6일 전');
  const old = NOW - 30 * 86400_000;
  const d = new Date(old);
  assert.equal(formatLastPlayed(old, NOW), `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`);
  assert.equal(formatLastPlayed(NOW + 5000, NOW), '방금 전', '시계가 어긋나 미래여도 음수가 나오지 않는다');
  assert.equal(formatLastPlayed(null, NOW), null);
  assert.equal(formatLastPlayed(NaN, NOW), null);
});

test('저장된 칸 카드: 이름·단계·등급·요력·마지막 플레이와 버튼 3개(이어하기가 주 버튼)', () => {
  const s = fakeStorage();
  saveProgress(filled(), s, 1);
  const card = slotCard(summarizeSlot(1, s), { now: Date.now() + 2 * 3600_000, isLast: true });
  assert.equal(card.heading, '1번');
  assert.equal(card.state, 'ok');
  assert.equal(card.name, snake.name);
  assert.equal(card.detail, '2단계 B등급');
  assert.equal(card.wallet, '요력 1,234');
  assert.equal(card.played, '2시간 전');
  assert.equal(card.isLast, true);
  assert.deepEqual(ids(card), ['continue', 'new', 'clear']);
  assert.deepEqual(card.actions.map((a) => a.label), ['이어하기', '새로 시작', '지우기']);
  assert.equal(card.actions.find((a) => a.primary).id, 'continue');
});

test('빈 칸 카드는 [새로 시작]만 있고 그것이 주 버튼이다', () => {
  const card = slotCard(summarizeSlot(2, fakeStorage()), { now: NOW });
  assert.equal(card.state, 'empty');
  assert.deepEqual(ids(card), ['new']);
  assert.equal(card.actions[0].primary, true);
  assert.equal(card.name, null);
  assert.equal(card.note, '비어 있어요');
  assert.equal(card.isLast, false);
});

test('손상된 칸 카드는 [새로 시작]과 [지우기]만 있고 이어하기가 없다', () => {
  const s = fakeStorage({ [slotKey(3)]: '{not json' });
  const card = slotCard(summarizeSlot(3, s), { now: NOW, isLast: true });
  assert.equal(card.state, 'corrupt');
  assert.deepEqual(ids(card), ['new', 'clear']);
  assert.ok(card.note.includes('손상'));
  assert.equal(card.isLast, false, '읽을 수 없는 칸은 마지막으로 한 칸으로 표시하지 않는다');
});

test('보기: 칸 3개, 마지막으로 한 칸은 저장이 있을 때만 표시', () => {
  const s = fakeStorage();
  let model = createTitleModel({ storage: s, now: () => NOW });
  assert.equal(model.view().cards.length, 3);
  assert.ok(model.view().cards.every((c) => !c.isLast), '아무것도 없으면 표시 없음');
  saveProgress(filled(), s, 2);
  setCurrentSlot(2, s);
  model = createTitleModel({ storage: s, now: () => NOW });
  assert.deepEqual(model.view().cards.map((c) => c.isLast), [false, true, false]);
  assert.equal(model.view().canSave, true);
});

test('이어하기: 그 칸을 지금 슬롯으로 기억하고 그 칸의 진행으로 시작한다', () => {
  const s = fakeStorage();
  saveProgress(filled({ yoryeok: 555 }), s, 3);
  saveProgress(filled({ yoryeok: 111, formId: 'mimul', stage: 1 }), s, 1);
  const started = [];
  const model = createTitleModel({ storage: s, onStart: (r) => started.push(r) });
  assert.equal(model.choose(3, 'continue'), 'start');
  assert.equal(started.length, 1);
  assert.equal(started[0].slot, 3);
  assert.equal(started[0].mode, 'continue');
  assert.equal(started[0].progress.yoryeok, 555);
  assert.equal(getCurrentSlot(s), 3);
  assert.equal(loadProgressWithStatus(s).progress.yoryeok, 555, 'PlayScene의 loadProgress()가 같은 칸을 읽는다');
});

test('이어하기는 빈 칸·손상된 칸에서는 아무 일도 하지 않는다', () => {
  const s = fakeStorage({ [slotKey(2)]: 'garbage' });
  const started = [];
  const model = createTitleModel({ storage: s, onStart: (r) => started.push(r) });
  assert.equal(model.choose(1, 'continue'), null);
  assert.equal(model.choose(2, 'continue'), null);
  assert.equal(started.length, 0);
  assert.equal(getCurrentSlot(s), 1);
});

test('빈 칸의 새로 시작: 확인 없이 처음 상태로 저장하고 시작한다', () => {
  const s = fakeStorage();
  const started = [];
  const model = createTitleModel({ storage: s, onStart: (r) => started.push(r) });
  assert.equal(model.choose(2, 'new'), 'start');
  assert.equal(started[0].mode, 'new');
  assert.equal(started[0].slot, 2);
  assert.deepEqual(started[0].progress, createProgress());
  assert.equal(getCurrentSlot(s), 2);
  assert.equal(summarizeSlot(2, s).status, 'ok', '시작과 함께 칸이 생긴다');
});

test('저장이 있는 칸의 새로 시작은 한 번 확인한 뒤에만 덮어쓴다', () => {
  const s = fakeStorage();
  saveProgress(filled({ yoryeok: 9999 }), s, 1);
  const started = [];
  const model = createTitleModel({ storage: s, onStart: (r) => started.push(r) });
  assert.equal(model.choose(1, 'new'), 'confirm');
  assert.equal(started.length, 0);
  assert.equal(summarizeSlot(1, s).yoryeok, 9999, '확인 전에는 지워지지 않는다');
  assert.deepEqual(model.view().confirming, { slot: 1, action: 'new', text: confirmText(1, 'new') });
  assert.equal(model.confirm(), 'start');
  assert.equal(started.length, 1);
  assert.deepEqual(started[0].progress, createProgress());
  assert.equal(model.view().confirming, null);
});

test('손상된 칸의 새로 시작도 확인을 거친다', () => {
  const s = fakeStorage({ [slotKey(1)]: '{x' });
  const model = createTitleModel({ storage: s, onStart: () => assert.fail('확인 전에 시작') });
  assert.equal(model.choose(1, 'new'), 'confirm');
  assert.equal(s.m.get(slotKey(1)), '{x');
});

test('지우기: 확인 한 번 뒤에 그 칸만 비운다', () => {
  const s = fakeStorage();
  saveProgress(filled({ yoryeok: 10 }), s, 1);
  saveProgress(filled({ yoryeok: 20 }), s, 2);
  const model = createTitleModel({ storage: s, onStart: () => assert.fail('지우기는 시작하지 않는다') });
  assert.equal(model.choose(2, 'clear'), 'confirm');
  assert.equal(summarizeSlot(2, s).status, 'ok');
  assert.equal(model.confirm(), 'cleared');
  assert.equal(summarizeSlot(2, s).status, 'empty');
  assert.equal(summarizeSlot(1, s).yoryeok, 10);
  assert.equal(model.view().confirming, null);
});

test('손상된 칸도 지울 수 있고, 빈 칸에는 지우기가 없다', () => {
  const s = fakeStorage({ [slotKey(3)]: 'bad' });
  const model = createTitleModel({ storage: s });
  assert.equal(model.choose(1, 'clear'), null, '빈 칸');
  assert.equal(model.choose(3, 'clear'), 'confirm');
  assert.equal(model.confirm(), 'cleared');
  assert.equal(summarizeSlot(3, s).status, 'empty');
});

test('취소하면 아무것도 바뀌지 않고, 다른 동작을 고르면 확인 대상이 바뀐다', () => {
  const s = fakeStorage();
  saveProgress(filled({ yoryeok: 5 }), s, 1);
  const model = createTitleModel({ storage: s });
  model.choose(1, 'clear');
  assert.deepEqual(model.cancel(), { slot: 1, action: 'clear' });
  assert.equal(model.view().confirming, null);
  assert.equal(summarizeSlot(1, s).yoryeok, 5);
  assert.equal(model.cancel(), null);
  assert.equal(model.confirm(), null, '확인할 것이 없으면 아무 일도 하지 않는다');
  model.choose(1, 'clear');
  model.choose(1, 'new');
  assert.equal(model.view().confirming.action, 'new');
});

test('이상한 칸 번호·동작은 무시한다', () => {
  const model = createTitleModel({ storage: fakeStorage(), onStart: () => assert.fail('시작하면 안 된다') });
  for (const slot of [0, 4, '1', null]) assert.equal(model.choose(slot, 'new'), null);
  assert.equal(model.choose(1, 'explode'), null);
});

test('저장소가 막혀도 새로 시작은 판을 열고, 시작 화면은 저장 불가를 알린다', () => {
  const thrower = { getItem: () => null, setItem() { throw new Error('quota'); }, removeItem() {} };
  assert.equal(canSave(thrower), false);
  assert.equal(canSave(null), false);
  assert.equal(canSave(fakeStorage()), true);
  const started = [];
  const model = createTitleModel({ storage: thrower, onStart: (r) => started.push(r) });
  assert.equal(model.view().canSave, false);
  assert.equal(model.choose(1, 'new'), 'start');
  assert.deepEqual(started[0].progress, createProgress());
});

test('canSave는 시험 쓰기 키를 남기지 않는다', () => {
  const s = fakeStorage();
  assert.equal(canSave(s), true);
  assert.equal(s.m.size, 0);
});

test('확인 문구는 칸 번호와 무엇이 사라지는지를 말한다', () => {
  assert.equal(confirmText(2, 'clear'), '2번 칸을 지울까요? 지운 진행은 되돌릴 수 없어요.');
  assert.equal(confirmText(3, 'new'), '새로 시작하면 3번 칸의 진행이 사라져요.');
});
