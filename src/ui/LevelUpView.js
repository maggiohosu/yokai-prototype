// LevelUpView(progress, forms, run, { getFormImage, save, onEvolve, onBody, onAbility, onResume })를 호출하면
// 게임 위에 '성장할 때!' 모달이 열린다. 호출 전에 게임을 멈추는 일은 호출한 쪽(PlayScene)이 한다.
// - 진화: 이 화면을 닫고 onEvolve()만 호출한다(onResume은 부르지 않는다. EvolveView가 끝난 뒤 호출 측이 재개한다).
// - 몸집 강화: applyBody로 요력을 지불한 뒤 onBody(mult)를 부르고 닫는다(그다음 onResume()).
// - 능력 강화: tryEnhance로 결과를 먼저 정한 뒤 보여준다. 연속으로 더 고를 수 있고, 능력치가 바뀔 때마다
//   onAbility(stat, outcome)를 부른다(퇴화 A를 고른 뒤에도 outcome.degradeChoice === 'A'로 한 번 더).
//   퇴화 B를 고르면 progress.pendingDevolve가 켜진 채 닫고 onEvolve()를 부른다.
// - [계속하기]: 닫고 onResume(). 모든 변경 직후 save(progress).
// 닫은 뒤 다음 멈춤 기준(afterPause)은 호출 측이 정한다.

import { saveProgress } from '../state/save.js';
import { enhanceCost, tryEnhance } from '../systems/enhance.js';
import { hasPendingChoice, protectPrompt, settleProtect } from '../systems/protect.js';
import { applyBody, pauseOptions } from '../systems/levelup.js';
import { vitalityUpgradeText } from '../systems/tuning-upgrade.js';
import { attemptText, degradeDialog, statNames } from './HubView.js';
import { protectCopy, protectDialog } from './EnhanceDialogs.js';
import { button, el, formImage, number, openOverlay } from './OddsTable.js';

const outcomeNames = { success: '성공', great: '대성공', fail: '실패', degrade: '퇴화' };
const attemptTone = { great: 'great', degrade: 'bad', fail: 'fail', success: 'good', protected: 'protect' };

function setTone(node, tone) {
  node.dataset.tone = tone ?? '';
}

