// HubView(progress, forms, { onPlay, onEvolve, save, getFormImage })를 호출하면 판 사이 화면이 열린다.
// getFormImage(formId, grade)는 이미지 URL 또는 canvas를 반환한다. 변경 즉시 save(progress)를 호출한다.
// 다음 판은 onPlay(), 진화는 onEvolve(), 퇴화 B는 onEvolve({ devolve: true })로 화면을 넘긴다.
// B에서도 같은 progress로 EvolveView를 열면 된다. 각 콜백은 이 화면을 닫은 뒤 호출된다.

import { drawWeaponIcon } from '../art/weapons.js';
import { saveProgress } from '../state/save.js';
import { applyDegradeChoice, autoEnhance, enhanceCost, getEnhanceOdds, tryEnhance } from '../systems/enhance.js';
import { canEvolve, evolutionCost } from '../systems/evolution.js';
import { recordTreasureSuccess } from '../systems/progress.js';
import { chanceText, dropChance, equip, exchangeShards, hasPaid, saleValue, sell, tryUpgrade, upgradeCost, upgradeOdds } from '../systems/treasure.js';
import { blockerText, buy, buyBlocker, lockedText, shopCatalog } from '../systems/shop.js';
import { itemTitle, previewRows, weaponOf, withSubject } from '../systems/weapons.js';
import { ENHANCE, TREASURE } from '../systems/tuning-upgrade.js';
import { OddsTable, button, disclosure, el, formImage, number, openOverlay } from './OddsTable.js';
import { playEnhanceFx, playSellFx, preloadEnhanceSounds } from './enhanceFx.js';

export const statNames = { growth: '크기 성장', speed: '이동 속도', vitality: '생명력' };
const outcomeNames = { success: '성공', great: '대성공', fail: '실패', degrade: '퇴화' };

export function attemptText(attempt) {
  if (attempt.protectedUsed) return '보호권 1장으로 +' + attempt.from + ' 유지';
  if (attempt.needsChoice) return '퇴화 방식을 고르세요';
  if (attempt.from === attempt.to) return '실패, +' + attempt.to + ' 유지';
  return outcomeNames[attempt.result] + ', +' + attempt.from + '에서 +' + attempt.to + '로';
}

function stopText(reason, progress, stat) {
  if (reason === 'max') {
    if (progress.enh[stat] === ENHANCE.success.length) return '최고 레벨 도달';
    if (ENHANCE.singleAttemptGrades.includes(progress.grade)) return progress.grade + '등급은 한 번씩 강화할 수 있어요';
    return '연속 강화 한도 도달';
  }
  return { target: '목표 도달', gold: '요력 부족', great: '대성공으로 중단', degrade: '퇴화로 중단' }[reason];
}

function upgradeOddsTable(level) {
  const odds = upgradeOdds(level);
  return OddsTable('다음 보물 강화 확률', [['성공', odds.success], ['실패', odds.fail], ['깨짐', odds.break]]);
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
  b.disabled = progress.stage <= 1;
  const from = progress.enh[stat];
  modal.append(el('h2', 'yk-section-title', '퇴화 선택'),
    el('p', 'yk-caption', statNames[stat] + ' +' + from),
    el('p', 'yk-intro', '강화를 한 칸 낮추거나 이전 모습으로 돌아갈 수 있어요.'),
    button('강화를 +' + (from - 1) + '로 낮추기', () => select('A'), 'yk-primary'), b);
  if (b.disabled) modal.append(el('p', 'yk-hint', '1단계에서는 역진화할 수 없어요.'));
  parent.append(modal);
  modal.showModal();
}

