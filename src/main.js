import { CONFIG } from './config.js';
import { pixelRatio } from './game/camera.js';

const gallery = new URLSearchParams(location.search).get('gallery') === '1';
if (gallery) {
  document.body.classList.add('gallery-mode');
  document.title = '요괴 도감 · 요괴 키우기';
  document.getElementById('gallery').hidden = false;
  document.getElementById('arena').setAttribute('aria-hidden', 'true');
  document.getElementById('nav-text').textContent = '들판으로';
  document.getElementById('nav-link').href = './index.html';
}

function updateDensity() {
  const ratio = pixelRatio();
  const host = document.getElementById('phaser-host');
  host.style.setProperty('--density', ratio);
  host.style.setProperty('--inverse-density', 1 / ratio);
}

async function start() {
  if (!window.Phaser) throw new Error('Phaser CDN');
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
  // 확인용: 주소에 ?debug가 있을 때만 게임 객체를 노출한다.
  if (new URLSearchParams(location.search).has('debug')) window.__yokai = game;
}
start().catch((error) => {
  console.error(error);
  document.getElementById('loading').textContent = window.Phaser
    ? '들판을 열 수 없습니다. 페이지를 새로 고쳐 주세요.'
    : '게임 엔진을 불러올 수 없습니다. 인터넷 연결을 확인한 뒤 새로 고쳐 주세요.';
});
