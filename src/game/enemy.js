import { CONFIG } from '../config.js';
import { FORMS } from '../data/forms.js';
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
  }
  eat(prey) {
    const wasSmall = this.size < CONFIG.enemy.stage3Size;
    super.eat(prey);
    if (wasSmall && this.size >= CONFIG.enemy.stage3Size) {
      this.formId = formFor(this.dir, this.size).id;
      this.sprite.setTexture(drawCreature(this.scene, this.formId));
    }
  }
  step(player, dt) {
    const ai = CONFIG.enemy;
    const dx = player.x - this.x,
      dy = player.y - this.y,
      distance = Math.hypot(dx, dy);
    let speed = 0;
    if (distance <= ai.detect) {
      if (this.size > player.size) speed = ai.chaseSpeed;
      else if (this.size < player.size) speed = -ai.fleeSpeed;
    }
    let vx, vy;
    if (speed && distance > 0) {
      vx = (dx / distance) * speed;
      vy = (dy / distance) * speed;
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
