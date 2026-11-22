// 모션 그래픽(Opus). 모든 연출은 이미 정해진 결과를 보여주기만 한다(원칙 5).
// 숨쉬기·기울기·먹기 팝·피격 번쩍임·떠오르는 글자·역전 폭발·고등급 오라.
import { CONFIG } from '../config.js';

const DIR_COLOR = { east: 0x58c8a4, west: 0xf3ead2, south: 0xff8a6b, north: 0x6f87a8 };
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Fx {
  constructor(scene) {
    this.scene = scene;
    this.t = 0;
    this.parts = [];
    this.texts = [];
    this.g = scene.add.graphics().setDepth(5);
    this.aura = scene.add.graphics().setDepth(1.5);
    this.m = CONFIG.motion;
  }

  // 숨쉬기(눌림·늘어남)와 이동 방향 기울기. punch는 먹었을 때 잠깐 커지는 배율.
  animateActor(actor, dt, vx = 0, vy = 0) {
    if (!actor.sprite.active) return;
    const m = this.m;
    actor.phase ??= Math.random() * Math.PI * 2;
    const speed = Math.hypot(vx, vy);
    const rate = m.breathRate * (1 + Math.min(speed / 200, 1.2));
    const s = REDUCED ? 0 : Math.sin(this.t * rate + actor.phase) * m.breathAmount;
    actor.punch = actor.punch ? Math.max(1, actor.punch - dt * m.punchDecay) : 1;
    const base = actor.baseScale ?? actor.sprite.scaleX;
    actor.sprite.setScale(base * (1 + s) * actor.punch, base * (1 - s) * actor.punch);
    const tilt = REDUCED ? 0 : Math.max(-m.maxTilt, Math.min(m.maxTilt, vx * m.tiltPerSpeed));
    actor.sprite.angle += (tilt - actor.sprite.angle) * Math.min(1, dt * 8);
    if (actor.flash > 0) {
      actor.flash -= dt;
      if (actor.flash <= 0) actor.sprite.clearTint();
    }
  }

  flash(actor) {
    if (!actor.sprite.active || !(this.m.flashSeconds > 0)) return;
    actor.flash = this.m.flashSeconds;
    actor.sprite.setTintFill(0xfffbe6);
  }

  burst(x, y, color, count, power = 1) {
    if (REDUCED) count = Math.ceil(count / 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (60 + Math.random() * 140) * power;
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.45 + Math.random() * 0.25, max: 0.7, r: (2 + Math.random() * 3) * Math.sqrt(power), color });
    }
    if (this.parts.length > this.m.maxParticles) this.parts.splice(0, this.parts.length - this.m.maxParticles);
  }

  eatPop(hunter, prey) {
    if (this.m.punchScale > 1 && this.m.punchDecay > 0) hunter.punch = this.m.punchScale;
    this.burst(prey.x, prey.y, DIR_COLOR[prey.dir] ?? 0xffffff, 10, Math.max(0.6, prey.size / 30));
  }

  floatText(x, y, text, color = '#fff6cf') {
    let t = this.texts.find(o => !o.alive);
    if (!t) {
      if (this.texts.length >= 8) t = this.texts.reduce((a, b) => (a.life < b.life ? a : b));
      else {
        const obj = this.scene.add.text(0, 0, '', { fontFamily: 'system-ui, sans-serif', fontStyle: 'bold', fontSize: '15px', color, stroke: '#2b3d33', strokeThickness: 4, resolution: 2 }).setOrigin(0.5).setDepth(6);
        t = { obj };
        this.texts.push(t);
      }
    }
    const zoom = this.scene.cameras.main.zoom || 1;
    t.obj.setText(text).setColor(color).setPosition(x, y).setAlpha(1).setScale(1 / zoom).setVisible(true);
    Object.assign(t, { alive: true, life: this.m.textSeconds, y0: y, zoom });
  }

  reversal(enemy) {
    this.burst(enemy.x, enemy.y, 0xffd45c, 22, 1.4);
    this.flash(enemy);
    if (!REDUCED) this.scene.cameras.main.shake(this.m.shakeMs, this.m.shakeIntensity);
  }

  update(dt, player, grade) {
    this.t += dt;
    const g = this.g.clear();
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 1 - dt * 3; p.vy *= 1 - dt * 3;
      const k = p.life / p.max;
      g.fillStyle(p.color, Math.min(1, k * 1.6)).fillCircle(p.x, p.y, p.r * (0.4 + k));
    }
    for (const t of this.texts) {
      if (!t.alive) continue;
      t.life -= dt;
      const k = Math.max(0, t.life / this.m.textSeconds);
      t.obj.setY(t.y0 - (1 - k) * 46 / t.zoom).setAlpha(Math.min(1, k * 2));
      if (t.life <= 0) { t.alive = false; t.obj.setVisible(false); }
    }
    // S·S+ 등급만 플레이어 둘레에 도는 오라(등급은 빛·테두리로만 표현)
    const a = this.aura.clear();
    const color = CONFIG.gradeGlow[grade];
    if (player?.sprite.active && (grade === 'S' || grade === 'S+') && color != null) {
      const r = player.size * 1.35;
      const spin = REDUCED ? 0 : this.t * (grade === 'S+' ? 1.6 : 1);
      a.lineStyle(3, color, 0.8);
      for (let i = 0; i < 6; i++) {
        const s0 = spin + (i * Math.PI) / 3;
        a.beginPath(); a.arc(player.x, player.y, r, s0, s0 + 0.55); a.strokePath();
      }
      if (grade === 'S+') {
        a.lineStyle(2, 0xffffff, 0.6);
        for (let i = 0; i < 4; i++) {
          const s0 = -spin * 1.4 + (i * Math.PI) / 2;
          a.beginPath(); a.arc(player.x, player.y, r * 1.12, s0, s0 + 0.4); a.strokePath();
        }
      }
    }
  }
}
