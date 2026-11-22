import { CONFIG } from '../config.js';
import { drawCreature } from '../art/creature.js';
import { clamp } from './world.js';

export class Actor {
  constructor(scene, x, y, size, formId) {
    this.scene = scene;
    this.sprite = scene.add.image(x, y, drawCreature(scene, formId)).setOrigin(0.5, 0.52);
    this.formId = formId;
    this.setSize(size);
  }
  get x() {
    return this.sprite.x;
  }
  get y() {
    return this.sprite.y;
  }
  setSize(size) {
    this.size = size;
    const width = (size * CONFIG.render.artUnits) / CONFIG.render.bodyRadius;
    this.sprite.setDisplaySize(width, width);
    this.baseScale = this.sprite.scaleX;
    this.move(0, 0);
  }
  move(dx, dy) {
    const margin = Math.min(this.size, CONFIG.world.size / 2);
    this.sprite.x = clamp(this.x + dx, margin, CONFIG.world.size - margin);
    this.sprite.y = clamp(this.y + dy, margin, CONFIG.world.size - margin);
    if (dx !== 0) this.sprite.setFlipX(dx < 0);
  }
  eat(prey) {
    this.setSize(Math.sqrt(this.size ** 2 + CONFIG.eating.areaGain * prey.size ** 2));
  }
  destroy() {
    this.sprite.destroy();
  }
}

export function eatingPair(a, b, ratio = CONFIG.eating.ratio) {
  const larger = a.size >= b.size ? a : b;
  const smaller = larger === a ? b : a;
  if (larger.size / smaller.size < ratio) return null;
  const reach = a.size + b.size,
    dx = a.x - b.x,
    dy = a.y - b.y;
  return dx * dx + dy * dy < reach * reach ? [larger, smaller] : null;
}
