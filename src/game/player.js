import { CONFIG } from '../config.js';
import { Actor } from './actor.js';

export class Player extends Actor {
  constructor(scene) {
    const mid = CONFIG.world.size / 2;
    super(scene, mid, mid, CONFIG.player.startSize, 'mimul');
    this.eaten = 0;
    this.maxSize = this.size;
    this.sprite.setDepth(2);
  }
  step(direction, dt) {
    const distance = CONFIG.player.speed * dt;
    this.move(direction.x * distance, direction.y * distance);
  }
  eat(prey) {
    super.eat(prey);
    this.eaten++;
    this.maxSize = Math.max(this.maxSize, this.size);
  }
}
