import { CONFIG } from '../config.js';
import { Actor } from './actor.js';
import { carryDecay, evolveCarrySize, growthGain, sizeSpeedMultiplier } from '../systems/balance.js';

export class Player extends Actor {
  constructor(scene, formId = 'mimul', stats = {}) {
    const mid = CONFIG.world.size / 2;
    super(scene, mid, mid, CONFIG.player.startSize, formId);
    this.stats = { speed: CONFIG.player.speed, areaGain: CONFIG.eating.areaGain, ...stats };
    this.eaten = 0;
    this.carry = 0; // 진화 직후 이어 가는 속도 기준 크기(balance.evolveCarrySize). 시간이 지나며 0으로 돌아온다
    this.maxSize = this.size;
    this.sprite.setDepth(2);
  }
  // boostSec: dt 중 부스터로 가속한 시간(0~dt), boostMult: 그때의 배율. 적·발사체에는 영향이 없다.
  // 크기가 클수록 느리다(balance.sizeSpeedMultiplier: 사용자 지시 2026-11-23). 진화로 크기가 돌아간 직후에는 진화 직전 크기 기준으로 느리다가 서서히 빨라진다.
  step(direction, dt, boostSec = 0, boostMult = 1, hungerMult = 1) {
    if (this.carry > 0) this.carry = carryDecay(this.carry, dt);
    const distance = this.stats.speed * hungerMult * sizeSpeedMultiplier(Math.max(this.size, this.carry)) * (dt + boostSec * (boostMult - 1));
    this.move(direction.x * distance, direction.y * distance);
  }
  // 진화해서 크기가 시작 크기로 돌아가기 직전에 부른다: 속도는 그 크기 기준으로 이어 가다가 서서히 원래대로 돌아온다.
  carryOnEvolve(sizeBefore) {
    this.carry = Math.max(this.carry, evolveCarrySize(sizeBefore));
  }
  // 먹으면 면적이 늘되, 클수록 같은 먹이로 덜 자란다(balance.growthGain: refSize 이상에서 둔화).
  eat(prey) {
    this.setSize(growthGain(this.size, prey.size, this.stats.areaGain));
    this.eaten++;
    this.maxSize = Math.max(this.maxSize, this.size);
  }
}
