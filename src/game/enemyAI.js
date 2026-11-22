import { CONFIG } from '../config.js';

// Phaser 의존 없는 순수 로직. 적 70~80마리 기준으로 가볍게 동작한다.
const KEY_SPAN = 4096;
const OFFSET = 2048;

function keyOf(cx, cy) {
  return (cx + OFFSET) * KEY_SPAN + (cy + OFFSET);
}

export function isAlive(actor) {
  if (!actor || actor.dead) return false;
  return !(actor.sprite && actor.sprite.active === false);
}

export function buildGrid(actors, cell) {
  const buckets = new Map();
  let maxSize = 0;
  for (const actor of actors) {
    if (!isAlive(actor)) continue;
    const key = keyOf(Math.floor(actor.x / cell), Math.floor(actor.y / cell));
    const bucket = buckets.get(key);
    if (bucket) bucket.push(actor);
    else buckets.set(key, [actor]);
    if (actor.size > maxSize) maxSize = actor.size;
  }
  return { cell, buckets, maxSize };
}

// 중심이 (x, y)에서 반경 r 안에 있는 액터. out을 넘기면 배열을 재사용한다.
export function queryGrid(grid, x, y, r, out = []) {
  out.length = 0;
  const { cell, buckets } = grid;
  const r2 = r * r;
  const x0 = Math.floor((x - r) / cell), x1 = Math.floor((x + r) / cell);
  const y0 = Math.floor((y - r) / cell), y1 = Math.floor((y + r) / cell);
  for (let cx = x0; cx <= x1; cx++) {
    for (let cy = y0; cy <= y1; cy++) {
      const bucket = buckets.get(keyOf(cx, cy));
      if (!bucket) continue;
      for (const actor of bucket) {
        const dx = actor.x - x, dy = actor.y - y;
        if (dx * dx + dy * dy <= r2) out.push(actor);
      }
    }
  }
  return out;
}

const scratch = [];

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function stillValid(enemy, intent, player, cfg, ratio) {
  const t = intent.target;
  if (intent.mode === 'wander') return true;
  if (!t || !isAlive(t)) return false;
  if (dist(enemy, t) > cfg.detect * 1.35) return false;
  if (intent.mode === 'flee') return t.size / enemy.size >= ratio;
  return enemy.size / t.size >= ratio;
}

function choose(enemy, player, grid, cfg, ratio) {
  let threat = null, threatD = Infinity;
  let prey = null, preyScore = Infinity;
  const consider = (other, isPlayer) => {
    const d = dist(enemy, other);
    if (other.size / enemy.size >= ratio) {
      if (d < threatD) { threat = other; threatD = d; }
    } else if (enemy.size / other.size >= ratio) {
      const score = isPlayer ? d * cfg.playerBias : d;
      if (score < preyScore) { prey = other; preyScore = score; }
    }
  };
  if (player && isAlive(player) && dist(enemy, player) <= cfg.detect) consider(player, true);
  const near = queryGrid(grid, enemy.x, enemy.y, cfg.detect, scratch);
  for (const other of near) if (other !== enemy) consider(other, false);
  if (threat) return { mode: 'flee', target: threat };
  if (prey) return { mode: 'chase', target: prey };
  return { mode: 'wander', target: null };
}

// 반환: { mode: 'flee'|'chase'|'wander', target }. dt는 표적 재선택 타이머를 줄이는 데 쓴다(기본 0).
export function pickIntent(enemy, player, grid, cfg = CONFIG.hunt, dt = 0) {
  const ratio = CONFIG.eating.ratio;
  if (enemy.reversed && enemy.fleeTime > 0 && player) {
    enemy.aiIntent = { mode: 'flee', target: player };
    enemy.aiTimer = cfg.retargetSeconds;
    return enemy.aiIntent;
  }
  let intent = enemy.aiIntent;
  enemy.aiTimer = (enemy.aiTimer ?? 0) - dt;
  if (!intent || enemy.aiTimer <= 0 || !stillValid(enemy, intent, player, cfg, ratio)) {
    const retarget = cfg.retargetSeconds * (0.8 + Math.random() * 0.4);
    intent = choose(enemy, player, grid, cfg, ratio);
    enemy.aiIntent = intent;
    enemy.aiTimer = retarget;
  }
  return intent;
}

// 의도에 따른 단위 이동 방향. wander면 null(기존 배회 로직 사용).
export function intentDirection(enemy, intent) {
  if (!intent || intent.mode === 'wander' || !intent.target) return null;
  const dx = intent.target.x - enemy.x, dy = intent.target.y - enemy.y;
  const d = Math.hypot(dx, dy);
  if (!d) return { x: 1, y: 0 };
  const s = intent.mode === 'flee' ? -1 : 1;
  return { x: (s * dx) / d, y: (s * dy) / d };
}

// 적끼리 닿아서 먹히는 쌍 [먹는 쪽, 먹히는 쪽] 목록. 한 마리는 한 번만 먹힌다.
export function findMeals(grid, ratio = CONFIG.eating.ratio) {
  const meals = [];
  const eaten = new Set();
  for (const bucket of grid.buckets.values()) {
    for (const a of bucket) {
      if (eaten.has(a)) continue;
      const near = queryGrid(grid, a.x, a.y, a.size + grid.maxSize);
      for (const b of near) {
        if (b === a || eaten.has(b) || eaten.has(a)) continue;
        const [big, small] = a.size >= b.size ? [a, b] : [b, a];
        if (big.size / small.size < ratio) continue;
        const dx = a.x - b.x, dy = a.y - b.y, reach = a.size + b.size;
        if (dx * dx + dy * dy < reach * reach) {
          eaten.add(small);
          meals.push([big, small]);
        }
      }
    }
  }
  return meals;
}
