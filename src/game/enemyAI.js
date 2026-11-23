import { CONFIG } from '../config.js';
import { canEat, eatPair } from '../systems/rules.js';
import { ABILITY_RULES } from '../systems/tuning-abilities.js';
import { eatBlocked, inGrace, isAlly } from './status.js';

// 열·행 배열로 이웃을 직접 찾고, 채워진 칸만 생성 순서대로 순회한다.
const KEY_SPAN = 4096;
const OFFSET = 2048;

function keyOf(cx, cy) {
  return (cx + OFFSET) * KEY_SPAN + (cy + OFFSET);
}

export function isAlive(actor) {
  if (!actor || actor.dead) return false;
  return !(actor.sprite && actor.sprite.active === false);
}

function createGrid() {
  return {
    columns: [], pool: [], mealBuckets: [], used: 0, maxSize: 0,
    // 기존 디버그·검사 호출자가 요청할 때만 좌표 키 Map을 만든다.
    get buckets() {
      const result = new Map();
      for (let i = 0; i < this.used; i++) {
        const bucket = this.pool[i];
        result.set(keyOf(bucket.cx, bucket.cy), bucket);
      }
      return result;
    },
  };
}

export function buildGrid(actors, cell, grid = createGrid()) {
  const { pool, columns } = grid;
  const previousUsed = grid.used;
  for (let i = 0; i < previousUsed; i++) {
    const bucket = pool[i];
    columns[bucket.cx][bucket.cy] = undefined;
  }
  grid.used = 0;
  grid.maxSize = 0;
  grid.cell = cell;
  for (const actor of actors) if (isAlive(actor)) insertGrid(grid, actor);
  let mealCount = 0;
  for (let i = 0; i < grid.used; i++) {
    const bucket = pool[i];
    if (bucket.length !== bucket.count) bucket.length = bucket.count;
    if (bucket.hasMeal) grid.mealBuckets[mealCount++] = bucket;
  }
  grid.mealBuckets.length = mealCount;
  for (let i = grid.used; i < previousUsed; i++) pool[i].length = 0;
  return grid;
}

export function insertGrid(grid, actor) {
  const cx = Math.floor(actor.x / grid.cell), cy = Math.floor(actor.y / grid.cell);
  const column = grid.columns[cx] ?? (grid.columns[cx] = []);
  let bucket = column[cy];
  if (!bucket) {
    const i = grid.used++;
    bucket = grid.pool[i] ?? (grid.pool[i] = []);
    bucket.cx = cx;
    bucket.cy = cy;
    bucket.count = 0;
    bucket.hasMeal = false;
    column[cy] = bucket;
  }
  bucket[bucket.count++] = actor;
  if (actor.mealPossible) bucket.hasMeal = true;
  if (actor.size > grid.maxSize) grid.maxSize = actor.size;
}

