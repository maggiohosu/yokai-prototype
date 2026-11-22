// OddsTable('다음 강화 확률', [['성공', 90], ['실패', 10]])를 표시할 곳에 append한다.
// 숫자는 0~100 사이의 백분율이다. 조건부 확률은 호출하는 화면에서 최종 결과 확률로 바꾼다.
// 두 화면은 아래 DOM 도우미를 공유한다. openOverlay가 overlay.css도 함께 불러온다.

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function button(label, onClick, className = '') {
  const node = el('button', 'yk-button ' + className, label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

const numberFormat = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 });
export const number = (value) => numberFormat.format(value);

export function OddsTable(title, rows) {
  const table = el('dl', 'yk-odds');
  table.setAttribute('aria-label', title);
  for (const [label, percent] of rows) {
    const cell = el('div');
    cell.append(el('dt', '', label), el('dd', '', number(percent) + '%'));
    table.append(cell);
  }
  return table;
}

export function disclosure(title, content) {
  const details = el('details', 'yk-disclosure');
  details.append(el('summary', '', title), content);
  return details;
}

export function formImage(getFormImage, form, grade) {
  const frame = el('span', 'yk-portrait');
  const source = getFormImage?.(form.id, grade);
  if (source) {
    const image = el('img');
    image.alt = '';
    // getSourceImage()의 원본 canvas는 Phaser가 계속 소유한다.
    image.src = typeof source === 'string' ? source : source.toDataURL?.() || source.src;
    frame.append(image);
  } else {
    frame.textContent = form.name.slice(0, 1);
    frame.setAttribute('aria-hidden', 'true');
  }
  return frame;
}

export function openOverlay(label) {
  const href = new URL('./overlay.css', import.meta.url).href;
  if (![...document.querySelectorAll('link[rel="stylesheet"]')].some(link => link.href === href)) {
    const link = el('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.append(link);
  }
  const dialog = el('dialog', 'yk-dialog');
  dialog.setAttribute('aria-label', label);
  const header = el('header', 'yk-header');
  const body = el('div', 'yk-scroll');
  const footer = el('footer', 'yk-footer');
  dialog.append(header, body, footer);
  // 게임의 window 키 핸들러까지 입력이 전달되지 않게 한다.
  for (const event of ['keydown', 'keyup']) dialog.addEventListener(event, e => e.stopPropagation());
  document.body.append(dialog);
  dialog.showModal();
  return {
    dialog, header, body, footer,
    close() {
      dialog.close();
      dialog.remove();
    },
  };
}

export default OddsTable;
