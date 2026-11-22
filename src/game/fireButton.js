import { CONFIG } from '../config.js';

const styles = `
  #arena { --fire-size: 76px; --fire-bottom: max(14px, env(safe-area-inset-bottom)); }
  #arena .mini { bottom: calc(var(--fire-bottom) + var(--fire-size) + 12px); }
  #arena .help { max-width: calc(100% - var(--fire-size) - 44px); }
  .fire-button {
    position: absolute; right: max(16px, env(safe-area-inset-right)); bottom: var(--fire-bottom);
    width: var(--fire-size); height: var(--fire-size); padding: 5px; border-radius: 50%;
    border: 2px solid #405b49; color: #fff9e3; touch-action: none; cursor: pointer;
    background: conic-gradient(#f2cc73 var(--charge, 100%), #526456 0);
    box-shadow: 0 3px 0 #38534266, 0 4px 12px #324a3b33;
  }
  .fire-button:focus-visible { outline: 3px solid white; outline-offset: 2px; }
  .fire-button:active { transform: translateY(1px); }
  .fire-button > span {
    display: grid; align-content: center; justify-items: center; gap: 3px;
    width: 100%; height: 100%; border-radius: 50%; background: #315b50;
    font: 700 13px/1 system-ui, sans-serif;
  }
  .fire-button > span::before {
    content: ''; width: 23px; height: 23px; border-radius: 50%;
    background: radial-gradient(circle at 35% 27%, #fffced 7%, #bcefd6 22%, #7bc8ad 52%, #407b6b 90%);
  }
  .reversal-notice {
    position: absolute; left: 0; right: 0; top: 32%; text-align: center;
    pointer-events: none; color: #ffe393; font: 900 clamp(36px, 7vw, 54px)/1.1 var(--serif);
    -webkit-text-stroke: 4px #4c412e; paint-order: stroke fill; text-shadow: 0 3px 2px #544932;
  }
  @media (pointer: coarse), (max-width: 600px) {
    #arena .keys { display: none; }
    #arena .touch-help { display: block; }
  }
`;

export class FireButton {
  constructor(surface, onFire) {
    this.style = document.createElement('style');
    this.style.textContent = styles;
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
    this.notice.textContent = '역전!';
    surface.append(this.style, this.notice, this.button);

    this.keyHelp = document.createElement('span');
    this.keyHelp.textContent = '· 스페이스 발사';
    surface.querySelector('.keys').append(this.keyHelp);
    this.touchHelp = surface.querySelector('.touch-help');
    this.previousHelp = this.touchHelp.textContent;
    this.touchHelp.textContent = '화면을 눌러 그 방향으로 이동 · 오른쪽 버튼 발사';

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
    this.animation = this.notice.animate([
      { opacity: 1, transform: 'translateY(4px) scale(0.92)' },
      { opacity: 1, transform: 'translateY(0) scale(1)', offset: 0.2 },
      { opacity: 1, offset: 0.65 },
      { opacity: 0, transform: 'translateY(-10px)' },
    ], CONFIG.combat.reversalNoticeMs);
    this.animation.onfinish = () => { this.notice.hidden = true; };
  }

  destroy() {
    this.events.abort();
    this.animation?.cancel();
    this.style.remove();
    this.button.remove();
    this.notice.remove();
    this.keyHelp.remove();
    this.touchHelp.textContent = this.previousHelp;
  }
}
