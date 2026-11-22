import { CONFIG } from '../config.js';

export const pixelRatio = () => Math.min(window.devicePixelRatio || 1, CONFIG.render.maxPixelRatio);

export function zoomFor(size, cssWidth) {
  const cam = CONFIG.camera;
  const base = cam.baseZoom * Math.min(1, cssWidth / cam.portraitWidth);
  return Math.max(cam.minZoom, base * (CONFIG.player.startSize / size) ** cam.exponent);
}

export function followPlayer(scene, player) {
  const cam = scene.cameras.main;
  cam.setBounds(0, 0, CONFIG.world.size, CONFIG.world.size);
  const target = () => pixelRatio() * zoomFor(player.size, cam.width / pixelRatio());
  cam.setZoom(target()).centerOn(player.x, player.y).startFollow(player.sprite);
  return (dt) => {
    const blend = 1 - Math.exp(-CONFIG.camera.smoothRate * dt);
    cam.setZoom(cam.zoom + (target() - cam.zoom) * blend);
  };
}
