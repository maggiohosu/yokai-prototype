import { CONFIG } from '../config.js';
import { canEat, eatPair } from '../systems/rules.js';
import { ABILITY_RULES } from '../systems/tuning-abilities.js';
import { eatBlocked, inGrace, isAlly } from './status.js';

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
const mealScratch = [];

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function stillValid(enemy, intent, cfg) {
  const t = intent.target;
  if (intent.mode === 'wander') return true;
  if (!t || !isAlive(t)) return false;
  if (dist(enemy, t) > cfg.detect * 1.35) return false;
  return intent.mode === 'flee' ? canEat(t, enemy) : canEat(enemy, t);
}

function choose(enemy, player, grid, cfg, now) {
  let threat = null, threatD = Infinity;
  let prey = null, preyScore = Infinity;
  const lure = ABILITY_RULES.mark.lureMult;
  const consider = (other, isPlayer) => {
    const d = dist(enemy, other);
    if (canEat(other, enemy)) {
      if (d < threatD) { threat = other; threatD = d; }
    } else if (canEat(enemy, other)) {
      // 파사인(3단계 이상)이 찍힌 요괴는 다른 요괴의 먹잇감 점수가 낮아져 사냥당하기 쉽다.
      const score = isPlayer ? d * cfg.playerBias : (other.markLure && other.markUntil > now ? d * lure : d);
      if (score < preyScore) { prey = other; preyScore = score; }
    }
  };
  // 역전 중인 적은 플레이어를 사냥감으로도 위협으로도 보지 않는다(감지 거리 안에서는 pickIntent가 먼저 도망을 정한다).
  if (!enemy.reversed && player && isAlive(player) && dist(enemy, player) <= cfg.detect) consider(player, true);
  const near = queryGrid(grid, enemy.x, enemy.y, cfg.detect, scratch);
  for (const other of near) if (other !== enemy) consider(other, false);
  if (threat) return { mode: 'flee', target: threat };
  if (prey) return { mode: 'chase', target: prey };
  return { mode: 'wander', target: null };
}

// 매혹된 아군(설계 4-4): 플레이어를 위협도 먹이도 아닌 것으로 본다. 감지 거리 × senseMult 안에서 자기가 먹을 수 있는 적을 쫓고,
// 자기를 먹을 수 있는 적에게서는 도망한다. 쫓을 것이 없고 플레이어와 leash 이상 떨어지면 플레이어 쪽으로 돌아온다(목줄).
// 다른 아군은 서로 먹지 않게 무시한다(풀린 직후 유예 중인 적은 평범한 요괴).
function chooseAlly(enemy, player, grid, cfg, now) {
  let threat = null, threatD = Infinity;
  let prey = null, preyD = Infinity;
  const rule = ABILITY_RULES.charm;
  const near = queryGrid(grid, enemy.x, enemy.y, cfg.detect * rule.senseMult, scratch);
  for (const other of near) {
    if (other === enemy || isAlly(other, now)) continue;
    const d = dist(enemy, other);
    if (canEat(other, enemy)) {
      if (d < threatD) { threat = other; threatD = d; }
    } else if (canEat(enemy, other)) {
      if (d < preyD) { prey = other; preyD = d; }
    }
  }
  if (threat) return { mode: 'flee', target: threat };
  if (prey) return { mode: 'chase', target: prey };
  if (player && isAlive(player) && dist(enemy, player) >= rule.leash) return { mode: 'follow', target: player };
  return { mode: 'wander', target: null };
}

function allyStillValid(enemy, intent, cfg) {
  const t = intent.target;
  if (intent.mode === 'wander') return true;
  if (!t || !isAlive(t)) return false;
  if (intent.mode === 'follow') return dist(enemy, t) >= ABILITY_RULES.charm.leash * 0.6;
  if (dist(enemy, t) > cfg.detect * ABILITY_RULES.charm.senseMult * 1.35) return false;
  return intent.mode === 'flee' ? canEat(t, enemy) : canEat(enemy, t);
}

