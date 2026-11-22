import { CONFIG } from '../config.js';

// 생명력: 나를 먹을 수 있는 적과 겹쳐 있는 동안 줄어드는 게이지. Phaser·DOM에 의존하지 않는다.
// 모든 시간은 시뮬레이션 시간(초)이다. 상태는 { value, sinceTouch }: 현재 게이지와 마지막으로 닿은 뒤 지난 시간.

// 레벨별 최대치(초).
export function vitalityMax(level = 0) {
  const { baseSec, perLevelSec } = CONFIG.vitality;
  return baseSec + perLevelSec * Math.max(0, level);
}

export function createVitality(max) {
  return { value: max, sinceTouch: Infinity };
}

// 한 계산 단계. 닿아 있으면 dt만큼 줄고(겹친 적이 여럿이어도 1배), 닿아 있지 않으면 지연 뒤부터 회복한다.
// max가 줄었으면 현재치를 자른다. 반환 { eaten }: 닿아 있고 게이지가 0이면 true(그때 먹힌다).
export function stepVitality(state, { touching, dt, max }) {
  const { regenFullSec, regenDelaySec } = CONFIG.vitality;
  if (state.value > max) state.value = max;
  if (touching) {
    state.sinceTouch = 0;
    state.value = Math.max(0, state.value - dt);
    return { eaten: state.value <= 0 };
  }
  const before = state.sinceTouch;
  const after = before + dt;
  state.sinceTouch = after;
  // 지연이 끝난 시점부터 이번 단계가 끝날 때까지만 회복한다.
  const regenTime = Math.max(0, after - Math.max(before, regenDelaySec));
  if (regenTime > 0 && state.value < max) {
    state.value = Math.min(max, state.value + regenTime * (max / regenFullSec));
  }
  return { eaten: false };
}

// 특수 적 구슬 한 방. 게이지를 먼저 깎고, 모자란 비율(0~1)만큼만 기존 피해(크기 감소)를 입는다.
// drainSec가 0 이하이면 게이지를 쓰지 않고 피해를 그대로 입는다.
export function absorbHit(state, drainSec = CONFIG.vitality.hitDrainSec) {
  if (!(drainSec > 0)) return { damageRatio: 1 };
  const absorbed = Math.min(state.value, drainSec);
  state.value -= absorbed;
  state.sinceTouch = 0; // 맞은 직후에도 회복을 잠시 미룬다
  return { damageRatio: (drainSec - absorbed) / drainSec };
}

// 게이지를 보여줘야 하는가: 가득 차 있으면 숨긴다.
export function vitalityVisible(state, max) {
  return state.value < max - 1e-6;
}
