// HubView(progress, forms, { onPlay, onEvolve, save, getFormImage })를 호출하면 판 사이 화면이 열린다.
// getFormImage(formId, grade)는 이미지 URL 또는 canvas를 반환한다. 변경 즉시 save(progress)를 호출한다.
// 다음 판은 onPlay(), 진화는 onEvolve(), 퇴화 B는 onEvolve({ devolve: true })로 화면을 넘긴다.
// B에서도 같은 progress로 EvolveView를 열면 된다. 각 콜백은 이 화면을 닫은 뒤 호출된다.

import { drawWeaponIcon } from '../art/weapons.js';
import { HERALD_BOPAE, SUCCESS_MULT, WEAPON_BY_ID } from '../data/weapons.js';
import { sfx } from '../audio/sfx.js';
import { musicToggle } from './TitleView.js';
import { isNewWeapon } from '../game/fx.js';
import { saveProgress } from '../state/save.js';
import { applyDegradeChoice, autoEnhance, canDevolve, enhanceCost, enhanceTable, getEnhanceOdds, tryEnhance } from '../systems/enhance.js';
import { canEvolve, evolutionCost } from '../systems/evolution.js';
import { hasPendingChoice, protectPrompt, settleProtect } from '../systems/protect.js';
import { chanceText, dropChance, equip, exchangeShards, hasPaid, saleValue, sell, treasureTable, upgradeCost, upgradeOdds, upgradeTreasure } from '../systems/treasure.js';
import { blockerText, buy, buyBlocker, lockedText, shopCatalog } from '../systems/shop.js';
import { itemTitle, kindOf, previewRows, weaponOf, withSubject } from '../systems/weapons.js';
import { ENHANCE, TREASURE, statUpgradeText } from '../systems/tuning-upgrade.js';
import { LevelTable, OddsTable, button, disclosure, el, formImage, number, openOverlay } from './OddsTable.js';
import { playEnhanceFx, playSellFx, preloadEnhanceSounds } from './enhanceFx.js';
import { autoSetupDialog, autoStopText, autoSummary, protectCopy, protectDialog, summaryBlock } from './EnhanceDialogs.js';

export const statNames = { growth: '크기 성장', speed: '이동 속도', vitality: '생명력' };
const outcomeNames = { success: '성공', great: '대성공', fail: '실패', degrade: '퇴화' };

export function attemptText(attempt) {
  if (attempt.needsProtect) return '퇴화 직전, 보호권을 쓸지 골라 주세요';
  if (attempt.protectedUsed) return '보호권 1장으로 +' + attempt.from + ' 유지';
  if (attempt.degradeChoice === 'A') return '퇴화, +' + attempt.from + '에서 +' + attempt.to + '로';
  if (attempt.degradeChoice === 'B') return '퇴화, 역진화로 +' + attempt.from + ' 유지';
  if (attempt.needsChoice) return '퇴화 방식을 고르세요';
  if (attempt.from === attempt.to) return '실패, +' + attempt.to + ' 유지';
  return outcomeNames[attempt.result] + ', +' + attempt.from + '에서 +' + attempt.to + '로';
}

