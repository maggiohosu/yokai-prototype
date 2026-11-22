// HubView(progress, forms, { onPlay, onEvolve, save, getFormImage })를 호출하면 판 사이 화면이 열린다.
// getFormImage(formId, grade)는 이미지 URL 또는 canvas를 반환한다. 변경 즉시 save(progress)를 호출한다.
// 다음 판은 onPlay(), 진화는 onEvolve(), 퇴화 B는 onEvolve({ devolve: true })로 화면을 넘긴다.
// B에서도 같은 progress로 EvolveView를 열면 된다. 각 콜백은 이 화면을 닫은 뒤 호출된다.

import { saveProgress } from '../state/save.js';
import { applyDegradeChoice, autoEnhance, enhanceCost, getEnhanceOdds, tryEnhance } from '../systems/enhance.js';
import { canEvolve, evolutionCost } from '../systems/evolution.js';
import { recordTreasureSuccess } from '../systems/progress.js';
import { dropChance, equip, exchangeShards, sell, sellPrice, treasureTitle, tryUpgrade, upgradeCost } from '../systems/treasure.js';
import { ENHANCE, TREASURE } from '../systems/tuning-upgrade.js';
import { OddsTable, button, disclosure, el, formImage, number, openOverlay } from './OddsTable.js';

const statNames = { growth: '크기 성장', speed: '이동 속도', signature: '대표 효과' };
const outcomeNames = { success: '성공', great: '대성공', fail: '실패', degrade: '퇴화' };

function attemptText(attempt) {
  if (attempt.protectedUsed) return '보호권 1장 사용 · +' + attempt.from + ' 유지';
  if (attempt.needsChoice) return '퇴화 · 방식 선택';
  if (attempt.from === attempt.to) return '실패 · +' + attempt.to + ' 유지';
  return outcomeNames[attempt.result] + ' · +' + attempt.from + ' → +' + attempt.to;
}

function stopText(reason, progress, stat) {
  if (reason === 'max') {
    if (progress.enh[stat] === ENHANCE.success.length) return '최고 레벨 도달';
    if (ENHANCE.singleAttemptGrades.includes(progress.grade)) return progress.grade + '등급은 한 번씩 강화해요.';
    return '연속 시도 한도에 도달했어요.';
  }
  return { target: '목표 도달', gold: '요력 부족', great: '대성공으로 중단', degrade: '퇴화로 중단' }[reason];
}

function upgradeOdds(level) {
  const success = TREASURE.success[level];
  const broken = (100 - success) * TREASURE.breakOnFailure[level] / 100;
  return OddsTable('다음 여의주 강화 확률', [['성공', success], ['실패', 100 - success - broken], ['깨짐', broken]]);
}

function degradeDialog(parent, progress, stat, onChoice) {
  const modal = el('dialog', 'yk-prompt');
  modal.setAttribute('aria-label', '퇴화 방식 선택');
  modal.addEventListener('cancel', event => event.preventDefault());
  const select = choice => {
    if (!applyDegradeChoice(progress, choice, stat).ok) return;
    modal.close();
    modal.remove();
    onChoice(choice);
  };
  const b = button('B. 강화 유지하고 역진화', () => select('B'));
  b.disabled = progress.stage <= 1;
  const from = progress.enh[stat];
  modal.append(el('p', 'yk-overline', statNames[stat] + ' +' + from),
    el('h2', 'yk-section-title', '퇴화 방식을 고르세요'),
    el('p', 'yk-intro', '강화를 1 낮추거나, 지금의 강화를 지키고 이전 진화 단계로 돌아갈 수 있어요.'),
    button('A. 강화 낮추기 · +' + from + ' → +' + (from - 1), () => select('A'), 'yk-primary'), b);
  if (b.disabled) modal.append(el('p', 'yk-hint', '1단계에서는 역진화할 수 없어요.'));
  parent.append(modal);
  modal.showModal();
}

