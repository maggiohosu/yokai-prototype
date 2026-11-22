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
  // boostSec: dt 중 부스터로 가속한 시간(0~dt), boostMult: 그때의 배율. 적·발사체에는 영향이 없다.
  step(direction, dt, boostSec = 0, boostMult = 1) {
    const distance = this.stats.speed * (dt + boostSec * (boostMult - 1));
    this.move(direction.x * distance, direction.y * distance);
  }
  eat(prey) {
    this.setSize(Math.sqrt(this.size ** 2 + this.stats.areaGain * prey.size ** 2));
    this.eaten++;
    this.maxSize = Math.max(this.maxSize, this.size);
  }
}