// 접이식 '확률표': 모든 레벨(본체 +1~+20, 보물 +1~+15)의 결과 확률(%)과 한 번 시도에 드는 요력을 한 표로 보여 준다(변경 이력 22).
// 확률은 천장(실패마다 성공률 +5%p)을 반영하기 전의 기본값이다(성공·대성공·실패·퇴화의 합이 100).
function bodyLevelTable() {
  const rows = enhanceTable().map((r) => ['+' + r.to, number(r.success), number(r.great), number(r.fail), number(r.degrade), number(r.cost)]);
  const box = el('div');
  box.append(el('p', 'yk-level-note', '+N은 그 레벨로 오르는 한 번의 시도예요. 확률(%)은 천장을 더하기 전이고, 실패할 때마다 성공률이 5%p씩 쌓여요. 퇴화가 나왔을 때 보호권이 있으면 쓸지 물어봐요. 요력은 한 번 시도에 드는 값이에요.'),
    LevelTable('본체 강화 레벨별 확률표', ['단계', '성공', '대성공', '실패', '퇴화', '요력'], rows));
  return disclosure('강화 확률표 (+1 ~ +' + ENHANCE.outcomes.length + ')', box);
}
// 성공률 배율을 사람이 읽는 말로: 여의주는 '여의주 성공률이 기준', 보패는 '성공률은 여의주의 70%'(상점 보패)·'50%'(대요괴 보패). 숫자는 data/weapons.js SUCCESS_MULT에서 읽는다.
const percentOf = (mult) => Math.round(mult * 100);
const successNote = (weapon) => (weapon.successMult === 1 ? '성공률은 여의주가 기준이에요.' : '성공률은 여의주의 ' + percentOf(weapon.successMult) + '%예요.');
function treasureLevelTable(kind) {
  const weapon = weaponOf(kind);
  const rows = treasureTable(weapon.id).map((r) => ['+' + r.to, number(r.success), number(r.fail), number(r.break), number(r.cost)]);
  const box = el('div');
  box.append(el('p', 'yk-level-note', weapon.name + ' 확률표예요. ' + successNote(weapon) + ' 실패했을 때 깨질 몫과 요력은 모든 보물이 같아요. 요력은 한 번 시도에 드는 값이에요.'),
    LevelTable(weapon.name + ' 강화 레벨별 확률표', ['단계', '성공', '실패', '깨짐', '요력'], rows));
  return disclosure(weapon.name + ' 강화 확률표 (+1 ~ +' + TREASURE.success.length + ')', box);
}

function upgradeOddsTable(level, kind) {
  const weapon = weaponOf(kind);
  const odds = upgradeOdds(level, weapon.id);
  const box = el('div');
  box.append(OddsTable('다음 ' + weapon.name + ' 강화 확률', [['성공', odds.success], ['실패', odds.fail], ['깨짐', odds.break]]));
  if (weapon.successMult !== 1) box.append(el('p', 'yk-hint', weapon.name + ' ' + successNote(weapon)));
  return box;
}

export function degradeDialog(parent, progress, stat, onChoice) {
  const modal = el('dialog', 'yk-prompt');
  modal.setAttribute('aria-label', '퇴화 방식 선택');
  modal.addEventListener('cancel', event => event.preventDefault());
  const select = choice => {
    if (!applyDegradeChoice(progress, choice, stat).ok) return;
    modal.close();
    modal.remove();
    onChoice(choice);
  };
  const b = button('강화 유지하고 역진화', () => select('B'));
  b.disabled = !canDevolve(progress);
  const from = progress.enh[stat];
  modal.append(el('h2', 'yk-section-title', '퇴화 선택'),
    el('p', 'yk-caption', statNames[stat] + ' +' + from),
    el('p', 'yk-intro', '강화를 한 칸 낮추거나 이전 모습으로 돌아갈 수 있어요.'),
    button('강화를 +' + (from - 1) + '로 낮추기', () => select('A'), 'yk-primary'), b);
  if (b.disabled) modal.append(el('p', 'yk-hint', progress.stage <= 1 ? '1단계에서는 역진화할 수 없어요.' : '더 내릴 진화 단계가 없어요.'));
  parent.append(modal);
  modal.showModal();
}