export function HubView(progress, forms, { onPlay, onEvolve, save = saveProgress, getFormImage } = {}) {
  const { dialog, header, body, footer, close } = openOverlay('판 사이 정비');
  const form = forms.find(item => item.id === progress.formId);
  const identity = el('div', 'yk-identity');
  const heading = el('div');
  heading.append(el('p', 'yk-overline', '판 사이 정비 · ' + progress.stage + '단계'),
    el('h2', 'yk-title', (form?.name ?? '요괴') + ' · ' + progress.grade + '등급'));
  identity.append(heading);
  if (form) identity.append(formImage(getFormImage, form, progress.grade));
  const wallet = el('div', 'yk-wallet');
  header.append(identity, wallet);

  let tab = 'body';
  let playingLog = false;
  const targets = {};
  const tabs = el('div', 'yk-tabs');
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', '정비 항목');
  for (const [key, label] of [['body', '본체 강화'], ['treasure', '여의주']]) {
    const item = button(label, () => {
      if (tab === key || playingLog || progress.pendingDegrade) return;
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
  feedback.append(status, log);
  const actions = el('div', 'yk-actions');
  function leave(callback, ...args) {
    if (!dialog.open || playingLog || progress.pendingDegrade) return;
    close();
    callback?.(...args);
  }
  const playButton = button('다음 판 시작', () => leave(onPlay), 'yk-primary');
  const evolveButton = button('진화하기', () => requestEvolution());
  function requestEvolution() {
    if (progress.pendingDevolve) leave(onEvolve, { devolve: true });
    else if (canEvolve(progress)) leave(onEvolve);
  }
  actions.append(playButton, evolveButton);
  footer.append(feedback, actions);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    if (!progress.pendingDevolve) leave(onPlay);
  });

  function clearFeedback() {
    log.replaceChildren();
    status.textContent = '';
    status.dataset.tone = '';
  }
  function setStatus(message, tone = '') {
    status.textContent = message;
    status.dataset.tone = tone;
  }
  const attemptTone = { great: 'great', degrade: 'bad', fail: 'fail', success: 'good' };
  const autoTone = { great: 'great', degrade: 'bad', target: 'good', max: 'good', gold: '' };
  function commit(message, tone = '') {
    save(progress);
    clearFeedback();
    // 결과가 정해진 뒤 그 결과의 색으로 짧게 튀어 오른다(모션: Opus)
    setStatus(message, tone);
    status.classList.remove('yk-flash');
    void status.offsetWidth;
    status.classList.add('yk-flash');
    render();
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
        setStatus(statNames[stat] + ' 강화가 +' + progress.enh[stat] + '이 되었어요.');
        render();
      }
    });
  }
  function enhance(stat) {
    const cost = enhanceCost(progress.enh[stat]);
    if (progress.yoryeok < cost || playingLog || progress.pendingDegrade) return;
    const result = tryEnhance(progress, stat);
    progress.yoryeok -= cost;
    commit(statNames[stat] + ' ' + attemptText(result), attemptTone[result.result]);
    if (result.needsChoice) askDegrade();
  }
  function runAuto(stat, target) {
    if (playingLog || progress.pendingDegrade) return;
    const { attempts, reason } = autoEnhance(progress, stat, target);
    // 여기서 결제와 추첨이 모두 끝난다. 아래 타이머는 받은 기록만 재생한다.
    if (attempts.length) save(progress);
    clearFeedback();
    playingLog = true;
    render();
    setStatus(statNames[stat] + ' 연속 강화');
    let shown = 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const batch = reduced ? attempts.length : Math.ceil(attempts.length / 8);
    function showNext() {
      const end = Math.min(shown + batch, attempts.length);
      while (shown < end) log.append(el('li', '', attemptText(attempts[shown++])));
      log.scrollTop = log.scrollHeight;
      if (shown < attempts.length) {
        window.setTimeout(showNext, 80);
      } else {
        playingLog = false;
        setStatus(statNames[stat] + ' ' + attempts.length + '회 · ' + stopText(reason, progress, stat), autoTone[reason] ?? '');
        render();
        askDegrade();
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
    if (!Number.isFinite(cost)) {
      card.append(el('p', 'yk-hint', '최고 레벨이에요.'));
      return card;
    }
    const odds = getEnhanceOdds(progress, stat);
    card.append(el('p', 'yk-cost', '다음 +' + (level + 1) + ' · 요력 ' + number(cost)),
      OddsTable('다음 ' + statNames[stat] + ' 강화 확률', Object.entries(odds).map(([key, value]) => [outcomeNames[key], value])));
    const controls = el('div', 'yk-enhance-actions');
    const single = button('강화', () => enhance(stat), 'yk-primary');
    const picker = el('select', 'yk-select');
    picker.setAttribute('aria-label', statNames[stat] + ' 연속 강화 목표');
    const target = Math.max(level + 1, targets[stat] ?? level + 1);
    for (let n = level + 1; n <= ENHANCE.success.length; n++) {
      const option = el('option', '', '목표 +' + n);
      option.value = n;
      option.selected = n === target;
      picker.append(option);
    }
    const auto = button('연속 강화', () => runAuto(stat, Number(picker.value)));
    function updateTarget() {
      targets[stat] = Number(picker.value);
      auto.setAttribute('aria-label', statNames[stat] + ' 연속 강화 · 목표 +' + picker.value);
    }
    picker.addEventListener('change', updateTarget);
    updateTarget();
    auto.disabled = single.disabled = progress.yoryeok < cost;
    controls.append(single, picker, auto);
    card.append(controls);
    return card;
  }

  function upgrade() {
    const item = progress.treasure;
    if (!item) return;
    const cost = upgradeCost(item.level);
    if (progress.yoryeok < cost) return;
    const result = tryUpgrade(item);
    progress.yoryeok -= cost;
    let message;
    let tone = attemptTone[result.result] ?? (result.result === 'break' ? 'bad' : '');
    if (result.result === 'success') {
      recordTreasureSuccess(progress);
      message = '강화 성공 · ' + treasureTitle(result.to);
    } else if (result.result === 'break') {
      progress.treasure = null;
      progress.shards += result.shards;
      message = '여의주가 깨졌어요. 파편 +' + result.shards;
    } else {
      message = '강화 실패 · +' + result.from + ' 유지';
    }
    commit(message, tone);
  }
  function sellButton(slot, item) {
    return button('판매 · ' + number(sellPrice(item.level)) + ' 요력', () => {
      const price = sell(progress, slot);
      if (price) commit(treasureTitle(item.level) + ' 판매 · 요력 +' + number(price), 'good');
    });
  }
  function treasurePanel() {
    const equipped = el('section', 'yk-card');
    const item = progress.treasure;
    equipped.append(el('p', 'yk-label', '장착한 여의주'));
    if (item) {
      const title = el('h3', 'yk-orb-title', treasureTitle(item.level));
      equipped.append(title);
      const cost = upgradeCost(item.level);
      const controls = el('div', 'yk-actions');
      if (Number.isFinite(cost)) {
        equipped.append(el('p', 'yk-cost', '다음 +' + (item.level + 1) + ' · 요력 ' + number(cost)), upgradeOdds(item.level));
        const up = button('강화', upgrade, 'yk-primary');
        up.disabled = cost > progress.yoryeok;
        controls.append(up);
      } else {
        equipped.append(el('p', 'yk-hint', '최고 레벨이에요.'));
      }
      controls.append(sellButton('equipped', item));
      equipped.append(controls);
    } else {
      equipped.append(el('p', 'yk-intro', '장착한 여의주가 없어요.'));
    }
    const inventory = el('section', 'yk-card');
    inventory.append(el('h3', 'yk-stat-name', '보관함 · ' + progress.inventory.length + '/' + TREASURE.inventorySlots));
    const slots = el('ol', 'yk-slots');
    for (let i = 0; i < TREASURE.inventorySlots; i++) {
      const stored = progress.inventory[i];
      const slot = el('li');
      slot.append(el('span', 'yk-slot-no', String(i + 1)), el('strong', '', stored ? treasureTitle(stored.level) : '빈 칸'));
      if (stored) {
        const controls = el('div', 'yk-actions');
        controls.append(button(item ? '장착 바꾸기' : '장착', () => {
          if (equip(progress, i)) commit(treasureTitle(stored.level) + ' 장착');
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
      if (gained) commit('파편 교환 · 보호권 +' + gained, 'good');
    });
    exchange.disabled = !count;
    shards.append(exchange);
    body.append(equipped, inventory, shards, disclosure('여의주 획득 확률 보기',
      OddsTable('요괴를 쓰러뜨렸을 때 여의주 획득 확률',
        [['직접 먹기', dropChance() * 100], ['여의주로 처치', dropChance({ killedByTreasure: true }) * 100]])));
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
    else {
      for (const stat of ENHANCE.stats) body.append(statCard(stat));
    }
    body.scrollTop = scroll;
    body.inert = playingLog;
    playButton.disabled = playingLog || !!progress.pendingDevolve;
    const cost = evolutionCost(progress.stage + 1);
    evolveButton.disabled = playingLog || (!progress.pendingDevolve && !canEvolve(progress));
    evolveButton.textContent = progress.pendingDevolve ? '다시 진화하기' :
      Number.isFinite(cost) ? '진화하기 · ' + number(cost) + ' 요력' : '최고 진화 단계';
  }
  render();
  askDegrade();
  return { close: () => { if (!progress.pendingDevolve) leave(onPlay); } };
}

export default HubView;
