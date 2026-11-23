import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { CONFIG } from '../src/config.js';
import { createBooster } from '../src/game/booster.js';
import { Enemy } from '../src/game/enemy.js';
import { buildGrid, findMeals, insertGrid, queryGrid } from '../src/game/enemyAI.js';
import { eatPair } from '../src/systems/rules.js';
import { eatBlocked } from '../src/game/status.js';
import { drawStageMark, StageMarks } from '../src/art/marks.js';
import { populationScenario, withSeed } from '../src/game/populationStress.js';

test('느린 프레임도 이동·충돌 단계의 길이를 지키고 남은 시간을 다음 프레임에 소화한다', async () => {
  globalThis.Phaser ??= { Scene: class {} };
  const { PlayScene } = await import('../src/scenes/PlayScene.js');
  const lengths = [];
  const scene = {
    enemies: [], simTime: 0, pace: 1, boostMult: 1, booster: createBooster(), stress: true,
    player: { step: (_direction, h) => lengths.push(h) }, combat: { step() {} }, enemyFire: { step: () => [] },
    resolveMeals() {}, applyEnemyHits() {},
  };
  const h = CONFIG.render.maxStep, limit = CONFIG.render.maxSteps;
  const advance = elapsed => PlayScene.prototype.simulate.call(scene, elapsed, { x: 0, y: 0 });
  advance((limit + 2) * h);
  assert.equal(lengths.length, limit);
  assert.ok(lengths.every(s => s <= h));
  assert.ok(Math.abs(scene.simDebt - 2 * h) < 1e-12);
  advance(h);
  assert.ok(Math.abs(scene.simTime - (limit + 3) * h) < 1e-12);
  assert.equal(scene.simDebt, 0);
});

test('보충 묶음은 인구 배율과 함께 바뀐다', () => {
  const world = CONFIG.world, current = world.populationMult;
  try {
    for (const mult of [1, 2, 3]) {
      world.populationMult = mult;
      assert.equal(world.refillBatch, 4 * mult);
    }
  } finally { world.populationMult = current; }
});

test('먼 적도 조향을 쉬는 단계에 밀림·빙결·매혹 유예를 즉시 적용한다', () => {
  const player = { x: 900, y: 200, size: 5, stage: 1 };
  const enemy = {
    x: 200, y: 200, size: 12, stage: 1, vx: 8, vy: 2, scene: { simTime: 1 },
    sprite: { active: true }, knockUntil: 2, knockVx: 10, knockVy: 0, frozenUntil: 2,
    aiIntent: { mode: 'chase', target: player }, aiTimer: 1, steer: {},
    push(dx, dy) { this.x += dx; this.y += dy; }, move(dx, dy) { this.push(dx, dy); },
  };
  const grid = buildGrid([enemy], 128);
  Enemy.prototype.step.call(enemy, player, 0.1, grid, false);
  assert.equal(enemy.x, 201);
  assert.equal(enemy.vx, 0);
  enemy.scene.simTime = 3;
  enemy.charmUntil = 2;
  enemy.charmGraceUntil = 5;
  Enemy.prototype.step.call(enemy, player, 0.1, grid, false);
  assert.equal(enemy.aiIntent.mode, 'flee');
  assert.equal(enemy.aiIntent.target, player);
  assert.ok(enemy.vx < 0);
});

test('시드와 시험 조건을 재현하고, 예외가 나도 원래 난수를 복원한다', () => {
  const original = Math.random;
  const trial = () => Array.from({ length: 8 }, () => Math.random());
  assert.deepEqual(withSeed(731, trial), withSeed(731, trial));
  assert.notDeepEqual(withSeed(731, trial), withSeed(732, trial));
  assert.throws(() => withSeed(1, () => { throw Error('중단'); }));
  assert.equal(Math.random, original);
  assert.deepEqual(populationScenario(new URLSearchParams('stage=3&w=mirror')), { stage: 3, weapon: 'mirror', seed: 731 });
});

test('격자 재구축은 칸 배열을 재사용하고, 이동·사망·추가·셀 크기 변경을 반영한다', () => {
  const a = { x: -20, y: -5, size: 12 }, b = { x: 41, y: 41, size: 32 };
  const grid = buildGrid([a, b], 32);
  const firstBucket = grid.pool[0];
  b.dead = true;
  a.x = a.y = 500;
  assert.equal(buildGrid([b, a], 128, grid), grid);
  assert.equal(grid.pool[0], firstBucket);
  assert.deepEqual(queryGrid(grid, 0, 0, 100), []);
  assert.deepEqual(queryGrid(grid, 500, 500, 5), [a]);
  assert.equal(grid.maxSize, 12);
  const c = { x: 505, y: 500, size: 36 };
  insertGrid(grid, c);
  assert.deepEqual(queryGrid(grid, 500, 500, 5), [a, c]);
  assert.equal(grid.maxSize, 36);
});

