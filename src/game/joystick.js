import { CONFIG } from '../config.js';

// 눌러야 하는 UI와 선택지 카드 레이어는 이동 입력으로 쓰지 않는다.
const DEFAULT_EXCLUDE = 'button, a, input, select, textarea, dialog, [role="dialog"], .fire-button, .quickpick';
const GEOMETRY_REFRESH_MS = 500;

// ---- 순수 계산(DOM 없이 단위 테스트한다) ----

// 패드 한계값. 최대 속도에 닿는 거리는 CONFIG.input.fullSpeedPx이되 패드 반지름을 넘지 않는다(가장자리 = 최대).
export function padLimits(radius, input = CONFIG.input) {
  const full = Math.max(1, Math.min(input.fullSpeedPx, radius));
  return { deadZone: Math.min(input.deadZonePx, full * 0.5), full };
}

// 손가락과 패드 중심(둘 다 client 좌표)으로 방향 벡터를 만든다. 길이는 0~1이다.
// 데드존 이하면 0, full 이상이면 1, 그 사이는 선형이다. 방향은 패드 중심 기준이다(캐릭터 기준이 아니다).
export function padVector(finger, center, { deadZone, full }, out = { x: 0, y: 0 }) {
  const dx = finger.x - center.x;
  const dy = finger.y - center.y;
  const length = Math.hypot(dx, dy);
  if (!(length > deadZone)) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  const power = Math.min(1, (length - deadZone) / Math.max(1e-6, full - deadZone));
  out.x = (dx / length) * power;
  out.y = (dy / length) * power;
  return out;
}

// 스틱을 잡을 수 있는 위치: 화면 왼쪽 절반.
export function inStickZone(clientX, viewportWidth) {
  return clientX < viewportWidth / 2;
}

// 방향 벡터를 시간상수 responseMs로 섞는다(사실상 즉시 따라가고 떨림만 막는다). 첫 호출(elapsedMs 없음)은 바로 따라간다.
export function smoothAxis(axis, target, elapsedMs, responseMs, out = { x: 0, y: 0 }) {
  const blend = elapsedMs == null ? 1 : 1 - Math.exp(-elapsedMs / Math.max(0.001, responseMs));
  out.x = axis.x + (target.x - axis.x) * blend;
  out.y = axis.y + (target.y - axis.y) * blend;
  return out;
}

// 키보드 방향: 대각선도 길이 1.
export function keyVector(keys, out = { x: 0, y: 0 }) {
  const held = (a, b) => Number(keys.has(a) || keys.has(b));
  const x = held('KeyD', 'ArrowRight') - held('KeyA', 'ArrowLeft');
  const y = held('KeyS', 'ArrowDown') - held('KeyW', 'ArrowUp');
  const scale = Math.max(1, Math.hypot(x, y));
  out.x = x / scale;
  out.y = y / scale;
  return out;
}

