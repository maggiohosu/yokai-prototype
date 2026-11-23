import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { nearSpawnPlan, refillRingFor, shouldCullOnEvolve, sizeWeights, spawnPoint, spawnSize, spawnStage, startStage } from '../src/game/world.js';
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

test('nearSpawnPlan: 1·2단계는 null(월드 전체), 3단계 이후는 시작 장소 근처에 둘 적 수와 고리를 돌려준다', () => {
  assert.equal(nearSpawnPlan(1, 72), null);
  assert.equal(nearSpawnPlan(2, 115), null);
  assert.equal(nearSpawnPlan(undefined, 72), null);
  for (const stage of [3, 4, 5]) {
    const population = worldFor(stage).population;
    const plan = nearSpawnPlan(stage, population);
    const { share, startRing, refillRing } = E.nearSpawn;
    assert.equal(plan.count, Math.round((population - CONFIG.world.initialNeighbors) * share));
    assert.ok(plan.count + CONFIG.world.initialNeighbors <= population, '근처에 두는 수는 적 수를 넘지 않는다');
    assert.deepEqual(plan.startRing, startRing);
    assert.deepEqual(plan.refillRing, refillRing);
    // 근처 고리는 시작 직후 위험한 적이 바로 붙지 않게 안전 거리(world.safeStart) 근처에서 시작한다
    assert.ok(startRing[0] <= CONFIG.world.safeStart && startRing[1] > startRing[0]);
    assert.ok(refillRing[0] >= CONFIG.world.offscreenMargin, '보충은 화면 밖');
  }
  assert.equal(nearSpawnPlan(3, 5).count, 0, '적이 initialNeighbors보다 적으면 0');
});

test('적 밀도: 시작 장소 근처가 월드 평균보다 훨씬 촘촘하다(만나는 적이 많아 보인다)', () => {
  for (const stage of [3, 4, 5]) {
    const { size, population } = worldFor(stage);
    const plan = nearSpawnPlan(stage, population);
    const [r0, r1] = plan.startRing;
    const nearDensity = plan.count / (Math.PI * (r1 * r1 - r0 * r0));
    const worldDensity = population / (size * size);
    assert.ok(nearDensity > 5 * worldDensity, `stage ${stage}: ${nearDensity * 1e6} vs ${worldDensity * 1e6} (백만 칸당)`);
  }
});

test('spawnPoint(near): 시작 고리와 보충 고리 안에서만 나오고, 월드 안이며, 화면 안에는 나오지 않는다', () => {
  const player = { x: CONFIG.world.size / 2, y: CONFIG.world.size / 2, size: CONFIG.player.startSize };
  const { startRing, refillRing } = E.nearSpawn;
  const dist = (p) => Math.hypot(p.x - player.x, p.y - player.y);
  for (let i = 0; i < 300; i++) {
    const a = spawnPoint(player, [], 12, { near: startRing, initial: true, stage: 5 });
    assert.ok(a, '시작 고리에서 자리를 찾는다');
    assert.ok(dist(a) >= startRing[0] - 1e-6 && dist(a) <= startRing[1] + 1e-6, '시작 고리: ' + dist(a));
    // 위험한 적(높은 단계)은 시작 직후 안전 거리 밖에 놓인다
    assert.ok(dist(a) >= CONFIG.world.safeStart - 1e-6, '안전 거리: ' + dist(a));
  }
  const view = { left: player.x - 300, right: player.x + 300, top: player.y - 150, bottom: player.y + 150 };
  for (let i = 0; i < 300; i++) {
    const b = spawnPoint(player, [], 12, { near: refillRing, view });
    assert.ok(b, '보충 고리에서 자리를 찾는다');
    assert.ok(dist(b) >= refillRing[0] - 1e-6 && dist(b) <= refillRing[1] + 1e-6, '보충 고리: ' + dist(b));
    assert.ok(!(b.x > view.left && b.x < view.right && b.y > view.top && b.y < view.bottom), '화면 밖');
    assert.ok(b.x >= 0 && b.x <= CONFIG.world.size && b.y >= 0 && b.y <= CONFIG.world.size);
  }
});

