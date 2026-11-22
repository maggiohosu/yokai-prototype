import { CONFIG } from '../config.js';

const DEFAULT_EXCLUDE = '.fire-button, .hud, .mini, .help, button, a, input, select, textarea, [role="dialog"]';

// 화면 어디든 누르고 있으면 캐릭터의 화면 위치에서 손가락 쪽으로 이동한다.
// 좌표는 모두 client(CSS 픽셀)이다. 카메라 줌과 캔버스 배율은 worldToClient가 처리한다.
export class Joystick {
  constructor(arena, { exclude = DEFAULT_EXCLUDE } = {}) {
    this.surface = arena;
    this.exclude = exclude;
    this.pad = document.querySelector('#joystick');
    this.knob = this.pad.firstElementChild;
    this.keys = new Set();
    this.pointer = null;
    this.target = { x: 0, y: 0 };
    this.origin = { x: 0, y: 0 };
    this.axis = { x: 0, y: 0 };
    this.lastTime = 0;
    this.events = new AbortController();
    const listen = (element, type, fn) => element.addEventListener(type, fn, { signal: this.events.signal });
    listen(arena, 'pointerdown', (event) => {
      if (this.pointer !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
      if (this.excluded(event.target)) return;
      this.pointer = event.pointerId;
      this.origin.x = event.clientX;
      this.origin.y = event.clientY;
      this.target.x = event.clientX;
      this.target.y = event.clientY;
      this.lastTime = 0;
      try { arena.setPointerCapture(event.pointerId); } catch {}
      Object.assign(this.pad.style, { left: this.origin.x + 'px', top: this.origin.y + 'px' });
      this.knob.style.transform = '';
      this.pad.hidden = false;
    });
    listen(arena, 'pointermove', (event) => {
      if (event.pointerId !== this.pointer) return;
      // 한 프레임에 몰려 들어온 이벤트 중 마지막 위치를 바로 쓴다.
      const events = event.getCoalescedEvents?.();
      const last = events?.length ? events[events.length - 1] : event;
      this.target.x = last.clientX;
      this.target.y = last.clientY;
      this.moveKnob();
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      listen(arena, type, (event) => {
        if (event.pointerId === this.pointer) this.release();
      });
    }
    const codes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];
    listen(window, 'keydown', (event) => {
      if (!codes.includes(event.code) || event.ctrlKey || event.metaKey || event.altKey) return;
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
    listen(window, 'resize', clear);
    this.pad.style.setProperty('--radius', CONFIG.input.joystickRadius + 'px');
  }
  excluded(target) {
    const { exclude } = this;
    if (typeof exclude === 'function') return Boolean(exclude(target));
    return Boolean(exclude && target?.closest?.(exclude));
  }
  moveKnob() {
    const r = CONFIG.input.joystickRadius;
    const dx = this.target.x - this.origin.x,
      dy = this.target.y - this.origin.y;
    const scale = Math.min(1, r / (Math.hypot(dx, dy) || 1));
    this.knob.style.transform = 'translate(' + dx * scale + 'px,' + dy * scale + 'px)';
  }
  // playerClient: 캐릭터의 화면(client) 좌표. 반환값 크기는 0~1이다.
  direction(playerClient) {
    if (this.pointer !== null) {
      const { deadZonePx, fullSpeedPx, responseMs } = CONFIG.input;
      let x = 0,
        y = 0;
      if (playerClient) {
        const dx = this.target.x - playerClient.x,
          dy = this.target.y - playerClient.y;
        const length = Math.hypot(dx, dy);
        if (length > deadZonePx) {
          const power = Math.min(1, (length - deadZonePx) / Math.max(1, fullSpeedPx - deadZonePx));
          x = (dx / length) * power;
          y = (dy / length) * power;
        }
      }
      // 시간상수 responseMs(20ms)로만 섞어 사실상 즉시 따라가고 떨림만 막는다.
      const now = performance.now();
      const blend = this.lastTime ? 1 - Math.exp(-(now - this.lastTime) / Math.max(0.001, responseMs)) : 1;
      this.lastTime = now;
      this.axis.x += (x - this.axis.x) * blend;
      this.axis.y += (y - this.axis.y) * blend;
      return this.axis;
    }
    const held = (a, b) => Number(this.keys.has(a) || this.keys.has(b));
    const x = held('KeyD', 'ArrowRight') - held('KeyA', 'ArrowLeft');
    const y = held('KeyS', 'ArrowDown') - held('KeyW', 'ArrowUp');
    const scale = Math.max(1, Math.hypot(x, y));
    this.axis.x = x / scale;
    this.axis.y = y / scale;
    return this.axis;
  }
  release() {
    const id = this.pointer;
    this.pointer = null;
    if (id !== null && this.surface.hasPointerCapture?.(id)) this.surface.releasePointerCapture(id);
    this.axis.x = 0;
    this.axis.y = 0;
    this.pad.hidden = true;
  }
  destroy() {
    this.events.abort();
    this.release();
  }
}
