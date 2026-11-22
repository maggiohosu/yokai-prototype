import { CONFIG } from '../config.js';
import { Actor } from './actor.js';

export class Player extends Actor {
  constructor(scene, formId = 'mimul', stats = {}) {
    const mid = CONFIG.world.size / 2;
    super(scene, mid, mid, CONFIG.player.startSize, formId);
    this.stats = { speed: CONFIG.player.speed, areaGain: CONFIG.eating.areaGain, ...stats };
    this.eaten = 0;
    this.maxSize = this.size;
    this.sprite.setDepth(2);
  }
  step(direction, dt) {
    const distance = this.stats.speed * dt;
    this.move(direction.x * distance, direction.y * distance);
  }
  eat(prey) {
    this.setSize(Math.sqrt(this.size ** 2 + this.stats.areaGain * prey.size ** 2));
    this.eaten++;
    this.maxSize = Math.max(this.maxSize, this.size);
  }
}
