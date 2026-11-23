import test from 'node:test';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { Enemy } from '../src/game/enemy.js';
import { EnemyFire, canBeSpecial, rollSpecial, specialRule } from '../src/game/enemyFire.js';

// 난이도 × 플레이어 단계별 [chance, cooldown]. 값은 docs/balance-v4.md 17절의 측정(시드 15판, 시드당 정상 템포 60초)으로 맞췄다.
// 표를 바꾸면 아래 MEASURED의 chance·cooldown과 분당 발사 수도 다시 재서 함께 고쳐야 한다.
const TABLE = {
  easy: [[0.3, 3.6], [0.3, 7.9], [0.16, 10]],
  normal: [[0.3, 3.4], [0.3, 5.9], [0.3, 8.2]],
  hard: [[0.3, 3.6], [0.3, 3], [0.3, 3.9]],
};

test('플레이어 난이도와 단계가 특수 적 비율·발사 간격을 정한다', () => {
  for (const [difficulty, rows] of Object.entries(TABLE)) {
    for (const stage of [1, 2]) assert.equal(specialRule(stage, difficulty), CONFIG.special);
    for (const [i, [chance, cooldown]] of rows.entries()) {
      assert.deepEqual(specialRule(i + 3, difficulty), { chance, cooldown });
    }
  }
  assert.deepEqual(Object.keys(CONFIG.special.byStage), ['easy', 'normal', 'hard']);
  for (const rows of Object.values(CONFIG.special.byStage)) assert.deepEqual(Object.keys(rows), ['3', '4', '5']);
  assert.equal(CONFIG.special.chance, 0.3);
  assert.equal(CONFIG.special.cooldown, 2.2);
  assert.equal(CONFIG.special.rewardMult, 8);
  assert.equal(specialRule(4, 'unknown'), CONFIG.special.byStage.normal[4]);
});

test('쿨타임이 1차 수단이다: 모든 칸의 쿨타임이 기본 2.2보다 길고 10 이하, chance는 쿨타임 10으로도 모자란 이지 5단계만 0.3보다 낮다', () => {
  for (const [difficulty, rows] of Object.entries(CONFIG.special.byStage)) {
    for (const [stage, { chance, cooldown }] of Object.entries(rows)) {
      assert.ok(cooldown > CONFIG.special.cooldown && cooldown <= 10, `${difficulty} ${stage}단계 쿨타임 ${cooldown}`);
      if (difficulty === 'easy' && stage === '5') assert.ok(chance < 0.3 && cooldown === 10, `${difficulty} ${stage}단계`);
      else assert.equal(chance, 0.3, `${difficulty} ${stage}단계 chance`);
    }
  }
});

// 측정 기록: 같은 시드의 판을 (chance, cooldown)으로 다시 돌린 분당 화면 안 발사 수의 중앙값(15판).
// old는 배포판 4182ded(12판), afterRule은 5단계 적만 쏘게 바꾼 직후(chance 0.3·쿨타임 2.2), perMin은 아래 표 값이다.
// 상한 T3·T4는 이전 계획(노말 3단계 B/3, 4단계 2B/3, B = 4182ded 노말 3단계 분당 98발)의 쿨타임을 이지에 적용했을 때의 이지 3·4단계 빈도다.
const MEASURED = {
  B: 98, T3: 27.8, T4: 83.7,
  cells: {
    easy3: { chance: 0.3, cooldown: 3.6, old: 68, afterRule: 45.8, perMin: 28.0 },
    easy4: { chance: 0.3, cooldown: 7.9, old: 127, afterRule: 98.4, perMin: 28.1 },
    easy5: { chance: 0.16, cooldown: 10, old: 193, afterRule: 217.7, perMin: 28.3 },
    normal3: { chance: 0.3, cooldown: 3.4, old: 98, afterRule: 41.2, perMin: 27.5 },
    normal4: { chance: 0.3, cooldown: 5.9, old: 158, afterRule: 96.5, perMin: 28.1 },
    normal5: { chance: 0.3, cooldown: 8.2, old: 233, afterRule: 184.1, perMin: 27.9 },
    hard3: { chance: 0.3, cooldown: 3.6, old: 104, afterRule: 47.4, perMin: 27.1 },
    hard4: { chance: 0.3, cooldown: 3, old: 190, afterRule: 119.2, perMin: 83.9 },
    hard5: { chance: 0.3, cooldown: 3.9, old: 264, afterRule: 156, perMin: 83.9 },
  },
};

