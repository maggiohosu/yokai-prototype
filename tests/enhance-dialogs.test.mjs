// 보호권 선택창·연속 강화 시작 선택창(사용자 지시 2026-11-24, docs/plan.md 변경 이력 23): 문구, 포커스, Esc, 한 번만 선택, 44px.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  autoSetupDialog, autoStopText, autoSummary, protectCopy, protectDialog, summaryBlock,
} from '../src/ui/EnhanceDialogs.js';
import { protectPrompt } from '../src/systems/protect.js';
import { autoEnhance } from '../src/systems/enhance.js';
import { createProgress } from '../src/systems/progress.js';

const css = readFileSync(new URL('../src/ui/overlay.css', import.meta.url), 'utf8');

// 선택창이 쓰는 만큼만 흉내 낸 DOM.
function fakeDom(t) {
  const state = { active: null };
  class Node {
    constructor(tag) {
      Object.assign(this, {
        tagName: tag, children: [], attrs: {}, listeners: {}, dataset: {}, textContent: '', removed: false,
        open: false, modal: false, disabled: false, checked: false, type: '', name: '', value: '', id: '',
      });
      this.classes = new Set();
    }
    set className(value) { this.classes = new Set(String(value).split(/\s+/).filter(Boolean)); }
    get className() { return [...this.classes].join(' '); }
    append(...nodes) { this.children.push(...nodes); }
    setAttribute(key, value) { this.attrs[key] = String(value); }
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
    showModal() { this.open = true; this.modal = true; }
    close() { this.open = false; }
    remove() { this.removed = true; }
    focus() { state.active = this; }
    fire(type, init = {}) {
      const event = { type, defaultPrevented: false, stopped: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...init };
      for (const fn of this.listeners[type] ?? []) fn(event);
      return event;
    }
    click() { if (!this.disabled) this.fire('click'); }
    find(predicate, out = []) {
      if (predicate(this)) out.push(this);
      for (const child of this.children) child.find(predicate, out);
      return out;
    }
  }
  globalThis.document = { createElement: (tag) => new Node(tag) };
  t.after(() => { delete globalThis.document; });
  return { parent: new Node('dialog'), state, Node };
}

const textOf = (node) => [node.textContent, ...node.children.map(textOf)].join(' ').replace(/\s+/g, ' ').trim();

test('문구: 질문은 "보호권을 써서 지킬까요? (남은 보호권 n개)", 단추는 [보호권 사용] [그냥 받기]', () => {
  const body = protectCopy({ kind: 'body', stat: 'growth', level: 7, protect: 3 }, '크기 성장');
  assert.equal(body.question, '보호권을 써서 지킬까요? (남은 보호권 3개)');
  assert.equal(body.use, '보호권 사용');
  assert.equal(body.decline, '그냥 받기');
  assert.match(body.detail, /크기 성장 \+7 → \+8/);
  assert.match(body.detail, /퇴화/);
  const treasure = protectCopy({ kind: 'treasure', level: 9, protect: 1, shards: 9 }, '여의주');
  assert.equal(treasure.question, '보호권을 써서 지킬까요? (남은 보호권 1개)');
  assert.match(treasure.detail, /여의주 \+9 → \+10/);
  assert.match(treasure.detail, /파편 9개/);
  // 보호권 prompt 모델에서 곧바로 만든다.
  const p = createProgress();
  p.enh.speed = 4;
  p.protect = 2;
  p.pendingProtect = { kind: 'body', stat: 'speed' };
  assert.equal(protectCopy(protectPrompt(p), '이동 속도').question, '보호권을 써서 지킬까요? (남은 보호권 2개)');
});

test('보호권 선택창: alertdialog, 제목·설명 연결, 처음 초점은 [보호권 사용], 단추는 type=button', (t) => {
  const { parent, state } = fakeDom(t);
  const copy = protectCopy({ kind: 'body', stat: 'growth', level: 7, protect: 2 }, '크기 성장');
  const choices = [];
  const shown = protectDialog(parent, copy, true, (use) => choices.push(use));
  const { modal } = shown;
  assert.equal(parent.children.includes(modal), true);
  assert.equal(modal.open && modal.modal, true, '모달로 열린다');
  assert.equal(modal.attrs.role, 'alertdialog');
  const title = modal.find((n) => n.id === modal.attrs['aria-labelledby'])[0];
  const text = modal.find((n) => n.id === modal.attrs['aria-describedby'])[0];
  assert.equal(title.textContent, copy.title);
  assert.match(textOf(text), /보호권을 써서 지킬까요\? \(남은 보호권 2개\)/);
  assert.equal(shown.use.textContent, '보호권 사용');
  assert.equal(shown.decline.textContent, '그냥 받기');
  assert.equal(shown.use.type, 'button');
  assert.equal(shown.decline.type, 'button');
  assert.equal(state.active, shown.use, '열리면 [보호권 사용]에 초점');
  assert.match(shown.use.attrs['aria-label'], /보호권 1장/);
  assert.deepEqual(choices, []);
});

