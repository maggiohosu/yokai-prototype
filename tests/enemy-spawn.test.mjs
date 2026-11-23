import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { bossRingFor, growMoveCount, safeStartFor, seedField, shouldCullOnEvolve, sizeWeights, spawnPoint, spawnSize, spawnStage, startScale, startStage } from '../src/game/world.js';
import { buildGrid, insertGrid } from '../src/game/enemyAI.js';
import { canEat } from '../src/systems/rules.js';
import { withSeed } from '../src/game/populationStress.js';
import { zoomFor } from '../src/game/camera.js';
import { artUnitsFor } from '../src/art/creature.js';
import { applyWorldScale, worldFor } from '../src/systems/worldScale.js';

// 사용자 지시(2026-11-23): 3단계 이후 적이 너무 약하고 적다 → 적의 단계를 높이고, 시작 장소 근처에 모아 만나는 적이 많아 보이게 한다.
const E = CONFIG.enemy;
const mean = (weights) => weights.reduce((acc, w, i) => acc + w * (i + 1), 0);
const sum = (weights) => weights.reduce((a, b) => a + b, 0);
const OLD_REFILL = { 3: [0.22, 0.38, 0.32, 0.08, 0], 4: [0.1, 0.25, 0.35, 0.25, 0.05], 5: [0.05, 0.15, 0.3, 0.3, 0.2] };

test('보충되는 적의 단계표: 3단계 이후 평균 적 단계가 크게 오른다(합 1)', () => {
  for (const stage of [3, 4, 5]) {
    const row = E.stageWeights[stage];
    assert.ok(Math.abs(sum(row) - 1) < 1e-9, 'stage ' + stage + ' 합');
    assert.ok(mean(row) >= mean(OLD_REFILL[stage]) + 0.6, `stage ${stage}: ${mean(row)} ≥ ${mean(OLD_REFILL[stage])} + 0.6`);
    // 약한 1단계 적은 거의 안 나온다
    assert.ok(row[0] <= 0.05, 'stage ' + stage + ': 1단계 적 ' + row[0]);
    // 플레이어 단계보다 한 단계 아래까지 포함해 같은 단계 이상의 적이 대부분이다
    assert.ok(row.slice(stage - 2).reduce((a, b) => a + b, 0) >= 0.75, 'stage ' + stage + ': 같은 단계 이상의 적');
  }
  // 1·2단계는 그대로다
  assert.deepEqual(E.stageWeights[1], [1, 0, 0, 0, 0]);
  assert.deepEqual(E.stageWeights[2], [0.35, 0.45, 0.2, 0, 0]);
});

test('startStage: 플레이어 1·2단계는 예전처럼 항상 1단계, 3단계부터는 처음부터 높은 단계가 나온다', () => {
  for (const r of [0, 0.3, 0.6, 0.999999]) {
    assert.equal(startStage(1, () => r), 1);
    assert.equal(startStage(2, () => r), 1);
  }
  assert.equal(startStage(undefined, () => 0.999999), 1);
  assert.equal(startStage(NaN, () => 0.5), 1);
  for (const stage of [3, 4, 5]) {
    const row = E.startStageWeights[stage];
    assert.ok(Math.abs(sum(row) - 1) < 1e-9);
    assert.ok(mean(row) >= 3, `stage ${stage}: 시작 평균 단계 ${mean(row)}`);
    // 구간 경계: 0이면 가장 낮은 단계, 1에 가까우면 가장 높은 단계
    assert.equal(startStage(stage, () => 0.999999), 5);
    assert.equal(startStage(stage, () => 0), row.findIndex((w) => w > 0) + 1);
    // 시작표는 보충표보다 조금 낮다(시작 직후에 바로 먹히지 않게)
    assert.ok(mean(row) <= mean(E.stageWeights[stage]));
  }
  assert.equal(startStage(9, () => 0.999999), startStage(5, () => 0.999999));
  // 많이 뽑으면 표의 비율을 따른다
  let seed = 11;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const counts = [0, 0, 0, 0, 0];
  const N = 20000;
  for (let i = 0; i < N; i++) counts[startStage(4, rng) - 1]++;
  [0.03 / 1.1, 0.12 / 1.1, 0.30 / 1.1, 0.35 / 1.1, 0.30 / 1.1].forEach((w, i) => assert.ok(Math.abs(counts[i] / N - w) < 0.02, `단계 ${i + 1}: ${counts[i] / N} ≈ ${w}`));
  // 보충도 같은 방식으로 표를 따른다
  assert.equal(spawnStage(5, () => 0.999999), 5);
});

