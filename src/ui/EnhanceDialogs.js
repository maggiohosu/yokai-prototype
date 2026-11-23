// 강화 선택창 두 가지(사용자 지시 2026-11-24, docs/plan.md 변경 이력 23). 계산은 systems/protect.js·systems/enhance.js가 하고 이 파일은 묻고 보여 주기만 한다.
//   protectDialog(parent, copy, canUse, onChoice)   한 번씩 누르는 강화에서 퇴화·깨짐이 나왔고 보호권이 있을 때: [보호권 사용] [그냥 받기]
//   autoSetupDialog(parent, model, { onStart, onCancel })  연속 강화를 누르면 시작 전에 한 번: 퇴화 A/B, 보호권 자동 사용/쓰지 않기
// 위쪽의 순수 함수(protectCopy·autoStopText·autoSummary)는 node 테스트에서 그대로 쓴다. DOM은 *Dialog 안에서만 만진다.
import { button, el, number } from './OddsTable.js';

// ---- 문구 (순수) ----

// model은 systems/protect.protectPrompt의 값({ kind, stat?, level, protect, shards? }), subject는 능력 이름 또는 보물 이름.
export function protectCopy(model, subject) {
  const body = model.kind === 'body';
  return {
    title: body ? '퇴화할 위기예요' : '보물이 깨질 위기예요',
    detail: body
      ? subject + ' +' + model.level + ' → +' + (model.level + 1) + ' 강화에서 퇴화가 나왔어요. 그냥 받으면 강화를 한 칸 낮추거나 역진화를 골라야 해요.'
      : subject + ' +' + model.level + ' → +' + (model.level + 1) + ' 강화에서 깨짐이 나왔어요. 그냥 받으면 보물이 깨지고 파편 ' + model.shards + '개를 받아요.',
    question: '보호권을 써서 지킬까요? (남은 보호권 ' + model.protect + '개)',
    use: '보호권 사용',
    decline: '그냥 받기',
    useLabel: '보호권 사용, 보호권 1장을 쓰고 ' + (body ? '강화 +' + model.level + ' 유지' : '보물 +' + model.level + ' 유지'),
    declineLabel: '그냥 받기, ' + (body ? '퇴화를 받아들이고 방식을 고르기' : '보물이 깨지고 파편 ' + model.shards + '개 받기'),
    noneNote: '보호권이 없어 쓸 수 없어요.',
    escNote: '아래 버튼 중 하나를 눌러 정해 주세요. Esc로는 닫히지 않아요.',
  };
}

// 연속 강화가 20번 전에 멈췄거나 다 했을 때의 한 줄. tries는 시도한 횟수, grade는 지금 등급.
export function autoStopText(reason, tries, grade = '') {
  switch (reason) {
    case 'batch': return tries + '회를 모두 했어요';
    case 'max': return '최고 레벨에 닿았어요';
    case 'gold': return '요력이 모자라 멈췄어요';
    case 'devolve': return '더 내릴 진화 단계가 없어 멈췄어요. 퇴화 방식을 골라 주세요';
    case 'single': return grade + '등급은 한 번씩 강화할 수 있어요';
    default: return '멈췄어요';
  }
}

// 결과 요약 한 장: { headline, stop, rows: [[이름, 값]...], note? }. summary는 systems/enhance.autoEnhance의 summary.
export function autoSummary({ summary, reason, statName, grade = '', batch = summary.tries }) {
  const pending = summary.degrade - summary.lowered - summary.devolved;
  const parts = [['레벨 낮춤', summary.lowered], ['역진화', summary.devolved], ['선택 대기', pending]]
    .filter(([, count]) => count > 0).map(([label, count]) => label + ' ' + count);
  const degradeDetail = summary.degrade ? summary.degrade + '번 (' + parts.join(' · ') + ')' : '0번';
  const view = {
    headline: statName + ' 연속 강화 ' + summary.tries + '회 · +' + summary.from + ' → +' + summary.to,
    stop: autoStopText(reason, batch, grade),
    rows: [
      ['성공', summary.success + '번'],
      ['대성공', summary.great + '번'],
      ['실패', summary.fail + '번'],
      ['퇴화', degradeDetail],
      ['보호권 사용', summary.protectUsed + '장'],
      ['쓴 요력', number(summary.spent)],
    ],
  };
  if (summary.devolved) view.note = '역진화 ' + summary.devolved + '번을 예약했어요. [다시 진화하기]로 이어서 진행하세요.';
  return view;
}

