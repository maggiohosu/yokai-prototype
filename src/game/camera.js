import { CONFIG } from '../config.js';
import { stageZoomMultiplier } from '../systems/balance.js';

export const pixelRatio = () => Math.min(window.devicePixelRatio || 1, CONFIG.render.maxPixelRatio);

// 이 게임의 회전 없는 주 카메라. Phaser의 worldView는 렌더 직전에 갱신되므로
// 첫 update와 resize 직후에는 현재 스크롤·화면 크기·줌으로 시야를 구한다.
export function cameraView(camera, out = {}) {
  const { width, height, scrollX, scrollY, zoom } = camera;
  if (!Number.isFinite(scrollX) || !Number.isFinite(scrollY)) return camera.worldView;
  out.width = width / zoom;
  out.height = height / zoom;
  out.centerX = scrollX + width * 0.5;
  out.centerY = scrollY + height * 0.5;
  out.left = out.centerX - out.width * 0.5;
  out.right = out.left + out.width;
  out.top = out.centerY - out.height * 0.5;
  out.bottom = out.top + out.height;
  return out;
}

// 화면의 짧은 변을 기준으로 배율을 잡는다. 세로 화면은 짧은 변이 너비라 예전과 같고,
// 가로 화면은 높이가 기준이라 시야가 너무 좁아지지 않는다. cssHeight를 안 주면 너비만 본다(예전 호출).
// stage를 주면 balance.view.stageZoom[단계]를 곱한다. 지금은 모두 1이라 어느 단계든 시작 크기의 화면은 같다(진화한 뒤의 화면은 처음 시작 화면과 같다).
// 1보다 작게 두면 그 단계에서 시야가 넓어지고, 물러서는 한계(minZoom)도 같은 비율로 낮추되 화면의 긴 변이 월드보다 넓어지지 않는 선까지만 간다.
export function zoomFloor(cssWidth, cssHeight = Infinity, stage = 1) {
  const cam = CONFIG.camera;
  const longSide = Number.isFinite(cssHeight) ? Math.max(cssWidth, cssHeight) : cssWidth;
  return Math.max(cam.minZoom * stageZoomMultiplier(stage), longSide / CONFIG.world.size);
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
  // 판 안 진화 연출: 진화하는 순간 카메라가 직전 배율 × evolveZoom까지 물러서고(cap) evolveHoldSec 동안 머문 뒤 자연 배율(= 시작 화면)로 돌아온다.
  // cap은 시간이 지나면 풀리므로 연출이 끝난 뒤의 화면은 크기·단계가 정하는 평소 화면이다.
  let cap = Infinity;
  let capUntil = 0;
  let slowUntil = 0;
  const target = () => {
    const z = natural();
    if (scene.time.now >= capUntil) return z;
    // 연출 중 화면을 회전·확대하면 이전 화면에서 구한 cap도 새 월드 경계를 지킨다.
    const floor = pixelRatio() * zoomFloor(...css(), player.stage ?? 1);
    return Math.max(floor, Math.min(z, cap));
  };
  cam.setZoom(target()).centerOn(player.x, player.y).startFollow(player.sprite);
  const update = (dt) => {
    const slow = scene.time.now < slowUntil;
    const rate = slow ? CONFIG.balance.view.expandSmoothRate : CONFIG.camera.smoothRate;
    const blend = 1 - Math.exp(-rate * dt);
    cam.setZoom(cam.zoom + (target() - cam.zoom) * blend);
  };
  update.recenter = ({ width, height }) => {
    cam.setSize(width, height);
    cam.setZoom(target()).centerOn(player.x, player.y);
  };
  // 월드 크기가 바뀐 뒤(진화로 맵이 커진 뒤)에 부른다: 카메라가 월드 밖으로 나가지 않게 경계를 다시 잡는다.
  update.rebound = () => cam.setBounds(0, 0, CONFIG.world.size, CONFIG.world.size);
  // 진화하는 순간(크기·단계가 바뀐 직후)에 부른다: 직전 배율 × factor까지 물러서고(월드 밖이 보이지 않는 한계까지만) evolveHoldSec 동안 머문 뒤 시작 화면 배율로 돌아온다.
  update.expand = (factor = CONFIG.balance.view.evolveZoom) => {
    const { evolveHoldSec, evolveExpandSec } = CONFIG.balance.view;
    const floor = pixelRatio() * zoomFloor(...css(), player.stage ?? 1);
    const now = scene.time.now;
    cap = Math.max(floor, cam.zoom * factor);
    capUntil = now + evolveHoldSec * 1000;
    slowUntil = now + evolveExpandSec * 1000;
  };
  return update;
}
