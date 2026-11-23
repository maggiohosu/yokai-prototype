// QuickPick(cards, { yoryeok, getFormImage, onPick, ignoreMs, rerollsLeft, onReroll, title, onDefer })를 부르면 화면 가운데에 카드 3장이 뜬다.
// 호출 전에 게임을 멈추는 일, 고른 뒤 재개하는 일은 호출한 쪽(PlayScene)이 한다.
// - 카드 하나 = 결과 하나. 카드를 누르는 순간(pointerdown) onPick(card)을 부르고 곧바로 닫는다. 확인 창은 없다.
// - 열린 직후 ignoreMs(기본 CONFIG.levelUp.quickIgnoreMs) 동안은 입력을 무시한다(진행 중이던 손가락의 오입력 방지).
// - 키보드: 1·2·3 또는 Tab 후 Enter/Space. R은 [다시 뽑기], C·Esc는 [계속 모으기].
// - [계속 모으기](계획서 변경 이력 21): 2단계 이상의 진화 전용 선택에서 onDefer(함수)를 주면 카드 아래에 단추가 나온다. 누르면 아무것도 사지 않고 닫고 onDefer()를 부른다(44px 이상, 탭 한 번).
//   title로 머리글 글자를 바꾼다(기본 '성장할 때!').
// - [다시 뽑기](계획서 변경 이력 5): rerollsLeft(남은 횟수, 0이면 버튼을 숨긴다)와 onReroll(현재 카드)이 있을 때 카드 아래에 나온다. onReroll은 levelup.js의 rerollQuickCards 결과
//   { cards, left, changed } 또는 null을 돌려준다. 새 카드는 호출한 쪽이 이미 정해서 넘기고, 이 화면은 그대로 보여주기만 한다(바뀐 뒤에도 ignoreMs 동안 탭을 무시한다).
// cards는 levelup.js의 pickQuickCards가 만든 { kind, id, cost, form?, unknown?, mult?, stat?, level? } 목록이다.
// 반환값 { close, layer }. 씬이 닫힐 때 close()를 부르면 onPick 없이 사라진다.

import { CONFIG } from '../config.js';
import { QUICK_STAT_NAMES, quickStatNote } from '../systems/levelup.js';
import { abilityLabel } from '../systems/abilities.js';
import { AbilityInfoView, withInfoButton } from './AbilityInfoView.js';

