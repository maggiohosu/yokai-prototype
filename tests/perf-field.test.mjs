import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { pathToFileURL } from 'node:url';
import { CONFIG } from '../src/config.js';
import { createBooster } from '../src/game/booster.js';
import { Enemy } from '../src/game/enemy.js';
import { buildGrid, findMeals, insertGrid, MealBounds, queryGrid } from '../src/game/enemyAI.js';
import { cameraView } from '../src/game/camera.js';
import { worldFor } from '../src/systems/worldScale.js';
import { createVitality } from '../src/systems/vitality.js';
import { fakeEnemy, makeWorld } from './fixtures-abilities.mjs';
import { eatPair } from '../src/systems/rules.js';
import { eatBlocked } from '../src/game/status.js';
import { drawStageMark, StageMarks } from '../src/art/marks.js';
import { PopulationStress, populationScenario, withSeed } from '../src/game/populationStress.js';

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

test('5단계는 20fps에서 허용하는 50ms를 한 프레임 안에 시뮬레이션한다', () => {
  const elapsed = CONFIG.render.maxDelta * CONFIG.tempo * CONFIG.balance.pace.stageMult[5];
  assert.equal(CONFIG.render.maxSteps, Math.ceil(elapsed / CONFIG.render.maxStep));
});

test('첫 렌더 전과 크기 변경 직후에 현재 스크롤·줌·화면 크기로 시야를 정한다', () => {
  const camera = { scrollX: 200, scrollY: 300, width: 800, height: 400, zoom: 2, worldView: {} };
  const view = cameraView(camera);
  assert.deepEqual([view.left, view.right, view.top, view.bottom], [400, 800, 400, 600]);
  Object.assign(camera, { scrollX: 500, width: 400, zoom: 1 });
  assert.equal(cameraView(camera, view), view);
  assert.deepEqual([view.left, view.right, view.top, view.bottom], [500, 900, 300, 700]);
});

test('인구 시험의 생성 실패는 그 프레임만 중단하고 같은 배치의 격자로 다시 채운다', () => {
  const stress = new PopulationStress(new URLSearchParams('stage=1'));
  let attempts = 0, ticks = 0, firstGrid;
  const scene = {
    enemies: Array.from({ length: 297 }, (_, i) => ({ x: i, y: 500, size: 5 })), // 새 적(y 100)과 떨어진 줄에 둔다
    cameras: { main: { worldView: {} } }, player: { size: 12 },
    spawn(_size, { grid }) {
      firstGrid ??= grid;
      assert.equal(grid, firstGrid);
      if (++attempts === 1) return false;
      const enemy = { x: 300 + attempts, y: 100, size: 6 };
      this.enemies.push(enemy);
      insertGrid(grid, enemy);
      return true;
    },
    tick() { ticks++; },
  };
  stress.update(scene, 16);
  assert.deepEqual([attempts, ticks, scene.enemies.length], [1, 1, 297]);
  stress.update(scene, 16);
  assert.deepEqual([attempts, ticks, scene.enemies.length], [4, 2, 300]);
  assert.equal(queryGrid(firstGrid, 302, 100, 5).length, 3);
});