test('시작 안전 거리: 한 변 1000에서는 맵에 맞춰 330으로 줄고(휴대폰 시작 화면 대각선 밖), 한 변 1273 이상에서는 420 그대로다', () => {
  const W = CONFIG.world;
  assert.equal(safeStartFor(1000), 330);
  assert.equal(startScale(1000), 330 / 420);
  for (const size of [1273, 1500, 2000, 2600, 3300, 4000]) {
    assert.equal(safeStartFor(size), W.safeStart, `한 변 ${size}`);
    assert.equal(startScale(size), 1);
  }
  // 844 × 390 시작 화면(배율 1.4395 → 586 × 271)의 반대각선보다 바깥이다: 위협이 시작 화면에 들어오지 않는다.
  const zoom = zoomFor(CONFIG.player.startSize, 844, 390, 1);
  assert.ok(safeStartFor(1000) >= Math.hypot(844 / zoom, 390 / zoom) / 2, `안전 거리 ${safeStartFor(1000)} ≥ 시작 화면 반대각선`);
  assert.equal(safeStartFor(), safeStartFor(CONFIG.world.size));
});

// 헤드리스로 시작 배치를 한 번 한다. 플레이어는 맵 한가운데(실제 판과 같다). 격자를 쓰는 실제 spawnPoint 경로를 그대로 탄다.
function seedWorld(stage, seed = 731, difficulty = 'normal', startView = null) {
  const { size, population } = applyWorldScale(stage);
  const player = { x: size / 2, y: size / 2, size: CONFIG.player.startSize, stage };
  const enemies = [];
  const calls = [];
  const grid = buildGrid([], CONFIG.render.enemyCell);
  withSeed(seed, () => seedField({
    player, difficulty, startView,
    spawn(enemySize, options) {
      calls.push({ size: enemySize, ...options });
      const pos = spawnPoint(player, enemies, enemySize, { ...options, grid });
      if (!pos) return false;
      const enemy = { ...pos, size: enemySize, stage: options.stage };
      enemies.push(enemy);
      insertGrid(grid, enemy);
      return true;
    },
  }));
  return { size, population, player, enemies, calls };
}

// 몰림 지표: Clark–Evans 최근접 이웃 비 R(경계 보정, Donnelly). 1이면 무작위, 1보다 작으면 몰림.
function clarkEvans(points, side) {
  const n = points.length;
  let sum = 0;
  for (const a of points) {
    let best = Infinity;
    for (const b of points) if (a !== b) best = Math.min(best, Math.hypot(a.x - b.x, a.y - b.y));
    sum += best;
  }
  const expected = 0.5 * Math.sqrt((side * side) / n) + ((0.0514 + 0.041 / Math.sqrt(n)) * 4 * side) / n;
  return sum / n / expected;
}

test.afterEach(() => applyWorldScale(1));