// inRun: true면 판 중 [정비]로 연 화면이다. 아래 버튼이 [게임으로 돌아가기]가 되고, 이때 onPlay는 '같은 판 재개'다.
export function HubView(progress, forms, { onPlay, onEvolve, save = saveProgress, getFormImage, inRun = false } = {}) {
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

  let tab = 'body';
  let playingLog = false;
  const targets = {};
  const tabs = el('div', 'yk-tabs');
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', '정비 항목');
  for (const [key, label] of [['body', '본체 강화'], ['treasure', '보물'], ['shop', '상점']]) {
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
  const playButton = button(inRun ? '게임으로 돌아가기' : '다음 판 시작', () => leave(onPlay), 'yk-primary');
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
    // 계산이 끝난 결과만 알림에 표시한다.
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
        setStatus(statNames[stat] + ' 강화 +' + progress.enh[stat]);
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
        setStatus(statNames[stat] + ' ' + attempts.length + '회, ' + stopText(reason, progress, stat), autoTone[reason] ?? '');
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
      card.append(el('p', 'yk-hint', '최고 레벨'));
      return card;
    }
    const odds = getEnhanceOdds(progress, stat);
    card.append(el('p', 'yk-cost', '다음 +' + (level + 1) + '에 필요한 요력 ' + number(cost)),
      OddsTable('다음 ' + statNames[stat] + ' 강화 확률', Object.entries(odds).map(([key, value]) => [outcomeNames[key], value])));
    const controls = el('div', 'yk-enhance-actions');
    const single = button('강화', () => enhance(stat));
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
      auto.setAttribute('aria-label', statNames[stat] + ' 목표 +' + picker.value + '까지 연속 강화');
    }
    picker.addEventListener('change', updateTarget);
    updateTarget();
    auto.disabled = single.disabled = progress.yoryeok < cost;
    controls.append(single, picker, auto);
    card.append(controls);
    return card;
  }

  let upgradeFx = null;
  function upgrade() {
    const item = progress.treasure;
    if (!item || upgradeFx) return;
    const cost = upgradeCost(item);
    if (progress.yoryeok < cost) return;
    // 깨지면 item.level이 null이 되므로 이름·확률은 시도 전에 구해 둔다.
    const name = weaponOf(item).name;
    const odds = upgradeOdds(item.level);
    const result = tryUpgrade(item);
    progress.yoryeok -= cost;
    const chance = chanceText(result.result, odds);
    let message;
    let tone = attemptTone[result.result] ?? (result.result === 'break' ? 'bad' : '');
    if (result.result === 'success') {
      recordTreasureSuccess(progress);
      message = '강화 성공, ' + itemTitle(item) + ' · ' + chance;
    } else if (result.result === 'break') {
      progress.treasure = null;
      progress.shards += result.shards;
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
        equipped.append(el('p', 'yk-cost', '다음 +' + (item.level + 1) + '에 필요한 요력 ' + number(cost)), upgradeOddsTable(item.level));
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
          if (equip(progress, i)) commit(itemTitle(stored) + ' 장착');
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
    el('p', 'yk-hint', '요괴가 떨어뜨리는 보물은 여의주뿐이에요.'));
    body.append(equipped, inventory, shards, disclosure('보물 획득 확률', dropOdds));
  }

  function purchase(kind, level) {
    const result = buy(progress, kind, level);
    if (!result.ok) {
      setStatus(result.reason === 'locked' ? lockedText(kind) : blockerText[result.reason], 'bad');
      return;
    }
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
    terms.append(el('p', '', '모든 보물의 강화 확률은 같아요.'),
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
    }
    body.scrollTop = scroll;
    body.inert = playingLog;
    playButton.disabled = playingLog || !!progress.pendingDevolve;
    const cost = evolutionCost(progress.stage + 1);
    evolveButton.disabled = playingLog || (!progress.pendingDevolve && !canEvolve(progress));
    evolveButton.textContent = progress.pendingDevolve ? '다시 진화하기' :
      Number.isFinite(cost) ? '진화 (요력 ' + number(cost) + ')' : '최고 진화 단계';
  }
  render();
  askDegrade();
  return { close: () => { if (!progress.pendingDevolve) leave(onPlay); } };
}

export default HubView;
