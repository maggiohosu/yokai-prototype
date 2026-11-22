import { CONFIG } from '../config.js';
import { stageZoomMultiplier } from '../systems/balance.js';

export const pixelRatio = () => Math.min(window.devicePixelRatio || 1, CONFIG.render.maxPixelRatio);

// 화면의 짧은 변을 기준으로 배율을 잡는다. 세로 화면은 짧은 변이 너비라 예전과 같고,
// 가로 화면은 높이가 기준이라 시야가 너무 좁아지지 않는다. cssHeight를 안 주면 너비만 본다(예전 호출).
// stage를 주면 단계가 오를 때마다 시야가 더 넓어진다(balance.view.stageZoom: 나와 적이 함께 자라서 맵이 커진 것처럼 보인다).
// 물러서는 한계(minZoom)도 같은 비율로 낮추되, 화면의 긴 변이 월드보다 넓어지지 않는 선(월드 밖이 보이지 않게)까지만 간다.
export function zoomFor(size, cssWidth, cssHeight = Infinity, stage = 1) {
  const cam = CONFIG.camera;
  const shortSide = Math.min(cssWidth, cssHeight);
  const base = cam.baseZoom * Math.min(1, shortSide / cam.portraitWidth);
  const stageMult = stageZoomMultiplier(stage);
  const longSide = Number.isFinite(cssHeight) ? Math.max(cssWidth, cssHeight) : cssWidth;
  const floor = Math.max(cam.minZoom * stageMult, longSide / CONFIG.world.size);
  return Math.max(Math.min(cam.minZoom, floor), base * stageMult * ((cam.refSize ?? CONFIG.player.startSize) / size) ** cam.exponent);
}

export function followPlayer(scene, player) {
  const cam = scene.cameras.main;
  cam.setBounds(0, 0, CONFIG.world.size, CONFIG.world.size);
  const target = () => pixelRatio() * zoomFor(player.size, cam.width / pixelRatio(), cam.height / pixelRatio(), player.stage ?? 1);
  cam.setZoom(target()).centerOn(player.x, player.y).startFollow(player.sprite);
  return (dt) => {
    const blend = 1 - Math.exp(-CONFIG.camera.smoothRate * dt);
    cam.setZoom(cam.zoom + (target() - cam.zoom) * blend);
  };
}
