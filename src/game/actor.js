import { CONFIG } from '../config.js';
import { artUnitsFor, drawCreature } from '../art/creature.js';
import { FORM_BY_ID } from '../data/forms.js';
import { clamp } from './world.js';
import { eatPair } from '../systems/rules.js';

export class Actor {
  constructor(scene, x, y, size, formId, drawOpts) {
    this.scene = scene;
    this.sprite = scene.add.image(x, y, drawCreature(scene, formId, drawOpts)).setOrigin(0.5, 0.52);
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
    const width = size * artUnitsFor(FORM_BY_ID[this.formId]?.stage) / CONFIG.render.bodyRadius;
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

// 기존 호출 호환: 먹기 판정은 rules.eatPair가 맡는다(단계 규칙 포함). ratio가 1 이하면 역전 상태로 본다.
export function eatingPair(a, b, ratio = CONFIG.eating.ratio) {
  return eatPair(a, b, { reversed: ratio <= 1 });
}