test('seedField: 처음 initialNeighbors마리만 플레이어 둘레 고리에 놓고 나머지는 모든 단계에서 맵 전체에 놓는다', () => {
  for (const stage of [1, 2, 3, 4, 5]) {
    const { size, population, calls, enemies } = seedWorld(stage);
    assert.equal(enemies.length, population, `${stage}단계: 480마리를 다 놓는다`);
    assert.equal(population, 480);
    const k = startScale(size);
    const first = calls.slice(0, CONFIG.world.initialNeighbors);
    assert.ok(first.every((c) => Array.isArray(c.near) && c.initial), '처음 12마리는 고리');
    for (const c of first) {
      assert.ok(c.near[0] >= CONFIG.world.innerRing[0] * k - 1e-9 && c.near[1] <= CONFIG.world.outerRing[1] * k + 1e-9, `고리 ${c.near}`);
    }
    assert.deepEqual(first[0].near, [CONFIG.world.innerRing[0] * k, CONFIG.world.innerRing[0] * k]);
    assert.equal(first[0].stage, 1, '첫 한 마리는 늘 가까이 있는 1단계 먹이');
    assert.ok(calls.slice(CONFIG.world.initialNeighbors).every((c) => c.near === undefined && c.initial), '나머지는 고리 없이 맵 전체');
  }
  // 3단계 이후 시작 장소 근처에 모으던 설정(nearSpawn)은 없어졌다.
  assert.equal(CONFIG.enemy.nearSpawn, undefined);
});

test('seedField: 1·2단계는 처음에 적이 모두 1단계, 3단계부터는 startStageWeights로 높은 단계가 나온다', () => {
  for (const stage of [1, 2]) assert.ok(seedWorld(stage).enemies.every((e) => e.stage === 1), `${stage}단계`);
  for (const stage of [3, 4, 5]) {
    const { enemies } = seedWorld(stage);
    const avg = enemies.reduce((sum, e) => sum + e.stage, 0) / enemies.length;
    assert.ok(Math.abs(avg - mean(E.startStageWeights[stage])) < 0.35, `${stage}단계 평균 ${avg}`);
  }
});

test('seedField: 시작 직후 나를 먹을 수 있는 적은 안전 거리(1단계 330, 그 밖 420) 안에 없고 첫 먹이는 시작 화면 안이다', () => {
  for (const stage of [1, 2, 3, 4, 5]) {
    for (const seed of [731, 732, 733]) {
      const { size, player, enemies } = seedWorld(stage, seed);
      const safe = safeStartFor(size);
      const breach = enemies.filter((e) => canEat(e, player) && Math.hypot(e.x - player.x, e.y - player.y) < safe - 1e-6);
      assert.equal(breach.length, 0, `${stage}단계 시드 ${seed}`);
    }
  }
  const { player, enemies } = seedWorld(1);
  const d = Math.hypot(enemies[0].x - player.x, enemies[0].y - player.y);
  assert.ok(Math.abs(d - CONFIG.world.innerRing[0] * startScale(1000)) < 1e-6, `첫 먹이 거리 ${d}`);
  assert.ok(d < 135, '844 × 390 시작 화면(반높이 약 135) 안');
});

test('seedField: 큰 화면(1920 × 1080, 1단계 시야 889 × 500)이 맵의 44%를 덮어도 시작 화면 안에는 나를 먹을 수 있는 적이 없다', () => {
  for (const stage of [1, 3, 5]) {
    for (const seed of [731, 732]) {
      const { size } = applyWorldScale(stage);
      const z = zoomFor(CONFIG.player.startSize, 1920, 1080, stage);
      const hw = 1920 / z / 2, hh = 1080 / z / 2;
      const startView = { left: size / 2 - hw, right: size / 2 + hw, top: size / 2 - hh, bottom: size / 2 + hh };
      const { player, enemies } = seedWorld(stage, seed, 'normal', startView);
      assert.equal(enemies.length, 480);
      const visible = enemies.filter((e) => e.x > startView.left && e.x < startView.right && e.y > startView.top && e.y < startView.bottom);
      assert.equal(visible.filter((e) => canEat(e, player)).length, 0, `${stage}단계 시드 ${seed}`);
      if (stage === 1) assert.ok(visible.length > 100, '먹이는 화면에도 놓인다: ' + visible.length);
    }
  }
});

