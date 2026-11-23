import { ENHANCE, TREASURE } from './tuning-upgrade.js';

// 보호권 선택 상태 기계(사용자 지시 2026-11-24, docs/plan.md 변경 이력 23). Phaser·DOM 의존이 없는 순수 계산이다.
//
// 한 번씩 누르는 강화에서 '퇴화(본체)' 또는 '깨짐(보물)'이 추첨됐고 보호권이 1장 이상이면, 결과를 확정하지 않고 progress.pendingProtect에 세워 둔다.
//   { kind: 'body', stat }       본체: 퇴화가 추첨됐다. 쓰면 레벨 유지(실패로 처리), 안 쓰면 퇴화(pendingDegrade로 이어져 A/B를 고른다).
//   { kind: 'treasure', from }   보물: 깨짐이 추첨됐다. 쓰면 +from 그대로 남고, 안 쓰면 깨져서 파편을 받는다. 장착한 보물이 그 물건이다.
// 확률 굴림은 pendingProtect를 세우기 전에 끝나 있고(저장도 그 뒤), settleProtect는 굴림 없이 결과만 바꾼다.
// 그래서 창을 닫거나 새로고침해도 다시 굴릴 수 없고, 다시 열면 같은 선택창이 뜬다(save.normalizePendingProtect가 읽는다).
// 연속 강화(enhance.autoEnhance)는 이 창을 쓰지 않는다. 시작 전에 고른 방침(보호권 자동 사용/쓰지 않기, 퇴화 A/B)대로 알아서 처리한다.

export const hasPendingChoice = (state) => !!(state?.pendingProtect || state?.pendingDegrade);

// 저장된 값을 읽어 올바르면 그 모양({ kind, ... })으로, 아니면 undefined로 돌려준다. state는 강화 레벨·장착 보물이 이미 읽힌 진행도다.
export function normalizePendingProtect(raw, state) {
  if (!raw || typeof raw !== 'object') return undefined;
  if (raw.kind === 'body') {
    if (!ENHANCE.stats.includes(raw.stat)) return undefined;
    const level = state?.enh?.[raw.stat];
    return Number.isInteger(level) && level < ENHANCE.outcomes.length ? { kind: 'body', stat: raw.stat } : undefined;
  }
  if (raw.kind === 'treasure') {
    const level = state?.treasure?.level;
    return Number.isInteger(raw.from) && level === raw.from ? { kind: 'treasure', from: raw.from } : undefined;
  }
  return undefined;
}

// 선택창이 보여 줄 값: { kind, stat?, level, protect, canUse }. 대기 중이 아니면 null.
export function protectPrompt(state) {
  const pending = state?.pendingProtect;
  if (!pending) return null;
  const protect = Number.isInteger(state.protect) ? state.protect : 0;
  if (pending.kind === 'body') {
    return { kind: 'body', stat: pending.stat, level: state.enh[pending.stat], protect, canUse: protect >= 1 };
  }
  return {
    kind: 'treasure', level: pending.from, shards: pending.from * TREASURE.shardsPerLevel, protect, canUse: protect >= 1,
  };
}

// 선택을 확정한다. use = true면 보호권 1장을 쓴다. 굴림은 하지 않는다.
//   본체 use: 보호권 −1, 레벨 유지. → { ok, used: true, kind: 'body', stat, result: 'fail', protectedUsed: true, from, to }
//   본체 안 씀: pendingDegrade를 세운다(A/B 선택). → { ok, used: false, kind: 'body', stat, result: 'degrade', needsChoice: true, from, to }
//   보물 use: 보호권 −1, 보물 그대로. → { ok, used: true, kind: 'treasure', result: 'protected', from, to: from, shards: 0 }
//   보물 안 씀: 보물이 사라지고 파편을 받는다. → { ok, used: false, kind: 'treasure', result: 'break', from, to: null, shards }
// 대기 중인 것이 없거나 보호권이 없는데 쓰려 하면 { ok: false }이고 상태는 그대로다.
export function settleProtect(state, use) {
  const pending = state?.pendingProtect;
  if (!pending) return { ok: false };
  if (use && !(state.protect >= 1)) return { ok: false, reason: 'none' };
  if (pending.kind === 'body') {
    const { stat } = pending;
    const level = state.enh[stat];
    delete state.pendingProtect;
    if (use) {
      state.protect -= 1;
      return { ok: true, used: true, kind: 'body', stat, result: 'fail', protectedUsed: true, from: level, to: level };
    }
    state.pendingDegrade = stat;
    return { ok: true, used: false, kind: 'body', stat, result: 'degrade', needsChoice: true, from: level, to: level };
  }
  const from = pending.from;
  if (state.treasure?.level !== from) {
    delete state.pendingProtect;
    return { ok: false, reason: 'stale' };
  }
  delete state.pendingProtect;
  if (use) {
    state.protect -= 1;
    return { ok: true, used: true, kind: 'treasure', result: 'protected', from, to: from, shards: 0 };
  }
  const shards = from * TREASURE.shardsPerLevel;
  state.treasure = null;
  state.shards += shards;
  return { ok: true, used: false, kind: 'treasure', result: 'break', from, to: null, shards };
}