test('측정 기록의 값이 설정 표와 같고 상한 ±15% 안이다: 이지·노말 3~5단계와 하드 3단계는 T3, 하드 4·5단계는 T4', () => {
  assert.ok(MEASURED.T3 < MEASURED.T4 && MEASURED.T4 < MEASURED.B);
  for (const [name, cell] of Object.entries(MEASURED.cells)) {
    const [, difficulty, stage] = /^(easy|normal|hard)(\d)$/.exec(name);
    assert.deepEqual(specialRule(+stage, difficulty), { chance: cell.chance, cooldown: cell.cooldown }, name);
    const cap = difficulty === 'hard' && +stage >= 4 ? MEASURED.T4 : MEASURED.T3;
    assert.ok(cell.afterRule > cap, `${name}은 규칙 변경 직후 상한(${cap})을 넘어 쿨타임을 늘렸다`);
    assert.ok(Math.abs(cell.perMin / cap - 1) <= 0.15, `${name} ${cell.perMin} / 상한 ${cap}`);
    assert.ok(cell.perMin < cell.old, `${name}은 배포판(${cell.old}발/분)보다 적다`);
  }
});

test('요력 대박 확률은 chance가 정한다: 0.3을 지킨 칸은 5단계 적의 기대 배율이 그대로이고, 이지 5단계는 낮아진 만큼만 준다', () => {
  const jackpot = chance => 1 + (CONFIG.special.rewardMult - 1) * chance;
  const change = (difficulty, stage) => jackpot(CONFIG.special.byStage[difficulty][stage].chance) / jackpot(0.3) - 1;
  for (const difficulty of ['easy', 'normal', 'hard']) for (const stage of [3, 4, 5]) {
    if (difficulty === 'easy' && stage === 5) continue;
    assert.equal(change(difficulty, stage), 0, `${difficulty} ${stage}단계`);
  }
  assert.ok(Math.abs(change('easy', 5) - -0.316) < 0.001, String(change('easy', 5)));
});

function shooter(scene, stage, roll) {
  const enemy = Object.assign(Object.create(Enemy.prototype), { scene, stage, size: 12, sprite: { x: 150, y: 100 } });
  enemy.rollOrbTrait(() => roll);
  return enemy;
}

test('5단계 적만 특수 적이 될 수 있다: 1~4단계 적은 추첨값과 상관없이 구슬을 쏘지 않는다', () => {
  assert.equal(CONFIG.pace.maxStage, 5);
  assert.deepEqual([1, 2, 3, 4, 5].map(canBeSpecial), [false, false, false, false, true]);
  for (const stage of [1, 2, 3, 4]) assert.equal(rollSpecial(50, stage, () => 0, 1), false, `${stage}단계`);
  assert.equal(rollSpecial(50, 5, () => 0, 0.3), true);
  assert.equal(rollSpecial(50, 5, () => 0.3, 0.3), false);
  for (const difficulty of ['easy', 'normal', 'hard']) for (const playerStage of [1, 2, 3, 4, 5]) {
    const scene = { player: { x: 100, y: 100, size: 10, stage: playerStage }, difficulty };
    for (const stage of [1, 2, 3, 4]) {
      const enemy = shooter(scene, stage, 0);
      assert.equal(enemy.special, false, `${difficulty} 플레이어 ${playerStage}단계 / 적 ${stage}단계`);
      assert.equal(new EnemyFire(scene).tryFire(Object.assign(enemy, { fireCd: 0 }), scene.player, 1), false);
    }
    assert.equal(shooter(scene, 5, 0).special, true, `${difficulty} 플레이어 ${playerStage}단계 / 적 5단계`);
  }
});

