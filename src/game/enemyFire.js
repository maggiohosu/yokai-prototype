import { CONFIG } from '../config.js';
import { FORM_BY_ID } from '../data/forms.js';
import { drawOrb } from '../art/orbs.js';
import { fireBlocked } from './status.js';

export function rollSpecial(size, stage, rng = Math.random) {
  return stage >= 3 && rng() < CONFIG.special.chance;
}

export function isFatal(playerSize) {
  return playerSize < CONFIG.special.deathSize;
}

// 선분 (ax,ay)-(bx,by)와 점 (px,py)의 최단 거리 제곱
function segDist2(ax, ay, bx, by, px, py) {
  const vx = bx - ax, vy = by - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2)) : 0;
  const dx = ax + vx * t - px, dy = ay + vy * t - py;
  return dx * dx + dy * dy;
}

export class EnemyFire {
  constructor(scene) {
    this.scene = scene;
    this.orbs = [];
    this.prev = null;
    this.vx = 0;
    this.vy = 0;
    this.dir = { x: 0, y: 0, vx: 1, vy: 0 }; // drawOrb에 넘기는 재사용 객체
  }
  // 특수 적(enemy.special === true)이 쏠 수 있으면 구슬을 만들고 true를 반환한다.
  // now(시뮬레이션 시각)를 주면 빙결·경직·매혹(아군) 중에는 쏘지 않는다(쿨타임도 줄지 않는다).
  tryFire(enemy, player, dt, now = 0) {
    const cfg = CONFIG.special;
    if (!enemy.special) return false;
    if (fireBlocked(enemy, now)) return false;
    if (enemy.fireCd === undefined) enemy.fireCd = cfg.cooldown * (0.3 + Math.random() * 0.7);
    enemy.fireCd -= dt;
    if (enemy.fireCd > 0) return false;
    const dx = player.x - enemy.x, dy = player.y - enemy.y;
    const d = Math.hypot(dx, dy);
    if (d > cfg.range) return false;
    if (this.orbs.length >= cfg.maxOrbs) return false;
    enemy.fireCd = cfg.cooldown;
    const t = d / cfg.orbSpeed;
    const tx = player.x + this.vx * t * cfg.leadAim - enemy.x;
    const ty = player.y + this.vy * t * cfg.leadAim - enemy.y;
    const m = Math.hypot(tx, ty) || 1;
    const ux = tx / m, uy = ty / m;
    // 사용자 결정(2026-11-23): 4·5단계 특수 적의 구슬은 그 적 줄기의 모양·색으로 그린다(효과는 지금 구슬과 같음).
    const stage = enemy.stage ?? 1;
    const stem = stage >= 4 ? FORM_BY_ID[enemy.formId]?.stem ?? null : null;
    this.orbs.push({
      x: enemy.x + ux * enemy.size, y: enemy.y + uy * enemy.size,
      vx: ux * cfg.orbSpeed, vy: uy * cfg.orbSpeed,
      life: (cfg.range * 1.5) / cfg.orbSpeed,
      ux, uy, style: stem, tier: stage,
    });
    return true;
  }
  // 플레이어를 맞힌 피해 목록 [{ damage, x, y }]. dt는 템포가 곱해진 시간.
  // shield({ block(ox, oy, nx, ny, r) })를 주면 호신주 진주가 막은 구슬은 사라진다.
  step(dt, player, shield = null) {
    const cfg = CONFIG.special;
    if (this.prev && dt > 0) {
      const k = Math.min(1, dt * 8);
      this.vx += ((player.x - this.prev.x) / dt - this.vx) * k;
      this.vy += ((player.y - this.prev.y) / dt - this.vy) * k;
    }
    this.prev = { x: player.x, y: player.y };
    const hits = [];
    const world = CONFIG.world.size;
    let w = 0;
    for (const o of this.orbs) {
      const ox = o.x, oy = o.y;
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.life -= dt;
      if (shield && shield.block(ox, oy, o.x, o.y, cfg.orbRadius)) continue;
      const reach = cfg.orbRadius + player.size;
      if (segDist2(ox, oy, o.x, o.y, player.x, player.y) < reach * reach) {
        hits.push({ damage: Math.max(cfg.minDamage, player.size * cfg.damageRatio), x: o.x, y: o.y });
        continue;
      }
      if (o.life <= 0 || o.x < 0 || o.y < 0 || o.x > world || o.y > world) continue;
      this.orbs[w++] = o;
    }
    this.orbs.length = w;
    return hits;
  }
  draw(g) {
    const cfg = CONFIG.special;
    const dir = this.dir;
    for (const o of this.orbs) {
      if (o.style) {
        // 줄기 모양 구슬: 플레이어 구슬과 헷갈리지 않게 특수 적 색 고리를 뒤에 깐다.
        dir.x = o.x;
        dir.y = o.y;
        dir.vx = o.ux;
        dir.vy = o.uy;
        g.lineStyle(2, cfg.orbColor, 0.85).strokeCircle(o.x, o.y, cfg.orbRadius * 1.9);
        drawOrb(g, dir, o.style, o.tier, cfg.orbRadius);
        continue;
      }
      const tx = o.x - o.vx * cfg.trailLength, ty = o.y - o.vy * cfg.trailLength;
      const mx = o.x - o.vx * cfg.trailLength * 0.5, my = o.y - o.vy * cfg.trailLength * 0.5;
      g.lineStyle(cfg.orbRadius * 1.1, cfg.trailColor, 0.35);
      g.lineBetween(tx, ty, mx, my);
      g.lineStyle(cfg.orbRadius * 1.5, cfg.trailColor, 0.6);
      g.lineBetween(mx, my, o.x, o.y);
      g.fillStyle(cfg.orbColor, 1);
      g.fillCircle(o.x, o.y, cfg.orbRadius);
      g.fillStyle(cfg.coreColor, 1);
      g.fillCircle(o.x, o.y, cfg.orbRadius * 0.45);
    }
  }
  // 구슬을 지운다. 플레이어 위치 기록(prev)과 속도 추정도 비운다: 진화로 맵이 커져 플레이어가 순간 이동하면 속도 추정이 튀어 앞질러 조준이 빗나간다.
  clear() {
    this.orbs.length = 0;
    this.prev = null;
    this.vx = 0;
    this.vy = 0;
  }
  destroy() {
    this.orbs.length = 0;
    this.prev = null;
    this.scene = null;
  }
}

// 특수 적 둘레의 돌아가는 붉은 점선 고리. t는 초 단위 시간.
export function drawSpecialMark(g, enemy, t) {
  const cfg = CONFIG.special;
  const r = enemy.size * cfg.ringPad + 4;
  const n = cfg.ringDashes, step = (Math.PI * 2) / n, spin = t * cfg.ringSpin;
  g.lineStyle(cfg.ringWidth, cfg.ringColor, 0.9);
  for (let i = 0; i < n; i++) {
    const a = spin + i * step;
    g.beginPath();
    g.arc(enemy.x, enemy.y, r, a, a + step * 0.55, false);
    g.strokePath();
  }
}