test('적 수: 3단계 이후 예전보다 늘고(지수 1.15), 단계마다 커진다', () => {
  const pops = [1, 2, 3, 4, 5].map((stage) => worldFor(stage).population);
  assert.deepEqual(pops, [72, 115, 160, 216, 284].map(base => base * CONFIG.world.populationMult));
  const old = [72, 108, 144, 187, 238];
  for (let i = 1; i < 5; i++) assert.ok(pops[i] > old[i] && pops[i] > pops[i - 1]);
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

test('nearSpawnPlan.preyRing: 내가 먹을 수 있는 적은 시작 화면 안쪽(120)부터 놓을 수 있다(위협은 safeStart 밖)', () => {
  const plan = nearSpawnPlan(3, 160);
  assert.deepEqual(plan.preyRing, [E.nearSpawn.preyInner, E.nearSpawn.startRing[1]]);
  assert.ok(plan.preyRing[0] < plan.startRing[0] && plan.preyRing[0] < 293, '시작 화면(반너비 약 293) 안쪽부터');
  const mid = CONFIG.world.size / 2;
  const player = { x: mid, y: mid, size: CONFIG.player.startSize };
  let inView = 0;
  for (let i = 0; i < 300; i++) {
    const p = spawnPoint(player, [], 6, { near: plan.preyRing, initial: true, stage: 1 }); // 1단계 작은 적(위협 아님)
    assert.ok(p);
    const d = Math.hypot(p.x - player.x, p.y - player.y);
    assert.ok(d >= plan.preyRing[0] - 1e-6 && d <= plan.preyRing[1] + 1e-6);
    if (Math.abs(p.x - player.x) < 293 && Math.abs(p.y - player.y) < 145) inView++;
  }
  assert.ok(inView > 0, '시작 화면 안에도 놓인다(첫인상에서 적이 보인다)');
  // 위협(높은 단계)은 안전 거리 밖
  for (let i = 0; i < 200; i++) {
    const p = spawnPoint(player, [], 12, { near: plan.startRing, initial: true, stage: 5 });
    assert.ok(Math.hypot(p.x - player.x, p.y - player.y) >= CONFIG.world.safeStart - 1e-6);
  }
});

test('refillRingFor: 보충 고리의 안쪽 반지름이 화면 크기에 맞춰져, 화면이 아무리 커도 고리가 화면에 가려지지 않는다', () => {
  const base = E.nearSpawn.refillRing;
  const width = base[1] - base[0];
  // 작은 화면: 기본 고리에 가깝다(대각선 / 2 + refillPad가 기본 안쪽보다 크면 그 값)
  const small = refillRingFor({ width: 585, height: 289 });
  assert.ok(small[0] >= base[0] && Math.abs(small[1] - small[0] - width) < 1e-9);
  assert.deepEqual(refillRingFor(undefined), base);
  assert.deepEqual(refillRingFor({ width: NaN, height: 10 }), base);
  // 화면이 커질수록 안쪽 반지름이 커지고 고리 두께는 그대로
  let last = 0;
  for (const w of [585, 1200, 2400, 4000, 6000]) {
    const ring = refillRingFor({ width: w, height: w * 0.49 });
    assert.ok(ring[0] >= last && Math.abs(ring[1] - ring[0] - width) < 1e-9);
    last = ring[0];
    // 고리 안쪽은 화면 대각선의 절반보다 바깥에 있다(화면 안에 들어가지 않는다)
    assert.ok(ring[0] >= Math.hypot(w, w * 0.49) / 2 + E.nearSpawn.refillPad - 1e-6);
  }
  // 실패 예시(2560×1440 모니터, 배율 0.43 → 시야 약 5950×3000): 예전 고리(450~1600)는 전부 화면 안이었다. 새 고리에서는 자리를 찾는다.
  const view = { left: 0, right: 5950, top: 0, bottom: 3000, width: 5950, height: 3000 };
  const player = { x: 2975, y: 1500, size: 160 };
  const old = spawnPoint(player, [], 40, { near: base, view });
  assert.equal(old, null, '예전 고리는 화면 안이라 자리를 못 찾는다');
  const ring = refillRingFor(view);
  let found = 0;
  const savedSize = CONFIG.world.size;
  CONFIG.world.size = 6600;
  try {
    const mid = CONFIG.world.size / 2;
    const bigPlayer = { x: mid, y: mid, size: 160 };
    const bigView = { left: mid - 2975, right: mid + 2975, top: mid - 1500, bottom: mid + 1500, width: 5950, height: 3000 };
    for (let i = 0; i < 100; i++) if (spawnPoint(bigPlayer, [], 40, { near: ring, view: bigView })) found++;
  } finally {
    CONFIG.world.size = savedSize;
  }
  assert.ok(found > 90, '새 고리에서 자리를 찾는다: ' + found);
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
            const pos = spawnPoint(player, [], radius, { stage, view, near: refillRingFor(view) })
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
  assert.equal(shouldCullOnEvolve({ x: 1000 + E.nearSpawn.refillRing[0] - 1, y: 1000, stage: 1 }, player, 3, always), false);
  // 확률: evolveCull 비율
  assert.equal(shouldCullOnEvolve(far(1), player, 3, never), false);
  let seed = 7;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let culled = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) if (shouldCullOnEvolve(far(1), player, 3, rng)) culled++;
  assert.ok(Math.abs(culled / N - E.nearSpawn.evolveCull) < 0.02, '정리 비율 ' + culled / N);
  assert.ok(E.nearSpawn.evolveCull >= 0.5, '대부분 정리해야 3단계로 오른 직후에도 적이 약하지 않다');
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
