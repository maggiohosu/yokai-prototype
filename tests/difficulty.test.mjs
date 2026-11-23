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

test('초반·전환 중간·성장 뒤의 크기 가중치에 단계 조합별 난이도를 적용한다', () => {
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
          if (difficulty !== 'easy') scaled[2] *= difficulty === 'hard' && same ? 2.1 : 1.5;
          const out = sizeWeights(start + t * (end - start), stage, difficulty, enemyStage);
          out.forEach((w, i) => near(w, scaled[i] / sum(scaled)));
        }
      }
    }
  }
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
  near(spawnSize(size, 3, 'normal', stage, roll), size * 0.96);
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