test('시작 배치는 맵 전체에 고르다: 3·4·5단계에서 시작 장소 근처가 평균보다 촘촘하지 않고 몰림 지표 R ≥ 0.9', () => {
  for (const stage of [3, 4, 5]) {
    for (const seed of [731, 732, 733]) {
      const { size, player, enemies } = seedWorld(stage, seed);
      assert.equal(enemies.length, 480);
      const R = clarkEvans(enemies, size);
      assert.ok(R >= 0.9, `${stage}단계 시드 ${seed}: R ${R.toFixed(3)}`);
      // 시작 장소에서 반지름 600 안에 든 적의 비율 / 균일할 때의 면적 비율(예전에는 5.1 · 9.0 · 14.3배)
      const share = enemies.filter((e) => Math.hypot(e.x - player.x, e.y - player.y) <= 600).length / enemies.length;
      const uniform = (Math.PI * 600 ** 2) / (size * size);
      assert.ok(share / uniform < 1.5, `${stage}단계 시드 ${seed}: 시작 장소 근처 ${(share / uniform).toFixed(2)}배`);
    }
  }
});

test('spawnPoint: 벽에서 떨어지고, 화면 밖이며, 시작 때 위협은 안전 거리 밖이고, 고리를 주면 그 고리 안에서만 나온다', () => {
  const player = { x: CONFIG.world.size / 2, y: CONFIG.world.size / 2, size: CONFIG.player.startSize };
  const ring = CONFIG.world.outerRing.map((r) => r * startScale());
  const dist = (p) => Math.hypot(p.x - player.x, p.y - player.y);
  for (let i = 0; i < 300; i++) {
    const a = spawnPoint(player, [], 12, { near: ring, initial: true, stage: 5 });
    assert.ok(a, '고리에서 자리를 찾는다');
    assert.ok(dist(a) >= ring[0] - 1e-6 && dist(a) <= ring[1] + 1e-6, '고리: ' + dist(a));
    assert.ok(dist(a) >= safeStartFor() - 1e-6, '안전 거리: ' + dist(a));
  }
  const view = { left: player.x - 300, right: player.x + 300, top: player.y - 150, bottom: player.y + 150 };
  for (let i = 0; i < 300; i++) {
    const b = spawnPoint(player, [], 12, { view, stage: 3 });
    assert.ok(b, '화면 밖 아무 곳에서 자리를 찾는다');
    assert.ok(!(b.x > view.left && b.x < view.right && b.y > view.top && b.y < view.bottom), '화면 밖');
    const edge = 12 + CONFIG.world.spawnGap;
    assert.ok(b.x >= edge && b.x <= CONFIG.world.size - edge && b.y >= edge && b.y <= CONFIG.world.size - edge, '벽에서 떨어짐');
  }
  // region: 주어진 영역 안에서만 나온다(맵이 커질 때 새 땅으로 옮기는 데 쓴다)
  for (let i = 0; i < 100; i++) {
    const c = spawnPoint(player, [], 12, { region: (x) => x < 200 });
    assert.ok(c && c.x < 200);
  }
});

test('spawnPoint: 자리가 모자란 맵에서는 간격을 못 지켜도 가장 덜 붐비는 곳에 놓고(crowdedSpawn), 끄면 null이다', () => {
  const { size } = applyWorldScale(1);
  const player = { x: size / 2, y: size / 2, size: CONFIG.player.startSize };
  // 한 변 1000에 반지름 30짜리 적 480마리를 촘촘하게(겹치게) 깐다: 간격을 지킬 빈자리가 없다.
  const enemies = [];
  for (let i = 0; i < 480; i++) enemies.push({ x: 20 + (i % 24) * 40, y: 20 + Math.floor(i / 24) * 48, size: 30 });
  const grid = buildGrid(enemies, CONFIG.render.enemyCell);
  const saved = CONFIG.world.crowdedSpawn;
  try {
    CONFIG.world.crowdedSpawn = false;
    assert.equal(spawnPoint(player, enemies, 30, { grid }), null, '끄면 자리가 없다');
    CONFIG.world.crowdedSpawn = true;
    const view = { left: player.x - 300, right: player.x + 300, top: player.y - 150, bottom: player.y + 150 };
    for (let i = 0; i < 50; i++) {
      const pos = spawnPoint(player, enemies, 30, { grid, view, stage: 1 });
      assert.ok(pos, '가장 덜 붐비는 곳에 놓는다');
      assert.ok(!(pos.x > view.left && pos.x < view.right && pos.y > view.top && pos.y < view.bottom), '그래도 화면 밖');
      assert.ok(Math.hypot(pos.x - player.x, pos.y - player.y) >= 30 + CONFIG.world.spawnGap + player.size, '플레이어 위는 아니다');
    }
  } finally { CONFIG.world.crowdedSpawn = saved; }
});

