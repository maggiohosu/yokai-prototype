// 적의 상태이상 필드와 타이머(설계 4-1·4-6). Phaser 의존 없음.
// - 모든 시각은 시뮬레이션 시계(scene.simTime) 기준이다. 판 안 카드로 멈춘 동안에는 시계가 서므로 효과도 멈춘다.
// - 화면 시간(초) → 시뮬레이션 시간 변환은 simSeconds(화면 초, scene)를 쓴다(= 화면 초 × CONFIG.tempo × 속도 곡선 f).
// - 적마다 숫자 필드만 쓴다. 프레임마다 배열·객체를 새로 만들지 않는다(GC 끊김 방지).
import { CONFIG } from '../config.js';
import { screenToSim } from '../systems/abilities.js';

export const STATUS_FIELDS = Object.freeze({
  frozenUntil: 0, frozenImmuneUntil: 0,
  fearUntil: 0, fearImmuneUntil: 0,
  burnUntil: 0, burnDps: 0,
  markUntil: 0, markAmp: 0, markLure: false,
  slowUntil: 0, slowMult: 1,
  knockUntil: 0, knockVx: 0, knockVy: 0, stunUntil: 0,
  charmUntil: 0, charmDur: 0, charmGraceUntil: 0, charmImmuneUntil: 0,
  orbitGateUntil: 0, gustGateUntil: 0,
});

// 적(Enemy)을 만들 때 한 번 부른다. 필드 모양을 고정해 두어 프레임 중 새 속성이 생기지 않게 한다.
// 이미 값이 있는 필드는 건드리지 않는다(없는 필드만 채운다).
export function initStatus(enemy) {
  for (const key in STATUS_FIELDS) if (!(key in enemy)) enemy[key] = STATUS_FIELDS[key];
  return enemy;
}

// 씬의 지금 시뮬레이션 시각과 속도 곡선. 가짜 씬(시험)에서는 0, 1.
export const nowOf = (scene) => scene?.simTime ?? 0;
export const paceOf = (scene) => scene?.pace ?? 1;

export function simSeconds(seconds, scene) {
  return screenToSim(seconds, CONFIG.tempo, paceOf(scene));
}

// ---- 판정 ----
export const isFrozen = (e, now) => e.frozenUntil > now;
export const isFeared = (e, now) => e.fearUntil > now;
export const isStunned = (e, now) => e.stunUntil > now;
export const isAlly = (e, now) => e.charmUntil > now;
// 아군이거나 풀려난 직후 유예 중: 플레이어와 서로 먹지 않고, 구슬·능력이 통과한다.
export const isShielded = (e, now) => e.charmUntil > now || e.charmGraceUntil > now;
export const inGrace = (e, now) => e.charmUntil <= now && e.charmGraceUntil > now;
// 빙결·경직: 이동·사냥·먹기·발사·자가 진화가 모두 멈춘다.
export const isDisabled = (e, now) => e.frozenUntil > now || e.stunUntil > now;
// 먹기가 막힌 사냥꾼: 빙결·경직·위협(겁먹은 동안 아무것도 먹지 않는다).
export const eatBlocked = (e, now) => e.frozenUntil > now || e.stunUntil > now || e.fearUntil > now;
// 나(플레이어)를 먹지 못하는 적: 먹기가 막혔거나 아군(유예 포함).
export const cannotEatPlayer = (e, now) => eatBlocked(e, now) || isShielded(e, now);
// 특수 적이 구슬을 못 쏘는 상태: 빙결·경직·아군.
export const fireBlocked = (e, now) => e.frozenUntil > now || e.stunUntil > now || e.charmUntil > now;

// ---- 걸기. 지속은 이미 시뮬레이션 시간이다. 걸렸으면 true ----
// 빙결·위협: 끝난 뒤 면역(immuneSim). 면역은 걸 때 끝나는 시각부터 계산해 두므로 지속 중 다시 맞아도 늘어나지 않는다.
export function tryFreeze(e, now, durationSim, immuneSim) {
  if (now < e.frozenImmuneUntil) return false;
  e.frozenUntil = now + durationSim;
  e.frozenImmuneUntil = e.frozenUntil + immuneSim;
  return true;
}