test('특수 적(5단계 적)의 실제 간격은 플레이어 단계와 난이도를 따른다', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    for (const playerStage of [2, 3, 4, 5]) {
      const player = { x: 100, y: 100, size: 10, stage: playerStage };
      const scene = { player, difficulty };
      const fire = new EnemyFire(scene);
      const rule = specialRule(playerStage, difficulty);
      const enemy = shooter(scene, 5, rule.chance / 2);
      assert.equal(shooter(scene, 2, 0).special, false);
      assert.equal(shooter(scene, 5, rule.chance).special, false);
      enemy.fireCd = 0;
      assert.equal(fire.tryFire(enemy, player, 0), true);
      assert.equal(fire.tryFire(enemy, player, rule.cooldown - 0.01), false);
      assert.equal(fire.tryFire(enemy, player, 0.011), true);
    }
  }
});

test('플레이어 단계가 바뀌면 기존 적은 추첨값과 남은 대기 비율을 지키고 맞수는 계속 발사하지 않는다', () => {
  const player = { stage: 2 };
  const scene = { player, difficulty: 'normal' };
  const ready = shooter(scene, 5, 0);
  ready.fireCd = CONFIG.special.cooldown / 2;
  player.stage = 5;
  ready.refreshOrbRule();
  assert.equal(ready.specialDraw, 0);
  assert.equal(ready.special, true);
  assert.equal(ready.fireCd, specialRule(5, 'normal').cooldown / 2);
  const excluded = shooter(scene, 5, specialRule(5, 'normal').chance);
  assert.equal(excluded.special, false);
  ready.rival = true;
  ready.refreshOrbRule();
  assert.equal(ready.special, false);
  assert.equal(ready.fireCd, undefined);
});

test('이지에서 진화하면 쿨타임 대기가 비례해 늘고, 5단계에서 낮아진 chance 밖의 적은 특수 적에서 빠진다', () => {
  const player = { stage: 3 };
  const scene = { player, difficulty: 'easy' };
  const kept = shooter(scene, 5, 0.05), dropped = shooter(scene, 5, 0.2);
  assert.deepEqual([kept.special, dropped.special], [true, true]);
  kept.fireCd = specialRule(3, 'easy').cooldown / 2;
  dropped.fireCd = 1;
  player.stage = 4;
  kept.refreshOrbRule();
  dropped.refreshOrbRule();
  assert.deepEqual([kept.special, dropped.special], [true, true]);
  assert.ok(Math.abs(kept.fireCd - specialRule(4, 'easy').cooldown / 2) < 1e-9, `4단계 남은 대기 ${kept.fireCd}`);
  assert.equal(kept.firePeriod, specialRule(4, 'easy').cooldown);
  player.stage = 5;
  kept.refreshOrbRule();
  dropped.refreshOrbRule();
  assert.equal(kept.special, true);
  assert.ok(Math.abs(kept.fireCd - specialRule(5, 'easy').cooldown / 2) < 1e-9, `5단계 남은 대기 ${kept.fireCd}`);
  assert.equal(dropped.special, false);
  assert.equal(dropped.fireCd, undefined);
  assert.equal(shooter(scene, 5, specialRule(5, 'easy').chance).special, false);
});