test('PERF는 업데이트와 렌더가 짝을 이룬 120프레임마다 한 줄을 쓰고 종료 시 리스너를 뗀다', async t => {
  globalThis.Phaser ??= { Scene: class {} };
  const { PlayScene } = await import('../src/scenes/PlayScene.js');
  const game = new EventEmitter();
  const scene = { events: new EventEmitter(), game: { events: game }, enemies: [1, 2], tick() {} };
  const log = t.mock.method(console, 'log', () => {});
  PlayScene.prototype.attachFramePerf.call(scene);
  for (let i = 0; i < 240; i++) {
    game.emit('prerender');
    game.emit('postrender');
    PlayScene.prototype.update.call(scene, i, 16);
    game.emit('prerender');
    game.emit('postrender');
    assert.equal(log.mock.callCount(), Math.floor((i + 1) / 120));
  }
  assert.match(log.mock.calls[0].arguments[0], /^PERF update avg [\d.]+ms max [\d.]+ms render avg [\d.]+ms max [\d.]+ms enemies 2$/);
  scene.events.emit('shutdown');
  assert.equal(game.listenerCount('prerender') + game.listenerCount('postrender'), 0);
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
    const grid = buildGrid(actors, CONFIG.render.enemyCell);
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

test('프레임 중 이동·성장·생성에도 생략한 먹기 후보와 전체 격자의 먹기 순서가 같다', () => {
  withSeed(713, () => {
    const actors = Array.from({ length: 160 }, (_, i) => ({
      x: Math.random() * 1200 - 60, y: Math.random() * 600, size: 4 + Math.random() * 17,
      stage: i % 5 + 1, fearUntil: i % 8 ? 0 : 10,
    }));
    const bounds = new MealBounds();
    bounds.capture(actors);
    assert.ok(actors.some(a => !a.mealPossible));
    assert.ok(actors.some(a => a.mealPossible));
    let grid;
    function compare(verified) {
      grid = buildGrid(actors, CONFIG.render.enemyCell, grid);
      assert.equal(bounds.valid && actors.every(actor => bounds.contains(actor)), verified);
      assert.deepEqual(findMeals(grid, undefined, 2, [], new Set(), verified), findMeals(grid, undefined, 2));
    }
    for (let i = 0; i < 5; i++) {
      for (const a of actors) { a.x += 0.9; a.y -= 0.8; }
      compare(true);
    }
    actors[7].size += 20;
    compare(false);
    bounds.capture(actors);
    actors.splice(8, 1);
    compare(true);
    actors.push({ x: actors[0].x + 1, y: actors[0].y, size: 9 });
    compare(false);
    actors[0].size = 1200;
    bounds.capture(actors);
    compare(false);
  });
});

test('원거리 이동을 묶어도 근거리의 이동·먹기 순서와 여의주·팔괘경 명중 대상·피해가 같다', async () => {
  globalThis.Phaser ??= { Scene: class {} };
  const { PlayScene } = await import('../src/scenes/PlayScene.js');
  function run(kind, useBounds) {
    return withSeed(731, () => {
      const hits = [], meals = [], calls = [0, 0, 0, 0, 0];
      const actors = [[1110, 1000, 43], [1180, 1000, 39], [920, 1010, 26], [916, 1010, 8], [2900, 1000, 12]]
        .map(([x, y, size], id) => {
          const a = fakeEnemy(x, y, size, {
            id, thinkSlot: id % 4, travelSteps: 0,
            step(_player, h) { this.x += 10 * h; calls[id]++; },
            stepDistant: Enemy.prototype.stepDistant,
            eat(prey) { meals.push([this.id, prey.id]); this.size = Math.hypot(this.size, prey.size); },
          });
          a.sprite.visible = false;
          for (const axis of ['x', 'y']) Object.defineProperty(a.sprite, axis, { get: () => a[axis], set: v => { a[axis] = v; } });
          return a;
        });
      const w = makeWorld({ enemies: actors, level: 15 });
      w.progress.treasure.kind = kind;
      w.combat.applyTreasureDamage = (enemy, damage) => { hits.push([enemy.id, damage]); return damage; };
      const scene = Object.assign(w.scene, {
        stress: true, combat: w.combat, meals: [], eatenThisStep: new Set(), booster: createBooster(),
        hunger: createVitality(5), playerStats: { vitalityMax: 5 }, fireRequested: true,
        enemyFire: { step: () => [] }, applyEnemyHits() {}, resolveMeals: PlayScene.prototype.resolveMeals,
        mealBounds: useBounds ? new MealBounds() : null,
      });
      scene.fx.eatPop = () => {};
      scene.player.step = () => {};
      for (let i = 0; i < 12; i++) PlayScene.prototype.simulate.call(scene, 5 / 60, { x: 1, y: 0 });
      return { hits, meals, calls, positions: scene.enemies.filter(e => e.id !== 4).map(e => [e.id, e.x, e.y]) };
    });
  }
  for (const weapon of ['yeouiju', 'mirror']) {
    const full = run(weapon, false), lod = run(weapon, true);
    assert.ok(full.hits.length && full.meals.length, weapon);
    assert.deepEqual(lod.hits, full.hits);
    assert.deepEqual(lod.meals, full.meals);
    assert.deepEqual(lod.positions, full.positions);
    assert.deepEqual(lod.calls.slice(0, 4), full.calls.slice(0, 4));
    assert.equal(lod.calls[4] * 5, full.calls[4]);
  }
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
async function launchFieldBrowser() {
  const module = process.env.YOKAI_PLAYWRIGHT;
  const { chromium } = await import(module ? pathToFileURL(module).href : 'playwright');
  return chromium.launch({
    channel: 'chrome', headless: true,
    args: ['--enable-gpu', '--autoplay-policy=no-user-gesture-required'], ignoreDefaultArgs: ['--disable-gpu'],
  });
}

async function fieldContext(browser) {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
  if (process.env.YOKAI_PHASER_JS) await context.route('**/phaser.min.js', route =>
    route.fulfill({ path: process.env.YOKAI_PHASER_JS, contentType: 'application/javascript' }));
  if (process.env.YOKAI_FONT) await context.route('**/*.woff2', route => route.fulfill({
    path: process.env.YOKAI_FONT, contentType: 'font/woff2', headers: { 'Access-Control-Allow-Origin': '*' },
  }));
  return context;
}

if (process.env.YOKAI_PERF_URL) test('헤드리스 Chrome 여섯 장면의 인구·발사·프레임 예산', { timeout: 900000 }, async t => {
  const browser = await launchFieldBrowser();
  const rounds = 5;
  const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const overBudget = [];
  try {
    for (const [stage, worldSize, population] of [[1, 1000, 300], [3, 2000, 300], [5, 3300, 300]]) {
      for (const w of ['yeouiju', 'mirror']) {
        const results = [];
        for (let trial = 0; trial < rounds; trial++) {
          const context = await fieldContext(browser);
          try {
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
            const url = new URL(process.env.YOKAI_PERF_URL);
            url.search = new URLSearchParams({ stress: 'population', stage, w, seed: 731 });
            await page.goto(url.href);
            try {
              await page.waitForFunction(() => window.__stressReport?.done, null, { timeout: 120000 });
            } catch (cause) {
              const loading = await page.locator('#loading').textContent();
              throw new Error(`${stage}단계 ${w} ${trial + 1}회차, ${loading}, ${errors.join(' / ')}`, { cause });
            }
            const { report, canvas } = await page.evaluate(() => ({
              report: window.__stressReport,
              canvas: [document.querySelector('#phaser-host canvas').width, document.querySelector('#phaser-host canvas').height],
            }));
            assert.deepEqual(errors, []);
            assert.deepEqual(canvas, [1688, 780]);
            assert.equal(report.worldSize, worldSize);
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
        t.diagnostic(JSON.stringify({
          stage, worldSize, population, w, rounds, ...measures, simP95: ms('simMs', 'p95'), drawP95: ms('drawMs', 'p95'),
          trials: results.map(r => ({ interval: r.intervalMs.avg, p95: r.intervalMs.p95, sim: r.simMs.avg, draw: r.drawMs.avg })),
          initialStages: results[0].initialStages, fires: results[0].fires, hits: results[0].hits, steps: results[0].steps,
        }));
        if (measures.avg > 18 || measures.p95 > 25 || measures.sim > 6 || measures.draw > 6) overBudget.push({ stage, w, ...measures });
      }
    }
    assert.deepEqual(overBudget, [], '장면별 프레임 예산 초과');
  } finally { await browser.close(); }
});

async function measureRefill() {
  const scene = window.__yokai.scene.getScene('Play');
  const { CONFIG } = await import('./src/config.js');
  const { FORMS } = await import('./src/data/forms.js');
  const { loadProgress, newSlotProgress, slotKey } = await import('./src/state/save.js');
  const { withSeed } = await import('./src/game/populationStress.js');
  const rows = [];
  for (const stage of [1, 3, 5]) {
    const formId = stage === 1 ? 'mimul' : FORMS.find(f => f.stage === stage && f.entry).id;
    const progress = { ...newSlotProgress(), formId, stage, x: 13000, y: -500 };
    localStorage.setItem(slotKey(2), JSON.stringify({ version: 1, progress }));
    for (let seed = 731; seed < 736; seed++) {
      const row = { stage, seed, initialCalls: 0, initialFailed: 0, calls: 0, failed: 0, onScreen: 0, frames: 0 };
      const spawn = scene.spawn;
      const seedEnemies = scene.seedEnemies;
      const createField = scene.createField;
      let start;
      scene.createField = function (data) {
        start = performance.now();
        return createField.call(this, data);
      };
      const seeded = new Promise(resolve => {
        scene.seedEnemies = function () {
          this.spawn = function (size, options) {
            row.initialCalls++;
            const ok = spawn.call(this, size, options);
            if (!ok) row.initialFailed++;
            return ok;
          };
          withSeed(seed, () => seedEnemies.call(this));
          this.spawn = spawn;
          this.paused = true;
          row.initialMs = performance.now() - start;
          row.initialCount = this.enemies.length;
          row.target = CONFIG.world.population;
          row.size = CONFIG.world.size;
          row.center = [this.player.x, this.player.y];
          const cam = this.cameras.main;
          row.zoom = cam.zoom / devicePixelRatio;
          row.visibleCenters = this.enemies.filter(enemy =>
            Math.abs(enemy.x - this.player.x) <= cam.width / (2 * cam.zoom) &&
            Math.abs(enemy.y - this.player.y) <= cam.height / (2 * cam.zoom)).length;
          row.playerWidth = this.player.sprite.displayWidth * row.zoom;
          row.firstEnemyWidth = this.enemies[0].sprite.displayWidth * row.zoom;
          resolve();
        };
      });
      scene.scene.restart({ progress: loadProgress(localStorage, 2) });
      await seeded;
      scene.createField = createField;
      scene.seedEnemies = seedEnemies;
      for (const enemy of scene.enemies.splice(-24)) enemy.destroy();
      const simulate = scene.simulate;
      scene.simulate = elapsed => elapsed; // 보충 중 다른 적이 먹혀 빈자리가 늘어나는 것을 막는다.
      scene.paused = false;
      scene.preview = true;
      scene.spawn = function (size, options) {
        row.calls++;
        if (!spawn.call(this, size, options)) { row.failed++; return false; }
        const bounds = this.lastSpawned.sprite.getBounds();
        const v = options.view;
        if (bounds.right > v.left && bounds.left < v.right && bounds.bottom > v.top && bounds.top < v.bottom) row.onScreen++;
        return true;
      };
      withSeed(seed, () => {
        while (scene.enemies.length < row.target && row.frames < 180) {
          scene.tick(1000 / 60);
          row.frames++;
        }
      });
      row.restored = scene.enemies.length;
      scene.paused = true;
      scene.simulate = simulate;
      scene.spawn = spawn;
      rows.push(row);
    }
  }
  return rows;
}

if (process.env.YOKAI_PERF_URL) test('능력·무기 단독 시험은 4000 월드의 72마리로 실행한다', async () => {
  const browser = await launchFieldBrowser();
  try {
    const context = await fieldContext(browser);
    const page = await context.newPage();
    for (const mode of ['abilities', 'weapons']) {
      const url = new URL(process.env.YOKAI_PERF_URL);
      url.search = new URLSearchParams({ stress: mode, only: 'chain', w: 'mirror', ms: 300 });
      await page.goto(url.href);
      await page.waitForFunction(() => window.__stressReport?.done);
      const field = await page.evaluate(async () => {
        const { CONFIG } = await import('./src/config.js');
        const { worldFor } = await import('./src/systems/worldScale.js');
        return [CONFIG.world.size, window.__stressReport.population, worldFor(1).size];
      });
      assert.deepEqual(field, [4000, 72, 1000]);
    }
  } finally { await browser.close(); }
});

if (process.env.YOKAI_PERF_URL) test('일반 슬롯 이어하기와 화면 밖 보충을 3개 단계·5개 시드에서 확인한다', { timeout: 120000 }, async t => {
  const browser = await launchFieldBrowser();
  try {
    const context = await fieldContext(browser);
    const page = await context.newPage();
    await page.goto(new URL('?debug=', process.env.YOKAI_PERF_URL).href);
    await page.waitForFunction(() => window.__yokai?.scene.scenes[0]?.hud);
    const rows = await page.evaluate(measureRefill);
    for (const r of rows) {
      assert.equal(r.size, worldFor(r.stage).size);
      assert.equal(r.initialCount, r.target);
      assert.equal(r.initialCalls - r.initialFailed, r.target);
      if (r.stage === 1 && r.seed === 731) {
        assert.ok(Math.abs(r.zoom - 1.43948598) < 1e-6);
        assert.ok(Math.abs(r.playerWidth - 51.1817) < 0.01);
        assert.ok(Math.abs(r.firstEnemyWidth - 31.8791) < 0.01);
      }
      assert.deepEqual(r.center, [r.size / 2, r.size / 2]);
      assert.equal(r.restored, r.target);
      assert.equal(r.onScreen, 0);
      assert.equal(r.failed, 0);
      assert.equal(r.calls, 24);
      assert.equal(r.frames, Math.ceil(24 / CONFIG.render.refillPerFrame)); // 24마리를 프레임당 refillPerFrame마리씩(예전 3마리 → 20프레임, 지금 6마리 → 4프레임)
    }
    t.diagnostic('REFILL ' + JSON.stringify(rows));
  } finally { await browser.close(); }
});

// 일반 판 60초(60fps, 플레이어가 2초마다 방향을 바꾸며 걷고 무기를 계속 쏜다)의 적 분포와 인구. 플레이어는 먹히지 않게 두었다.
// 몰림 지표 R = Clark–Evans 최근접 이웃 비(경계 보정, Donnelly): 1이면 무작위, 1보다 작으면 몰림. 판 시작 직후와 60초 뒤 모두 0.9 이상이어야 한다.
async function liveField({ stage, seed, seconds }) {
  const [{ FORMS }, { createProgress }, { CONFIG }] = await Promise.all([
    import('./src/data/forms.js'), import('./src/systems/progress.js'), import('./src/config.js'),
  ]);
  const game = window.__yokai;
  game.loop.sleep();
  let state = seed;
  Math.random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  const progress = Object.assign(createProgress(), {
    stage, difficulty: 'normal', grade: 'C', formId: stage === 1 ? 'mimul' : FORMS.find(f => f.stage === stage && f.entry).id,
    treasure: { kind: 'yeouiju', level: 0 },
  });
  game.scene.stop('Play');
  game.scene.start('Play', { progress });
  const scene = game.scene.getScene('Play');
  game.loop.sleep();
  Object.assign(scene, { openQuickPick() {}, ascend() {}, applyEnemyHits() {}, endRun() {} });
  const resolve = scene.resolveMeals.bind(scene);
  scene.resolveMeals = (...args) => {
    const before = scene.stress;
    scene.stress = {};
    try { return resolve(...args); } finally { scene.stress = before; }
  };
  const side = CONFIG.world.size;
  const R = () => {
    const pts = scene.enemies.filter(e => e.sprite.active), n = pts.length;
    let sum = 0;
    for (const a of pts) {
      let best = Infinity;
      for (const b of pts) if (a !== b) best = Math.min(best, Math.hypot(a.x - b.x, a.y - b.y));
      sum += best;
    }
    return sum / n / (0.5 * Math.sqrt(side * side / n) + (0.0514 + 0.041 / Math.sqrt(n)) * 4 * side / n);
  };
  const camera = scene.cameras.main, dt = 1 / 60; // 실제 60fps 프레임: 보충은 프레임당 3마리까지라 프레임 길이가 보충 처리량을 정한다
  let heading = seed * 0.43, rng = seed * 7 + 1;
  scene.joystick.direction = () => ({ x: Math.cos(heading), y: Math.sin(heading) });
  const r0 = R(), n0 = scene.enemies.length;
  let sum = 0, min = Infinity;
  const frames = Math.round(seconds / dt);
  for (let frame = 0; frame < frames; frame++) {
    if (frame % 60 === 0) heading += ((rng = (Math.imul(rng, 1103515245) + 12345) >>> 0) / 4294967296 - 0.5) * 2.4;
    scene.fireRequested = true;
    camera.centerOn(scene.player.x, scene.player.y);
    camera.preRender();
    scene.tick(dt * 1000, frame * dt * 1000);
    const n = scene.enemies.filter(e => e.sprite.active).length;
    sum += n;
    min = Math.min(min, n);
  }
  return { stage, seed, size: side, target: CONFIG.world.population, r0, n0, r60: R(), n60: scene.enemies.length, meanCount: sum / frames, minCount: min };
}

if (process.env.YOKAI_PERF_URL) test('일반 판 60초: 몰림 지표 R이 시작 직후와 60초 뒤 모두 0.9 이상이고 1~5단계 모두 평균 인구가 목표(300)의 95%, 최저가 목표의 90%(270) 이상이다', { timeout: 600000 }, async t => {
  const browser = await launchFieldBrowser();
  try {
    for (const stage of [1, 2, 3, 4, 5]) {
      const context = await fieldContext(browser);
      try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(new URL('?debug=', process.env.YOKAI_PERF_URL).href);
        await page.waitForFunction(() => window.__yokai?.scene.getScene('Play')?.player);
        const r = await page.evaluate(liveField, { stage, seed: 731, seconds: 60 });
        t.diagnostic('LIVE ' + JSON.stringify(r));
        assert.deepEqual(errors, []);
        assert.equal(r.size, worldFor(stage).size);
        assert.equal(r.n0, r.target);
        assert.ok(r.r0 >= 0.9, `${stage}단계 시작 직후 R ${r.r0}`);
        assert.ok(r.r60 >= 0.9, `${stage}단계 60초 뒤 R ${r.r60}`);
        // 사용자 지시 '적 수 고정'(480 → 300, 변경 이력 21): 1~5단계 모두 60초 평균 95%(285) 이상, 최저 90%(270) 이상이어야 한다(보충 묶음·한 프레임 보충 상한·새로 놓인 적 유예, plan.md 변경 이력 16). 옛 480마리 때의 최저 430은 같은 비율(약 90%)로 줄였다.
        assert.ok(r.meanCount >= r.target * 0.95, `${stage}단계 60초 평균 인구 ${r.meanCount} < 목표 ${r.target}의 95%`);
        assert.ok(r.minCount >= r.target * 0.9, `${stage}단계 60초 최저 인구 ${r.minCount} < 목표의 90%`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
});