test('spawnPoint: 화면이 맵의 큰 비율을 덮어 몸 전체가 화면 밖인 자리가 없으면 화면 밖 여유를 줄여 화면 가장자리 바로 밖을 쓴다', () => {
  const { size } = applyWorldScale(1);
  const player = { x: size / 2, y: size / 2, size: 40 };
  // 1920 × 1080에서 하한(1.92) 배율의 시야: 1000 × 562. 몸 반지름 60인 대요괴는 여유 85 + 약 120이 필요해 위아래 띠(219)에는 몸 전체가 못 들어간다.
  const view = { left: 0, right: 1000, top: player.y - 281, bottom: player.y + 281 };
  const pad = CONFIG.world.offscreenMargin + 60 * artUnitsFor(1) / CONFIG.render.bodyRadius * 0.52;
  let found = 0, full = 0;
  for (let i = 0; i < 200; i++) {
    const pos = spawnPoint(player, [], 60, { view, stage: 1 });
    if (!pos) continue;
    found++;
    assert.ok(pos.y < view.top || pos.y > view.bottom, '중심은 화면 밖');
    if (pos.y <= view.top - pad || pos.y >= view.bottom + pad) full++;
  }
  assert.ok(view.top - pad < 60 + CONFIG.world.spawnGap, '시험 조건: 몸 전체가 화면 밖인 자리가 없다');
  assert.ok(found >= 190, `큰 적도 자리를 찾는다: ${found}/200`);
  assert.equal(full, 0);
});

test('growMoveCount: 맵이 커지면 옛 땅이 새 맵에서 차지하는 면적 비율만큼 남기고 나머지를 새 땅으로 옮겨 밀도를 같게 한다', () => {
  assert.equal(growMoveCount(480, 1000, 1000), 0);
  assert.equal(growMoveCount(480, 1000, 800), 0, '줄이는 경우는 없다');
  assert.equal(growMoveCount(0, 1000, 1500), 0);
  assert.equal(growMoveCount(480, 1000, 1500), Math.round(480 * (1 - (1000 / 1500) ** 2)));
  assert.equal(growMoveCount(480, 1000, 1500), 267);
  assert.equal(growMoveCount(480, 1500, 2000), 210);
  assert.equal(growMoveCount(480, 2000, 2600), 196);
  assert.equal(growMoveCount(480, 2600, 3300), 182);
  // 옮긴 뒤 옛 땅의 적 수 / 옛 땅 면적 = 새 땅의 적 수 / 새 땅 면적
  for (const [before, after] of [[1000, 1500], [1500, 2000], [2000, 2600], [2600, 3300]]) {
    const moved = growMoveCount(480, before, after);
    const oldDensity = (480 - moved) / before ** 2, newDensity = moved / (after ** 2 - before ** 2);
    assert.ok(Math.abs(oldDensity / newDensity - 1) < 0.02, `${before} → ${after}`);
  }
});

test('적 수: 모든 단계의 목표 인구가 480으로 같다(사용자 지시 2026-11-23), 맵만 단계마다 커진다', () => {
  const pops = [1, 2, 3, 4, 5].map((stage) => worldFor(stage).population);
  assert.deepEqual(pops, [480, 480, 480, 480, 480]);
  assert.equal(CONFIG.world.fixedPopulation, 480);
  const sizes = [1, 2, 3, 4, 5].map((stage) => worldFor(stage).size);
  assert.deepEqual(sizes, [1000, 1500, 2000, 2600, 3300]);
});

