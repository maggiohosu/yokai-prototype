import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { rollSpawnSize, sizeWeights, spawnSize, spawnStage, startStage } from '../src/game/world.js';
import { livesFor, onRunEnd, stageWeightsFor } from '../src/systems/difficulty.js';
import {
  loadProgress, normalizeProgress, saveProgress, slotKey, startNewSlot, summarizeSlot,
} from '../src/state/save.js';
import { createProgress } from '../src/systems/progress.js';
import { playerStats } from '../src/game/session.js';
import { boosterMult, createBooster } from '../src/game/booster.js';
import { Enemy } from '../src/game/enemy.js';
import { fakeEnemy, makeWorld } from './fixtures-abilities.mjs';

const sum = (a) => a.reduce((x, y) => x + y, 0);
const storage = () => {
  const m = new Map();
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

// 기댓값을 분포 그대로(무작위 없이) 구하려고 rng를 0~1 격자로 훑는다.
const distribution = (fn, n = 20000) => {
  const counts = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) counts[fn(() => (i + 0.5) / n)]++;
  return counts.map((c) => c / n);
};

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, a + ' ≈ ' + b);

test('시작·보충의 모든 단계 칸은 난이도 배율을 적용한 뒤 합이 1이다', () => {
  for (const table of [CONFIG.enemy.startStageWeights, CONFIG.enemy.stageWeights]) {
    for (const [key, row] of Object.entries(table)) {
      const stage = Number(key);
      for (const difficulty of ['easy', 'normal', 'hard']) {
        const scaled = row.map((w, i) => {
          if (difficulty === 'easy') return i + 1 < stage ? w * 1.4 : w;
          return i + 1 > stage ? w * (difficulty === 'hard' ? 2.1 : 1.5) : w;
        });
        const actual = stageWeightsFor(stage, difficulty, table);
        near(sum(actual), 1);
        actual.forEach((weight, i) => near(weight, scaled[i] / sum(scaled)));
      }
    }
  }
  for (const difficulty of ['easy', 'normal', 'hard']) {
    assert.equal(spawnStage(1, () => 0.999, difficulty), 1);
    assert.equal(startStage(1, () => 0.999, difficulty), 1);
    assert.equal(startStage(2, () => 0.999, difficulty), 1);
  }
  const start = distribution(r => startStage(3, r, 'hard'));
  const refill = distribution(r => spawnStage(3, r, 'normal'));
  assert.ok(Math.abs(start[5] - 0.21 / 1.385) < 0.0001);
  assert.ok(Math.abs(refill[5] - 0.225 / 1.225) < 0.0001);
});

test('초반·전환 중간·성장 뒤의 크기 가중치에 단계 조합별 난이도를 적용한다(큰 적 칸은 종전 배율 × 3)', () => {
  // 큰 적 3배(변경 이력 17): 노말 1.5 → 4.5, 하드 같은 단계 2.1 → 6.3, 하드 다른 단계 1.5 → 4.5. 이지는 그대로다.
  const start = CONFIG.player.startSize, end = CONFIG.enemy.earlyUntilSize;
  for (const stage of [1, 2, 3, 4, 5]) {
    const grown = stage < 3 ? [0.67, 0.13, 0.2] : [0.45, 0.15, 0.4];
    for (const t of [0, 0.5, 1]) {
      const base = [0.35, 0.15, 0.5].map((w, i) => w * (1 - t) + grown[i] * t);
      for (const enemyStage of [1, 2, 3, 4, 5]) {
        const same = stage === enemyStage;
        for (const difficulty of ['easy', 'normal', 'hard']) {
          const scaled = [...base];
          if (difficulty === 'easy' && same) scaled[0] *= 1.4;
          if (difficulty !== 'easy') scaled[2] *= (difficulty === 'hard' && same ? 2.1 : 1.5) * 3;
          const out = sizeWeights(start + t * (end - start), stage, difficulty, enemyStage);
          out.forEach((w, i) => near(w, scaled[i] / sum(scaled)));
        }
      }
    }
  }
});