// inRun: true면 판 중 [정비]로 연 화면이다. 아래 버튼이 [게임으로 돌아가기]가 되고, 이때 onPlay는 '같은 판 재개'다.
export function HubView(progress, forms, { onPlay, onEvolve, save = saveProgress, getFormImage, inRun = false } = {}) {
  sfx.preload(['shop-buy', 'equip-swap']);
  const { dialog, header, body, footer, close } = openOverlay(inRun ? '판 중 정비' : '판 사이 정비');
  const form = forms.find(item => item.id === progress.formId);
  const identity = el('div', 'yk-identity');
  const heading = el('div');
  heading.append(el('h2', 'yk-title', (form?.name ?? '요괴') + ' 정비'),
    el('p', 'yk-caption', progress.stage + '단계 ' + progress.grade + '등급'));
  identity.append(heading);
  if (form) identity.append(formImage(getFormImage, form, progress.grade));
  const wallet = el('div', 'yk-wallet');
  header.append(identity, wallet);

  // 새로고침으로 다시 열었을 때 보물의 보호권 선택이 남아 있으면 보물 탭에서 이어 간다.
  let tab = progress.pendingProtect?.kind === 'treasure' ? 'treasure' : 'body';
  let playingLog = false;
  let shielded = null; // 방금 보호권으로 지킨 능력. 다음 한 번의 그리기에서만 '보호됨' 효과를 낸다.
  const tabs = el('div', 'yk-tabs');
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', '정비 항목');
  for (const [key, label] of [['body', '본체 강화'], ['treasure', '보물'], ['shop', '상점']]) {
    const item = button(label, () => {
      if (tab === key || playingLog || hasPendingChoice(progress)) return;
      tab = key;
      clearFeedback();
      render();
      body.scrollTop = 0;
    });
    item.dataset.tab = key;
    tabs.append(item);
  }
  dialog.insertBefore(tabs, body);

  const feedback = el('div', 'yk-feedback');
  const status = el('p', 'yk-status');
  status.setAttribute('role', 'status');
  const log = el('ol', 'yk-log');
  log.setAttribute('aria-label', '연속 강화 기록');
  const summaryBox = el('div', 'yk-summary-box');
  feedback.append(status, log, summaryBox);
  const actions = el('div', 'yk-actions yk-hub-actions');
  function leave(callback, ...args) {
    if (!dialog.open || playingLog || hasPendingChoice(progress)) return;
    close();
    callback?.(...args);
  }
  const playButton = button(inRun ? '게임으로 돌아가기' : '다음 판 시작', () => leave(onPlay), 'yk-primary');
  const evolveButton = button('진화하기', () => requestEvolution());
  function requestEvolution() {
    if (progress.pendingDevolve) leave(onEvolve, { devolve: true });
    else if (canEvolve(progress)) leave(onEvolve);
  }
  actions.append(playButton, evolveButton, musicToggle());
  footer.append(feedback, actions);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    if (!progress.pendingDevolve) leave(onPlay);
  });

  function clearFeedback() {
    log.replaceChildren();
    summaryBox.replaceChildren();
    status.textContent = '';
    status.dataset.tone = '';
  }
  function setStatus(message, tone = '') {
    status.textContent = message;
    status.dataset.tone = tone;
  }
  const attemptTone = { great: 'great', degrade: 'bad', fail: 'fail', success: 'good', protected: 'protect' };
  const autoTone = { batch: 'good', max: 'good', gold: '', devolve: 'bad', single: '' };
  function commit(message, tone = '') {
    save(progress);
    clearFeedback();
    // 계산이 끝난 결과만 알림에 표시한다.
    setStatus(message, tone);
    status.classList.remove('yk-flash');
    void status.offsetWidth;
    status.classList.add('yk-flash');
    render();
  }
  // 창이 닫히고 화면이 다시 그려진 뒤 초점을 돌려준다(그려 두었던 단추는 사라졌으므로 같은 자리의 새 단추를 찾는다).
  function focusAfter(selector) {
    const target = body.querySelector(selector);
    if (target && !target.disabled) target.focus({ preventScroll: true });
  }
  const statSelector = (kind, stat) => '[data-fx="' + kind + '"][data-stat="' + stat + '"]';

  // 보호권 선택과 퇴화 선택이 남아 있으면 먼저 보호권, 그다음 퇴화 순서로 묻는다. 둘 다 저장돼 있어 새로고침 뒤에도 같은 창이 뜬다.
  function askPending() {
    if (progress.pendingProtect) askProtect();
    else askDegrade();
  }
  function askDegrade() {
    const stat = progress.pendingDegrade;
    if (!stat) return;
    degradeDialog(dialog, progress, stat, choice => {
      if (choice === 'B') {
        save(progress);
        requestEvolution();
      } else {
        save(progress);
        setStatus(statNames[stat] + ' 강화 +' + progress.enh[stat]);
        render();
        focusAfter(statSelector('enhance', stat));
      }
    });
  }
  // 한 번씩 누르는 강화에서 퇴화(본체)·깨짐(보물)이 나왔고 보호권이 있을 때. 굴림은 이미 끝났고 이 선택은 결과만 바꾼다(systems/protect.js).
  function askProtect() {
    const model = protectPrompt(progress);
    if (!model) return;
    const subject = model.kind === 'body' ? statNames[model.stat] : weaponOf(progress.treasure).name;
    protectDialog(dialog, protectCopy(model, subject), model.canUse, use => settleChoice(use, subject));
  }
  function settleChoice(use, subject) {
    const kind = kindOf(progress.treasure); // 깨지면 장착 칸이 비므로 확률 문구에 쓸 무기 종류는 먼저 구해 둔다
    const outcome = settleProtect(progress, use);
    save(progress);
    if (!outcome.ok) {
      render();
      askPending();
      return;
    }
    if (outcome.kind === 'body') {
      const { stat } = outcome;
      if (use) {
        shielded = stat;
        commit(statNames[stat] + ' 보호됨, 보호권 1장으로 +' + outcome.from + ' 유지', 'protect');
      } else {
        commit(statNames[stat] + ' 퇴화, 퇴화 방식을 고르세요', 'bad');
        askDegrade();
        return;
      }
      focusAfter(statSelector('enhance', stat));
      return;
    }
    const chance = chanceText('break', upgradeOdds(outcome.from, kind));
    const message = use
      ? '보호됨, ' + subject + ' +' + outcome.from + ' 유지 · 보호권 1장 사용 · ' + chance
      : withSubject(subject) + ' 깨졌어요. 파편 +' + outcome.shards + ' · ' + chance;
    // 선택은 이미 저장했다. 연출은 긴장을 건너뛰고 결과 장면(보호됨 또는 기존 깨짐)만 보여 준다.
    upgradeFx = playEnhanceFx(outcome, {
      shake: dialog,
      skipCharge: true,
      onDone() {
        upgradeFx = null;
        commit(message, use ? 'protect' : 'bad');
        focusAfter('[data-fx="upgrade"]');
      },
    });
  }
  function enhance(stat) {
    const cost = enhanceCost(progress.enh[stat]);
    if (progress.yoryeok < cost || playingLog || hasPendingChoice(progress)) return;
    const result = tryEnhance(progress, stat);
    progress.yoryeok -= cost;
    commit(statNames[stat] + ' ' + attemptText(result), attemptTone[result.result]);
    if (result.needsProtect) askProtect();
    else if (result.needsChoice) askDegrade();
  }
  // 연속 강화: 누르면 시작 전에 한 번만 묻고(퇴화 A/B, 보호권 자동 사용/쓰지 않기), ENHANCE.autoBatch(20)번을 멈추지 않고 이어서 한다.
  // 이 흐름에서는 보호권 선택창이 뜨지 않는다. 선택은 시작 전에 이미 했다.
  function startAuto(stat) {
    if (playingLog || upgradeFx || hasPendingChoice(progress) || ENHANCE.singleAttemptGrades.includes(progress.grade)) return;
    const level = progress.enh[stat];
    if (!Number.isFinite(enhanceCost(level))) return;
    autoSetupDialog(dialog, {
      statName: statNames[stat], level, batch: ENHANCE.autoBatch,
      canDevolve: canDevolve(progress), protect: progress.protect, initial: progress.autoEnhance,
    }, {
      onStart: (choice) => runAuto(stat, choice),
      onCancel: () => focusAfter(statSelector('auto', stat)),
    });
  }
  function runAuto(stat, choice) {
    if (playingLog || hasPendingChoice(progress)) return;
    progress.autoEnhance = { degrade: choice.degrade, protect: choice.protect };
    const { attempts, reason, summary } = autoEnhance(progress, stat, { degrade: choice.degrade, useProtect: choice.protect === 'use' });
    // 여기서 결제와 추첨이 모두 끝나고 저장한다. 아래 타이머는 받은 기록만 재생한다.
    save(progress);
    clearFeedback();
    playingLog = true;
    render();
    setStatus(statNames[stat] + ' 연속 강화');
    let shown = 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 20번이 길게 늘어지지 않게 여러 줄씩 묶어 보인다(약 0.6초).
    const batch = reduced ? attempts.length : Math.ceil(attempts.length / 8);
    function showNext() {
      const end = Math.min(shown + batch, attempts.length);
      while (shown < end) log.append(el('li', '', attemptText(attempts[shown++])));
      log.scrollTop = log.scrollHeight;
      if (shown < attempts.length) {
        window.setTimeout(showNext, 80);
      } else {
        playingLog = false;
        const view = autoSummary({ summary, reason, statName: statNames[stat], grade: progress.grade, batch: ENHANCE.autoBatch });
        setStatus(view.headline + ' · ' + view.stop, autoTone[reason] ?? '');
        summaryBox.replaceChildren(summaryBlock(view));
        render();
        askDegrade();
        focusAfter(statSelector('auto', stat));
      }
    }
    showNext();
  }

  function statCard(stat) {
    const level = progress.enh[stat];
    const cost = enhanceCost(level);
    const card = el('article', 'yk-card');
    const head = el('div', 'yk-line');
    head.append(el('h3', 'yk-stat-name', statNames[stat]), el('strong', 'yk-level', '+' + level));
    card.append(head);
    card.append(el('p', 'yk-hint', statUpgradeText(stat, level, !Number.isFinite(cost))));
    if (!Number.isFinite(cost)) {
      card.append(el('p', 'yk-hint', '최고 레벨'));
      return card;
    }
    const odds = getEnhanceOdds(progress, stat);
    card.append(el('p', 'yk-cost', '다음 +' + (level + 1) + '에 필요한 요력 ' + number(cost)),
      OddsTable('다음 ' + statNames[stat] + ' 강화 확률', Object.entries(odds).map(([key, value]) => [outcomeNames[key], value])));
    const controls = el('div', 'yk-enhance-actions');
    const single = button('강화', () => enhance(stat));
    single.dataset.fx = 'enhance';
    single.dataset.stat = stat;
    const auto = button('연속 강화 ' + ENHANCE.autoBatch + '회', () => startAuto(stat));
    auto.dataset.fx = 'auto';
    auto.dataset.stat = stat;
    auto.setAttribute('aria-label', statNames[stat] + ' 연속 강화 ' + ENHANCE.autoBatch + '회');
    // S·S+ 등급은 연속 강화 대신 한 번씩만 강화한다(ENHANCE.singleAttemptGrades). 한 번뿐인 시도라 퇴화·보호권 선택창이 그때그때 뜨는 단일 강화가 맞다.
    const singleGrade = ENHANCE.singleAttemptGrades.includes(progress.grade);
    auto.disabled = single.disabled = progress.yoryeok < cost;
    if (singleGrade) auto.disabled = true;
    controls.append(single, auto);
    card.append(controls);
    if (singleGrade) card.append(el('p', 'yk-hint', progress.grade + '등급은 한 번씩 강화할 수 있어요.'));
    if (shielded === stat) card.dataset.shield = 'true';
    return card;
  }

  let upgradeFx = null;
  function upgrade() {
    const item = progress.treasure;
    if (!item || upgradeFx || hasPendingChoice(progress)) return;
    const cost = upgradeCost(item);
    if (progress.yoryeok < cost) return;
    // 깨지면 item.level이 null이 되므로 이름·확률은 시도 전에 구해 둔다.
    const name = weaponOf(item).name;
    const odds = upgradeOdds(item.level, kindOf(item));
    const result = upgradeTreasure(progress);
    progress.yoryeok -= cost;
    if (result.needsProtect) {
      // 깨짐이 나왔고 보호권이 있다: 결과는 아직 확정하지 않는다. 선택 대기를 저장한 뒤 긴장 연출(깨질 위기) 다음에 선택창을 연다.
      save(progress);
      upgradeFx = playEnhanceFx({ ...result, result: 'suspense' }, {
        shake: dialog,
        onDone() {
          upgradeFx = null;
          clearFeedback();
          setStatus('깨질 위기, 보호권을 쓸지 골라 주세요', 'bad');
          render();
          askProtect();
        },
      });
      return;
    }
    const chance = chanceText(result.result, odds);
    let message;
    let tone = attemptTone[result.result] ?? (result.result === 'break' ? 'bad' : '');
    if (result.result === 'success') {
      message = '강화 성공, ' + itemTitle(item) + ' · ' + chance;
    } else if (result.result === 'break') {
      message = withSubject(name) + ' 깨졌어요. 파편 +' + result.shards + ' · ' + chance;
    } else {
      message = '강화 실패, +' + result.from + ' 유지 · ' + chance;
    }
    // 결과는 위에서 정해졌다. 연출 전에 저장해 새로고침으로 다시 굴릴 수 없게 하고, 연출은 그 결과만 보여준다.
    save(progress);
    upgradeFx = playEnhanceFx(result, {
      shake: dialog,
      sub: result.result === 'success' ? itemTitle(item) + ' · ' + chance : undefined,
      onDone() {
        upgradeFx = null;
        commit(message, tone);
        const again = body.querySelector('[data-fx="upgrade"]');
        if (again && !again.disabled) again.focus({ preventScroll: true });
      },
    });
  }
  function sellButton(slot, item) {
    const control = button((hasPaid(item) ? '판매 (본전까지 요력 ' : '판매 (요력 ') + number(saleValue(item)) + ')', () => {
      const origin = control.getBoundingClientRect();
      const before = progress.yoryeok;
      const price = sell(progress, slot);
      if (!price) return;
      commit(itemTitle(item) + ' 판매로 요력 +' + number(price), 'good');
      playSellFx({
        origin, host: dialog, amount: price, from: before, to: progress.yoryeok,
        wallet: wallet.querySelector('strong'), format: (v) => '요력 ' + number(v), label: '+' + number(price),
      });
    });
    return control;
  }
  // 장착한 물건의 핵심 수를 '지금 → 다음 레벨'로 보여 준다. 무기마다 라벨이 다르다(systems/weapons.js previewRows).
  function statLine(item) {
    const now = previewRows(item);
    const next = item.level < TREASURE.success.length ? previewRows({ ...item, level: item.level + 1 }) : null;
    const stats = el('dl', 'yk-attributes');
    now.forEach(([label, value], i) => {
      const after = next?.[i]?.[1];
      stats.append(el('dt', '', label), el('dd', '', after != null && after !== value ? value + ' → ' + after : value));
    });
    return stats;
  }

  function weaponIcon(kind, locked = false) {
    const canvas = el('canvas', 'yk-weapon-icon');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.width = canvas.height = Math.round(64 * Math.min(window.devicePixelRatio || 1, 3));
    drawWeaponIcon(canvas.getContext('2d'), kind, form?.stem, canvas.width, { locked });
    return canvas;
  }
  function itemHeading(item, tag) {
    const head = el('div', 'yk-weapon-heading');
    const weapon = weaponOf(item);
    const info = el('div');
    info.append(el(tag, 'yk-weapon-name', itemTitle(item)));
    if (hasPaid(item)) info.append(el('span', 'yk-source', '상점 · 본전 한도 요력 ' + number(item.paid)));
    head.append(weaponIcon(weapon.id), info);
    return head;
  }
  function treasurePanel() {
    preloadEnhanceSounds();
    const equipped = el('section', 'yk-card');
    const item = progress.treasure;
    equipped.append(el('p', 'yk-label', '장착한 보물'));
    if (item) {
      equipped.append(itemHeading(item, 'h3'), el('p', 'yk-hint', weaponOf(item).line));
      if (item.level < TREASURE.success.length) {
        equipped.append(el('p', 'yk-preview-label', '강화 미리보기　+' + item.level + ' → +' + (item.level + 1)));
      }
      equipped.append(statLine(item));
      const cost = upgradeCost(item);
      const controls = el('div', 'yk-actions');
      if (Number.isFinite(cost)) {
        equipped.append(el('p', 'yk-cost', '다음 +' + (item.level + 1) + '에 필요한 요력 ' + number(cost)), upgradeOddsTable(item.level, kindOf(item)));
        const up = button('강화', upgrade);
        up.dataset.fx = 'upgrade';
        up.disabled = cost > progress.yoryeok;
        controls.append(up);
      } else {
        equipped.append(el('p', 'yk-hint', '최고 레벨'));
      }
      controls.append(sellButton('equipped', item));
      equipped.append(controls);
    } else {
      equipped.append(el('p', 'yk-intro', '장착한 보물이 없어요.'));
    }
    const inventory = el('section', 'yk-card');
    inventory.append(el('h3', 'yk-stat-name', '보관함 ' + progress.inventory.length + '/' + TREASURE.inventorySlots));
    const slots = el('ol', 'yk-slots');
    for (let i = 0; i < TREASURE.inventorySlots; i++) {
      const stored = progress.inventory[i];
      const slot = el('li');
      slot.append(el('span', 'yk-slot-no', String(i + 1)),
        stored ? itemHeading(stored, 'strong') : el('strong', '', '빈 칸'));
      if (stored) {
        const controls = el('div', 'yk-actions');
        controls.append(button(item ? '장착 바꾸기' : '장착', () => {
          if (equip(progress, i)) {
            sfx.play('equip-swap');
            commit(itemTitle(stored) + ' 장착');
          }
        }), sellButton(i, stored));
        slot.append(controls);
      }
      slots.append(slot);
    }
    inventory.append(slots);
    const shards = el('section', 'yk-card');
    shards.append(el('h3', 'yk-stat-name', '파편 ' + number(progress.shards) + '개'),
      el('p', 'yk-cost', '파편 ' + TREASURE.shardsPerProtect + '개로 보호권 1장을 받아요.'));
    const count = Math.floor(progress.shards / TREASURE.shardsPerProtect);
    const exchange = button(count ? '보호권 ' + count + '장으로 교환' : '보호권 교환', () => {
      const gained = exchangeShards(progress);
      if (gained) commit('보호권 ' + gained + '장 교환', 'good');
    });
    exchange.disabled = !count;
    shards.append(exchange);
    const dropOdds = el('div');
    dropOdds.append(OddsTable('요괴를 쓰러뜨렸을 때 여의주 획득 확률',
      [['직접 먹기', dropChance() * 100], ['보물로 처치', dropChance({ killedByTreasure: true }) * 100]]),
    el('p', 'yk-hint', '보통 요괴가 떨어뜨리는 보물은 여의주뿐이에요. 대요괴를 쓰러뜨리면 ' + HERALD_BOPAE.map((id) => WEAPON_BY_ID[id].name).join('·') + ' 같은 대요괴 보패가 나와요.'));
    body.append(equipped, inventory, shards, disclosure('보물 획득 확률', dropOdds), treasureLevelTable(item ? weaponOf(item).id : 'yeouiju'));
  }

  function purchase(kind, level) {
    const result = buy(progress, kind, level);
    if (!result.ok) {
      setStatus(result.reason === 'locked' ? lockedText(kind) : blockerText[result.reason], 'bad');
      return;
    }
    sfx.play('shop-buy');
    commit(itemTitle({ kind, level }) + ' 구매, 요력 ' + number(result.price) + ' 사용', 'good');
  }
  // 카드마다 고른 레벨은 화면을 다시 그려도 남긴다(구매할 때마다 render가 돈다).
  const shopPick = {};
  function shopCard(card) {
    const row = el('li', 'yk-shop-item');
    row.dataset.kind = card.kind;
    row.dataset.locked = String(card.locked);
    const head = el('div', 'yk-weapon-heading');
    const info = el('div', 'yk-shop-info');
    info.append(el('h4', 'yk-weapon-name', card.name), el('span', 'yk-weapon-hanja', card.hanja));
    head.append(weaponIcon(card.kind, card.locked), info);
    if (!card.locked && isNewWeapon(progress, card.unlockStage)) {
      const badge = el('strong', 'yk-storage-count', '새');
      badge.setAttribute('aria-label', '이번 판에 해금');
      head.append(badge);
    }
    row.append(head);
    if (card.locked) {
      row.append(el('p', 'yk-unlock', lockedText(card.kind)));
      return row;
    }
    const traits = el('dl', 'yk-weapon-traits');
    traits.append(el('dt', '', '강점'), el('dd', '', card.strong), el('dt', '', '약점'), el('dd', '', card.weak));
    row.append(el('p', 'yk-weapon-line', card.line), traits);
    const controls = el('div', 'yk-buy-controls');
    const picker = el('select', 'yk-select');
    picker.setAttribute('aria-label', card.name + ' 레벨');
    for (const { level } of card.levels) {
      const option = el('option', '', '+' + level);
      option.value = level;
      picker.append(option);
    }
    picker.value = String(shopPick[card.kind] ?? card.levels[0].level);
    const buyButton = button('', () => purchase(card.kind, Number(picker.value)), 'yk-primary');
    const need = el('span', 'yk-buy-reason');
    need.id = 'yk-buy-reason-' + card.kind;
    function refreshBuy() {
      const level = Number(picker.value);
      shopPick[card.kind] = level;
      const { price } = card.levels.find((x) => x.level === level);
      const blocker = buyBlocker(progress, card.kind, level);
      buyButton.textContent = '구매 (요력 ' + number(price) + ')';
      buyButton.setAttribute('aria-label', itemTitle({ kind: card.kind, level }) + ' 구매, 요력 ' + number(price));
      buyButton.disabled = !!blocker;
      need.textContent = blocker === 'funds' ? '요력 ' + number(price - progress.yoryeok) + ' 모자라요' : blockerText[blocker] ?? '';
      if (blocker) buyButton.setAttribute('aria-describedby', need.id);
      else buyButton.removeAttribute('aria-describedby');
    }
    picker.addEventListener('change', refreshBuy);
    refreshBuy();
    controls.append(picker, buyButton);
    row.append(controls, need);
    return row;
  }
  function shopPanel() {
    const intro = el('div', 'yk-shop-head');
    const used = progress.inventory.length;
    intro.append(el('h3', 'yk-stat-name', '보물 상점'),
      el('span', 'yk-storage-count', '보관함 ' + used + ' / ' + TREASURE.inventorySlots));
    if (used >= TREASURE.inventorySlots) {
      intro.append(el('p', 'yk-notice', '보물 탭에서 보관함 한 칸을 비워 주세요.'));
    }
    const list = el('ol', 'yk-shop');
    list.setAttribute('aria-label', '보물 진열대');
    for (const card of shopCatalog(progress)) list.append(shopCard(card));
    const terms = el('div', 'yk-shop-terms');
    terms.append(el('p', '', '강화 성공률은 여의주가 기준이에요. 여기서 파는 보패는 여의주의 ' + percentOf(SUCCESS_MULT.shop) + '%예요.'),
      el('p', '', HERALD_BOPAE.map((id) => WEAPON_BY_ID[id].name).join('·') + '은 상점에 없어요. 대요괴를 쓰러뜨리면 나와요(강화 성공률은 여의주의 ' + percentOf(SUCCESS_MULT.herald) + '%).'),
      el('p', '', '상점에서 산 보물은 본전까지만 돌려받아요.'));
    body.append(intro, list, terms);
  }

  function render() {
    wallet.replaceChildren(el('strong', '', '요력 ' + number(progress.yoryeok)),
      el('span', '', '보호권 ' + number(progress.protect) + '장'));
    for (const item of tabs.children) {
      item.setAttribute('aria-pressed', String(item.dataset.tab === tab));
      item.disabled = playingLog;
    }
    const scroll = body.scrollTop;
    body.replaceChildren();
    if (tab === 'treasure') treasurePanel();
    else if (tab === 'shop') shopPanel();
    else {
      for (const stat of ENHANCE.stats) body.append(statCard(stat));
      body.append(bodyLevelTable());
    }
    body.scrollTop = scroll;
    shielded = null;
    body.inert = playingLog;
    playButton.disabled = playingLog || !!progress.pendingDevolve;
    const cost = evolutionCost(progress.stage + 1);
    evolveButton.disabled = playingLog || (!progress.pendingDevolve && !canEvolve(progress));
    evolveButton.textContent = progress.pendingDevolve ? '다시 진화하기' :
      Number.isFinite(cost) ? '진화 (요력 ' + number(cost) + ')' : '최고 진화 단계';
  }
  render();
  askPending();
  return { close: () => { if (!progress.pendingDevolve) leave(onPlay); } };
}

export default HubView;