test('성장 뒤 큰 적 구간은 노말 1·2단계에서 약 27%, 3단계부터 50%다', () => {
  const farGrown = E.earlyUntilSize * 3;
  for (const stage of [1, 2, 3, 4, 5]) {
    const expectedBig = stage < 3 ? 0.3 / 1.1 : 0.5;
    assert.ok(Math.abs(sizeWeights(farGrown, stage)[2] - expectedBig) < 1e-9);
    assert.ok(Math.abs(sizeWeights(CONFIG.player.startSize, stage)[2] - 0.6) < 1e-9);
  }
  // 많이 뽑으면 나보다 큰 적(1.15배 이상)의 비율이 크게 늘어난다
  const originalRandom = Math.random;
  try {
    let seed = 99;
    Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    // 실제 설정 그대로(상한을 풀지 않고) 플레이어 크기 60·120에서 본다
    for (const size of [60, 120]) {
      const share = (stage) => {
        let big = 0;
        const N = 6000;
        for (let i = 0; i < N; i++) if (spawnSize(size, stage) >= size * 1.15 - 1e-9) big++;
        return big / N;
      };
      const before = share(2), after = share(4);
      assert.ok(after > 0.2 && after >= before * 1.8, `크기 ${size}: 큰 적 비율 ${before} → ${after}`);
    }
  } finally {
    Math.random = originalRandom;
  }
});

test('bossRingFor: 대요괴·맞수 고리의 안쪽 반지름이 화면 크기에 맞춰져, 화면이 아무리 커도 고리가 화면에 가려지지 않는다', () => {
  const { ring: base, pad } = E.bossRing;
  const width = base[1] - base[0];
  // 작은 화면: 기본 고리에 가깝다(대각선 / 2 + pad가 기본 안쪽보다 크면 그 값)
  const small = bossRingFor({ width: 585, height: 289 });
  assert.ok(small[0] >= base[0] && Math.abs(small[1] - small[0] - width) < 1e-9);
  assert.deepEqual(bossRingFor(undefined), base);
  assert.deepEqual(bossRingFor({ width: NaN, height: 10 }), base);
  // 화면이 커질수록 안쪽 반지름이 커지고 고리 두께는 그대로
  let last = 0;
  for (const w of [585, 1200, 2400, 4000, 6000]) {
    const ring = bossRingFor({ width: w, height: w * 0.49 });
    assert.ok(ring[0] >= last && Math.abs(ring[1] - ring[0] - width) < 1e-9);
    last = ring[0];
    // 고리 안쪽은 화면 대각선의 절반보다 바깥에 있다(화면 안에 들어가지 않는다)
    assert.ok(ring[0] >= Math.hypot(w, w * 0.49) / 2 + pad - 1e-6);
  }
  // 1920 × 1080(하한 배율 1.92, 시야 1000 × 562)에서 고리는 전부 맵 밖이라 spawnPoint가 null이고, 부르는 쪽(PlayScene)이 맵 전체의 화면 밖에서 다시 찾는다.
  const { size } = applyWorldScale(1);
  const player = { x: size / 2, y: size / 2, size: 30 };
  const view = { left: 0, right: 1000, top: 219, bottom: 781, width: 1000, height: 562 };
  assert.equal(spawnPoint(player, [], 40, { near: bossRingFor(view), view }), null);
  assert.ok(spawnPoint(player, [], 40, { view }), '맵 전체의 화면 밖에서는 찾는다');
});