test('보호권 선택창 · Esc는 닫지 않는다(결과를 정하는 명시적 선택만 닫는다). 안내만 보이고 아무 결정도 하지 않는다', (t) => {
  const { parent } = fakeDom(t);
  const choices = [];
  const { modal, note } = protectDialog(parent, protectCopy({ kind: 'body', stat: 'growth', level: 7, protect: 2 }, '크기 성장'), true, (use) => choices.push(use));
  const event = modal.fire('cancel');
  assert.equal(event.defaultPrevented, true, '브라우저의 Esc 닫기를 막는다');
  assert.equal(modal.open, true);
  assert.equal(modal.removed, false);
  assert.deepEqual(choices, []);
  assert.match(note.textContent, /버튼 중 하나/);
  assert.equal(note.attrs.role, 'status', '스크린리더가 안내를 읽는다');
  // 키 입력이 게임의 키 핸들러로 새지 않는다.
  assert.equal(modal.fire('keydown', { key: 'Escape' }).stopped, true);
});

test('보호권 선택창 · [보호권 사용]은 true, [그냥 받기]는 false를 한 번만 알리고 창을 닫는다', (t) => {
  const { parent } = fakeDom(t);
  const copy = protectCopy({ kind: 'treasure', level: 9, protect: 1, shards: 9 }, '여의주');
  const used = [];
  const first = protectDialog(parent, copy, true, (use) => used.push(use));
  first.use.click();
  first.use.click();
  first.decline.click();
  assert.deepEqual(used, [true], '두 번 눌러도 한 번만');
  assert.equal(first.modal.open, false);
  assert.equal(first.modal.removed, true);
  const declined = [];
  const second = protectDialog(parent, copy, true, (use) => declined.push(use));
  second.decline.click();
  second.use.click();
  assert.deepEqual(declined, [false]);
});

test('보호권 선택창 · 보호권이 없으면 [보호권 사용]은 비활성이고 [그냥 받기]에 초점이 간다', (t) => {
  const { parent, state } = fakeDom(t);
  const choices = [];
  const copy = protectCopy({ kind: 'body', stat: 'growth', level: 7, protect: 0 }, '크기 성장');
  const shown = protectDialog(parent, copy, false, (use) => choices.push(use));
  assert.equal(shown.use.disabled, true);
  assert.equal(state.active, shown.decline);
  assert.equal(shown.note.textContent, copy.noneNote);
  shown.use.fire('click'); // 비활성이어도 이벤트가 들어오는 경우를 막는다
  assert.deepEqual(choices, []);
  shown.decline.click();
  assert.deepEqual(choices, [false]);
});

test('연속 강화 시작창: 퇴화 A/B와 보호권 자동 사용/쓰지 않기를 한 번만 묻고, 고른 값을 시작과 함께 돌려준다', (t) => {
  const { parent, state } = fakeDom(t);
  const started = [];
  let cancelled = 0;
  const shown = autoSetupDialog(parent, {
    statName: '크기 성장', level: 8, batch: 20, canDevolve: true, protect: 3, initial: { degrade: 'A', protect: 'skip' },
  }, { onStart: (choice) => started.push(choice), onCancel: () => { cancelled++; } });
  const { modal, radios } = shown;
  assert.equal(modal.modal, true);
  assert.equal(modal.attrs['aria-labelledby'] !== undefined, true);
  assert.match(textOf(modal), /연속 강화 20회/);
  assert.match(textOf(modal), /크기 성장 \+8에서 20번을 멈추지 않고/);
  assert.match(textOf(modal), /강화 레벨 낮추기/);
  assert.match(textOf(modal), /진화 단계 낮추기/);
  assert.match(textOf(modal), /보호권 자동 사용/);
  assert.match(textOf(modal), /보호권 쓰지 않기/);
  assert.match(textOf(modal), /보호권 \(3장 보유\)/);
  assert.equal(radios.length, 4);
  assert.deepEqual(radios.map((r) => [r.value, r.checked]), [['A', true], ['B', false], ['use', false], ['skip', true]]);
  assert.equal(state.active, radios[0], '처음 초점은 고른 퇴화 방식');
  // B와 보호권 자동 사용으로 바꾸고 시작
  radios[0].checked = false; radios[1].checked = true; radios[1].fire('change');
  radios[3].checked = false; radios[2].checked = true; radios[2].fire('change');
  shown.start.click();
  shown.start.click();
  assert.deepEqual(started, [{ degrade: 'B', protect: 'use' }], '한 번만 시작한다');
  assert.equal(cancelled, 0);
  assert.equal(modal.removed, true);
});

