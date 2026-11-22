// QuickPick(cards, { yoryeok, getFormImage, onPick, ignoreMs })를 부르면 화면 가운데에 카드 3장이 뜬다.
// 호출 전에 게임을 멈추는 일, 고른 뒤 재개하는 일은 호출한 쪽(PlayScene)이 한다.
// - 카드 하나 = 결과 하나. 카드를 누르는 순간(pointerdown) onPick(card)을 부르고 곧바로 닫는다. 확인 창은 없다.
// - 열린 직후 ignoreMs(기본 CONFIG.levelUp.quickIgnoreMs) 동안은 입력을 무시한다(진행 중이던 손가락의 오입력 방지).
// - 키보드: 1·2·3 또는 Tab 후 Enter/Space.
// cards는 levelup.js의 pickQuickCards가 만든 { kind, id, cost, form?, unknown?, mult?, stat?, level? } 목록이다.
// 반환값 { close, layer }. 씬이 닫힐 때 close()를 부르면 onPick 없이 사라진다.

import { CONFIG } from '../config.js';
import { QUICK_STAT_NAMES, quickStatNote } from '../systems/levelup.js';
import { abilityLabel } from '../systems/abilities.js';

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
    note: quickStatNote(card.stat),
  };
}

export function QuickPick(cards, {
  yoryeok, getFormImage, onPick, ignoreMs = CONFIG.levelUp.quickIgnoreMs, now = () => performance.now(),
} = {}) {
  ensureStyles();
  const openedAt = now();
  const layer = el('div', 'quickpick');
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', '성장할 때! 하나를 고르세요');
  const panel = el('div', 'qp-panel');
  const head = el('div', 'qp-head');
  head.append(el('h2', 'qp-title', '성장할 때!'));
  if (Number.isFinite(yoryeok)) head.append(el('span', 'qp-wallet', '보유 요력 ' + numberFormat.format(yoryeok)));
  const list = el('div', 'qp-cards');
  list.style.setProperty('--qp-count', String(Math.max(1, cards.length)));
  // 카드가 많으면(진화 선택지가 모두 보일 때) 줄바꿈한다: 4장까지는 한 줄, 5·6장은 3열, 7장 이상은 4열(패널도 넓힌다).
  const cols = cards.length <= 4 ? Math.max(1, cards.length) : cards.length <= 6 ? 3 : 4;
  list.style.setProperty('--qp-cols', String(cols));
  panel.style.setProperty('--qp-panel-w', cols >= 4 ? '760px' : '560px');
  panel.append(head, list);
  layer.append(panel);

  let done = false;
  const buttons = [];
  const onKey = (event) => {
    const match = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
    if (!match || event.ctrlKey || event.metaKey || event.altKey) return;
    const index = Number(match[1]) - 1;
    if (index >= cards.length) return;
    event.preventDefault();
    event.stopPropagation();
    pick(cards[index]);
  };
  function close() {
    if (done) return;
    done = true;
    window.removeEventListener('keydown', onKey, true);
    layer.remove();
  }
  function pick(card) {
    if (done || now() - openedAt < ignoreMs) return;
    close();
    onPick?.(card);
  }

  cards.forEach((card, index) => {
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
    list.append(button);
  });
  // 레이어의 빈 곳을 눌러도 게임 입력으로 새지 않게 한다.
  layer.addEventListener('pointerdown', (event) => event.stopPropagation());
  document.body.append(layer);
  window.addEventListener('keydown', onKey, true);
  buttons[0]?.focus({ preventScroll: true });
  return { close, layer };
}

export default QuickPick;
