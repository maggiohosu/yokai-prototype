import { CONFIG } from '../config.js';
import { gradeMultiplier } from '../systems/evolution.js';
import { treasureStats } from '../systems/treasure.js';
import { TREASURE } from '../systems/tuning-upgrade.js';

const tuning = CONFIG.combat;

// (x,y)에서 (hx,hy) 방향 부채꼴 안의 '나보다 큰' 가장 가까운 적.
function aimTarget(x, y, size, enemies, hx, hy) {
  const cone = Math.cos(tuning.aimHalfAngleDeg * Math.PI / 180);
  let nearest = null;
  let best = tuning.range ** 2;
  for (const enemy of enemies) {
    if (!enemy.sprite.active || enemy.size <= size) continue;
    const dx = enemy.x - x, dy = enemy.y - y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq > best || dx * hx + dy * hy < Math.sqrt(distanceSq) * cone) continue;
    nearest = enemy;
    best = distanceSq;
  }
  return nearest;
}

// 구슬이 한 프레임에 지나간 선분과 가장 먼저 닿는 충돌 원을 찾는다.
function firstHit(orb, travel, enemies) {
  let first = null;
  let nearest = travel;
  for (const enemy of enemies) {
    if (!enemy.sprite.active) continue;
    const dx = enemy.x - orb.x, dy = enemy.y - orb.y;
    const along = dx * orb.vx + dy * orb.vy;
    const across = dx * orb.vy - dy * orb.vx;
    const chordSq = (enemy.size + tuning.orbRadius) ** 2 - across * across;
    if (chordSq < 0) continue;
    const halfChord = Math.sqrt(chordSq);
    if (along + halfChord < 0) continue;
    const entry = Math.max(0, along - halfChord);
    if (entry <= nearest) {
      nearest = entry;
      first = enemy;
    }
  }
  return first;
}

export class Combat {
  constructor(scene, progress) {
    this.scene = scene;
    this.progress = progress;
    this.heading = { x: 1, y: 0 };
    this.engagements = new WeakMap();
    this.orbs = [];
    this.target = null;
    this.cooldown = 0;
    this.graphics = scene.add.graphics().setDepth(4);
  }

  engage(enemy) {
    if (!this.engagements.has(enemy)) {
      this.engagements.set(enemy, {
        preySize: enemy.size,
        myOriginalSizeAtEngage: this.scene.player.size,
      });
    }
    return this.engagements.get(enemy);
  }

  meal(enemy, killedByTreasure) {
    return { dir: enemy.dir, ...this.engage(enemy), killedByTreasure, special: !!enemy.special, stage: enemy.stage ?? 1, grade: enemy.grade };
  }

  stats() {
    const level = this.progress.treasure?.level;
    const valid = Number.isInteger(level) && level >= 0 && level <= TREASURE.success.length;
    return treasureStats(valid ? level : 0);
  }

  fire(stats = this.stats()) {
    const { damage, ways, perWay, speedMult, homing } = stats;
    const power = damage * (gradeMultiplier(this.progress.grade) ?? 1) * (this.scene.playerStats?.signature ?? 1);
    const { player } = this.scene;
    const base = Math.atan2(this.heading.y, this.heading.x);
    const speed = tuning.orbSpeed * speedMult;
    for (let w = 0; w < ways; w++) {
      const angle = base + w * 2 * Math.PI / ways;
      const vx = Math.cos(angle), vy = Math.sin(angle);
      for (let i = 0; i < perWay; i++) {
        if (this.orbs.length >= tuning.maxOrbs) break;
        const offset = (i - (perWay - 1) / 2) * tuning.shotSpacing;
        this.orbs.push({
          x: player.x - vy * offset, y: player.y + vx * offset,
          vx, vy, speed, homing, damage: power, rangeLeft: tuning.range,
        });
      }
    }
    this.cooldown = tuning.cooldown;
  }

  hit(enemy, damage) {
    const { player } = this.scene;
    this.engage(enemy);
    const remaining = enemy.size - damage;
    const reversal = enemy.size >= player.size && remaining < player.size;
    if (reversal) this.scene.fireButton.showReversal();
    this.scene.fx?.flash(enemy);
    if (reversal) this.scene.fx?.reversal(enemy);
    if (remaining <= tuning.defeatSize) {
      const meal = this.meal(enemy, true);
      this.scene.fx?.burst(enemy.x, enemy.y, 0x9deed3, 16, Math.max(0.8, enemy.size / 25));
      enemy.destroy();
      this.scene.events.emit('eat', meal);
    } else {
      enemy.setSize(remaining);
      if (reversal) enemy.fleeFrom(player);
    }
  }

  step(direction, dt, fireRequested) {
    const { player, enemies } = this.scene;
    const magnitude = Math.hypot(direction.x, direction.y);
    if (magnitude) {
      this.heading.x = direction.x / magnitude;
      this.heading.y = direction.y / magnitude;
    }
    const stats = this.stats();
    this.target = stats.homing > 0 ? aimTarget(player.x, player.y, player.size, enemies, this.heading.x, this.heading.y) : null;
    if (this.target) this.engage(this.target);
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (fireRequested && this.cooldown === 0) this.fire(stats);

    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const orb = this.orbs[i];
      if (orb.homing > 0) {
        const target = aimTarget(orb.x, orb.y, player.size, enemies, orb.vx, orb.vy);
        if (target) {
          const dx = target.x - orb.x, dy = target.y - orb.y;
          const cross = orb.vx * dy - orb.vy * dx;
          const dot = orb.vx * dx + orb.vy * dy;
          const want = Math.atan2(cross, dot);
          const limit = orb.homing * tuning.homingTurnRate * dt;
          const turn = Math.max(-limit, Math.min(limit, want));
          const cos = Math.cos(turn), sin = Math.sin(turn);
          const vx = orb.vx * cos - orb.vy * sin;
          orb.vy = orb.vx * sin + orb.vy * cos;
          orb.vx = vx;
        }
      }
      const travel = Math.min(orb.rangeLeft, orb.speed * dt);
      const hit = firstHit(orb, travel, enemies);
      if (hit) this.hit(hit, orb.damage);
      orb.rangeLeft -= travel;
      if (hit || orb.rangeLeft <= 0) {
        this.orbs.splice(i, 1);
      } else {
        orb.x += orb.vx * travel;
        orb.y += orb.vy * travel;
      }
    }
  }

  draw() {
    const g = this.graphics.clear();
    const target = this.target;
    if (this.stats().homing > 0 && target?.sprite.active && target.size > this.scene.player.size) {
      const radius = target.size + 5;
      g.lineStyle(4, 0x4e4835, 0.9).strokeCircle(target.x, target.y, radius);
      g.lineStyle(2, 0xffe693, 1).strokeCircle(target.x, target.y, radius);
      const tip = target.y - radius - 2;
      g.fillStyle(0xffdf78).fillTriangle(target.x, tip, target.x - 5, tip - 7, target.x + 5, tip - 7);
    }
    const r = tuning.orbRadius;
    for (const { x, y, vx, vy } of this.orbs) {
      g.lineStyle(r, 0x6bc6af, 0.65).lineBetween(x - vx * r * 3, y - vy * r * 3, x, y);
      g.fillStyle(0x245f5b).fillCircle(x, y, r + 1);
      g.fillStyle(0x9deed3).fillCircle(x, y, r);
      g.fillStyle(0xfffbe6).fillCircle(x - r * 0.25, y - r * 0.3, r * 0.45);
    }
  }
}
