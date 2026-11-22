import { CONFIG } from '../config.js';
import { FORMS, FORM_BY_ID } from '../data/forms.js';
import { pickIntent, intentDirection } from './enemyAI.js';
import { rollSpecial } from './enemyFire.js';
import { drawCreature } from '../art/creature.js';
import { Actor } from './actor.js';
import { between } from './world.js';

function formFor(dir, size) {
  const stage = size < CONFIG.enemy.stage3Size ? 2 : 3;
  const pool = FORMS.filter((form) => form.dir === dir && form.stage === stage);
  return pool[Math.floor(Math.random() * pool.length)];
}

export class Enemy extends Actor {
  constructor(scene, pos, size, dir) {
    super(scene, pos.x, pos.y, size, formFor(dir, size).id);
    this.dir = dir;
    this.wanderTime = 0;
    this.vx = 0;
    this.vy = 0;
    this.reversed = false;
    this.fleeTime = 0;
    this.special = FORM_BY_ID[this.formId]?.stage === 3 && rollSpecial(size, 3);
  }
  fleeFrom(player) {
    this.reversed = true;
    this.fleeTime = CONFIG.combat.reversalFleeSeconds;
    const dx = this.x - player.x, dy = this.y - player.y;
    const distance = Math.hypot(dx, dy);
    this.vx = distance ? CONFIG.enemy.fleeSpeed * dx / distance : CONFIG.enemy.fleeSpeed;
    this.vy = distance ? CONFIG.enemy.fleeSpeed * dy / distance : 0;
  }
  eat(prey) {
    const wasSmall = this.size < CONFIG.enemy.stage3Size;
    super.eat(prey);
    if (wasSmall && this.size >= CONFIG.enemy.stage3Size) {
      this.formId = formFor(this.dir, this.size).id;
      this.sprite.setTexture(drawCreature(this.scene, this.formId));
      this.special = rollSpecial(this.size, 3);
    }
  }
  // 플레이어와 다른 적을 함께 보고: 나를 먹을 수 있는 상대에게서 도망, 내가 먹을 수 있는 상대를 추격, 아니면 배회.
  step(player, dt, grid) {
    const ai = CONFIG.enemy;
    if (this.size >= player.size) {
      this.reversed = false;
      this.fleeTime = 0;
    }
    const intent = grid ? pickIntent(this, player, grid, CONFIG.hunt, dt) : null;
    this.fleeTime = Math.max(0, this.fleeTime - dt);
    const dir = intentDirection(this, intent);
    let vx, vy;
    if (dir) {
      const speed = intent.mode === 'flee' ? ai.fleeSpeed : ai.chaseSpeed;
      vx = dir.x * speed;
      vy = dir.y * speed;
      this.wanderTime = 0;
    } else {
      this.wanderTime -= dt;
      if (this.wanderTime <= 0) {
        this.wanderAngle = Math.random() * Math.PI * 2;
        this.wanderTime = between(ai.wanderInterval);
      }
      vx = Math.cos(this.wanderAngle) * ai.wanderSpeed;
      vy = Math.sin(this.wanderAngle) * ai.wanderSpeed;
      const edge = this.size + ai.wallMargin,
        end = CONFIG.world.size - edge;
      if (this.x < edge) vx = Math.abs(vx);
      if (this.x > end) vx = -Math.abs(vx);
      if (this.y < edge) vy = Math.abs(vy);
      if (this.y > end) vy = -Math.abs(vy);
    }
    const blend = 1 - Math.exp(-ai.turnRate * dt);
    this.vx += (vx - this.vx) * blend;
    this.vy += (vy - this.vy) * blend;
    this.move(this.vx * dt, this.vy * dt);
  }
}