test('직접 순회한 먹기 쌍은 같은 격자·순서의 기존 조회와 일치한다', () => {
  withSeed(731, () => {
    const actors = Array.from({ length: 180 }, (_, id) => ({
      id, x: Math.random() * 480, y: Math.random() * 480, size: 6 + Math.random() * 35,
      stage: 1 + (id % 5), frozenUntil: id % 6 ? 0 : 10,
    }));
    const grid = buildGrid(actors, 128);
    const eaten = new Set(), expected = [];
    for (const bucket of grid.buckets.values()) {
      for (const a of bucket) {
        for (const b of queryGrid(grid, a.x, a.y, a.size + grid.maxSize)) {
          if (a === b || eaten.has(a) || eaten.has(b)) continue;
          const pair = eatPair(a, b);
          if (!pair || eatBlocked(pair[0], 2)) continue;
          expected.push(pair.map(e => e.id));
          eaten.add(pair[1]);
        }
      }
    }
    assert.ok(expected.length > 10);
    assert.deepEqual(findMeals(grid, undefined, 2).map(pair => pair.map(e => e.id)), expected);
  });
});

test('같은 단계 점은 한 번 굽고 카메라를 벗어났다가 돌아오면 같은 이미지를 쓴다', () => {
  const previous = globalThis.window;
  globalThis.window = { devicePixelRatio: 2 };
  try {
    let bakes = 0, arcs = 0, images = 0;
    const textures = new Set();
    const graphics = new Proxy({}, { get: (_, key) => (...args) => {
      if (key === 'arc') arcs++;
      if (key === 'generateTexture') { bakes++; textures.add(args[0]); }
      return graphics;
    } });
    const scene = {
      cameras: { main: { zoom: 2, worldView: { left: 0, right: 200, top: 0, bottom: 200 } } },
      make: { graphics: () => graphics }, textures: { exists: key => textures.has(key) },
      add: { image(x, y, key) {
        images++;
        return {
          texture: { key }, visible: true,
          setDepth() { return this; }, setPosition(x, y) { Object.assign(this, { x, y }); },
          setScale(s) { this.scaleX = s; }, setVisible(v) { this.visible = v; },
        };
      } },
    };
    const cache = new StageMarks(scene);
    const actor = { x: 100, y: 110, size: 12, stage: 3 };
    const draw = () => { drawStageMark({ scene }, actor, 2, 0, cache); cache.finish(); };
    draw(); draw();
    assert.equal(arcs, 3);
    assert.equal(bakes, 1);
    actor.x = 400;
    draw();
    assert.equal(cache.images[0].visible, false);
    actor.x = 120;
    draw();
    assert.equal(cache.images[0].visible, true);
    assert.equal(cache.images[0].x, 120);
    assert.equal(images, 1);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});

// 일반 규칙 시험에는 브라우저 의존성이 없다. 서버 주소를 주면 실제 Chrome까지 검증한다.
if (process.env.YOKAI_PERF_URL) test('헤드리스 Chrome 여섯 장면의 인구·발사·프레임 예산', { timeout: 900000 }, async t => {
  const module = process.env.YOKAI_PLAYWRIGHT;
  const { chromium } = await import(module ? pathToFileURL(module).href : 'playwright');
  const browser = await chromium.launch({
    channel: 'chrome', headless: true,
    args: ['--enable-gpu', '--autoplay-policy=no-user-gesture-required'], ignoreDefaultArgs: ['--disable-gpu'],
  });
  const rounds = 5;
  const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  try {
    for (const [stage, population] of [[1, 216], [3, 480], [5, 852]]) {
      for (const w of ['yeouiju', 'mirror']) {
        const results = [];
        for (let trial = 0; trial < rounds; trial++) {
          const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
          try {
            if (process.env.YOKAI_PHASER_JS) await context.route('**/phaser.min.js', route =>
              route.fulfill({ path: process.env.YOKAI_PHASER_JS, contentType: 'application/javascript' }));
            if (process.env.YOKAI_FONT) await context.route('**/*.woff2', route => route.fulfill({
              path: process.env.YOKAI_FONT, contentType: 'font/woff2', headers: { 'Access-Control-Allow-Origin': '*' },
            }));
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
            const url = new URL(process.env.YOKAI_PERF_URL);
            url.search = new URLSearchParams({ stress: 'population', stage, w, seed: 731 });
            await page.goto(url.href);
            await page.waitForFunction(() => window.__stressReport?.done, null, { timeout: 120000 });
            const { report, canvas } = await page.evaluate(() => ({
              report: window.__stressReport,
              canvas: [document.querySelector('#phaser-host canvas').width, document.querySelector('#phaser-host canvas').height],
            }));
            assert.deepEqual(errors, []);
            assert.deepEqual(canvas, [1688, 780]);
            assert.equal(report.initialCount, population);
            assert.equal(report.minSimStartCount, population);
            assert.equal(report.frames, 180);
            assert.equal(report.weapon, w);
            assert.ok(report.fires > 0);
            results.push(report);
          } finally { await context.close(); }
        }
        const ms = (key, stat = 'avg') => median(results.map(r => r[key][stat]));
        const measures = { avg: ms('intervalMs'), p95: ms('intervalMs', 'p95'), sim: ms('simMs'), draw: ms('drawMs') };
        t.diagnostic(JSON.stringify({ stage, w, rounds, ...measures }));
        assert.ok(measures.avg <= 18 && measures.p95 <= 25 && measures.sim <= 6 && measures.draw <= 6, JSON.stringify(measures));
      }
    }
  } finally { await browser.close(); }
});