test('큰 적 3배: 노말·하드는 모든 단계·전환 크기에서 큰 적의 승산(odds)이 종전의 정확히 3배이고 이지는 그대로다', () => {
  assert.equal(CONFIG.difficulty.bigMult, 3);
  assert.equal(CONFIG.difficulty.strongMult, 1.5, '종전 1.5배는 그대로 두고 그 위에 곱한다');
  const start = CONFIG.player.startSize, end = CONFIG.enemy.earlyUntilSize;
  const odds = (w) => w[2] / (w[0] + w[1]);
  for (const stage of [1, 2, 3, 4, 5]) {
    const grown = stage < 3 ? [0.67, 0.13, 0.2] : [0.45, 0.15, 0.4];
    for (const t of [0, 0.25, 0.5, 1]) {
      const base = [0.35, 0.15, 0.5].map((w, i) => w * (1 - t) + grown[i] * t);
      const size = start + t * (end - start);
      for (const enemyStage of [1, 2, 3, 4, 5]) {
        const same = stage === enemyStage;
        // 종전(변경 이력 13) 값: 큰 칸에 1.5배, 하드 같은 단계는 2.1배만 곱한 가중치. 확률이 아니라 가중치를 3배로 한다.
        const before = (m) => odds([base[0], base[1], base[2] * m]);
        near(odds(sizeWeights(size, stage, 'normal', enemyStage)), 3 * before(1.5));
        near(odds(sizeWeights(size, stage, 'hard', enemyStage)), 3 * before(same ? 2.1 : 1.5));
        const easy = sizeWeights(size, stage, 'easy', enemyStage);
        near(sum(easy), 1);
        const easyBase = [...base];
        if (same) easyBase[0] *= 1.4;
        easy.forEach((w, i) => near(w, easyBase[i] / sum(easyBase)));
      }
    }
  }
  // 확률로 3배를 하면 하드는 100%를 넘으므로 승산을 3배로 한 결과는 항상 1 미만이다.
  for (const difficulty of ['normal', 'hard']) {
    const p = sizeWeights(start, 1, difficulty, 1)[2];
    assert.ok(p < 1 && p > 0.8, `${difficulty}: ${p}`);
  }
});

// 나보다 큰 적(마지막 크기 구간) 확률 = 적 단계 분포 × 그 단계에서 큰 구간을 뽑을 확률. docs/plan.md 변경 이력 17의 표.
const bigChance = (stage, difficulty, size, table) => {
  const weights = stageWeightsFor(stage, difficulty, table) ?? [1, 0, 0, 0, 0];
  return weights.reduce((p, w, i) => p + w * sizeWeights(size, stage, difficulty, i + 1)[2], 0);
};

