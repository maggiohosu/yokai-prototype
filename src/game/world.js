import { CONFIG, REGIONS } from '../config.js';
import { artUnitsFor } from '../art/creature.js';
import { canEat } from '../systems/rules.js';
import { queryGrid } from './enemyAI.js';
import { worldFor } from '../systems/worldScale.js';
import { sizeWeightsFor, stageWeightsFor } from '../systems/difficulty.js';

const { world } = CONFIG;
const directions = Object.keys(REGIONS);
export const between = ([min, max]) => min + Math.random() * (max - min);
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function regionAt(x, y) {
  const dx = x - world.size / 2,
    dy = y - world.size / 2;
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'east' : 'west') : dy >= 0 ? 'south' : 'north';
}

// 구역별 생성 수가 적어도 주조색의 최소 비율을 만족시킨다.
export function colorPicker() {
  const counts = new Map(directions.map((dir) => [dir, { total: 0, local: 0 }]));
  return (region) => {
    const count = counts.get(region);
    count.total++;
    if (count.local < Math.ceil(count.total * world.regionShare[region])) {
      count.local++;
      return region;
    }
    const others = directions.filter((dir) => dir !== region);
    return others[Math.floor(Math.random() * others.length)];
  };
}

// 초반(시작 크기~earlyUntilSize)엔 큰 적 비중을 높이고 커질수록 기존 분포로 선형 전환한다.
// playerStage가 lateStage.fromStage 이상이면 큰 적의 비율이 높은 hardSizeWeights를 쓴다(3단계 이후 난이도).
// 전환 중인 분포에도 난이도별 크기 가중치를 한 번만 적용한다.
export function sizeWeights(playerSize, playerStage = 1, difficulty = 'normal', enemyStage = playerStage) {
  const { sizes, earlyWeights, earlyUntilSize, hardSizeWeights, lateStage } = CONFIG.enemy;
  const normal = playerStage >= lateStage.fromStage ? hardSizeWeights : sizes.map((band) => band.weight);
  const start = CONFIG.player.startSize;
  const t = clamp((playerSize - start) / Math.max(1e-6, earlyUntilSize - start), 0, 1);
  const base = normal.map((weight, i) => earlyWeights[i] * (1 - t) + weight * t);
  return sizeWeightsFor(base, difficulty, enemyStage === playerStage);
}

// 노말의 추첨 순서(크기 구간 → 구간 안 크기 → 단계)를 보존하고, 위치 재시도 때도 같은 크기 난수를 쓴다.
export function rollSpawnSize(rng = Math.random) {
  return { band: rng(), within: rng() };
}

export function spawnSize(playerSize, playerStage = 1, difficulty = 'normal', enemyStage = playerStage, roll = rollSpawnSize()) {
  const bands = CONFIG.enemy.sizes;
  const weights = sizeWeights(playerSize, playerStage, difficulty, enemyStage);
  let draw = roll.band * weights.reduce((a, b) => a + b, 0);
  let band = bands.at(-1);
  for (let i = 0; i < bands.length; i++) {
    const entry = bands[i];
    draw -= weights[i];
    if (draw < 0) {
      band = entry;
      break;
    }
  }
  const raw = playerSize * (band.min + roll.within * (band.max - band.min));
  // 3단계 이후에는 상한을 플레이어 크기에 맞춰 올려, 커져도 '나보다 큰 적'이 계속 나온다(절대 상한은 growthCap.maxSize).
  const cap = playerStage >= CONFIG.enemy.lateStage.fromStage
    ? Math.min(Math.max(CONFIG.enemy.maxSpawnSize, playerSize * band.max), CONFIG.enemy.growthCap.maxSize)
    : CONFIG.enemy.maxSpawnSize;
  return Math.min(cap, raw);
}

// 플레이어 단계(1~5)별 가중치(config.enemy.stageWeights)로 새 적의 단계(1~5)를 고른다.
export function spawnStage(playerStage = 1, rng = Math.random, difficulty = 'normal') {
  return drawStage(stageWeightsFor(playerStage, difficulty), rng);
}

// 판을 처음 시작할 때의 적 단계. 플레이어 1·2단계는 예전처럼 모두 1단계, 3단계부터는 config.enemy.startStageWeights로 높은 단계가 나온다.
export function startStage(playerStage = 1, rng = Math.random, difficulty = 'normal') {
  return drawStage(stageWeightsFor(playerStage, difficulty, CONFIG.enemy.startStageWeights), rng);
}

function drawStage(weights, rng) {
  if (!weights) return 1;
  let draw = rng() * weights.reduce((a, b) => a + b, 0);
  let last = 1;
  for (let i = 0; i < weights.length; i++) {
    if (weights[i] <= 0) continue;
    last = i + 1;
    draw -= weights[i];
    if (draw < 0) return last;
  }
  return last;
}