// 반환: { mode: 'flee'|'chase'|'follow'|'wander', target }. dt는 표적 재선택 타이머를 줄이는 데 쓴다(기본 0).
// now(시뮬레이션 시각)를 주면 상태이상을 본다: 아군(매혹)·위협(겁먹음)·풀려난 직후 유예. 안 주면 상태이상은 없다.
export function pickIntent(enemy, player, grid, cfg = CONFIG.hunt, dt = 0, now = 0) {
  // 매혹된 아군: 플레이어를 사냥하지도 위협하지도 않고 다른 요괴를 사냥한다.
  if (enemy.charmUntil > now) {
    let intent = enemy.aiIntent;
    enemy.aiTimer = (enemy.aiTimer ?? 0) - dt;
    if (!intent || enemy.aiTimer <= 0 || !allyStillValid(enemy, intent, cfg)) {
      intent = chooseAlly(enemy, player, grid, cfg, now);
      enemy.aiIntent = intent;
      enemy.aiTimer = cfg.retargetSeconds * (0.8 + Math.random() * 0.4);
    }
    return intent;
  }
  // 위협(겁먹음)과 풀려난 직후 유예: 거리와 상관없이 플레이어에게서 도망한다. 끝나면 새로 고른다.
  if ((enemy.fearUntil > now || inGrace(enemy, now)) && player && isAlive(player)) {
    const intent = enemy.aiIntent?.mode === 'flee' && enemy.aiIntent.target === player && enemy.aiIntent.forced
      ? enemy.aiIntent
      : (enemy.aiIntent = { mode: 'flee', target: player, forced: true });
    enemy.aiTimer = 0;
    return intent;
  }
  // 역전 중인 적(enemy.reversed)은 시간이 지나도 풀리지 않고(먹기·진화·몸집 강화로만 풀린다) 플레이어를 쫓지 않는다.
  // 감지 거리 안에서는 플레이어에게서 도망하고, 밖에서는 플레이어를 빼고 평소처럼 움직인다.
  if (enemy.reversed && player && isAlive(player) && dist(enemy, player) <= cfg.detect) {
    enemy.aiIntent = { mode: 'flee', target: player };
    enemy.aiTimer = cfg.retargetSeconds;
    return enemy.aiIntent;
  }
  let intent = enemy.aiIntent;
  enemy.aiTimer = (enemy.aiTimer ?? 0) - dt;
  const chasingPlayerWhileReversed = enemy.reversed && intent?.mode === 'chase' && intent.target === player;
  if (!intent || intent.forced || intent.mode === 'follow' || chasingPlayerWhileReversed || enemy.aiTimer <= 0 || !stillValid(enemy, intent, cfg)) {
    const retarget = cfg.retargetSeconds * (0.8 + Math.random() * 0.4);
    intent = choose(enemy, player, grid, cfg, now);
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

// 적끼리 닿아서 먹히는 쌍 [먹는 쪽, 먹히는 쪽] 목록(rules.eatPair 규칙). 한 마리는 한 번만 먹힌다.
// now를 주면 빙결·경직·위협(겁먹음) 중인 사냥꾼은 아무것도 먹지 못한다(다른 적에게 먹히는 것은 그대로).
export function findMeals(grid, opts, now = null) {
  const meals = [];
  const eaten = new Set();
  for (const bucket of grid.buckets.values()) {
    for (const a of bucket) {
      if (eaten.has(a)) continue;
      const near = queryGrid(grid, a.x, a.y, a.size + grid.maxSize, mealScratch);
      for (const b of near) {
        if (b === a || eaten.has(b) || eaten.has(a)) continue;
        const pair = eatPair(a, b, opts);
        if (!pair) continue;
        if (now !== null && eatBlocked(pair[0], now)) continue;
        eaten.add(pair[1]);
        meals.push(pair);
      }
    }
  }
  return meals;
}