test('나보다 큰 적 확률 표(판 시작·성장 뒤 보충)가 plan.md 변경 이력 17과 같고 적 단계 가중치는 바뀌지 않는다', () => {
  const start = CONFIG.player.startSize, grown = CONFIG.enemy.earlyUntilSize;
  // [난이도, 플레이어 단계, 판 시작 %, 성장 뒤 보충 %]
  const expected = [
    ['easy', 1, 43.86, 15.77], ['easy', 2, 50.00, 18.33], ['easy', 3, 47.77, 38.02], ['easy', 4, 48.18, 37.86], ['easy', 5, 48.13, 37.75],
    ['normal', 1, 81.82, 52.94], ['normal', 2, 81.82, 52.94], ['normal', 3, 81.82, 75.00], ['normal', 4, 81.82, 75.00], ['normal', 5, 81.82, 75.00],
    ['hard', 1, 86.30, 61.17], ['hard', 2, 81.82, 55.97], ['hard', 3, 83.11, 76.35], ['hard', 4, 83.10, 76.81], ['hard', 5, 83.52, 77.60],
  ];
  for (const [difficulty, stage, atStart, afterGrowth] of expected) {
    const s = bigChance(stage, difficulty, start, CONFIG.enemy.startStageWeights) * 100;
    const g = bigChance(stage, difficulty, grown, CONFIG.enemy.stageWeights) * 100;
    assert.ok(Math.abs(s - atStart) < 0.006, `${difficulty} ${stage}단계 시작 ${s.toFixed(3)} ≈ ${atStart}`);
    assert.ok(Math.abs(g - afterGrowth) < 0.006, `${difficulty} ${stage}단계 보충 ${g.toFixed(3)} ≈ ${afterGrowth}`);
  }
  // 사용자 지시는 큰 적만 3배다. 높은 단계 적 비중(stageWeights)은 종전과 같은 값이다.
  assert.deepEqual(CONFIG.enemy.stageWeights[3], [0.05, 0.15, 0.35, 0.3, 0.15]);
  assert.deepEqual(CONFIG.enemy.stageWeights[4], [0.02, 0.08, 0.25, 0.4, 0.25]);
  assert.deepEqual(CONFIG.enemy.stageWeights[5], [0, 0.04, 0.16, 0.35, 0.45]);
  assert.deepEqual(CONFIG.enemy.startStageWeights[3], [0.05, 0.2, 0.4, 0.25, 0.1]);
});

test('목숨은 하드 패배에 한 번 쓰고 승천과 정비는 보존한다', () => {
  const p = Object.freeze({ difficulty: 'hard', lives: 1 });
  assert.equal(livesFor('hard'), 10);
  assert.equal(livesFor('easy'), null);
  assert.deepEqual(onRunEnd(p, 'defeat'), { livesLeft: 0, erased: true });
  for (const outcome of ['ascension', 'maintenance']) {
    assert.deepEqual(onRunEnd(p, outcome), { livesLeft: 1, erased: false });
  }
  assert.deepEqual(onRunEnd({ difficulty: 'normal' }, 'defeat'), { livesLeft: null, erased: false });
});

test('판 시작 추첨은 크기 구간·구간 안 크기·단계 순서이고 이지의 작은 먹이는 그대로다', () => {
  const size = CONFIG.player.startSize;
  const draws = [0.39, 0.25, 0.71];
  const rng = () => draws.shift();
  const roll = rollSpawnSize(rng);
  const stage = startStage(3, rng, 'normal');
  assert.equal(stage, 4);
  // 큰 적 3배 뒤 노말의 큰 구간(1.15~1.75배)이 [0.35, 0.15, 2.25] 중 82%라 같은 난수 0.39·0.25가 이제는 큰 구간이다(종전엔 비슷한 구간 0.96배).
  near(spawnSize(size, 3, 'normal', stage, roll), size * 1.3);
  near(spawnSize(size, 3, 'easy', 3, roll), size * 0.59);
  assert.equal(draws.length, 0);
});

test('저장: 기존 저장·이상한 값은 노말, 하드는 목숨 0~10', () => {
  assert.equal(normalizeProgress({}).difficulty, 'normal');
  assert.equal(normalizeProgress({}).lives, null);
  assert.equal(normalizeProgress({ difficulty: 'nope', lives: 3 }).lives, null);
  assert.equal(normalizeProgress({ difficulty: 'hard' }).lives, 10);
  assert.equal(normalizeProgress({ difficulty: 'hard', lives: 4 }).lives, 4);
  assert.equal(normalizeProgress({ difficulty: 'hard', lives: 99 }).lives, 10);
  assert.equal(normalizeProgress({ difficulty: 'hard', lives: -2 }).lives, 0);
  assert.equal(normalizeProgress({ difficulty: 'easy', lives: 5 }).lives, null);
});

