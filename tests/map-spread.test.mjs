import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { applyWorldScale } from '../src/systems/worldScale.js';
import { buildGrid, insertGrid } from '../src/game/enemyAI.js';
import { zoomFloor, zoomFor } from '../src/game/camera.js';
import { growMoveCount, offscreenPad, seedField, spawnPoint } from '../src/game/world.js';
import { withSeed } from '../src/game/populationStress.js';

// 사용자 지시(2026-11-23): 맵 면적을 다시 1/4로(한 변 1000·1500·2000·2600·3300), 적 수는 모든 단계 480, 적은 맵 전체에 고르게.
test.afterEach(() => applyWorldScale(1));

const view = (player, width, height, size) => {
  const left = Math.min(Math.max(0, player.x - width / 2), size - width), top = Math.min(Math.max(0, player.y - height / 2), size - height);
  return { left, top, right: left + width, bottom: top + height, width, height };
};

function seeded(stage, seed = 731) {
  const { size } = applyWorldScale(stage);
  const player = { x: size / 2, y: size / 2, size: CONFIG.player.startSize, stage };
  const enemies = [];
  const grid = buildGrid([], CONFIG.render.enemyCell);
  withSeed(seed, () => seedField({
    player,
    spawn(enemySize, options) {
      const pos = spawnPoint(player, enemies, enemySize, { ...options, grid });
      if (!pos) return false;
      const e = { size: enemySize, stage: options.stage, sprite: { x: pos.x, y: pos.y, active: true } };
      Object.defineProperties(e, { x: { get() { return this.sprite.x; } }, y: { get() { return this.sprite.y; } } });
      enemies.push(e);
      insertGrid(grid, e);
      return true;
    },
  }));
  return { size, player, enemies };
}

test('카메라 하한(1단계 한 변 1000): 시작 화면의 나·적 크기는 예전과 같고, 하한은 성장 뒤에만 걸리며 시야는 맵보다 넓어지지 않는다', () => {
  const start = CONFIG.player.startSize;
  // 844 × 390 휴대폰: 시작 배율 1.4395는 그대로(하한 0.844 아래), 반지름 24.6부터 하한이 걸린다(예전 한 변 2000에서는 84).
  applyWorldScale(1);
  assert.ok(Math.abs(zoomFor(start, 844, 390, 1) - 1.4394859765554318) < 1e-9);
  assert.equal(zoomFloor(844, 390, 1), 0.844);
  assert.ok(zoomFor(24, 844, 390, 1) > 0.844 && zoomFor(25, 844, 390, 1) === 0.844);
  // 1920 × 1080: 시작 배율 2.1592는 하한 1.92 위, 반지름 11.6부터 걸린다(예전에는 40.7)
  assert.ok(Math.abs(zoomFor(start, 1920, 1080, 1) - 2.159229) < 1e-5);
  assert.equal(zoomFloor(1920, 1080, 1), 1.92);
  assert.ok(zoomFor(11.5, 1920, 1080, 1) > 1.92 && zoomFor(11.7, 1920, 1080, 1) === 1.92);
  // 몸이 아무리 커도 시야는 맵 한 변을 넘지 않는다(긴 변 = 맵 한 변, 짧은 변은 그보다 짧다): 맵 전체가 한 화면에 담기지는 않는다(가로 화면은 맵의 46~56%).
  for (const stage of [1, 2, 3, 4, 5]) {
    const { size } = applyWorldScale(stage);
    for (const [w, h] of [[844, 390], [1920, 1080], [1280, 720], [390, 844]]) {
      for (const bodySize of [start, 50, 83.33, 150, 200]) {
        const z = zoomFor(bodySize, w, h, stage);
        assert.ok(Math.max(w, h) / z <= size + 1e-6, `${stage}단계 ${w}×${h} 크기 ${bodySize}`);
      }
    }
  }
  applyWorldScale(1);
  const areaShare = (w, h) => (w / zoomFor(200, w, h, 1)) * (h / zoomFor(200, w, h, 1)) / 1000 ** 2;
  assert.ok(Math.abs(areaShare(844, 390) - 0.462) < 0.001);
  assert.ok(Math.abs(areaShare(1920, 1080) - 0.5625) < 0.001);
});

test('진화 고리(pulse.reach 750)는 진화 직전 시작 화면이 물러선(÷ evolveZoom) 시야의 반대각선보다 멀리 퍼진다', () => {
  const { evolveZoom, pulse } = CONFIG.balance.view;
  for (const [w, h] of [[844, 390], [1920, 1080], [1280, 720]]) {
    const z = zoomFor(CONFIG.player.startSize, w, h, 2);
    const half = Math.hypot(w / z / evolveZoom, h / z / evolveZoom) / 2;
    assert.ok(pulse.reach > half, `${w}×${h}: 반대각선 ${half.toFixed(0)} < 고리 ${pulse.reach}`);
  }
});

