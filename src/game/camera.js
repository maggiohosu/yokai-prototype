import { CONFIG } from '../config.js';

export const pixelRatio = () => Math.min(window.devicePixelRatio || 1, CONFIG.render.maxPixelRatio);

// 화면의 짧은 변을 기준으로 배율을 잡는다. 세로 화면은 짧은 변이 너비라 예전과 같고,
// 가로 화면은 높이가 기준이라 시야가 너무 좁아지지 않는다. cssHeight를 안 주면 너비만 본다(예전 호출).
export function zoomFor(size, cssWidth, cssHeight = Infinity) {
  const cam = CONFIG.camera;
  const shortSide = Math.min(cssWidth, cssHeight);
  const base = cam.baseZoom * Math.min(1, shortSide / cam.portraitWidth);
  return Math.max(cam.minZoom, base * ((cam.refSize ?? CONFIG.player.startSize) / size) ** cam.exponent);
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