// ---- 화면 위의 고정 스틱 ----
// 패드(#joystick)의 위치는 CSS가 정하고, 중심은 실제 화면 위치에서 읽는다. 화면 왼쪽 절반(눌러야 하는 UI 제외)에서
// 누르기 시작한 손가락이 스틱을 잡고, 손가락을 떼면 0이다. 키보드 WASD·화살표도 같이 쓴다.
export class Joystick {
  constructor(root = document, { exclude = DEFAULT_EXCLUDE, pad = '#joystick', arena = '#arena' } = {}) {
    this.exclude = exclude;
    this.pad = root.querySelector(pad);
    this.knob = this.pad.firstElementChild;
    this.arena = root.querySelector(arena);
    this.capture = document.documentElement;
    this.keys = new Set();
    this.pointer = null;
    this.suspended = false;
    this.target = { x: 0, y: 0 };
    this.axis = { x: 0, y: 0 };
    this.want = { x: 0, y: 0 };
    this.center = { x: 0, y: 0 };
    this.radius = CONFIG.input.joystickRadius;
    this.travel = this.radius * 0.5;
    this.limits = padLimits(this.radius);
    this.measuredAt = -Infinity;
    this.lastTime = 0;
    this.knobKey = '';
    this.events = new AbortController();
    const listen = (element, type, fn) => element.addEventListener(type, fn, { signal: this.events.signal });

    // 화면 전체에서 스크롤·확대 제스처가 가로채지 않도록 한다. 닫을 때 원래대로 돌린다.
    this.touchAction = [document.documentElement, document.body].map((node) => [node, node.style.touchAction]);
    for (const [node] of this.touchAction) node.style.touchAction = 'none';

    this.pad.hidden = false;
    this.measure();
    this.showKnob(this.axis);

    listen(document, 'pointerdown', (event) => {
      if (this.suspended || this.pointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
      if (this.excluded(event.target)) return;
      if (!inStickZone(event.clientX, document.documentElement.clientWidth || window.innerWidth)) return;
      this.measure();
      this.pointer = event.pointerId;
      this.target.x = event.clientX;
      this.target.y = event.clientY;
      this.lastTime = 0;
      event.preventDefault();
      try { this.capture.setPointerCapture(event.pointerId); } catch {}
    });
    listen(document, 'pointermove', (event) => {
      if (event.pointerId !== this.pointer) return;
      // 한 프레임에 몰려 들어온 이벤트 중 마지막 위치를 바로 쓴다.
      const events = event.getCoalescedEvents?.();
      const last = events?.length ? events[events.length - 1] : event;
      this.target.x = last.clientX;
      this.target.y = last.clientY;
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      listen(document, type, (event) => {
        if (event.pointerId === this.pointer) this.release();
      });
    }
    // 길게 눌러 생기는 메뉴가 스틱을 끊지 않게 한다.
    listen(document, 'contextmenu', (event) => {
      if (this.pointer !== null) event.preventDefault();
    });
    const codes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];
    listen(window, 'keydown', (event) => {
      if (this.suspended || !codes.includes(event.code) || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      this.keys.add(event.code);
    });
    listen(window, 'keyup', (event) => this.keys.delete(event.code));
    const clear = () => {
      this.release();
      this.keys.clear();
    };
    listen(window, 'blur', clear);
    listen(document, 'visibilitychange', clear);
    listen(window, 'resize', () => {
      clear();
      this.measure();
    });
  }

  excluded(target) {
    const { exclude } = this;
    if (typeof exclude === 'function') return Boolean(exclude(target));
    return Boolean(exclude && target?.closest?.(exclude));
  }

  // 패드의 실제 화면 위치에서 중심·반지름을 읽는다. CSS가 아직 패드를 배치하지 못했으면(크기 0) 아레나 왼쪽 아래를 쓴다.
  measure() {
    this.measuredAt = performance.now();
    const rect = this.pad.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.center.x = rect.left + rect.width / 2;
      this.center.y = rect.top + rect.height / 2;
      this.radius = Math.min(rect.width, rect.height) / 2;
    } else {
      const area = this.arena?.getBoundingClientRect() ?? { left: 0, bottom: window.innerHeight };
      this.radius = CONFIG.input.joystickRadius;
      this.center.x = area.left + 16 + this.radius;
      this.center.y = area.bottom - 16 - this.radius;
    }
    const knob = this.knob?.getBoundingClientRect();
    this.travel = Math.max(0, this.radius - (knob?.width ?? 0) / 2);
    this.limits = padLimits(this.radius);
  }

  // 손잡이는 방향 벡터 × 이동 가능 거리만큼 움직인다(패드 가장자리 = 최대 속도).
  showKnob(vector) {
    if (!this.knob) return;
    const key = Math.round(vector.x * this.travel) + ',' + Math.round(vector.y * this.travel);
    if (key === this.knobKey) return;
    this.knobKey = key;
    this.knob.style.transform = key === '0,0' ? '' : 'translate(' + vector.x * this.travel + 'px,' + vector.y * this.travel + 'px)';
  }

  // 반환값 크기는 0~1이다. 방향은 패드 중심에서 손가락까지이며 캐릭터 위치와 무관하다.
  direction() {
    if (this.pointer !== null) {
      if (performance.now() - this.measuredAt > GEOMETRY_REFRESH_MS) this.measure();
      padVector(this.target, this.center, this.limits, this.want);
      const now = performance.now();
      const elapsed = this.lastTime ? now - this.lastTime : null;
      this.lastTime = now;
      smoothAxis(this.axis, this.want, elapsed, CONFIG.input.responseMs, this.axis);
    } else {
      keyVector(this.keys, this.axis);
    }
    this.showKnob(this.axis);
    return this.axis;
  }

  // 멈춤(선택지 카드)·결과 창에서는 새 입력을 받지 않고, 잡고 있던 손가락도 놓는다.
  suspend() {
    this.suspended = true;
    this.release();
    this.keys.clear();
  }

  resume() {
    this.suspended = false;
  }

  release() {
    const id = this.pointer;
    this.pointer = null;
    if (id !== null && this.capture.hasPointerCapture?.(id)) this.capture.releasePointerCapture(id);
    this.axis.x = 0;
    this.axis.y = 0;
    this.showKnob(this.axis);
  }

  destroy() {
    this.events.abort();
    this.release();
    for (const [node, previous] of this.touchAction) node.style.touchAction = previous;
    this.pad.hidden = true;
  }
}