export function LevelUpView(progress, forms, run, {
  getFormImage, save = saveProgress, onEvolve, onBody, onAbility, onResume,
} = {}) {
  const { dialog, header, body, footer, close } = openOverlay('성장할 때!');
  const form = forms.find(item => item.id === progress.formId);

  const identity = el('div', 'yk-identity');
  const heading = el('div');
  heading.append(el('h2', 'yk-title', '성장할 때!'),
    el('p', 'yk-caption', (form?.name ?? '요괴') + ' ' + progress.stage + '단계'));
  identity.append(heading);
  if (form) identity.append(formImage(getFormImage, form, progress.grade));
  const wallet = el('div', 'yk-wallet');
  header.append(identity, wallet);

  const status = el('p', 'yk-status');
  status.setAttribute('role', 'status');
  const resume = button('계속하기', () => leave(onResume), 'yk-primary');
  footer.append(status, resume);

  function leave(callback, ...args) {
    if (!dialog.open || hasPendingChoice(progress)) return;
    save(progress);
    close();
    callback?.(...args);
  }
  // 진화 화면으로 넘기는 경로. onEvolve가 없으면 게임이 멈춘 채로 남지 않게 재개한다.
  const toEvolve = () => leave(onEvolve ?? onResume);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    leave(onResume);
  });

  function say(message, tone = '') {
    status.textContent = message;
    setTone(status, tone);
    status.classList.remove('yk-flash');
    void status.offsetWidth;
    status.classList.add('yk-flash');
  }

  function chooseEvolve(option) {
    if (!option.available || progress.yoryeok < option.cost) return;
    toEvolve();
  }

  function chooseBody() {
    if (!dialog.open || hasPendingChoice(progress)) return;
    const applied = applyBody(progress, run);
    if (!applied) return;
    save(progress);
    onBody?.(applied.mult);
    leave(onResume);
  }

  function chooseAbility(stat) {
    if (!dialog.open || hasPendingChoice(progress)) return;
    const cost = enhanceCost(progress.enh[stat]);
    if (!Number.isFinite(cost) || progress.yoryeok < cost) return;
    // 결과를 먼저 정하고, 화면은 그 결과를 보여주기만 한다.
    const outcome = tryEnhance(progress, stat);
    progress.yoryeok -= cost;
    save(progress);
    onAbility?.(stat, outcome);
    say(statNames[stat] + ' ' + attemptText(outcome), attemptTone[outcome.result]);
    render();
    if (outcome.needsProtect) askProtect();
    else if (outcome.needsChoice) askDegrade(stat, outcome);
  }

  // 퇴화가 나왔고 보호권이 있으면 결과를 확정하기 전에 쓸지 묻는다(HubView와 같은 선택창, systems/protect.js).
  function askProtect() {
    const model = protectPrompt(progress);
    if (!model) return;
    protectDialog(dialog, protectCopy(model, statNames[model.stat]), model.canUse, (use) => {
      const outcome = settleProtect(progress, use);
      save(progress);
      if (outcome.ok && use) {
        onAbility?.(outcome.stat, { result: 'fail', from: outcome.from, to: outcome.to, protectedUsed: true });
        say(statNames[outcome.stat] + ' 보호됨, 보호권 1장으로 +' + outcome.from + ' 유지', 'protect');
      } else if (outcome.ok) {
        say(statNames[outcome.stat] + ' 퇴화, 퇴화 방식을 고르세요', 'bad');
        render();
        askDegrade(outcome.stat, { result: 'degrade', needsChoice: true });
        return;
      }
      render();
    });
  }

  function askDegrade(stat, outcome) {
    degradeDialog(dialog, progress, stat, choice => {
      save(progress);
      if (choice === 'B') {
        toEvolve();
        return;
      }
      onAbility?.(stat, { ...outcome, degradeChoice: 'A' });
      say(statNames[stat] + ' 강화 +' + progress.enh[stat]);
      render();
    });
  }

  function evolveCard(option) {
    const card = el('article', 'yk-card yk-lv-card');
    const head = el('div', 'yk-line');
    head.append(el('h3', 'yk-stat-name', '진화'),
      el('strong', 'yk-level yk-lv-stage', option.available ? progress.stage + ' → ' + (progress.stage + 1) + '단계' : '3단계'));
    card.append(head);
    const action = button(option.available ? '진화 (요력 ' + number(option.cost) + ')' : '최고 단계',
      () => chooseEvolve(option));
    action.disabled = !option.available || progress.yoryeok < option.cost;
    card.dataset.off = String(action.disabled);
    card.append(el('p', 'yk-cost', option.available
      ? '새 모습이 되면 시작 크기로 돌아가요.' : '마지막 모습에 도달했어요.'), action);
    return card;
  }

  function bodyCard(option) {
    const card = el('article', 'yk-card yk-lv-card');
    const head = el('div', 'yk-line');
    head.append(el('h3', 'yk-stat-name', '몸집 강화'),
      el('strong', 'yk-level yk-lv-stage', '+' + run.bodyLevel));
    const action = button('몸집 키우기 (요력 ' + number(option.cost) + ')', chooseBody);
    action.disabled = progress.yoryeok < option.cost;
    card.dataset.off = String(action.disabled);
    card.append(head, el('p', 'yk-cost', '이번 판 크기 ' + option.mult + '배 확정'), action);
    return card;
  }

  function statButton(item) {
    const max = !Number.isFinite(item.cost);
    const node = button('', () => chooseAbility(item.stat), 'yk-lv-stat');
    node.disabled = max || progress.yoryeok < item.cost;
    const top = el('span', 'yk-lv-top');
    top.append(el('strong', 'yk-lv-name', statNames[item.stat] + ' +' + item.level),
      el('span', 'yk-lv-cost', max ? '최고 레벨' : '요력 ' + number(item.cost)));
    node.append(top);
    if (item.stat === 'vitality') node.append(el('span', 'yk-hint', vitalityUpgradeText(item.level, max)));
    if (!max) {
      const odds = el('span', 'yk-lv-odds');
      for (const [key, value] of Object.entries(item.odds)) {
        const cell = el('span');
        cell.append(el('span', '', outcomeNames[key]), el('b', '', number(value) + '%'));
        odds.append(cell);
      }
      node.append(odds);
    }
    node.setAttribute('aria-label', statNames[item.stat] + ' +' + item.level + (max ? ' 최고 레벨' : ' 강화, 요력 ' + number(item.cost) +
      ', ' + Object.entries(item.odds).map(([key, value]) => outcomeNames[key] + ' ' + number(value) + '%').join(', ')));
    return node;
  }

  function abilityCard(option) {
    const card = el('article', 'yk-card yk-lv-card');
    const head = el('div', 'yk-line');
    head.append(el('h3', 'yk-stat-name', '능력 강화'));
    const stats = el('div', 'yk-lv-stats');
    const buttons = option.stats.map(statButton);
    stats.append(...buttons);
    card.dataset.off = String(buttons.every(node => node.disabled));
    card.append(head, el('p', 'yk-cost', '강화에 실패하거나 퇴화할 수 있어요.'), stats);
    return card;
  }

  function render() {
    wallet.replaceChildren(el('strong', '', '요력 ' + number(progress.yoryeok)),
      el('span', '', '보호권 ' + number(progress.protect) + '장'));
    const [evolve, bodyOption, ability] = pauseOptions(progress, run);
    const scroll = body.scrollTop;
    body.replaceChildren(evolveCard(evolve), bodyCard(bodyOption), abilityCard(ability));
    body.scrollTop = scroll;
    resume.disabled = hasPendingChoice(progress);
  }

  render();
  // 저장된 퇴화 선택이 남은 채 열렸다면 먼저 고르게 한다.
  if (progress.pendingProtect) askProtect();
  else if (progress.pendingDegrade) askDegrade(progress.pendingDegrade, { result: 'degrade', needsChoice: true });
  return { close: () => leave(onResume) };
}

export default LevelUpView;
