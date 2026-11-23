import { CONFIG } from '../config.js';

// 예고된 대요괴(계획서 '변경 이력 5', 근거 docs/research/slotbound.md 6절 R2). Phaser·DOM 의존이 없는 순수 규칙이며 수치는 모두 CONFIG.herald에 있다.
// 시간 인자(dt)는 **실제 초**다(판을 멈춘 동안 호출하지 않으면 세지 않는다). 맞수(balance.rivalPlan, 4·5단계)와는 따로 센다.
const cfg = () => CONFIG.herald;

const finite = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// state = { timer(실제 초), alive(지금 살아 있는 대요괴 수), warned(이번 주기에 안내를 이미 냈는가) }
export function createHeraldState() {
  return { timer: 0, alive: 0, warned: false };
}

export function heraldEnabled() {
  const c = cfg();
  return !!c.enabled && c.intervalSec > 0;
}

// 대요괴의 몸집 상한: 플레이어 × sizeMax(절대 상한은 일반 적과 같다). 먹어서 자라도 이 값을 넘지 않는다.
export function heraldSizeCap(playerSize) {
  return Math.min(CONFIG.enemy.growthCap.maxSize, finite(playerSize, 0) * cfg().sizeMax);
}

// 한 프레임 진행. 반환 { spawn, cue }:
//   spawn  { stage, size, herald: true } | null — 등장 시각이 되면 하나. 나와 같은 단계(1단계 판이면 1단계, 2로 올리지 않는다), 크기 = 내 크기 × sizeMin~sizeMax.
//   cue    'warn' | null — 남은 시간이 warnSec 이하로 처음 내려온 프레임(HUD가 짧은 안내를 띄운다). 주기마다 한 번.
// alive는 호출자가 매번 '지금 살아 있는 대요괴 수'로 넘긴다. 살아 있는 동안(maxAlive 이상)은 타이머가 0으로 묶여, 사라진 뒤 intervalSec부터 다시 센다.
// 등장 지시를 받고도 놓지 못했으면 heraldRetry로 다음 호출에 다시 받는다.
export function stepHerald(state, { dt, alive, playerStage, playerSize }, rng = Math.random) {
  const c = cfg();
  state.alive = Math.max(0, Math.round(finite(alive, 0)));
  if (!heraldEnabled() || !(playerSize > 0) || state.alive >= c.maxAlive) {
    state.timer = 0;
    state.warned = false;
    return { spawn: null, cue: null };
  }
  state.timer += Math.max(0, finite(dt, 0));
  let cue = null;
  if (!state.warned && c.intervalSec - state.timer <= c.warnSec) {
    state.warned = true;
    cue = 'warn';
  }
  if (state.timer < c.intervalSec) return { spawn: null, cue };
  state.timer = 0;
  state.warned = false;
  const size = playerSize * (c.sizeMin + clamp(rng(), 0, 1) * (c.sizeMax - c.sizeMin));
  const stage = clamp(Math.round(finite(playerStage, 1)) || 1, 1, CONFIG.balance.pace.maxStage);
  return { spawn: { stage, size: Math.min(heraldSizeCap(playerSize), size), herald: true }, cue };
}

// 지시를 받았지만 자리를 못 찾아 놓지 못했을 때: 다음 호출에서 바로 다시 지시를 받는다(안내는 다시 내지 않는다).
export function heraldRetry(state) {
  state.timer = cfg().intervalSec;
  state.warned = true;
}

// HUD 표시용: { mode, current, target, remainSec, warn }
//   mode 'off'       대요괴가 꺼져 있다(게이지를 숨긴다)
//   mode 'countdown' 등장까지 남은 시간 게이지(current = 지난 초, target = intervalSec)
//   mode 'alive'     지금 나와 있다(게이지는 가득, 문구는 처치 안내)
export function heraldView(state) {
  const c = cfg();
  if (!heraldEnabled()) return { mode: 'off', current: 0, target: 0, remainSec: 0, warn: false };
  if (state.alive >= c.maxAlive) return { mode: 'alive', current: c.intervalSec, target: c.intervalSec, remainSec: 0, warn: false };
  const current = clamp(finite(state.timer, 0), 0, c.intervalSec);
  const remainSec = c.intervalSec - current;
  return { mode: 'countdown', current, target: c.intervalSec, remainSec, warn: remainSec <= c.warnSec };
}

// ---- 보상 ----
// 보너스 요력 = 그 먹이의 기본 요력 × bonusMult(정수). 기본 요력은 호출자가 session.mealYoryeok(meal)로 구한다.
export function heraldBonusYoryeok(baseGain) {
  return Math.round(Math.max(0, finite(baseGain, 0)) * Math.max(0, finite(cfg().bonusMult, 0)));
}

// 보패 보상(처치하면 반드시 1개)은 heraldReward.js가 정한다. 예전의 '여의주 드롭 확률을 dropChance로 올리는 한 번 더 굴림'은 없어졌다(계획서 '변경 이력 19').
