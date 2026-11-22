import { CONFIG } from './config.js';
import { pixelRatio } from './game/camera.js';

const gallery = new URLSearchParams(location.search).get('gallery') === '1';
const portrait = window.matchMedia('(orientation: portrait)');
const rotateGuide = document.getElementById('rotate-guide');
let fieldGame;
let sleptForRotation = false;

function syncOrientation() {
  if (portrait.matches) {
    if (!rotateGuide.open) rotateGuide.showModal();
    if (fieldGame?.loop.running) {
      fieldGame.loop.sleep();
      sleptForRotation = true;
    }
  } else {
    if (rotateGuide.open) rotateGuide.close();
    if (sleptForRotation) {
      fieldGame.loop.wake();
      sleptForRotation = false;
    }
  }
}

async function enterLandscape() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
  } catch { /* 전체 화면 없이도 방향 잠금을 지원하는 기기가 있다. */ }
  try {
    await screen.orientation?.lock?.('landscape');
  } catch { /* 수동으로 돌려도 같은 화면이 열린다. */ }
}

if (gallery) {
  document.body.classList.add('gallery-mode');
  document.title = '요괴 도감 · 요괴 키우기';
  document.getElementById('gallery').hidden = false;
  document.getElementById('arena').setAttribute('aria-hidden', 'true');
  document.getElementById('nav-text').textContent = '들판으로';
  document.getElementById('nav-link').href = './index.html';
} else {
  rotateGuide.addEventListener('cancel', event => event.preventDefault());
  // 회전 직후 정비창이 뒤늦게 열릴 때에도 회전 안내가 입력을 받는다.
  document.addEventListener('toggle', event => {
    if (event.newState === 'open' && event.target instanceof HTMLDialogElement &&
        event.target !== rotateGuide && rotateGuide.open) {
      rotateGuide.close();
      rotateGuide.showModal();
    }
  }, true);
  portrait.addEventListener('change', syncOrientation);
  syncOrientation();
  const firstTap = event => {
    if (!event.isPrimary || event.button !== 0 || event.target.closest('a')) return;
    document.removeEventListener('pointerup', firstTap, true);
    if (!event.target.closest('#rotate-start')) void enterLandscape();
  };
  document.addEventListener('pointerup', firstTap, true);
  document.getElementById('rotate-start').addEventListener('click', enterLandscape);
}

function updateDensity() {
  const ratio = pixelRatio();
  const host = document.getElementById('phaser-host');
  host.style.setProperty('--density', ratio);
  host.style.setProperty('--inverse-density', 1 / ratio);
}

async function start() {
  if (!window.Phaser) throw new Error('Phaser CDN');
  while (!gallery && portrait.matches) {
    await new Promise(resolve => portrait.addEventListener('change', resolve, { once: true }));
  }
  updateDensity();
  window.addEventListener('resize', updateDensity);
  const Scene = gallery
    ? (await import('./scenes/GalleryScene.js')).GalleryScene
    : (await import('./scenes/PlayScene.js')).PlayScene;
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'phaser-host',
    backgroundColor: '#dae4d7',
    scale: { mode: Phaser.Scale.RESIZE, autoRound: true },
    fps: { target: CONFIG.render.targetFps },
    render: { antialias: true, roundPixels: false },
    input: { keyboard: false, mouse: false, touch: false },
    audio: { noAudio: true },
    scene: [Scene],
  });
  if (!gallery) {
    fieldGame = game;
    game.events.once('postrender', syncOrientation);
  }
  // 확인용: 주소에 ?debug가 있을 때만 게임 객체를 노출한다.
  if (new URLSearchParams(location.search).has('debug')) window.__yokai = game;
}
start().catch((error) => {
  console.error(error);
  document.getElementById('loading').textContent = window.Phaser
    ? '들판을 열 수 없습니다. 페이지를 새로 고쳐 주세요.'
    : '게임 엔진을 불러올 수 없습니다. 인터넷 연결을 확인한 뒤 새로 고쳐 주세요.';
});