// 시작 안전 거리와 시작 고리: 맵이 좁으면(한 변 × safeStartShare가 safeStart보다 작으면) 같은 비율로 줄인다. 한 변 1273 이상에서는 그대로다.
export function startScale(size = world.size) {
  return Math.min(1, (size * world.safeStartShare) / world.safeStart);
}
export const safeStartFor = (size = world.size) => world.safeStart * startScale(size);

// 판을 처음 시작할 때 적을 모두 놓는다(모든 단계 같은 규칙, 사용자 지시 2026-11-23: 3단계 이후 적이 너무 몰려 있다 → 맵 전체에 고르게).
// 먼저 initialNeighbors마리를 플레이어 둘레에 놓고(첫 한 마리는 늘 가까이 있는 작은 먹이, 먹이는 안쪽 고리, 위협은 바깥 고리), 나머지는 맵 전체의 아무 곳에나 놓는다.
// 위협(나를 먹을 수 있는 적)은 안전 거리 안과, startView(시작 화면 사각형, 있으면) 안에 놓지 않는다(spawnPoint의 initial·keepOut): 큰 화면이 맵의 큰 비율을 덮는 좁은 맵에서도
// 시작하자마자 화면에 위협이 보이지 않는다. spawn(size, options)은 놓았으면 true를 돌려준다.
export function seedField({ player, spawn, difficulty = 'normal', rng = Math.random, population = world.population, startView = null }) {
  const playerStage = player.stage ?? 1;
  const k = startScale();
  const scaled = (ring) => [ring[0] * k, ring[1] * k];
  for (let i = 0; i < population; i++) {
    const roll = rollSpawnSize(rng);
    let stage = startStage(playerStage, rng, difficulty);
    let size = spawnSize(player.size, playerStage, difficulty, stage, roll);
    let near;
    if (i < world.initialNeighbors) {
      near = scaled(canEat({ size, stage }, player) ? world.outerRing : world.innerRing);
      if (i === 0) {
        stage = 1; // 첫 한 마리는 늘 가까이 있는 작은 먹이(1단계)다
        const small = CONFIG.enemy.sizes[0];
        size = player.size * (small.min + rng() * (small.max - small.min));
        near = [world.innerRing[0] * k, world.innerRing[0] * k];
      }
    }
    const options = { initial: true, stage, keepOut: startView };
    if (!spawn(size, { ...options, near })) spawn(size, options);
  }
}

// 대요괴·맞수가 나오는 고리: 안쪽 반지름을 화면 크기에 맞춘다(화면이 커도 고리가 화면에 가려 자리를 못 찾는 일이 없게). view = 카메라 worldView({ width, height }).
export function bossRingFor(view, { ring, pad } = CONFIG.enemy.bossRing) {
  const half = view && Number.isFinite(view.width) && Number.isFinite(view.height) ? Math.hypot(view.width, view.height) / 2 : 0;
  const inner = Math.max(ring[0], half + pad);
  return [inner, inner + (ring[1] - ring[0])];
}

// 판 안 진화로 3단계 이상이 될 때 이 적을 지울까: 맞수·같거나 높은 단계·가까운(keepRadius 안) 적은 지우지 않고,
// 멀리 흩어진 낮은 단계 적을 evolveCull 비율만큼 지운다. 빈자리는 보충이 stageWeights대로 채운다.
export function shouldCullOnEvolve(enemy, player, playerStage, rng = Math.random) {
  const cfg = CONFIG.enemy.lateStage;
  if (!(playerStage >= cfg.fromStage) || enemy.rival || (enemy.stage ?? 1) >= playerStage) return false;
  if (Math.hypot(enemy.x - player.x, enemy.y - player.y) < cfg.keepRadius) return false;
  return rng() < cfg.evolveCull;
}

// 맵이 커질 때(before → after 한 변) 옛 땅에 몰린 적 중 몇 마리를 새 땅으로 옮길까: 옛 땅이 새 맵에서 차지하는 면적 비율을 r이라 하면
// 적의 (1 - r)를 옮겨야 옛 땅과 새 땅의 밀도가 같아진다. 새 땅은 옛 땅을 한가운데에 둔 테두리다.
export function growMoveCount(count, before, after) {
  if (!(after > before) || !(count > 0)) return 0;
  return Math.round(count * (1 - (before / after) ** 2));
}

// stage를 넘기면 시작 직후 플레이어를 먹을 수 있는 적(단계 규칙 포함)을 멀리 둔다. 안 넘기면 크기만 본다.
const spawnHits = [];

