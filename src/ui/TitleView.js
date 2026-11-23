// 시작 화면: 저장 칸 3개를 보여 주고 [이어하기] / [새로 시작] / [지우기]를 고르게 한다.
// TitleView({ storage, now, onStart })를 호출하면 화면이 열린다. 고른 칸을 지금 슬롯으로 기억한 뒤
// 이 화면을 닫고 onStart({ slot, mode: 'continue' | 'new', progress })를 부른다(PlayScene은 지금 슬롯을 읽는다).
// 화면 규칙(어떤 칸에 어떤 버튼이 있고 무엇이 확인을 요구하는가)은 createTitleModel에 있어 DOM 없이 시험한다.

import {
  canSave, clearSave, getCurrentSlot, listSlots, loadProgress, setCurrentSlot, startNewSlot,
} from '../state/save.js';
import { button, el, number } from './OddsTable.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// 마지막으로 저장한 시각을 사람이 읽는 말로. 모르면 null.
export function formatLastPlayed(savedAt, now = Date.now()) {
  if (!Number.isFinite(savedAt)) return null;
  const gap = Math.max(0, now - savedAt);
  if (gap < MINUTE) return '방금 전';
  if (gap < HOUR) return Math.floor(gap / MINUTE) + '분 전';
  if (gap < DAY) return Math.floor(gap / HOUR) + '시간 전';
  if (gap < 7 * DAY) return Math.floor(gap / DAY) + '일 전';
  const date = new Date(savedAt);
  return date.getFullYear() + '년 ' + (date.getMonth() + 1) + '월 ' + date.getDate() + '일';
}

const ACTIONS = {
  continue: { id: 'continue', label: '이어하기', primary: true },
  new: { id: 'new', label: '새로 시작' },
  clear: { id: 'clear', label: '지우기' },
};

// 칸 하나의 표시 내용. 빈 칸은 [새로 시작]만, 손상된 칸은 [새로 시작]과 [지우기]만 둔다.
export function slotCard(summary, { now = Date.now(), isLast = false } = {}) {
  const base = {
    slot: summary.slot,
    heading: summary.slot + '번',
    state: summary.status,
    isLast: false,
    name: null, detail: null, wallet: null, played: null, note: null,
  };
  if (summary.status === 'ok') {
    return {
      ...base,
      isLast,
      name: summary.formName,
      detail: summary.stage + '단계 ' + summary.grade + '등급',
      wallet: '요력 ' + number(summary.yoryeok),
      played: formatLastPlayed(summary.savedAt, now),
      actions: [ACTIONS.continue, ACTIONS.new, ACTIONS.clear],
    };
  }
  if (summary.status === 'corrupt') {
    return { ...base, note: '저장이 손상되어 읽을 수 없어요', actions: [ACTIONS.new, { ...ACTIONS.clear, primary: false }] };
  }
  return { ...base, note: '비어 있어요', actions: [{ ...ACTIONS.new, primary: true }] };
}

// 지우거나 덮어쓰기 전에 한 번 묻는 말. 빈 칸에는 확인이 없다.
export function confirmText(slot, action) {
  return action === 'clear'
    ? slot + '번 칸을 지울까요? 지운 진행은 되돌릴 수 없어요.'
    : '새로 시작하면 ' + slot + '번 칸의 진행이 사라져요.';
}

export function createTitleModel({ storage, now = () => Date.now(), onStart } = {}) {
  let confirming = null; // { slot, action: 'new' | 'clear' }
  const summaries = () => listSlots(storage);
  const summaryOf = (slot) => summaries().find((s) => s.slot === slot);

  function view() {
    const last = getCurrentSlot(storage);
    const t = now();
    return {
      cards: summaries().map((s) => slotCard(s, { now: t, isLast: s.slot === last })),
      confirming: confirming && { ...confirming, text: confirmText(confirming.slot, confirming.action) },
      canSave: canSave(storage),
    };
  }

  function begin(slot, mode) {
    if (mode === 'new') startNewSlot(slot, storage);
    else setCurrentSlot(slot, storage);
    confirming = null;
    // 저장소가 막혀 있어도 판은 시작한다(진행이 남지 않을 뿐이다).
    onStart?.({ slot, mode, progress: loadProgress(storage, slot) });
  }

  return {
    view,
    // 'start' | 'confirm' | 'cleared' | null(할 일 없음)
    choose(slot, action) {
      const status = summaryOf(slot)?.status;
      if (!status) return null;
      if (action === 'continue') {
        if (status !== 'ok') return null;
        begin(slot, 'continue');
        return 'start';
      }
      if (action === 'new' && status === 'empty') {
        begin(slot, 'new');
        return 'start';
      }
      if ((action === 'new' || action === 'clear') && status !== 'empty') {
        confirming = { slot, action };
        return 'confirm';
      }
      return null;
    },
    // 확인을 누르면 대기 중이던 동작을 실행한다.
    confirm() {
      if (!confirming) return null;
      const { slot, action } = confirming;
      if (action === 'new') {
        begin(slot, 'new');
        return 'start';
      }
      confirming = null;
      clearSave(storage, slot);
      return 'cleared';
    },
    cancel() {
      const was = confirming;
      confirming = null;
      return was;
    },
  };
}