test('대요괴·맞수의 최대 출현 크기도 중앙과 모서리에서 맵 안·화면 밖에 놓인다', () => {
  try {
    withSeed(731, () => {
      for (const stage of [1, 3, 4, 5]) {
        const { size } = applyWorldScale(stage);
        const playerSize = CONFIG.player.startSize;
        const zoom = zoomFor(playerSize, 844, 390, stage);
        const width = 844 / zoom, height = 390 / zoom;
        for (const [x, y] of [[size / 2, size / 2], [playerSize, playerSize]]) {
          const left = Math.max(0, x - width / 2), top = Math.max(0, y - height / 2);
          const view = { width, height, left, top, right: left + width, bottom: top + height };
          const bosses = [CONFIG.herald];
          if (stage >= CONFIG.balance.rival.minStage) bosses.push(CONFIG.balance.rival);
          for (const boss of bosses) {
            const radius = playerSize * boss.sizeMax;
            const player = { x, y, size: playerSize, stage };
            const pos = spawnPoint(player, [], radius, { stage, view, near: bossRingFor(view) })
              ?? spawnPoint(player, [], radius, { stage, view });
            assert.ok(pos);
            assert.ok(pos.x >= radius && pos.y >= radius && pos.x <= size - radius && pos.y <= size - radius);
            const pad = CONFIG.world.offscreenMargin + radius * artUnitsFor(stage) / CONFIG.render.bodyRadius * 0.52;
            assert.ok(pos.x <= view.left - pad || pos.x >= view.right + pad ||
                      pos.y <= view.top - pad || pos.y >= view.bottom + pad);
          }
        }
      }
    });
  } finally { applyWorldScale(1); }
});

test('shouldCullOnEvolve: 판 안 진화로 3단계 이상이 되면 멀리 흩어진 낮은 단계 적만 evolveCull 비율로 지운다', () => {
  const player = { x: 1000, y: 1000 };
  const far = (stage, extra = {}) => ({ x: 1000 + 2000, y: 1000, stage, ...extra });
  const always = () => 0, never = () => 0.999999;
  // 3단계 미만이면 아무것도 지우지 않는다
  assert.equal(shouldCullOnEvolve(far(1), player, 2, always), false);
  // 멀리 있는 낮은 단계 적은 지운다
  assert.equal(shouldCullOnEvolve(far(1), player, 3, always), true);
  assert.equal(shouldCullOnEvolve(far(2), player, 3, always), true);
  assert.equal(shouldCullOnEvolve(far(4), player, 5, always), true);
  // 같거나 높은 단계, 맞수, 가까운 적은 지우지 않는다
  assert.equal(shouldCullOnEvolve(far(3), player, 3, always), false);
  assert.equal(shouldCullOnEvolve(far(5), player, 3, always), false);
  assert.equal(shouldCullOnEvolve(far(1, { rival: true }), player, 3, always), false);
  assert.equal(shouldCullOnEvolve({ x: 1000 + E.lateStage.keepRadius - 1, y: 1000, stage: 1 }, player, 3, always), false);
  // 확률: evolveCull 비율
  assert.equal(shouldCullOnEvolve(far(1), player, 3, never), false);
  let seed = 7;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let culled = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) if (shouldCullOnEvolve(far(1), player, 3, rng)) culled++;
  assert.ok(Math.abs(culled / N - E.lateStage.evolveCull) < 0.02, '정리 비율 ' + culled / N);
  assert.ok(E.lateStage.evolveCull >= 0.5, '대부분 정리해야 3단계로 오른 직후에도 적이 약하지 않다');
});

test('spawnSize 상한: 3단계 이후는 플레이어가 커져도 나보다 큰 적이 나오고(절대 상한 growthCap.maxSize), 1·2단계는 maxSpawnSize 그대로', () => {
  const originalRandom = Math.random;
  try {
    let seed = 5;
    Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const size of [42, 60, 120, 150]) {
      let max3 = 0, max2 = 0;
      for (let i = 0; i < 4000; i++) {
        max3 = Math.max(max3, spawnSize(size, 3));
        max2 = Math.max(max2, spawnSize(size, 2));
      }
      assert.ok(max2 <= E.maxSpawnSize + 1e-9, `1·2단계 상한 ${max2}`);
      assert.ok(max3 <= E.growthCap.maxSize + 1e-9, `절대 상한 ${max3}`);
      if (size >= 60) assert.ok(max3 > size * 1.15, `크기 ${size}: 3단계 이후 최대 ${max3} > ${size * 1.15}`);
    }
  } finally {
    Math.random = originalRandom;
  }
});