test('화면 밖 보충: 1·3·5단계에서 큰 화면(1920 × 1080 하한 배율)이어도 120마리를 한꺼번에 화면 밖에 다시 채운다(1단계는 좁은 띠라 1~2마리는 다음 보충으로 미룬다)', () => {
  for (const stage of [1, 3, 5]) {
    for (const seed of [731, 732]) {
      const { size, player, enemies } = seeded(stage, seed);
      const z = zoomFor(player.size, 1920, 1080, stage);
      const v = view(player, 1920 / z, 1080 / z, size);
      let missed = 0;
      withSeed(seed, () => {
        for (let i = 0; i < 120; i++) enemies.splice(Math.floor(Math.random() * enemies.length), 1);
        const grid = buildGrid(enemies, CONFIG.render.enemyCell);
        for (let i = 0; i < 120; i++) {
          const enemySize = CONFIG.player.startSize * (0.5 + Math.random() * 1.2);
          const pos = spawnPoint(player, enemies, enemySize, { view: v, stage: 1, grid });
          if (!pos) { missed++; continue; } // 일반 보충은 화면 밖 규칙을 줄이지 않는다: 자리가 없으면 다음 보충에서 다시 시도한다
          assert.ok(!(pos.x > v.left && pos.x < v.right && pos.y > v.top && pos.y < v.bottom), '화면 밖');
          const e = { size: enemySize, stage: 1, x: pos.x, y: pos.y };
          enemies.push(e);
          insertGrid(grid, e);
        }
      });
      assert.ok(missed <= (stage === 1 ? 3 : 0), `${stage}단계 시드 ${seed}: 미룬 보충 ${missed}`);
      assert.equal(enemies.length, 480 - missed);
    }
  }
});

test('경계에 붙은 카메라·벽 근처 플레이어: 옮긴 적은 진화 뒤 실제 시야(가운데 정렬 후 경계 안으로 민 사각형) 밖에 놓인다', async () => {
  globalThis.Phaser ??= { Scene: class {} };
  const { PlayScene } = await import('../src/scenes/PlayScene.js');
  const { evolveZoom } = CONFIG.balance.view;
  for (const [from, to] of [[1, 2], [2, 3]]) {
    for (const [w, h, near] of [[844, 390, [60, 500]], [1920, 1080, [60, 500]], [390, 844, [500, 60]]]) {
      const { size: before, player, enemies } = seeded(from);
      const after = applyWorldScale(to).size;
      const shift = (after - before) / 2;
      for (const e of enemies) { e.sprite.x += shift; e.sprite.y += shift; }
      const z = zoomFor(player.size * 3, w, h, to);
      const vw = Math.min(w / z, before), vh = Math.min(h / z, before);
      const mover = { x: near[0] + shift, y: near[1] + shift, size: player.size * 3, stage: to };
      // 옛 카메라는 옛 경계에 붙어 있다
      // (Phaser scroll: 시야 왼쪽 = scrollX + w/2 - w/z/2)
      const left0 = Math.min(Math.max(0, near[0] - vw / 2), before - vw), top0 = Math.min(Math.max(0, near[1] - vh / 2), before - vh);
      const cam = { width: w, height: h, zoom: z, scrollX: left0 + w / z / 2 - w / 2, scrollY: top0 + h / z / 2 - h / 2, worldView: {} };
      const scene = { enemies, player: mover, cameras: { main: cam }, cameraBounds: {} };
      const old = new Set(enemies.filter((e) => e.x >= shift && e.x <= shift + before));
      withSeed(901, () => PlayScene.prototype.spreadIntoNewLand.call(scene, before, after, shift));
      const moved = enemies.filter((e) => !(e.x >= shift && e.x <= shift + before && e.y >= shift && e.y <= shift + before));
      const rect = (rw, rh) => {
        const left = Math.min(Math.max(0, mover.x - rw / 2), Math.max(0, after - rw)), top = Math.min(Math.max(0, mover.y - rh / 2), Math.max(0, after - rh));
        return { left, right: left + rw, top, bottom: top + rh };
      };
      for (const r of [rect(w / z, h / z), rect(w / z / evolveZoom, h / z / evolveZoom)]) {
        for (const e of moved) {
          assert.ok(!(e.x > r.left && e.x < r.right && e.y > r.top && e.y < r.bottom), `${from}→${to} ${w}×${h}: 옮긴 적이 화면 안`);
        }
      }
      assert.ok(old.size > 0);
    }
  }
});