test('startNewSlot: 난이도를 저장하고 하드만 목숨 10, summarizeSlot이 돌려준다', () => {
  const s = storage();
  assert.ok(startNewSlot(1, s));
  assert.equal(loadProgress(s, 1).difficulty, 'normal');
  assert.ok(startNewSlot(2, s, 'easy'));
  assert.equal(Object.hasOwn(JSON.parse(s.getItem(slotKey(2))).progress, 'lives'), false);
  assert.equal(summarizeSlot(2, s).difficulty, 'easy');
  assert.equal(summarizeSlot(2, s).lives, null);
  assert.ok(startNewSlot(3, s, 'hard'));
  const sum3 = summarizeSlot(3, s);
  assert.equal(sum3.difficulty, 'hard');
  assert.equal(sum3.lives, 10);
  assert.ok(startNewSlot(1, s, 'bogus'));
  assert.equal(loadProgress(s, 1).difficulty, 'normal');
});

test('마지막 패배의 자동 저장이 여러 번 불려도 슬롯이 되살아나지 않는다', () => {
  const s = storage();
  startNewSlot(2, s, 'easy');
  startNewSlot(1, s, 'hard');
  const p = loadProgress(s, 1);
  p.lives = 0;
  for (let i = 0; i < 2; i++) {
    saveProgress(p, s, 1);
    assert.equal(s.m.has(slotKey(1)), false);
  }
  assert.equal(summarizeSlot(1, s).status, 'empty');
  assert.equal(loadProgress(s, 2).difficulty, 'easy');
});

test('이지의 이동 속도는 강화 후에도 2배이고 부스터 배율은 1, 적의 배회 속도는 같다', () => {
  const base = createProgress();
  const enemySpeed = (progress) => {
    const enemy = fakeEnemy(500, 500, 10, {
      vx: 0, vy: 0, wanderTime: 10, wanderAngle: 0, move() {}, followLabel() {},
      scene: { progress, simTime: 0 },
    });
    Enemy.prototype.step.call(enemy, { size: 8, stage: 1 }, 0.1);
    return enemy.vx;
  };
  for (const speed of [0, 6]) {
    base.enh.speed = speed;
    const easy = { ...base, difficulty: 'easy' };
    for (const difficulty of ['normal', 'hard']) {
      const manual = { ...base, difficulty };
      assert.equal(playerStats(easy).speed, 2 * playerStats(manual).speed);
      assert.equal(playerStats(easy).pace, playerStats(manual).pace);
      assert.ok(enemySpeed(manual) > 0);
      assert.equal(enemySpeed(easy), enemySpeed(manual));
    }
    assert.equal(boosterMult(easy), 1);
  }
});

test('이지 자동 발사는 무기 쿨타임마다 한 번 작동하고 정비 중에는 멈춘다', async () => {
  globalThis.Phaser ??= { Scene: class {} };
  const { PlayScene } = await import('../src/scenes/PlayScene.js');
  const { scene, player, combat, progress } = makeWorld();
  player.step = () => {};
  Object.assign(scene, {
    combat, progress, booster: createBooster(), boostMult: 1, autoFire: CONFIG.difficulty.easy.autoFire,
    resolveMeals() {}, applyEnemyHits() {}, enemyFire: { step: () => [] },
  });
  const fire = combat.fire.bind(combat);
  const shots = [];
  combat.fire = (stats) => { shots.push(scene.simTime); fire(stats); };
  const dt = 1 / 60;
  const cooldown = combat.stats().cooldown;
  for (let i = 0; i < Math.ceil(2.5 * cooldown / dt); i++) {
    PlayScene.prototype.simulate.call(scene, dt, { x: 1, y: 0 });
  }
  assert.equal(shots.length, 3);
  for (let i = 1; i < shots.length; i++) {
    assert.ok(Math.abs(shots[i] - shots[i - 1] - cooldown) <= dt + 1e-8);
  }
  scene.paused = true;
  const before = combat.cooldown;
  for (let i = 0; i < 180; i++) PlayScene.prototype.tick.call(scene, 1000 / 60);
  assert.equal(shots.length, 3);
  assert.equal(combat.cooldown, before);
});