// 후보 한 곳의 여유: 가장 가까운 적과의 거리에서 두 반지름과 간격(gap)을 뺀 값. 0 이상이면 간격을 지킨 자리, -gap 이상이면 몸이 겹치지 않는 자리다.
function clearanceAt(x, y, size, gap, nearEnemies) {
  let clear = Infinity;
  for (let i = 0; i < nearEnemies.length; i++) {
    const e = nearEnemies[i];
    const c = Math.hypot(x - e.x, y - e.y) - e.size - size - gap;
    if (c < clear) clear = c;
  }
  return clear;
}

// 스프라이트가 화면 가장자리에 걸치지 않게 하려면 중심이 화면에서 얼마나 떨어져야 하나: 여유(offscreenMargin) + 몸 지름 밖으로 나오는 원화 폭.
// 스프라이트의 세로 원점은 0.52이고 4·5단계 원화는 캔버스가 더 크다.
export function offscreenPad(size, stage) {
  return world.offscreenMargin + size * artUnitsFor(stage) / CONFIG.render.bodyRadius * 0.52;
}

// 새 적의 자리를 찾는다. 후보를 무작위로 뽑아(near가 있으면 플레이어 둘레 고리, 없으면 맵 전체) 다음을 모두 지키는 첫 자리를 돌려준다:
// 벽에서 edge 이상, region(있으면) 안, view(있으면) 밖, 플레이어에게서 안전 거리 이상(시작 때 위협은 keepOut 사각형 밖도), 다른 적과 간격(spawnGap) 이상.
// 자리가 모자라면 규칙을 이 순서로 줄인다(앞 단계에서 후보가 하나라도 있으면 뒤 단계로 가지 않는다):
//  ① 몸 전체가 화면 밖(pad)인 후보 중 간격을 지킨 첫 자리, 없으면 가장 덜 붐비는 후보(crowdedSpawn: 좁은 맵에 적 480마리라 간격을 못 지켜도 놓는다),
//  ② 화면 밖 여유를 절반으로 줄인 후보, ③ 중심만 화면 밖인 후보(화면이 맵의 큰 비율을 덮는 좁은 맵에서 큰 적이 화면 가장자리 바로 밖이라도 자리를 얻게).
// 벽·region·화면 안(중심)·플레이어 안전 거리는 끝까지 지킨다. 후보가 하나도 없으면 null이다(다음 보충 때 다시 시도한다).
const PAD_TIERS = [[1, 0.6], [0.5, 0.2], [0, 0.2]]; // [화면 밖 여유 배율, 후보 시도 비율]

export function spawnPoint(player, enemies, size, { view, near, initial, stage, grid, region, keepOut } = {}) {
  const gap = world.spawnGap;
  const edge = size + gap;
  const dangerous = stage == null ? size >= player.size * CONFIG.eating.ratio : canEat({ size, stage }, player);
  const padFull = view ? offscreenPad(size, stage) : 0;
  const safe = initial && dangerous ? safeStartFor() : edge + player.size;
  for (const [padScale, share] of PAD_TIERS) {
    const pad = padFull * padScale;
    let best = null, bestClear = -Infinity;
    for (let attempt = 0, n = Math.ceil(world.spawnAttempts * share); attempt < n; attempt++) {
      let x, y;
      if (near) {
        const angle = Math.random() * Math.PI * 2,
          radius = between(near);
        x = player.x + Math.cos(angle) * radius;
        y = player.y + Math.sin(angle) * radius;
      } else {
        x = between([edge, world.size - edge]);
        y = between([edge, world.size - edge]);
      }
      if (x < edge || x > world.size - edge || y < edge || y > world.size - edge) continue;
      if (region && !region(x, y)) continue;
      if (view) {
        if (x > view.left - pad && x < view.right + pad && y > view.top - pad && y < view.bottom + pad)
          continue;
      }
      if ((x - player.x) ** 2 + (y - player.y) ** 2 < safe ** 2) continue;
      // 시작 때 위협은 시작 화면 사각형(keepOut) 안에도 두지 않는다. 먹이는 화면 안에 놓아도 된다.
      if (keepOut && initial && dangerous && x > keepOut.left && x < keepOut.right && y > keepOut.top && y < keepOut.bottom) continue;
      const nearEnemies = grid ? queryGrid(grid, x, y, edge + grid.maxSize, spawnHits) : enemies;
      const clear = clearanceAt(x, y, size, gap, nearEnemies);
      if (clear >= 0) return { x, y };
      if (clear > bestClear) { best = { x, y }; bestClear = clear; }
    }
    if (best && world.crowdedSpawn) return best;
  }
  return null;
}