export function summaryBlock(view) {
  const box = el('div', 'yk-summary');
  const list = el('dl', 'yk-odds yk-summary-rows');
  list.setAttribute('aria-label', view.headline);
  for (const [label, value] of view.rows) {
    const cell = el('div');
    cell.append(el('dt', '', label), el('dd', '', value));
    list.append(cell);
  }
  box.append(list);
  if (view.note) box.append(el('p', 'yk-hint', view.note));
  return box;
}

// ---- 보호권 선택창 (DOM) ----

let promptSeq = 0;

// 확률 굴림은 이 창이 뜨기 전에 끝나 있다. 이 창은 결과만 바꾼다. 결과 선택은 버튼으로만 한다:
//  - Esc(cancel)는 막고 안내 문구만 보인다. '그냥 받기'로 보내면 손실이 확정되는 쪽이 기본값이 되고, '보호권 사용'으로 보내도 되돌릴 수 없는 소모라 둘 다 명시적 선택이어야 한다.
//  - 처음 초점은 [보호권 사용]이다(되돌릴 수 있는 쪽: 보호권은 다시 모을 수 있지만 깨진 보물·퇴화는 그렇지 않다). 보호권이 없으면 [그냥 받기]에 둔다.
// onChoice(use: boolean)는 창이 닫힌 뒤 한 번만 불린다.
export function protectDialog(parent, copy, canUse, onChoice) {
  const id = 'yk-protect-' + ++promptSeq;
  const modal = el('dialog', 'yk-prompt yk-protect');
  modal.setAttribute('role', 'alertdialog');
  modal.setAttribute('aria-labelledby', id + '-title');
  modal.setAttribute('aria-describedby', id + '-text');
  const title = el('h2', 'yk-section-title', copy.title);
  title.id = id + '-title';
  const text = el('div');
  text.id = id + '-text';
  text.append(el('p', 'yk-intro', copy.detail), el('p', 'yk-protect-question', copy.question));
  const note = el('p', 'yk-hint', canUse ? '' : copy.noneNote);
  note.setAttribute('role', 'status');
  let done = false;
  const choose = (use) => {
    if (done || (use && !canUse)) return;
    done = true;
    modal.close();
    modal.remove();
    onChoice(use);
  };
  const useButton = button(copy.use, () => choose(true), 'yk-primary');
  useButton.setAttribute('aria-label', copy.useLabel);
  useButton.disabled = !canUse;
  const declineButton = button(copy.decline, () => choose(false));
  declineButton.setAttribute('aria-label', copy.declineLabel);
  modal.addEventListener('cancel', (event) => {
    event.preventDefault();
    note.textContent = copy.escNote;
  });
  // 게임의 window 키 핸들러까지 입력이 전달되지 않게 한다(openOverlay와 같다).
  for (const type of ['keydown', 'keyup']) modal.addEventListener(type, (event) => event.stopPropagation());
  modal.append(title, text, useButton, declineButton, note);
  parent.append(modal);
  modal.showModal();
  (canUse ? useButton : declineButton).focus();
  return { modal, use: useButton, decline: declineButton, note };
}

// ---- 연속 강화 시작 선택창 (DOM) ----