test('맵이 커진 직후 적 일부를 새 땅으로 옮겨 옛 땅과 새 땅의 밀도가 같아진다(지금 화면에 보이는 적·맞수는 그대로)', async () => {
  globalThis.Phaser ??= { Scene: class {} };
  const { PlayScene } = await import('../src/scenes/PlayScene.js');
  for (const [from, to] of [[1, 2], [2, 3], [3, 4], [4, 5]]) {
    const { size: before, player, enemies } = seeded(from);
    enemies[5].rival = true;
    const rival = enemies[5];
    const after = applyWorldScale(to).size;
    const shift = (after - before) / 2;
    for (const e of enemies) { e.sprite.x += shift; e.sprite.y += shift; }
    const mover = { x: player.x + shift, y: player.y + shift, size: player.size, stage: to };
    const z = zoomFor(player.size, 844, 390, to);
    const cam = { width: 844, height: 390, zoom: z, scrollX: player.x - 422, scrollY: player.y - 195, worldView: {} };
    const half = [844 / z / 2, 390 / z / 2];
    const seen = enemies.filter((e) => {
      const pad = offscreenPad(e.size, e.stage);
      return Math.abs(e.x - mover.x) < half[0] + pad && Math.abs(e.y - mover.y) < half[1] + pad;
    });
    const seenAt = seen.map((e) => [e.x, e.y]);
    const rivalAt = [rival.x, rival.y];
    const scene = { enemies, player: mover, cameras: { main: cam }, cameraBounds: {} };
    const sizesBefore = enemies.map((e) => e.size).join();
    withSeed(900, () => PlayScene.prototype.spreadIntoNewLand.call(scene, before, after, shift));
    assert.equal(enemies.map((e) => e.size).join(), sizesBefore, '크기·단계는 그대로(옮기기만 한다)');
    const inOld = (e) => e.x >= shift && e.x <= shift + before && e.y >= shift && e.y <= shift + before;
    const oldCount = enemies.filter(inOld).length, newCount = enemies.length - oldCount;
    const want = growMoveCount(enemies.length, before, after);
    assert.ok(newCount >= want * 0.9 && newCount <= want, `${from}→${to}: 새 땅 ${newCount} / 옮길 수 ${want}`);
    const ratio = (oldCount / before ** 2) / (newCount / (after ** 2 - before ** 2));
    assert.ok(ratio > 0.85 && ratio < 1.2, `${from}→${to}: 옛 땅 / 새 땅 밀도 ${ratio.toFixed(2)}`);
    assert.deepEqual(seen.map((e) => [e.x, e.y]), seenAt, '지금 화면에 보이는 적은 그대로');
    assert.deepEqual([rival.x, rival.y], rivalAt, '맞수는 그대로');
    // 옮긴 적은 모두 맵 안
    assert.ok(enemies.every((e) => e.x >= 0 && e.x <= after && e.y >= 0 && e.y <= after));
  }
});

test('새로 놓인 보충 적은 spawnGraceSec 동안 먹지도 먹히지도 않고, 지나면 다시 먹는다(좁은 맵에서 놓이자마자 먹혀 보충이 헛도는 것을 막는다)', async () => {
  const { findMeals } = await import('../src/game/enemyAI.js');
  assert.equal(CONFIG.world.spawnGraceSec, 5);
  const big = { x: 100, y: 100, size: 14, stage: 1 };
  const small = { x: 108, y: 100, size: 8, stage: 1 };
  const grid = buildGrid([big, small], CONFIG.render.enemyCell);
  assert.equal(findMeals(grid, undefined, 1).length, 1, '겹친 큰 적은 작은 적을 먹는다');
  small.graceUntil = 5; // 작은 적이 방금 놓였다
  assert.equal(findMeals(buildGrid([big, small], CONFIG.render.enemyCell), undefined, 1).length, 0, '새로 놓인 먹이는 먹히지 않는다');
  big.graceUntil = 5;
  small.graceUntil = 0;
  assert.equal(findMeals(buildGrid([big, small], CONFIG.render.enemyCell), undefined, 1).length, 0, '새로 놓인 사냥꾼은 먹지 못한다');
  assert.equal(findMeals(buildGrid([big, small], CONFIG.render.enemyCell), undefined, 5.1).length, 1, '유예가 끝나면 먹는다');
});

test('보충 묶음은 부족분에 비례해 커진다: 부족이 작으면 기본 묶음 24마리, 크면 여러 배(refillBoost 48)이고, 0이면 고정이다', async () => {
  const { refillIncrement } = await import('../src/game/world.js');
  const W = CONFIG.world;
  assert.equal(W.refillBoost, 48);
  assert.equal(refillIncrement(0), W.refillBatch);
  assert.equal(refillIncrement(48), W.refillBatch * 2);
  assert.equal(refillIncrement(240), W.refillBatch * 6);
  assert.ok(refillIncrement(5) < refillIncrement(60) && refillIncrement(60) < refillIncrement(300));
  const saved = W.refillBoost;
  try {
    W.refillBoost = 0;
    assert.equal(refillIncrement(300), W.refillBatch, '0이면 고정 묶음');
  } finally { W.refillBoost = saved; }
});