// 중심이 (x, y)에서 반경 r 안에 있는 액터. out을 넘기면 배열을 재사용한다.
export function queryGrid(grid, x, y, r, out = []) {
  out.length = 0;
  const { cell, columns } = grid;
  const r2 = r * r;
  const x0 = Math.floor((x - r) / cell), x1 = Math.floor((x + r) / cell);
  const y0 = Math.floor((y - r) / cell), y1 = Math.floor((y + r) / cell);
  for (let cx = x0; cx <= x1; cx++) {
    const column = columns[cx];
    if (!column) continue;
    for (let cy = y0; cy <= y1; cy++) {
      const bucket = column[cy];
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

function distSq(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function stillValid(enemy, intent, cfg) {
  const t = intent.target;
  if (intent.mode === 'wander') return true;
  if (!t || !isAlive(t)) return false;
  if (distSq(enemy, t) > (cfg.detect * 1.35) ** 2) return false;
  return intent.mode === 'flee' ? canEat(t, enemy) : canEat(enemy, t);
}

function choose(enemy, player, grid, cfg, now) {
  let threat = null, threatD = Infinity;
  let prey = null, preyScore = Infinity;
  const lure = ABILITY_RULES.mark.lureMult;
  const consider = (other, isPlayer) => {
    const d = distSq(enemy, other);
    if (canEat(other, enemy)) {
      if (d < threatD) { threat = other; threatD = d; }
    } else if (canEat(enemy, other)) {
      // 파사인(3단계 이상)이 찍힌 요괴는 다른 요괴의 먹잇감 점수가 낮아져 사냥당하기 쉽다.
      const weight = isPlayer ? cfg.playerBias : other.markLure && other.markUntil > now ? lure : 1;
      const score = d * weight * weight;
      if (score < preyScore) { prey = other; preyScore = score; }
    }
  };
  // 역전 중인 적은 플레이어를 사냥감으로도 위협으로도 보지 않는다(감지 거리 안에서는 pickIntent가 먼저 도망을 정한다).
  if (!enemy.reversed && player && isAlive(player) && distSq(enemy, player) <= cfg.detect ** 2) consider(player, true);
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
    const d = distSq(enemy, other);
    if (canEat(other, enemy)) {
      if (d < threatD) { threat = other; threatD = d; }
    } else if (canEat(enemy, other)) {
      if (d < preyD) { prey = other; preyD = d; }
    }
  }
  if (threat) return { mode: 'flee', target: threat };
  if (prey) return { mode: 'chase', target: prey };
  if (player && isAlive(player) && distSq(enemy, player) >= rule.leash ** 2) return { mode: 'follow', target: player };
  return { mode: 'wander', target: null };
}

function allyStillValid(enemy, intent, cfg) {
  const t = intent.target;
  if (intent.mode === 'wander') return true;
  if (!t || !isAlive(t)) return false;
  if (intent.mode === 'follow') return distSq(enemy, t) >= (ABILITY_RULES.charm.leash * 0.6) ** 2;
  if (distSq(enemy, t) > (cfg.detect * ABILITY_RULES.charm.senseMult * 1.35) ** 2) return false;
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
  if (enemy.reversed && player && isAlive(player) && distSq(enemy, player) <= cfg.detect ** 2) {
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
export function intentDirection(enemy, intent, out = {}) {
  if (!intent || intent.mode === 'wander' || !intent.target) return null;
  const dx = intent.target.x - enemy.x, dy = intent.target.y - enemy.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const s = intent.mode === 'flee' ? -1 : 1;
  out.x = d ? (s * dx) / d : 1;
  out.y = d ? (s * dy) / d : 0;
  return out;
}

// 프레임 처음에 각 적의 몸을 8단위 넓힌 사각형을 64단위 칸에 등록한다. 다른 적과
// 한 칸도 공유하지 않는 적은 두 몸이 이 경계 안에서 움직이는 동안 충돌할 수 없다.
export class MealBounds {
  constructor() {
    this.columns = [];
    this.usedColumns = [];
    this.usedRows = [];
    this.frame = 0;
    this.valid = false;
  }
  capture(actors) {
    for (let i = 0; i < this.usedRows.length; i++) this.usedColumns[i][this.usedRows[i]] = undefined;
    this.usedRows.length = this.usedColumns.length = 0;
    this.frame++;
    this.valid = false;
    for (const a of actors) {
      a.mealFrame = this.frame;
      a.mealX = a.x;
      a.mealY = a.y;
      a.mealRadius = a.size + 8;
      a.mealPossible = false;
      const x0 = Math.floor((a.x - a.mealRadius) / 64), x1 = Math.floor((a.x + a.mealRadius) / 64);
      const y0 = Math.floor((a.y - a.mealRadius) / 64), y1 = Math.floor((a.y + a.mealRadius) / 64);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 256) return;
      for (let x = x0; x <= x1; x++) {
        const column = this.columns[x] ?? (this.columns[x] = []);
        for (let y = y0; y <= y1; y++) {
          const first = column[y];
          if (first) first.mealPossible = a.mealPossible = true;
          else {
            column[y] = a;
            this.usedColumns.push(column);
            this.usedRows.push(y);
          }
        }
      }
    }
    this.valid = true;
  }
  contains(a) {
    const free = a.mealRadius - a.size;
    return a.mealFrame === this.frame && Math.abs(a.x - a.mealX) <= free && Math.abs(a.y - a.mealY) <= free;
  }
}

// 겹친 적의 먹기 쌍을 원래 격자 순서로 반환한다. 빙결·경직·위협 중인 사냥꾼은 먹지 못한다.
export function findMeals(grid, opts, now = null, meals = [], eaten = new Set(), boundsVerified = false) {
  meals.length = 0;
  eaten.clear();
  const { columns, cell, maxSize } = grid;
  const buckets = boundsVerified ? grid.mealBuckets : grid.pool;
  const count = boundsVerified ? buckets.length : grid.used;
  for (let index = 0; index < count; index++) {
    const bucket = buckets[index];
    for (const a of bucket) {
      if (boundsVerified && !a.mealPossible) continue;
      if (eaten.has(a)) continue;
      const x = a.x, y = a.y, reach = a.size + maxSize;
      const x0 = Math.floor((x - reach) / cell), x1 = Math.floor((x + reach) / cell);
      const y0 = Math.floor((y - reach) / cell), y1 = Math.floor((y + reach) / cell);
      search: for (let cx = x0; cx <= x1; cx++) {
        const column = columns[cx];
        if (!column) continue;
        for (let cy = y0; cy <= y1; cy++) {
          const neighbors = column[cy];
          if (!neighbors) continue;
          for (const b of neighbors) {
            if (b === a || eaten.has(b)) continue;
            const pair = eatPair(a, b, opts);
            if (!pair || (now !== null && eatBlocked(pair[0], now))) continue;
            eaten.add(pair[1]);
            meals.push(pair);
            if (pair[1] === a) break search;
          }
        }
      }
    }
  }
  return meals;
}