async function sampleField({ difficulty, stage, seed, seconds = 24 }) {
  const [{ FORMS }, { createProgress }, { mealYoryeok }] = await Promise.all([
    import('./src/data/forms.js'), import('./src/systems/progress.js'), import('./src/game/session.js'),
  ]);
  const game = window.__yokai;
  game.loop.sleep();
  let state = seed;
  Math.random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  const progress = Object.assign(createProgress(), {
    stage, difficulty, grade: 'C', formId: FORMS.find(f => f.stage === stage && f.entry).id,
    treasure: { kind: 'yeouiju', level: 0 },
  });
  game.scene.stop('Play');
  game.scene.start('Play', { progress });
  const scene = game.scene.getScene('Play');
  game.loop.sleep();
  scene.openQuickPick = () => {};
  scene.ascend = () => {};
  scene.applyEnemyHits = () => {};
  // 실제 먹기·AI·보충이 도는 동안, 시드마다 같은 시간만큼 노출되도록 플레이어의 피격 피해와 접촉 사망만 제외한다.
  const resolve = scene.resolveMeals.bind(scene);
  scene.resolveMeals = (...args) => {
    const before = scene.stress;
    scene.stress = {};
    try { return resolve(...args); } finally { scene.stress = before; }
  };
  const fire = scene.enemyFire;
  const tryFire = fire.tryFire.bind(fire), step = fire.step.bind(fire);
  let shots = 0, hits = 0, reward = 0, jackpot = 0, meals = 0, specialMeals = 0;
  let view;
  fire.tryFire = (enemy, ...args) => {
    const fired = tryFire(enemy, ...args);
    if (fired && enemy.x >= view.left && enemy.x <= view.right && enemy.y >= view.top && enemy.y <= view.bottom) shots++;
    return fired;
  };
  fire.step = (...args) => {
    const incoming = step(...args);
    hits += incoming.length;
    return incoming;
  };
  scene.events.on('eat', meal => {
    const gain = mealYoryeok(meal);
    reward += gain;
    meals++;
    if (meal.special) {
      specialMeals++;
      jackpot += gain - mealYoryeok({ ...meal, special: false });
    }
  });
  const camera = scene.cameras.main, dt = 1 / 30;
  let angle = seed * 0.43;
  scene.joystick.direction = () => ({ x: Math.cos(angle), y: Math.sin(angle) });
  for (let frame = 0; frame < seconds / dt; frame++) {
    angle = seed * 0.43 + frame * dt * 0.37;
    scene.fireRequested = true;
    camera.centerOn(scene.player.x, scene.player.y);
    camera.preRender();
    view = { left: camera.worldView.left, right: camera.worldView.right, top: camera.worldView.top, bottom: camera.worldView.bottom };
    scene.tick(dt * 1000, frame * dt * 1000);
    if (scene.ended || scene.paused || scene.player.stage !== stage) throw new Error('측정 판이 도중에 종료됨');
  }
  return { difficulty, stage, seed, seconds, shots, hits, meals, specialMeals, reward, jackpot };
}

if (process.env.YOKAI_FIRE_URL) test('고정 시드 일반 판에서 화면 안 적 발사와 요력 보상을 센다', { timeout: 900000 }, async t => {
  const driver = process.env.YOKAI_PLAYWRIGHT;
  const { chromium } = await import(driver ? pathToFileURL(driver).href : 'playwright');
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu'], ignoreDefaultArgs: ['--disable-gpu'] });
  try {
    for (const difficulty of ['easy', 'normal', 'hard']) for (const stage of [3, 4, 5]) {
      const samples = [];
      for (const seed of [731, 732, 733, 734, 735]) {
        const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
        try {
          if (process.env.YOKAI_PHASER_JS) await context.route('**/phaser.min.js', r =>
            r.fulfill({ path: process.env.YOKAI_PHASER_JS, contentType: 'application/javascript' }));
          if (process.env.YOKAI_FONT) await context.route('**/*.woff2', r => r.fulfill({
            path: process.env.YOKAI_FONT, contentType: 'font/woff2', headers: { 'Access-Control-Allow-Origin': '*' },
          }));
          const page = await context.newPage();
          const url = new URL(process.env.YOKAI_FIRE_URL);
          url.search = 'debug=';
          await page.goto(url.href);
          await page.waitForFunction(() => window.__yokai?.scene.getScene('Play')?.player);
          samples.push(await page.evaluate(sampleField, { difficulty, stage, seed }));
        } finally { await context.close(); }
      }
      t.diagnostic(JSON.stringify({ difficulty, stage, samples }));
    }
  } finally { await browser.close(); }
});
