import { CONFIG } from '../config.js';
import { ENHANCE } from './tuning-upgrade.js';
import { costMultiplier } from './enhance-curve.js';

const maxLevel = ENHANCE.success.length;

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

function successChance(state, level) {
  return Math.min(100, ENHANCE.success[level] + state.pity);
}

// 다음 레벨(level → level + 1)로 올리는 한 번의 비용. 곡선은 CONFIG.enhanceCost(1~5레벨 1.6배씩, 5레벨 이후 2배씩)이고 반올림은 한 번만 한다.
// 판 안 능력 +1 카드(levelup.quickEnhanceCost)와 정비 화면(HubView)이 같은 함수를 읽는다.
export function enhanceCost(level) {
  checkLevel(level);
  return level === maxLevel ? Infinity : Math.round(ENHANCE.baseCost * costMultiplier(level, CONFIG.enhanceCost));
}

// 레벨별 확률·비용 표(정비 화면의 '확률표'). 한 행 = 현재 레벨에서 다음 레벨로 올리는 시도 한 번.
// success·great·degrade·fail은 시도 전 천장(pity)·보호권이 없을 때의 네 결과 확률(%)로 합이 100이고(getEnhanceOdds와 같은 식),
// degradeOnFailure는 '실패했을 때 퇴화할 몫'(표의 값 그대로)이다.
export function enhanceTable() {
  return ENHANCE.success.map((chance, level) => {
    const great = chance * ENHANCE.greatOnSuccess / 100;
    const failure = 100 - chance;
    const degrade = failure * ENHANCE.degradeOnFailure[level] / 100;
    return {
      level, to: level + 1, cost: enhanceCost(level),
      success: chance - great, great, fail: failure - degrade, degrade,
      degradeOnFailure: ENHANCE.degradeOnFailure[level],
    };
  });
}

// 네 값은 서로 배타적인 최종 결과의 백분율이다. 보호권도 표시에 반영한다.
export function getEnhanceOdds(state, stat) {
  const level = levelOf(state, stat);
  if (level === maxLevel) return { success: 0, great: 0, fail: 0, degrade: 0 };
  const chance = successChance(state, level);
  const great = chance * ENHANCE.greatOnSuccess / 100;
  const failure = 100 - chance;
  const degrade = state.protect > 0 ? 0 : failure * ENHANCE.degradeOnFailure[level] / 100;
  return { success: chance - great, great, fail: failure - degrade, degrade };
}

// 단일 시도 비용은 호출자가 지불한다. chanceUsed에는 대성공이 포함된다.
export function tryEnhance(state, stat, { rng = Math.random } = {}) {
  const from = levelOf(state, stat);
  if (from === maxLevel) throw new RangeError('이미 최고 강화 레벨입니다.');
  if (state.pendingDegrade) throw new Error('먼저 퇴화 방식을 선택해야 합니다.');

  const chanceUsed = successChance(state, from);
  let result;
  let to = from;
  let protectedUsed = false;
  if (rng() * 100 < chanceUsed) {
    const great = rng() * 100 < ENHANCE.greatOnSuccess;
    result = great ? 'great' : 'success';
    to = Math.min(maxLevel, from + (great ? ENHANCE.greatLevels : 1));
    state.enh[stat] = to;
    state.pity = 0;
  } else {
    const risk = ENHANCE.degradeOnFailure[from];
    const degrade = risk > 0 && rng() * 100 < risk;
    protectedUsed = degrade && state.protect > 0;
    result = degrade && !protectedUsed ? 'degrade' : 'fail';
    if (protectedUsed) state.protect -= 1;
    if (result === 'degrade') state.pendingDegrade = stat;
    state.pity = Math.min(100, state.pity + ENHANCE.pityStep);
  }

  const outcome = { result, from, to, chanceUsed, pityBonusAfter: state.pity, needsChoice: result === 'degrade' };
  if (protectedUsed) outcome.protectedUsed = true;
  return outcome;
}

export function applyDegradeChoice(state, choice, stat) {
  if (!ENHANCE.stats.includes(stat) || state.pendingDegrade !== stat) return { ok: false };
  if (choice === 'A') {
    state.enh[stat] = Math.max(0, state.enh[stat] - 1);
  } else if (choice === 'B' && state.stage > 1) {
    state.pendingDevolve = true;
  } else {
    return { ok: false };
  }
  delete state.pendingDegrade;
  return { ok: true };
}

// canAfford(cost), pay(cost). pay가 false를 반환하면 지불 실패로 간주한다.
// max는 최고 레벨 또는 시도 횟수 상한(S/S+는 1회), gold는 요력 부족이다.
export function autoEnhance(state, stat, targetLevel, {
  rng = Math.random,
  canAfford = (cost) => state.yoryeok >= cost,
  pay = (cost) => { state.yoryeok -= cost; },
} = {}) {
  const start = levelOf(state, stat);
  if (!Number.isInteger(targetLevel) || targetLevel < 0) throw new RangeError('목표 강화 레벨이 잘못되었습니다.');
  const attempts = [];
  if (state.pendingDegrade) return { attempts, reason: 'degrade' };
  if (start === maxLevel) return { attempts, reason: 'max' };
  if (start >= targetLevel) return { attempts, reason: 'target' };

  const limit = ENHANCE.singleAttemptGrades.includes(state.grade) ? 1 : ENHANCE.autoLimit;
  while (attempts.length < limit) {
    const cost = enhanceCost(state.enh[stat]);
    if (!canAfford(cost) || pay(cost) === false) return { attempts, reason: 'gold' };
    const attempt = tryEnhance(state, stat, { rng });
    attempts.push(attempt);
    if (attempt.needsChoice || attempt.result === 'great') return { attempts, reason: attempt.result };
    if (attempt.to >= targetLevel) return { attempts, reason: 'target' };
    if (attempt.to === maxLevel) break;
  }
  return { attempts, reason: 'max' };
}
