import { CONFIG } from '../config.js';
import { Actor } from './actor.js';
import { growthGain, sizeSpeedMultiplier } from '../systems/balance.js';

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
  // 크기가 클수록 느리다(balance.sizeSpeedMultiplier: 사용자 지시 2026-11-23).
  step(direction, dt, boostSec = 0, boostMult = 1) {
    const distance = this.stats.speed * sizeSpeedMultiplier(this.size) * (dt + boostSec * (boostMult - 1));
    this.move(direction.x * distance, direction.y * distance);
  }
  // 먹으면 면적이 늘되, 클수록 같은 먹이로 덜 자란다(balance.growthGain: refSize 이상에서 둔화).
  eat(prey) {
    this.setSize(growthGain(this.size, prey.size, this.stats.areaGain));
    this.eaten++;
    this.maxSize = Math.max(this.maxSize, this.size);
  }
}
