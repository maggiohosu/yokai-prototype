import { CONFIG } from '../config.js';

export const pixelRatio = () => Math.min(window.devicePixelRatio || 1, CONFIG.render.maxPixelRatio);

// 화면의 짧은 변을 기준으로 배율을 잡는다. 세로 화면은 짧은 변이 너비라 예전과 같고,
// 가로 화면은 높이가 기준이라 시야가 너무 좁아지지 않는다. cssHeight를 안 주면 너비만 본다(예전 호출).
export function zoomFor(size, cssWidth, cssHeight = Infinity) {
  const cam = CONFIG.camera;
  const shortSide = Math.min(cssWidth, cssHeight);
  const base = cam.baseZoom * Math.min(1, shortSide / cam.portraitWidth);
  return Math.max(cam.minZoom, base * (CONFIG.player.startSize / size) ** cam.exponent);
}

// 월드 좌표 → 화면(client) 좌표. 카메라 scroll·zoom, 캔버스 해상도/CSS 크기 비율(고해상도)을 반영한다.
export function worldToClient(scene, x, y) {
  const cam = scene.cameras.main;
  const canvas = scene.game.canvas;
  const rect = canvas.getBoundingClientRect();
  const zoom = cam.zoom || 1;
  const left = cam.scrollX + cam.width / 2 - cam.width / (2 * zoom);
  const top = cam.scrollY + cam.height / 2 - cam.height / (2 * zoom);
  const sx = rect.width / (canvas.width || rect.width || 1);
  const sy = rect.height / (canvas.height || rect.height || 1);
  return {
    x: rect.left + (cam.x + (x - left) * zoom) * sx,
    y: rect.top + (cam.y + (y - top) * zoom) * sy,
  };
}

export function followPlayer(scene, player) {
  const cam = scene.cameras.main;
  cam.setBounds(0, 0, CONFIG.world.size, CONFIG.world.size);
  const target = () => pixelRatio() * zoomFor(player.size, cam.width / pixelRatio(), cam.height / pixelRatio());
  cam.setZoom(target()).centerOn(player.x, player.y).startFollow(player.sprite);
  return (dt) => {
    const blend = 1 - Math.exp(-CONFIG.camera.smoothRate * dt);
    cam.setZoom(cam.zoom + (target() - cam.zoom) * blend);
  };
}
