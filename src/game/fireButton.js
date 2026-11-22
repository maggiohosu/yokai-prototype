import { CONFIG } from '../config.js';

export class FireButton {
  constructor(surface, onFire) {
    this.button = document.createElement('button');
    this.button.className = 'fire-button';
    this.button.type = 'button';
    this.button.setAttribute('aria-label', '여의주 발사');
    this.button.setAttribute('aria-keyshortcuts', 'Space');
    const face = document.createElement('span');
    face.textContent = '발사';
    this.button.append(face);
    this.notice = document.createElement('div');
    this.notice.className = 'reversal-notice';
    this.notice.hidden = true;
    this.notice.textContent = '역전';
    surface.append(this.notice, this.button);

    this.events = new AbortController();
    const options = { signal: this.events.signal };
    this.button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      event.preventDefault();
      onFire();
    }, options);
    // 키보드 Enter나 보조 기술이 만드는 click은 pointerdown이 없다.
    this.button.addEventListener('click', (event) => {
      if (event.detail === 0) onFire();
    }, options);
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'Space' || event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
      if (event.target !== this.button && event.target.closest?.('input, textarea, select, button, a, [contenteditable]')) return;
      event.preventDefault();
      if (!event.repeat) onFire();
    }, options);
  }

  update(readyFraction) {
    const percent = Math.floor(readyFraction * 100);
    if (this.percent === percent) return;
    this.percent = percent;
    this.button.style.setProperty('--charge', percent + '%');
    this.button.setAttribute('aria-disabled', String(percent < 100));
  }

  showReversal() {
    this.animation?.cancel();
    this.notice.hidden = false;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const frames = reduced ? [{ opacity: 1 }, { opacity: 1 }] : [
      { opacity: 1, offset: 0.7 },
      { opacity: 0 },
    ];
    this.animation = this.notice.animate(frames, CONFIG.combat.reversalNoticeMs);
    this.animation.onfinish = () => { this.notice.hidden = true; };
  }

  destroy() {
    this.events.abort();
    this.animation?.cancel();
    this.button.remove();
    this.notice.remove();
  }
}