export function TitleView({ storage, now = () => Date.now(), onStart } = {}) {
  const arena = document.getElementById('arena');
  const root = el('div', 'title-screen');
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', '저장 칸 고르기');
  let closed = false;
  const model = createTitleModel({
    storage, now,
    onStart(result) {
      close();
      onStart?.(result);
    },
  });

  const head = el('header', 'ts-head');
  const crest = el('span', 'crest');
  crest.setAttribute('aria-hidden', 'true');
  crest.append(el('i'), el('i'), el('i'), el('i'));
  const name = el('div', 'ts-name');
  name.append(el('h1', 'ts-title', '용이 되자'), el('p', 'ts-subtitle', '미물에서 용까지'));
  const book = el('a', 'ts-book', '요괴 도감');
  book.href = './index.html?gallery=1';
  head.append(crest, name, book);

  const grid = el('div', 'ts-slots');
  const hint = el('p', 'ts-hint');
  root.append(head, grid, hint);

  function cardNode(card, confirming) {
    const article = el('article', 'ts-card');
    article.dataset.slot = card.slot;
    article.dataset.state = card.state;
    if (card.isLast) article.dataset.last = 'true';
    const top = el('div', 'ts-card-head');
    top.append(el('h2', 'ts-slot', card.heading));
    if (card.isLast) top.append(el('span', 'ts-last', '최근에 한 칸'));
    article.append(top);

    const mine = confirming && confirming.slot === card.slot ? confirming : null;
    if (mine) {
      const message = el('p', 'ts-confirm', mine.text);
      message.setAttribute('role', 'alert');
      const row = el('div', 'ts-actions');
      const yes = button(mine.action === 'clear' ? '지우기' : '새로 시작', () => {
        // 지운 뒤에는 같은 칸의 [새로 시작]으로 초점을 옮긴다. 새로 시작하면 화면이 닫힌다.
        if (model.confirm() === 'cleared') render({ slot: card.slot, action: 'new' });
      }, 'ts-danger');
      yes.dataset.action = 'confirm';
      yes.setAttribute('aria-label', card.slot + '번 칸 ' + (mine.action === 'clear' ? '지우기 확인' : '새로 시작 확인'));
      const no = button('취소', () => {
        model.cancel();
        render({ slot: card.slot, action: mine.action });
      });
      no.dataset.action = 'cancel';
      row.append(yes, no);
      article.append(message, row);
      return article;
    }

    const body = el('div', 'ts-body');
    if (card.state === 'ok') {
      const portrait = el('span', 'ts-portrait', card.name.slice(0, 1));
      portrait.setAttribute('aria-hidden', 'true');
      const info = el('div', 'ts-info');
      info.append(el('strong', 'ts-form', card.name), el('span', '', card.detail), el('span', '', card.wallet));
      if (card.played) info.append(el('span', 'ts-played', '마지막 플레이 ' + card.played));
      body.append(portrait, info);
    } else {
      body.append(el('p', 'ts-note', card.note));
    }
    const row = el('div', 'ts-actions');
    row.dataset.count = card.actions.length;
    for (const action of card.actions) {
      const b = button(action.label, () => {
        const result = model.choose(card.slot, action.id);
        if (result === 'confirm') render({ slot: card.slot, action: 'cancel' });
      }, action.primary ? 'yk-primary' : '');
      b.dataset.action = action.id;
      b.setAttribute('aria-label', card.slot + '번 칸 ' + action.label);
      row.append(b);
    }
    article.append(body, row);
    return article;
  }

  // focus = { slot, action }이면 그 버튼으로, 없으면 마지막으로 한 칸(없으면 첫 주 버튼)으로 초점을 돌려 놓는다.
  function render(focus) {
    if (closed) return;
    const v = model.view();
    grid.replaceChildren(...v.cards.map((card) => cardNode(card, v.confirming)));
    hint.textContent = v.canSave
      ? '칸을 골라 시작해요. 진행은 자동으로 저장돼요.'
      : '이 브라우저에서는 저장할 수 없어요. 판을 마쳐도 진행이 남지 않아요.';
    hint.dataset.tone = v.canSave ? '' : 'warn';
    const target = focus
      ? grid.querySelector('[data-slot="' + focus.slot + '"] [data-action="' + focus.action + '"]')
      : (grid.querySelector('[data-last="true"] .yk-primary') ?? grid.querySelector('.yk-primary'));
    target?.focus({ preventScroll: true });
  }

  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !model.cancel()) return;
    event.preventDefault();
    render();
  });

  function close() {
    if (closed) return;
    closed = true;
    root.remove();
    if (arena) arena.inert = false;
  }

  // 게임 화면은 시작 화면 뒤에서 초점을 받지 않게 한다.
  if (arena) arena.inert = true;
  document.body.append(root);
  render();
  return { close, element: root };
}

export default TitleView;
