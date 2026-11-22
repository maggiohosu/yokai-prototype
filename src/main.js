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
  // 두 손가락 확대·두 번 탭 확대 막기(iOS Safari는 user-scalable=no와 touch-action을 무시할 때가 있다).
  // 스크롤이 필요한 모달 안의 한 손가락 이동은 그대로 둔다.
  const block = (event) => event.preventDefault();
  document.addEventListener('gesturestart', block, { passive: false });
  document.addEventListener('gesturechange', block, { passive: false });
  document.addEventListener('touchmove', (event) => { if (event.touches.length > 1) event.preventDefault(); }, { passive: false });
  document.addEventListener('dblclick', block, { passive: false });
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

// 시작 화면(저장 칸 고르기). 고른 칸은 지금 슬롯으로 기억되고 PlayScene이 그 칸을 읽는다.
// ?gallery=1과 시험 주소(?debug, ?stress)는 건너뛴다.
const skipTitle = gallery || ['debug', 'stress'].some(key => new URLSearchParams(location.search).has(key));
function showTitle() {
  return import('./ui/TitleView.js').then(({ TitleView }) => new Promise(resolve => TitleView({ onStart: resolve })));
}

// Phaser 글자는 만들 때 한 번 그려지므로 글꼴이 오기 전에 만들면 대체 글꼴로 굳는다. 프리텐다드가 올 때까지 잠깐(최대 timeoutMs) 기다린다.
// 못 받아도(오프라인 등) 게임은 대체 글꼴로 그대로 시작한다.
function fontsReady() {
  const { load, loadText, timeoutMs } = CONFIG.font;
  const request = document.fonts?.load ? document.fonts.load(load, loadText).catch(() => {}) : Promise.resolve();
  return Promise.race([request, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}

async function start() {
  if (!window.Phaser) throw new Error('Phaser CDN');
  const fonts = fontsReady();
  // 시작 화면이 떠 있는 동안 장면 코드를 미리 불러온다.
  const sceneModule = gallery ? import('./scenes/GalleryScene.js') : import('./scenes/PlayScene.js');
  sceneModule.catch(() => {});
  if (!skipTitle) await showTitle();
  while (!gallery && portrait.matches) {
    await new Promise(resolve => portrait.addEventListener('change', resolve, { once: true }));
  }
  updateDensity();
  window.addEventListener('resize', updateDensity);
  const Scene = gallery ? (await sceneModule).GalleryScene : (await sceneModule).PlayScene;
  await fonts;
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
