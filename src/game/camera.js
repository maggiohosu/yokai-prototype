import { CONFIG } from '../config.js';
import { stageZoomMultiplier } from '../systems/balance.js';

export const pixelRatio = () => Math.min(window.devicePixelRatio || 1, CONFIG.render.maxPixelRatio);

// 화면의 짧은 변을 기준으로 배율을 잡는다. 세로 화면은 짧은 변이 너비라 예전과 같고,
// 가로 화면은 높이가 기준이라 시야가 너무 좁아지지 않는다. cssHeight를 안 주면 너비만 본다(예전 호출).
// stage를 주면 단계가 오를 때마다 시야가 더 넓어진다(balance.view.stageZoom: 나와 적이 함께 자라서 맵이 커진 것처럼 보인다).
// 물러서는 한계(minZoom)도 같은 비율로 낮추되, 화면의 긴 변이 월드보다 넓어지지 않는 선(월드 밖이 보이지 않게)까지만 간다.
export function zoomFloor(cssWidth, cssHeight = Infinity, stage = 1) {
  const cam = CONFIG.camera;
  const longSide = Number.isFinite(cssHeight) ? Math.max(cssWidth, cssHeight) : cssWidth;
  const floor = Math.max(cam.minZoom * stageZoomMultiplier(stage), longSide / CONFIG.world.size);
  return Math.min(cam.minZoom, floor);
}

export function zoomFor(size, cssWidth, cssHeight = Infinity, stage = 1) {
  const cam = CONFIG.camera;
  const shortSide = Math.min(cssWidth, cssHeight);
  const base = cam.baseZoom * Math.min(1, shortSide / cam.portraitWidth);
  return Math.max(zoomFloor(cssWidth, cssHeight, stage), base * stageZoomMultiplier(stage) * ((cam.refSize ?? CONFIG.player.startSize) / size) ** cam.exponent);
}

export function followPlayer(scene, player) {
  const cam = scene.cameras.main;
  cam.setBounds(0, 0, CONFIG.world.size, CONFIG.world.size);
  const css = () => [cam.width / pixelRatio(), cam.height / pixelRatio()];
  const natural = () => pixelRatio() * zoomFor(player.size, ...css(), player.stage ?? 1);
  // 판 안 진화: 크기가 시작 크기로 돌아가도 카메라는 확대되지 않는다. cap(화면 배율 상한)은 자연 배율이 그 아래로 내려가면 풀린다.
  let cap = Infinity;
  let slowUntil = 0;
  const target = () => {
    const z = natural();
    if (z <= cap) cap = Infinity;
    return Math.min(z, cap);
  };
  cam.setZoom(target()).centerOn(player.x, player.y).startFollow(player.sprite);
  const update = (dt) => {
    const slow = scene.time.now < slowUntil;
    const rate = slow ? CONFIG.balance.view.expandSmoothRate : CONFIG.camera.smoothRate;
    const blend = 1 - Math.exp(-rate * dt);
    cam.setZoom(cam.zoom + (target() - cam.zoom) * blend);
  };
  // 월드 크기가 바뀐 뒤(진화로 맵이 커진 뒤)에 부른다: 카메라가 월드 밖으로 나가지 않게 경계를 다시 잡는다.
  update.rebound = () => cam.setBounds(0, 0, CONFIG.world.size, CONFIG.world.size);
  // 진화하는 순간(크기·단계가 바뀐 직후)에 부른다: 직전 배율 × factor까지 물러서고(월드 밖이 보이지 않는 한계까지만) 천천히 넓어진다.
  update.expand = (factor = CONFIG.balance.view.evolveZoom) => {
    const floor = pixelRatio() * zoomFloor(...css(), player.stage ?? 1);
    cap = Math.max(floor, cam.zoom * factor);
    slowUntil = scene.time.now + CONFIG.balance.view.evolveExpandSec * 1000;
  };
  return update;
}
