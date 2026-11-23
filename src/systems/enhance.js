import { CONFIG } from '../config.js';
import { ENHANCE } from './tuning-upgrade.js';
import { costMultiplier } from './enhance-curve.js';
import { hasPendingChoice } from './protect.js';

const maxLevel = ENHANCE.outcomes.length;

function checkLevel(level) {
  if (!Number.isInteger(level) || level < 0 || level > maxLevel) {
    throw new RangeError('본체 강화 레벨이 범위를 벗어났습니다.');
  }
}

function levelOf(state, stat) {
  if (!ENHANCE.stats.includes(stat)) throw new RangeError('알 수 없는 강화 능력치입니다.');
  const level = state.enh[stat];
  checkLevel(level);
  return level;
}

// 시도 전 천장(pity)을 반영한 한 레벨의 확률. 표(ENHANCE.outcomes)의 성공 + 대성공이 '총 성공 확률'이고 천장은 거기에 더한다(100 상한).
// 늘어난 성공 확률은 표의 대성공 몫(greatShare), 줄어든 실패는 표의 퇴화 몫(degradeShare)으로 나뉜다. 천장이 0이면 표의 네 값 그대로다.
//   chance = 총 성공 확률(%), success·great·fail·degrade = 서로 배타적인 네 결과(%, 합 100), greatShare·degradeShare = 굴림에 쓰는 조건부 몫(0~1).
function oddsAt(level, pity) {
  const row = ENHANCE.outcomes[level];
  const total = row.success + row.great;
  const bad = row.fail + row.degrade;
  const greatShare = total > 0 ? row.great / total : 0;
  const degradeShare = bad > 0 ? row.degrade / bad : 0;
  const chance = Math.min(100, total + pity);
  if (chance === total) return { chance, success: row.success, great: row.great, fail: row.fail, degrade: row.degrade, greatShare, degradeShare };
  const great = chance * greatShare;
  const failure = 100 - chance;
  const degrade = failure * degradeShare;
  return { chance, success: chance - great, great, fail: failure - degrade, degrade, greatShare, degradeShare };
}

// 다음 레벨(level → level + 1)로 올리는 한 번의 비용. 곡선은 CONFIG.enhanceCost(1~5레벨 1.6배씩, 5레벨 이후 2배씩)이고 반올림은 한 번만 한다.
// 판 안 능력 +1 카드(levelup.quickEnhanceCost)와 정비 화면(HubView)이 같은 함수를 읽는다.
export function enhanceCost(level) {
  checkLevel(level);
  return level === maxLevel ? Infinity : Math.round(ENHANCE.baseCost * costMultiplier(level, CONFIG.enhanceCost));
}

// 레벨별 확률·비용 표(정비 화면의 '확률표'). 한 행 = 현재 레벨에서 다음 레벨로 올리는 시도 한 번.
// success·great·fail·degrade는 시도 전 천장(pity)이 없을 때의 네 결과 확률(%)로 합이 100이고 ENHANCE.outcomes의 값 그대로다.
export function enhanceTable() {
  return ENHANCE.outcomes.map(({ success, great, fail, degrade }, level) => ({
    level, to: level + 1, cost: enhanceCost(level), success, great, fail, degrade,
  }));
}

// 네 값은 서로 배타적인 굴림 결과의 백분율이다. 보호권은 반영하지 않는다: 보호권은 굴림이 끝난 뒤 '퇴화'가 나왔을 때 쓸지 묻는 선택이라(systems/protect.js) 굴림 확률을 바꾸지 않는다.
// (예전에는 보호권이 있으면 퇴화를 0%로 표시하고 퇴화가 나오는 순간 자동으로 한 장을 썼다. 사용자 지시 2026-11-24로 선택창 방식이 됐다.)
export function getEnhanceOdds(state, stat) {
  const level = levelOf(state, stat);
  if (level === maxLevel) return { success: 0, great: 0, fail: 0, degrade: 0 };
  const { success, great, fail, degrade } = oddsAt(level, state.pity);
  return { success, great, fail, degrade };
}

// 역진화(퇴화 B)는 EvolveView가 단계를 내린다. 한 번씩 고를 때는 pendingDevolve = true(한 단계)지만, 연속 강화는 한 묶음에서 여러 번 고를 수 있어
// 2 이상의 정수로도 쌓는다(true = 1). 아직 내리지 않은 단계 수.
export function devolveSteps(state) {
  const value = state?.pendingDevolve;
  if (value === true) return 1;
  return Number.isInteger(value) && value > 0 ? value : 0;
}

