import { pixelRatio } from '../game/camera.js';
import { stageOf } from '../systems/rules.js';
import { CONFIG } from '../config.js';

// 1~5개 점을 한 번만 굽는다. 크기는 0.25 CSS px 간격, 빈 이미지 자리는 다음 프레임에 재사용한다.
export class StageMarks {
  constructor(scene) {
    this.scene = scene;
    this.images = [];
    this.used = 0;
  }

  place(x, y, radius, unit, stage, color) {
    const cssRadius = Math.round(radius / unit * 4) / 4;
    const key = 'stage-mark-' + stage + '-' + color + '-' + cssRadius;
    const scene = this.scene;
    if (!scene.textures.exists(key)) {
      const r = cssRadius * 2;
      const spacing = 2 * r + 5;
      const width = Math.ceil((stage - 1) * spacing + 2 * r + 6);
      const height = Math.ceil(2 * r + 6);
      const g = scene.make.graphics({ add: false });
      paintDots(g, width / 2, height / 2, stage, r, spacing, 2.5, color);
      g.generateTexture(key, width, height).destroy();
    }
    let image = this.images[this.used];
    if (!image) this.images[this.used] = image = scene.add.image(x, y, key).setDepth(4.5);
    else if (image.texture.key !== key) image.setTexture(key);
    this.used++;
    image.setPosition(x, y);
    if (image.scaleX !== unit / 2) image.setScale(unit / 2);
    if (!image.visible) image.setVisible(true);
  }

  finish() {
    for (let i = this.used; i < this.images.length && this.images[i].visible; i++) this.images[i].setVisible(false);
    this.used = 0;
  }
}

export function drawStageMark(g, actor, playerStage, _t, cache, view = g.scene.cameras.main.worldView) {
  const camera = g.scene.cameras.main;
  const unit = pixelRatio() / camera.zoom; // 화면 1 CSS px에 해당하는 월드 거리
  const radius = Math.max(2.5 * unit, Math.min(4 * unit, actor.size * 0.12));
  const stage = stageOf(actor);
  const spacing = 2 * radius + 2.5 * unit;
  const halfSpan = ((stage - 1) * spacing) / 2;
  const y = actor.y - actor.size * CONFIG.render.stageMarkLift[stage] * (actor.punch || 1) - radius - 2 * unit;
  if (y + radius < view.top || y - radius > view.bottom ||
      actor.x + halfSpan + radius < view.left || actor.x - halfSpan - radius > view.right) return;

  const color = stage > playerStage ? 0xe88270 : stage < playerStage ? 0x91ca91 : 0xffedc5;
  if (cache) cache.place(actor.x, y, radius, unit, stage, color);
  else paintDots(g, actor.x, y, stage, radius, spacing, 1.25 * unit, color);
}

function paintDots(g, x, y, stage, radius, spacing, width, color) {
  const firstX = x - (stage - 1) * spacing / 2;
  g.lineStyle(width, 0x304537, 1);
  g.fillStyle(color, 1);
  for (let i = 0; i < stage; i++) {
    g.beginPath();
    g.arc(firstX + i * spacing, y, radius, 0, Math.PI * 2);
    g.closePath();
    g.fillPath();
    g.strokePath();
  }
}