test('연속 강화 시작창: 보호권이 없으면 보호권 질문을 숨기고, 역진화가 불가능하면 B를 비활성화한다', (t) => {
  const { parent } = fakeDom(t);
  const started = [];
  const shown = autoSetupDialog(parent, {
    statName: '이동 속도', level: 0, batch: 20, canDevolve: false, protect: 0, initial: { degrade: 'B', protect: 'use' },
  }, { onStart: (choice) => started.push(choice) });
  assert.doesNotMatch(textOf(shown.modal), /보호권 자동 사용/);
  assert.equal(shown.radios.length, 2);
  const [a, b] = shown.radios;
  assert.equal(b.disabled, true, '내릴 진화 단계가 없으면 B는 고를 수 없다');
  assert.equal(a.checked, true, '저장된 B도 불가능하면 A로 바꾼다');
  assert.equal(b.checked, false);
  assert.match(textOf(shown.modal), /역진화는 고를 수 없어요/);
  shown.start.click();
  assert.deepEqual(started, [{ degrade: 'A', protect: 'use' }], '이번 묶음에는 보호권이 없어 저장된 값을 그대로 돌려준다');
});

test('연속 강화 시작창: Esc와 [취소]는 아무것도 시작하지 않고 닫는다(취소는 되돌릴 일이 없어 Esc를 허용한다)', (t) => {
  const { parent } = fakeDom(t);
  const model = { statName: '생명력', level: 3, batch: 20, canDevolve: true, protect: 1, initial: undefined };
  let started = 0;
  let cancelled = 0;
  const esc = autoSetupDialog(parent, model, { onStart: () => { started++; }, onCancel: () => { cancelled++; } });
  const event = esc.modal.fire('cancel');
  assert.equal(event.defaultPrevented, true);
  assert.equal(esc.modal.removed, true);
  const button = autoSetupDialog(parent, model, { onStart: () => { started++; }, onCancel: () => { cancelled++; } });
  button.cancel.click();
  button.start.click();
  assert.equal(started, 0);
  assert.equal(cancelled, 2);
  // 저장된 값이 없으면 처음 기본값은 A·쓰지 않기(소모하지 않는 쪽).
  assert.deepEqual(button.radios.map((r) => [r.value, r.checked]), [['A', true], ['B', false], ['use', false], ['skip', true]]);
});

test('단추와 선택 줄은 44px 이상이다(버튼 .yk-button, 라디오 줄 .yk-radio)', () => {
  assert.match(css, /\.yk-button,[^{]*\{[^}]*min-height: 44px/);
  assert.match(css, /\.yk-radio \{[^}]*min-height: 44px/);
  assert.match(css, /\.yk-prompt \.yk-button \{[^}]*width: 100%/, '선택창 단추는 폭 전체로 눌러 쉽다');
});

test('결과 요약: 성공·대성공·실패·퇴화·보호권 사용 수, 시작→끝 레벨, 쓴 요력과 멈춘 까닭', (t) => {
  const p = Object.assign(createProgress(), { yoryeok: 1e9, protect: 2 });
  p.enh.growth = 4;
  let seed = 5;
  const rng = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const { summary, reason } = autoEnhance(p, 'growth', { rng, degrade: 'A', useProtect: true });
  const view = autoSummary({ summary, reason, statName: '크기 성장', batch: 20 });
  assert.equal(view.headline, '크기 성장 연속 강화 ' + summary.tries + '회 · +4 → +' + p.enh.growth);
  assert.deepEqual(view.rows.map(([label]) => label), ['성공', '대성공', '실패', '퇴화', '보호권 사용', '쓴 요력']);
  assert.equal(view.rows[0][1], summary.success + '번');
  assert.equal(view.rows[4][1], summary.protectUsed + '장');
  assert.equal(view.stop, autoStopText(reason, 20));
  const accounted = summary.success + summary.great + summary.fail + summary.degrade + summary.protectUsed;
  assert.equal(accounted, summary.tries, '모든 시도가 다섯 칸 중 하나에 들어간다');
  assert.deepEqual([autoStopText('batch', 20), autoStopText('max', 3), autoStopText('gold', 3), autoStopText('single', 1, 'S')], [
    '20회를 모두 했어요', '최고 레벨에 닿았어요', '요력이 모자라 멈췄어요', 'S등급은 한 번씩 강화할 수 있어요',
  ]);
  assert.match(autoStopText('devolve', 3), /더 내릴 진화 단계가 없어/);
  // 역진화가 있으면 안내 한 줄이 붙는다.
  const devolved = autoSummary({
    summary: { tries: 3, success: 0, great: 0, fail: 0, protectUsed: 0, degrade: 3, lowered: 1, devolved: 2, from: 4, to: 3, spent: 1000 },
    reason: 'batch', statName: '생명력',
  });
  assert.equal(devolved.rows[3][1], '3번 (레벨 낮춤 1 · 역진화 2)');
  assert.match(devolved.note, /역진화 2번을 예약했어요/);
  // DOM 블록
  fakeDom(t);
  const block = summaryBlock(devolved);
  assert.equal(block.find((n) => n.tagName === 'dt').length, 6);
  assert.equal(block.find((n) => n.tagName === 'dd').length, 6);
});