// 역진화를 하나 더 예약할 수 있는가: 이미 예약한 단계를 빼고도 2단계 이상이어야 한다.
export const canDevolve = (state) => state.stage - devolveSteps(state) > 1;

function reserveDevolve(state) {
  const steps = devolveSteps(state) + 1;
  state.pendingDevolve = steps === 1 ? true : steps;
}

// 저장에서 읽은 pendingDevolve를 올바른 값으로(true 또는 2 이상의 정수, 내릴 수 있는 단계 stage−1이 상한). 없으면 undefined.
export function normalizeDevolve(raw, stage) {
  const steps = raw === true ? 1 : Number.isInteger(raw) ? raw : 0;
  const capped = Math.min(steps, Math.max(0, stage - 1));
  if (capped < 1) return undefined;
  return capped === 1 ? true : capped;
}

// 단일 시도 비용은 호출자가 지불한다. chanceUsed에는 대성공이 포함된다.
// protect: 퇴화가 추첨되고 보호권이 있을 때의 처리.
//   'ask'(기본): 보호권 선택 대기로 세우고(state.pendingProtect, outcome.needsProtect) 결과를 확정하지 않는다. systems/protect.settleProtect가 마무리한다(쓰면 'fail'·보호됨, 안 쓰면 'degrade'로 이어져 A/B 선택).
//   'use': 보호권 1장을 바로 쓴다(결과 'fail', protectedUsed). 연속 강화의 '보호권 자동 사용'.
//   'skip': 보호권을 쓰지 않는다(보호권이 있어도 퇴화). 연속 강화의 '보호권 쓰지 않기'.
// 보호권이 없으면 어느 쪽이든 바로 퇴화(state.pendingDegrade, outcome.needsChoice)다.
export function tryEnhance(state, stat, { rng = Math.random, protect = 'ask' } = {}) {
  const from = levelOf(state, stat);
  if (from === maxLevel) throw new RangeError('이미 최고 강화 레벨입니다.');
  if (state.pendingDegrade) throw new Error('먼저 퇴화 방식을 선택해야 합니다.');
  if (state.pendingProtect) throw new Error('먼저 보호권을 쓸지 선택해야 합니다.');

  const odds = oddsAt(from, state.pity);
  const chanceUsed = odds.chance;
  let result;
  let to = from;
  let protectedUsed = false;
  let needsProtect = false;
  if (rng() * 100 < chanceUsed) {
    const great = rng() * 100 < odds.greatShare * 100;
    result = great ? 'great' : 'success';
    to = Math.min(maxLevel, from + (great ? ENHANCE.greatLevels : 1));
    state.enh[stat] = to;
    state.pity = 0;
  } else {
    const risk = odds.degradeShare * 100;
    const degrade = risk > 0 && rng() * 100 < risk;
    const hasProtect = state.protect > 0;
    protectedUsed = degrade && hasProtect && protect === 'use';
    needsProtect = degrade && hasProtect && protect === 'ask';
    result = degrade && !protectedUsed ? 'degrade' : 'fail';
    if (protectedUsed) state.protect -= 1;
    if (needsProtect) state.pendingProtect = { kind: 'body', stat };
    else if (result === 'degrade') state.pendingDegrade = stat;
    state.pity = Math.min(100, state.pity + ENHANCE.pityStep);
  }

  const outcome = { result, from, to, chanceUsed, pityBonusAfter: state.pity, needsChoice: result === 'degrade' && !needsProtect };
  if (protectedUsed) outcome.protectedUsed = true;
  if (needsProtect) outcome.needsProtect = true;
  return outcome;
}

export function applyDegradeChoice(state, choice, stat) {
  if (!ENHANCE.stats.includes(stat) || state.pendingDegrade !== stat) return { ok: false };
  if (choice === 'A') {
    state.enh[stat] = Math.max(0, state.enh[stat] - 1);
  } else if (choice === 'B' && canDevolve(state)) {
    reserveDevolve(state);
  } else {
    return { ok: false };
  }
  delete state.pendingDegrade;
  return { ok: true };
}