export function tryFear(e, now, durationSim, immuneSim) {
  if (now < e.fearImmuneUntil) return false;
  e.fearUntil = now + durationSim;
  e.fearImmuneUntil = e.fearUntil + immuneSim;
  return true;
}

// 작열: 다시 맞으면 시간을 새로 고침, 초당 피해는 큰 값(dps는 시뮬레이션 초당).
export function applyBurn(e, now, durationSim, dpsSim) {
  e.burnDps = e.burnUntil > now ? Math.max(e.burnDps, dpsSim) : dpsSim;
  e.burnUntil = now + durationSim;
}

// 이번 단계의 작열 피해(시뮬레이션 h초). 불타고 있지 않으면 0.
export function burnDamage(e, now, h) {
  return e.burnUntil > now ? e.burnDps * h : 0;
}

// 파사인: 중첩 없음. 다시 맞으면 시간만 새로 고친다. lure = 3단계 이상이면 다른 요괴의 먹잇감 점수가 낮아진다.
export function applyMark(e, now, durationSim, amp, lure) {
  e.markUntil = now + durationSim;
  e.markAmp = amp;
  e.markLure = lure;
}

// 선무 둔화: 겹치면 더 강한(작은 배율) 쪽. durationSim은 보통 한 단계의 몇 배(구름 안에 있는 동안 계속 새로 고침).
export function applySlow(e, now, durationSim, mult) {
  e.slowMult = e.slowUntil > now ? Math.min(e.slowMult, mult) : mult;
  e.slowUntil = now + durationSim;
}

export const slowFactor = (e, now) => (e.slowUntil > now ? e.slowMult : 1);

// 대풍: 속도(월드 단위/시뮬레이션 초)로 pushSim 동안 밀리고, stunSim 동안 경직. 재밀기 gateSim 동안은 안 밀린다.
export function tryKnock(e, now, vx, vy, pushSim, stunSim, gateSim) {
  if (now < e.gustGateUntil) return false;
  e.knockVx = vx;
  e.knockVy = vy;
  e.knockUntil = now + pushSim;
  e.stunUntil = Math.max(e.stunUntil, now + stunSim);
  e.gustGateUntil = now + gateSim;
  return true;
}

// 대풍 방향 규칙(docs/design-weapons.md 3-1): 밀기 방향 (dx,dy)가 플레이어 쪽을 향하면(되돌아오는 칼·안쪽 메아리 등)
// 플레이어 → 적 방향으로 바꾼다. 적을 내 쪽으로 밀어 오는 일을 막는다. 결과는 out.x, out.y(단위 벡터)에 쓰고 out을 돌려준다.
export function outwardPush(dx, dy, ex, ey, px, py, out) {
  const len = Math.hypot(dx, dy);
  if (len > 0) {
    dx /= len;
    dy /= len;
  }
  if (dx * (px - ex) + dy * (py - ey) > 0 || len === 0) {
    const ox = ex - px, oy = ey - py;
    const m = Math.hypot(ox, oy);
    if (m > 0) {
      dx = ox / m;
      dy = oy / m;
    }
  }
  out.x = dx;
  out.y = dy;
  return out;
}

// 매혹: 이미 아군·유예이거나 면역이면 못 건다. durationSim 뒤 풀리고 graceSim 동안은 도망, 면역은 풀린 뒤 immuneSim.
export function tryCharm(e, now, durationSim, graceSim, immuneSim) {
  if (isShielded(e, now) || now < e.charmImmuneUntil) return false;
  e.charmUntil = now + durationSim;
  e.charmDur = durationSim;
  e.charmGraceUntil = e.charmUntil + graceSim;
  e.charmImmuneUntil = e.charmUntil + immuneSim;
  e.reversed = false;
  return true;
}

// 초당 횟수 상한(화면 초 한 칸 안에서 센다). windowSim = 시뮬레이션으로 바꾼 1초.
export function createRateGate(limit) {
  return { limit, count: 0, windowEnd: -Infinity };
}

export function takeRate(gate, now, windowSim) {
  if (now >= gate.windowEnd) {
    gate.windowEnd = now + windowSim;
    gate.count = 0;
  }
  if (gate.count >= gate.limit) return false;
  gate.count++;
  return true;
}
