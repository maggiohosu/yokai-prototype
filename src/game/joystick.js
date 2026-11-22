import { CONFIG } from '../config.js';

// 포인터 위치는 CSS 픽셀이다. 카메라 줌과 캔버스 배율이 조작 거리에 영향을 주지 않는다.
export class Joystick {
  constructor(surface) {
    this.surface = surface;
    this.pad = document.querySelector('#joystick');
    this.knob = this.pad.firstElementChild;
    this.keys = new Set();
    this.pointer = null;
    this.axis = { x: 0, y: 0 };
    this.events = new AbortController();
    const listen = (element, type, fn) => element.addEventListener(type, fn, { signal: this.events.signal });
    listen(surface, 'pointerdown', (event) => {
      const rect = surface.getBoundingClientRect();
      if (this.pointer !== null || event.button !== 0 || event.clientX >= rect.left + rect.width / 2) return;
      this.pointer = event.pointerId;
      this.origin = { x: event.clientX, y: event.clientY };
      surface.setPointerCapture(event.pointerId);
      Object.assign(this.pad.style, { left: this.origin.x + 'px', top: this.origin.y + 'px' });
      this.pad.hidden = false;
      this.drag(event);
    });
    listen(surface, 'pointermove', (event) => this.drag(event));
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      listen(surface, type, (event) => {
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
  drag(event) {
    if (event.pointerId !== this.pointer) return;
    const r = CONFIG.input.joystickRadius;
    const dx = (event.clientX - this.origin.x) / r,
      dy = (event.clientY - this.origin.y) / r;
    const length = Math.hypot(dx, dy),
      divisor = Math.max(1, length);
    this.axis.x = length < CONFIG.input.deadZone ? 0 : dx / divisor;
    this.axis.y = length < CONFIG.input.deadZone ? 0 : dy / divisor;
    this.knob.style.transform = 'translate(' + this.axis.x * r + 'px,' + this.axis.y * r + 'px)';
  }
  direction() {
    if (this.pointer !== null) return this.axis;
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
    if (id !== null && this.surface.hasPointerCapture(id)) this.surface.releasePointerCapture(id);
    this.axis.x = 0;
    this.axis.y = 0;
    this.pad.hidden = true;
  }
  destroy() {
    this.events.abort();
    this.release();
  }
}