// 연속 강화(사용자 지시 2026-11-24, 변경 이력 23). 한 번 누를 때 count(기본 ENHANCE.autoBatch = 20)번을 멈추지 않고 시도하고,
// 퇴화·보호권 상황은 시작 전에 고른 방침대로 알아서 처리한다.
//   degrade: 'A'(강화 레벨 −1) | 'B'(진화 단계 −1, 강화 유지). 퇴화가 나올 때마다 이 방식으로 처리한다.
//   useProtect: true면 보호권이 있는 동안 퇴화를 보호권으로 막는다(다 쓰면 degrade 방식으로 이어진다). false면 보호권이 있어도 쓰지 않는다.
// 대성공·퇴화·보호권 사용에서는 멈추지 않는다. count번 전에 끝나는 경우는 reason으로 알린다:
//   'max'     최고 레벨(+20)에 닿았다(시작할 때 이미 최고여도 같다).
//   'gold'    요력이 모자라 다음 시도를 못 한다.
//   'devolve' B를 골랐는데 더 내릴 진화 단계가 없다(1단계이거나 예약한 단계로 다 찼다). 퇴화를 확정하지 않고 멈춘다: pendingDegrade를 남겨 한 번씩 고르는 A/B 창이 뜨게 한다.
//             (자동으로 A로 바꾸지 않는다. B는 레벨을 지키려고 고른 방침이라, 몰래 레벨을 깎으면 뜻과 반대다.)
//   'batch'   count번을 다 했다.   'single' S·S+ 등급은 한 번만 시도한다(ENHANCE.singleAttemptGrades).
// 이미 대기 중인 선택(pendingProtect·pendingDegrade)이 있으면 시도하지 않고 'protect'·'degrade'로 돌려준다.
// canAfford(cost), pay(cost). pay가 false를 반환하면 지불 실패로 간주한다. 반환: { attempts, reason, summary }.
export function autoEnhance(state, stat, {
  rng = Math.random,
  canAfford = (cost) => state.yoryeok >= cost,
  pay = (cost) => { state.yoryeok -= cost; },
  degrade = 'A',
  useProtect = false,
  count = ENHANCE.autoBatch,
} = {}) {
  const start = levelOf(state, stat);
  if (degrade !== 'A' && degrade !== 'B') throw new RangeError('퇴화 처리 방식은 A 또는 B입니다.');
  const attempts = [];
  if (hasPendingChoice(state)) return { attempts, reason: state.pendingProtect ? 'protect' : 'degrade', summary: summarize(attempts, start, start, 0) };
  if (start === maxLevel) return { attempts, reason: 'max', summary: summarize(attempts, start, start, 0) };

  const single = ENHANCE.singleAttemptGrades.includes(state.grade);
  const limit = single ? 1 : count;
  let spent = 0;
  let reason = single ? 'single' : 'batch';
  while (attempts.length < limit) {
    if (state.enh[stat] === maxLevel) { reason = 'max'; break; }
    const cost = enhanceCost(state.enh[stat]);
    if (!canAfford(cost) || pay(cost) === false) { reason = 'gold'; break; }
    spent += cost;
    const attempt = tryEnhance(state, stat, { rng, protect: useProtect ? 'use' : 'skip' });
    attempts.push(attempt);
    if (!attempt.needsChoice) continue;
    if (degrade === 'A') {
      applyDegradeChoice(state, 'A', stat);
      attempt.degradeChoice = 'A';
      attempt.to = state.enh[stat];
    } else if (canDevolve(state)) {
      applyDegradeChoice(state, 'B', stat);
      attempt.degradeChoice = 'B';
    } else {
      reason = 'devolve';
      break;
    }
  }
  if (reason === 'batch' && state.enh[stat] === maxLevel) reason = 'max';
  return { attempts, reason, summary: summarize(attempts, start, state.enh[stat], spent) };
}

// 연속 강화 한 번의 결과 요약. degrade = 퇴화가 추첨돼 보호권으로 막지 못한 횟수(레벨 낮춤 lowered + 역진화 devolved + 아직 고르지 못한 것).
function summarize(attempts, from, to, spent) {
  const count = (test) => attempts.filter(test).length;
  const unresolved = count((a) => a.needsChoice && !a.degradeChoice);
  const lowered = count((a) => a.degradeChoice === 'A');
  const devolved = count((a) => a.degradeChoice === 'B');
  return {
    tries: attempts.length,
    success: count((a) => a.result === 'success'),
    great: count((a) => a.result === 'great'),
    fail: count((a) => a.result === 'fail' && !a.protectedUsed),
    protectUsed: count((a) => a.protectedUsed),
    degrade: lowered + devolved + unresolved,
    lowered,
    devolved,
    from,
    to,
    spent,
  };
}