function mapPattern(scene) {
  const key = 'meadow-pattern';
  if (scene.textures.exists(key)) return key;
  const tile = world.patternTile,
    grid = world.grid;
  const g = scene.make.graphics({ add: false });
  let seed = world.landscapeSeed;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const ink = 0x678275;
  for (let x = 0; x < tile; x += grid)
    for (let y = 0; y < tile; y += grid) {
      g.fillStyle(ink, 0.3).fillCircle(x + grid / 2, y + grid / 2, 1.35);
      if (random() > 0.73) {
        const px = x + 15 + random() * 32,
          py = y + 12 + random() * 35;
        g.lineStyle(1.5, ink, 0.36)
          .beginPath()
          .moveTo(px - 6, py - 3)
          .lineTo(px - 2, py + 1)
          .moveTo(px, py)
          .lineTo(px + 1, py - 6)
          .moveTo(px + 3, py)
          .lineTo(px + 6, py - 3)
          .strokePath();
      }
    }
  // 종이 결, 드문 풀꽃과 작은 돌. 타일 한 장으로 맵 전체를 덮는다.
  for (let i = 0; i < 620; i++)
    g.fillStyle(ink, 0.08 + random() * 0.08).fillRect(random() * tile, random() * tile, 1 + random(), 1);
  for (let i = 0; i < 9; i++) {
    const x = 18 + random() * (tile - 36),
      y = 18 + random() * (tile - 36);
    if (i % 3 === 0) {
      g.fillStyle(0x91a491, 0.28).fillEllipse(x, y + 3, 24, 7);
      g.fillStyle(0xaabaaa, 0.56).fillTriangle(x - 11, y + 2, x - 4, y - 7, x + 5, y + 2);
      g.fillStyle(0xf7f3db, 0.68).fillTriangle(x - 4, y - 7, x + 3, y - 5, x + 6, y + 2);
      g.fillStyle(ink, 0.28).fillEllipse(x + 10, y + 2, 7, 3);
    } else {
      g.lineStyle(1.2, ink, 0.55).lineBetween(x, y, x - 1, y - 7);
      for (let j = 0; j < 5; j++) {
        const a = (j * Math.PI * 2) / 5;
        g.fillStyle(0xfff9dd, 0.9).fillCircle(x - 1 + Math.cos(a) * 2.5, y - 7 + Math.sin(a) * 2.5, 2.1);
      }
      g.fillStyle(0xc7a979, 0.9).fillCircle(x - 1, y - 7, 1.4);
    }
  }
  g.generateTexture(key, tile, tile).destroy();
  return key;
}

// 월드 바닥을 그린다. 돌려주는 { destroy }로 지우고 다시 그릴 수 있다(진화로 맵이 커질 때).
// 바닥 무늬는 tileSprite 하나라 월드가 커져도 가볍다. 경계선은 월드 배율만큼 굵게 그려 멀리서도 보이게 한다.
export function drawWorld(scene) {
  const s = world.size,
    m = s / 2;
  const made = [];
  const track = (object) => {
    made.push(object);
    return object;
  };
  const widen = Math.max(1, s / worldFor(1).size);
  const ground = track(scene.add.graphics().setDepth(-3));
  for (const [dir, points] of Object.entries({
    north: [0, 0, s, 0, m, m],
    east: [s, 0, s, s, m, m],
    south: [0, s, s, s, m, m],
    west: [0, 0, 0, s, m, m],
  }))
    ground.fillStyle(REGIONS[dir].floor).fillTriangle(...points);
  track(scene.add.tileSprite(0, 0, s, s, mapPattern(scene)).setOrigin(0).setDepth(-2));
  ground.lineStyle(world.boundaryWidth * widen, 0x697d69).strokeRect(0, 0, s, s);
  ground.lineStyle(2 * widen, 0xfff7d7).strokeRect(9 * widen, 9 * widen, s - 18 * widen, s - 18 * widen);

  // 시작 지점의 방위반은 움직이는 동안에도 방향과 거리를 가늠할 수 있는 지형지물이다.
  const dial = track(scene.add.graphics().setDepth(-1).setPosition(m, m));
  for (const r of [91, 98]) dial.lineStyle(1.3, 0x728575, 0.28).strokeCircle(0, 0, r);
  for (let i = 0; i < 32; i++) {
    const a = (i * Math.PI) / 16,
      r = i % 4 === 0 ? 83 : 93;
    dial
      .lineStyle(i % 4 === 0 ? 2.2 : 1, 0x6b806f, 0.36)
      .lineBetween(Math.cos(a) * r, Math.sin(a) * r, Math.cos(a) * 98, Math.sin(a) * 98);
  }
  for (const [x, y, char] of [
    [0, -114, '北'],
    [114, 0, '東'],
    [0, 114, '南'],
    [-114, 0, '西'],
  ]) {
    track(
      scene.add
        .text(m + x, m + y, char, { fontFamily: CONFIG.font.family, fontSize: '15px', color: '#6d8170', resolution: 2 })
        .setOrigin(0.5)
        .setAlpha(0.65)
        .setDepth(-1),
    );
  }
  return {
    destroy() {
      for (const object of made) object.destroy();
      made.length = 0;
    },
  };
}