const KIND_LABEL = { evolve: '진화', body: '몸집', ability: '능력 +1' };
const numberFormat = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 });

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// index.html에 <link>가 없어도 동작하도록 한 번만 불러온다.
function ensureStyles() {
  const href = new URL('./quickpick.css', import.meta.url).href;
  const loaded = [...document.querySelectorAll('link[rel="stylesheet"]')].some((link) => link.href === href);
  if (loaded) return;
  const link = el('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.append(link);
}

function artOf(card, getFormImage) {
  const art = el('span', 'qp-art');
  art.setAttribute('aria-hidden', 'true');
  if (card.kind === 'evolve' && !card.unknown) {
    const source = getFormImage?.(card.form.id);
    if (source) {
      const image = el('img');
      image.alt = '';
      image.draggable = false;
      image.src = typeof source === 'string' ? source : source.toDataURL?.() || source.src;
      art.append(image);
      return art;
    }
    art.classList.add('qp-text');
    art.append(el('span', 'qp-glyph', card.form.name.slice(0, 1)));
  } else if (card.kind === 'evolve') {
    art.classList.add('qp-mystery', 'qp-text');
    art.append(el('span', 'qp-glyph', '???'));
  } else if (card.kind === 'body') {
    art.classList.add('qp-text');
    art.append(el('span', 'qp-glyph', '×' + numberFormat.format(card.mult)));
  } else {
    art.classList.add('qp-text');
    art.append(el('span', 'qp-glyph', '+1'));
  }
  return art;
}

function textOf(card) {
  if (card.kind === 'evolve') {
    return card.unknown
      ? { name: '???', sub: '미지의 진화' }
      : { name: card.form.name, sub: card.form.stage + '단계', note: abilityLabel(card.form) };
  }
  if (card.kind === 'body') return { name: '몸집 강화', sub: '이번 판만' };
  return {
    name: QUICK_STAT_NAMES[card.stat] ?? card.stat,
    sub: 'Lv ' + card.level + ' → ' + (card.level + 1),
    note: quickStatNote(card.stat, card.level),
  };
}

export function QuickPick(cards, {
  yoryeok, progress, getFormImage, onPick, ignoreMs = CONFIG.levelUp.quickIgnoreMs, now = () => performance.now(),
  rerollsLeft = 0, onReroll, title = '성장할 때!', onDefer, deferLabel = '계속 모으기',
} = {}) {
  ensureStyles();
  let openedAt = now();
  let current = cards;
  let left = Math.max(0, Math.floor(Number(rerollsLeft) || 0));
  const layer = el('div', 'quickpick');
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', title + (typeof onDefer === 'function' ? ' 진화하거나 ' + deferLabel + '를 고르세요' : ' 하나를 고르세요'));
  const panel = el('div', 'qp-panel');
  const head = el('div', 'qp-head');
  head.append(el('h2', 'qp-title', title));
  if (Number.isFinite(yoryeok)) head.append(el('span', 'qp-wallet', '보유 요력 ' + numberFormat.format(yoryeok)));
  const list = el('div', 'qp-cards');
  panel.append(head, list);
  // [다시 뽑기]: 한 판에 정해진 횟수만. 횟수를 다 쓰면 버튼이 사라진다(안내 글자만 남긴다).
  const canReroll = typeof onReroll === 'function' && left > 0;
  const foot = el('div', 'qp-foot');
  const rerollButton = el('button', 'qp-reroll');
  const rerollNote = el('span', 'qp-reroll-note');
  rerollNote.setAttribute('role', 'status');
  rerollNote.setAttribute('aria-live', 'polite');
  rerollButton.type = 'button';
  rerollButton.setAttribute('aria-keyshortcuts', 'R');
  // [계속 모으기]: 요력을 쓰지 않고 닫는다. 진화 전용 선택(2단계 이상)에서만 onDefer가 온다.
  const canDefer = typeof onDefer === 'function';
  const deferButton = el('button', 'qp-defer', deferLabel);
  deferButton.type = 'button';
  deferButton.setAttribute('aria-keyshortcuts', 'C Escape');
  deferButton.setAttribute('aria-label', deferLabel + ', 요력은 그대로 두고 계속 모아요');
  if (canDefer) foot.append(deferButton);
  if (canReroll) foot.append(rerollButton, rerollNote);
  if (canDefer || canReroll) panel.append(foot);
  layer.append(panel);

  let done = false;
  let info = null;
  const buttons = [];
  const onKey = (event) => {
    if (info || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === 'KeyR' && canReroll) {
      event.preventDefault();
      event.stopPropagation();
      reroll();
      return;
    }
    if ((event.code === 'KeyC' || event.code === 'Escape') && canDefer) {
      event.preventDefault();
      event.stopPropagation();
      defer();
      return;
    }
    const match = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
    if (!match) return;
    const index = Number(match[1]) - 1;
    if (index >= current.length) return;
    event.preventDefault();
    event.stopPropagation();
    pick(current[index]);
  };
  function close() {
    if (done) return;
    done = true;
    info?.close();
    window.removeEventListener('keydown', onKey, true);
    layer.remove();
  }
  function pick(card) {
    if (done || now() - openedAt < ignoreMs) return;
    close();
    onPick?.(card);
  }
  function defer() {
    if (done || now() - openedAt < ignoreMs) return;
    close();
    onDefer?.();
  }
  function showReroll(note = '') {
    rerollButton.textContent = '다시 뽑기 · 남은 ' + left + '번';
    rerollButton.hidden = left <= 0;
    rerollButton.setAttribute('aria-label', '카드 다시 뽑기, 요력은 들지 않아요, 남은 ' + left + '번');
    rerollNote.textContent = left > 0 ? note : '다시 뽑기를 썼어요';
  }
  // 카드를 새로 뽑는다: 새 카드는 onReroll이 이미 정했다. 구성이 바뀌지 않았으면(고를 수 있는 카드가 그것뿐) 횟수를 쓰지 않고 안내만 한다.
  function reroll() {
    if (done || left <= 0 || now() - openedAt < ignoreMs) return;
    const out = onReroll?.(current);
    if (!out) {
      left = 0;
      showReroll();
      return;
    }
    left = Math.max(0, Math.floor(Number(out.left) || 0));
    if (out.changed === false) {
      showReroll('바꿀 수 있는 카드가 더 없어요');
      return;
    }
    current = out.cards;
    openedAt = now(); // 손가락이 새 카드 위에 있을 수 있으니 열린 직후처럼 잠깐 입력을 무시한다
    renderCards();
    showReroll();
  }

  function renderCards() {
    buttons.length = 0;
    list.replaceChildren();
    list.style.setProperty('--qp-count', String(Math.max(1, current.length)));
    // 카드가 많으면(진화 선택지가 모두 보일 때) 줄바꿈한다: 4장까지는 한 줄, 5·6장은 3열, 7장 이상은 4열(패널도 넓힌다).
    const cols = current.length <= 4 ? Math.max(1, current.length) : current.length <= 6 ? 3 : 4;
    list.style.setProperty('--qp-cols', String(cols));
    panel.style.setProperty('--qp-panel-w', cols >= 4 ? '760px' : '560px');
    current.forEach((card, index) => {
      const { name, sub, note } = textOf(card);
      const button = el('button', 'qp-card');
      button.type = 'button';
      button.dataset.kind = card.kind;
      if (card.kind === 'evolve' && !card.unknown && card.form.dir) button.dataset.dir = card.form.dir;
      button.setAttribute('aria-keyshortcuts', String(index + 1));
      button.setAttribute('aria-label', (KIND_LABEL[card.kind] ?? '') + ' ' + name + ' ' + sub + (note ? ', ' + note : '') + ', 요력 ' + numberFormat.format(card.cost));
      button.append(
        el('span', 'qp-kind', KIND_LABEL[card.kind] ?? ''),
        artOf(card, getFormImage),
        el('strong', 'qp-name', name),
        el('span', 'qp-sub', sub),
        ...(note ? [el('span', 'qp-note', note)] : []),
        el('span', 'qp-cost', '요력 ' + numberFormat.format(card.cost)),
      );
      // 손가락이 닿는 순간 고른다. 이 이벤트가 아래 게임(조이스틱)으로 새지 않게 막는다.
      button.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        pick(card);
      });
      // 키보드 Enter/Space나 보조 기술이 만드는 click은 pointerdown이 없다(detail 0). 포인터가 만든 click은 무시한다.
      button.addEventListener('click', (event) => {
        if (event.detail === 0) pick(card);
      });
      buttons.push(button);
      if (card.kind === 'evolve') {
        list.append(withInfoButton(button, card.form?.name ?? '미지의 진화', () => {
          if (done || info || now() - openedAt < ignoreMs) return;
          info = AbilityInfoView(card.form?.id, {
            progress, getFormImage, mystery: card.unknown, onClose: () => { info = null; },
          });
        }));
      } else {
        list.append(button);
      }
    });
    buttons[0]?.focus({ preventScroll: true });
  }

  deferButton.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    defer();
  });
  deferButton.addEventListener('click', (event) => {
    if (event.detail === 0) defer();
  });
  rerollButton.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    reroll();
  });
  rerollButton.addEventListener('click', (event) => {
    if (event.detail === 0) reroll();
  });
  renderCards();
  if (canReroll) showReroll();
  // 레이어의 빈 곳을 눌러도 게임 입력으로 새지 않게 한다.
  layer.addEventListener('pointerdown', (event) => event.stopPropagation());
  document.body.append(layer);
  window.addEventListener('keydown', onKey, true);
  buttons[0]?.focus({ preventScroll: true });
  return { close, layer };
}

export default QuickPick;