// model: { statName, level, batch, canDevolve, protect(보유 수), initial: { degrade, protect } }.
// 한 번만 묻고, 시작을 누르면 onStart({ degrade: 'A'|'B', protect: 'use'|'skip' }), Esc·[취소]면 onCancel(). 취소는 아무것도 바꾸지 않아 Esc를 막지 않는다.
// 보호권이 없으면 보호권 질문은 숨기고 protect는 initial 값 그대로 돌려준다(이번 묶음에서는 쓸 보호권이 없다).
export function autoSetupDialog(parent, model, { onStart, onCancel } = {}) {
  const id = 'yk-auto-' + ++promptSeq;
  const modal = el('dialog', 'yk-prompt yk-auto');
  modal.setAttribute('aria-labelledby', id + '-title');
  modal.setAttribute('aria-describedby', id + '-text');
  const title = el('h2', 'yk-section-title', '연속 강화 ' + model.batch + '회');
  title.id = id + '-title';
  const text = el('p', 'yk-intro', model.statName + ' +' + model.level + '에서 ' + model.batch + '번을 멈추지 않고 이어서 강화해요. 퇴화나 보호권 상황은 아래에서 고른 대로 알아서 처리해요.');
  text.id = id + '-text';
  const choice = {
    degrade: model.initial?.degrade === 'B' && model.canDevolve ? 'B' : 'A',
    protect: model.initial?.protect === 'use' ? 'use' : 'skip',
  };
  const radios = [];
  function group(name, legend, options, hint) {
    const set = el('fieldset', 'yk-choice-group');
    set.append(el('legend', '', legend));
    for (const option of options) {
      const row = el('label', 'yk-radio');
      const input = el('input');
      input.type = 'radio';
      input.name = id + '-' + name;
      input.value = option.value;
      input.checked = choice[name] === option.value;
      input.disabled = !!option.disabled;
      input.addEventListener('change', () => { if (input.checked) choice[name] = option.value; });
      radios.push(input);
      row.append(input, el('span', '', option.label));
      set.append(row);
    }
    if (hint) set.append(el('p', 'yk-hint', hint));
    return set;
  }
  const degradeGroup = group('degrade', '퇴화가 나오면', [
    { value: 'A', label: '강화 레벨 낮추기 (−1)' },
    { value: 'B', label: '진화 단계 낮추기 (역진화, 강화 유지)', disabled: !model.canDevolve },
  ], model.canDevolve ? '역진화는 퇴화가 나올 때마다 한 단계씩 내려가요. 다시 진화하려면 진화 비용이 들어요.' : '더 내릴 진화 단계가 없어서 역진화는 고를 수 없어요.');
  const sections = [degradeGroup];
  if (model.protect > 0) {
    sections.push(group('protect', '보호권 (' + model.protect + '장 보유)', [
      { value: 'use', label: '보호권 자동 사용' },
      { value: 'skip', label: '보호권 쓰지 않기' },
    ], '자동 사용은 퇴화가 나올 때마다 한 장씩 써요. 다 쓰면 위에서 고른 방식으로 이어서 처리해요.'));
  }
  let done = false;
  const finish = (start) => {
    if (done) return;
    done = true;
    modal.close();
    modal.remove();
    if (start) onStart?.({ degrade: choice.degrade, protect: model.protect > 0 ? choice.protect : (model.initial?.protect ?? 'skip') });
    else onCancel?.();
  };
  const startButton = button('연속 강화 시작', () => finish(true), 'yk-primary');
  const cancelButton = button('취소', () => finish(false));
  modal.addEventListener('cancel', (event) => {
    event.preventDefault();
    finish(false);
  });
  for (const type of ['keydown', 'keyup']) modal.addEventListener(type, (event) => event.stopPropagation());
  // 낮은 가로 화면에서는 두 질문을 나란히, 단추도 나란히 놓아 스크롤 없이 시작·취소가 보이게 한다(overlay.css의 .yk-auto-*).
  const groups = el('div', 'yk-auto-groups');
  groups.append(...sections);
  const buttons = el('div', 'yk-auto-buttons');
  buttons.append(startButton, cancelButton);
  modal.append(title, text, groups, buttons);
  parent.append(modal);
  modal.showModal();
  (radios.find((input) => input.checked && !input.disabled) ?? startButton).focus();
  return { modal, choice, start: startButton, cancel: cancelButton, radios };
}
