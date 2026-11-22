import { CONFIG } from '../config.js';

// 부스터(플레이어 전용). 위쪽은 Phaser·DOM에 의존하지 않는 순수 계산이고, 아래 BoosterButton이 화면 버튼이다.
// stepBooster의 시간(게이지·회복·지연)은 화면 시간(초)이다. 시뮬레이션 단계는 stepBoosterSim으로 변환해 쓴다. 상태는 { value, sinceRelease, locked }:
// 남은 게이지, 버튼을 뗀 뒤 지난 시간, 게이지가 바닥나 minRestartSec까지 찰 때까지 잠긴 상태.

const EPS = 1e-9;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 부스터 배율 = baseMult × 줄기 보정 + perSpeedLevel × 이동 속도 강화 레벨.
// 줄기 보정: 형태 데이터의 선택 필드 form.boostMult → CONFIG.booster.formMult[form.id](임시 표) → 1.
export function boosterMult(progress, form, cfg = CONFIG.booster) {
  const level = clamp(Number(progress?.enh?.speed) || 0, 0, CONFIG.pace.maxSpeedLevel);
  const stem = Number.isFinite(form?.boostMult) ? form.boostMult : (cfg.formMult?.[form?.id] ?? 1);
  return cfg.baseMult * stem + cfg.perSpeedLevel * level;
}

export function createBooster(max = CONFIG.booster.maxSec) {
  return { value: max, sinceRelease: Infinity, locked: false };
}

// 한 계산 단계(dt초). 반환 { boosting, boostSec }: boostSec는 이번 dt 중 실제로 가속한 시간(0~dt)이다.
// 게이지가 dt 도중 바닥나면 그 시점까지만 가속하므로, 이동 거리는 속도 × (dt + boostSec × (배율 - 1))이다.
// - 누르는 동안: 게이지가 닳는다. 0이 되면 잠겨 가속이 끝난다. 잠긴 채 계속 눌러도 회복하지 않는다.
// - 뗀 뒤: regenDelaySec 동안은 회복하지 않고, 그 뒤 빈 상태에서 가득 차기까지 regenFullSec의 속도로 찬다.
// - 잠김은 게이지가 minRestartSec 이상 차면 풀린다(그때부터 다시 눌러 가속할 수 있다).
export function stepBooster(state, { pressed, dt, max = CONFIG.booster.maxSec }) {
  const { minRestartSec, regenFullSec, regenDelaySec } = CONFIG.booster;
  if (state.value > max) state.value = max;
  if (pressed) {
    state.sinceRelease = 0;
    if (state.value <= EPS) {
      state.value = 0;
      state.locked = true;
    }
    if (state.locked) return { boosting: false, boostSec: 0 };
    const boostSec = Math.min(Math.max(0, dt), state.value);
    state.value -= boostSec;
    if (state.value <= EPS) {
      state.value = 0;
      state.locked = true;
    }
    return { boosting: boostSec > 0, boostSec };
  }
  const before = state.sinceRelease;
  const after = before + dt;
  state.sinceRelease = after;
  // 지연이 끝난 시점부터 이번 단계가 끝날 때까지만 회복한다.
  const regenTime = Math.max(0, after - Math.max(before, regenDelaySec));
  if (regenTime > 0 && state.value < max) {
    state.value = Math.min(max, state.value + regenTime * (max / regenFullSec));
  }
  if (state.locked && state.value >= Math.min(minRestartSec, max) - EPS) state.locked = false;
  return { boosting: false, boostSec: 0 };
}

// 시뮬레이션 단계(h, 시뮬레이션 시간)를 화면 시간으로 바꿔 게이지를 계산하고, 가속 시간은 다시 시뮬레이션 시간으로 돌려준다.
// scale = CONFIG.tempo × pace(시뮬레이션 시간 ÷ 화면 시간). 그래서 게이지 2초·회복 5초·지연 0.5초가 화면 시간 기준으로 유지된다.
export function stepBoosterSim(state, { pressed, h, scale, max = CONFIG.booster.maxSec }) {
  const s = scale > 0 ? scale : 1;
  const step = stepBooster(state, { pressed, dt: h / s, max });
  return { boosting: step.boosting, boostSec: step.boostSec * s };
}

// ---- 발사 버튼 위의 부스터 버튼: 누르는 동안 켜지고 떼면 꺼진다(멀티터치, 키보드 Shift도 같다) ----
const SHIFT = ['ShiftLeft', 'ShiftRight'];

export class BoosterButton {
  constructor(surface) {
    this.pointers = new Set();
    this.keys = new Set();
    this.suspended = false;
    this.button = document.createElement('button');
    this.button.className = 'booster-button';
    this.button.type = 'button';
    this.button.setAttribute('aria-label', '부스터');
    this.button.setAttribute('aria-keyshortcuts', 'Shift');
    const face = document.createElement('span');
    face.textContent = '부스터';
    this.button.append(face);
    surface.append(this.button);

    this.events = new AbortController();
    const options = { signal: this.events.signal };
    this.button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      // 발사 버튼·이동 스틱과 동시에 눌러도 되도록 이 손가락은 이 버튼이 끝까지 잡는다(확대·스크롤 제스처로 넘기지 않는다).
      event.stopPropagation();
      event.preventDefault();
      if (this.suspended) return;
      this.pointers.add(event.pointerId);
      try { this.button.setPointerCapture(event.pointerId); } catch {}
    }, options);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.button.addEventListener(type, (event) => this.pointers.delete(event.pointerId), options);
    }
    // 길게 눌러 생기는 메뉴가 부스터를 끊지 않게 한다.
    this.button.addEventListener('contextmenu', (event) => event.preventDefault(), options);
    window.addEventListener('keydown', (event) => {
      if (this.suspended || event.repeat || !SHIFT.includes(event.code)) return;
      this.keys.add(event.code);
    }, options);
    window.addEventListener('keyup', (event) => this.keys.delete(event.code), options);
    window.addEventListener('blur', () => this.release(), options);
    document.addEventListener('visibilitychange', () => this.release(), options);
  }

  // 지금 눌려 있는가. 멈춤·종료 중에는 항상 false.
  get held() {
    return !this.suspended && (this.pointers.size > 0 || this.keys.size > 0);
  }

  release() {
    for (const id of this.pointers) {
      try { if (this.button.hasPointerCapture?.(id)) this.button.releasePointerCapture(id); } catch {}
    }
    this.pointers.clear();
    this.keys.clear();
  }

  // 성장 카드가 열려 있는 동안은 새 입력을 받지 않고, 잡고 있던 손가락·키도 놓는다. 닫힌 뒤에는 새로 눌러야 켜진다.
  suspend() {
    this.suspended = true;
    this.release();
  }

  resume() {
    this.suspended = false;
  }

  // 남은 게이지를 버튼 둘레 원호(--gauge)로, 가속 중·잠김은 속성으로 보여준다. 바뀔 때만 DOM을 건드린다.
  update(state, max = CONFIG.booster.maxSec, boosting = false) {
    const percent = Math.floor(clamp(state.value / max, 0, 1) * 100);
    const key = percent + (boosting ? 'b' : '') + (state.locked ? 'l' : '');
    if (this.key === key) return;
    this.key = key;
    this.button.style.setProperty('--gauge', percent + '%');
    this.button.setAttribute('aria-pressed', String(boosting));
    this.button.setAttribute('aria-disabled', String(state.locked));
  }

  destroy() {
    this.events.abort();
    this.release();
    this.button.remove();
  }
}
