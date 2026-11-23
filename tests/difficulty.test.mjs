import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { rollSpawnSize, sizeWeights, spawnSize, spawnStage, startStage } from '../src/game/world.js';
import { livesFor, onRunEnd, sizeWeightsFor, stageWeightsFor } from '../src/systems/difficulty.js';
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

test('stageWeightsFor: 이지는 낮은 단계, 하드는 높은 단계 칸에만 ×1.4(상대 비율)하고 합은 그대로', () => {
  for (const stage of [1, 2, 3, 4, 5]) {
    const row = CONFIG.enemy.stageWeights[stage];
    for (const [difficulty, mark] of [['easy', (s) => s < stage], ['hard', (s) => s > stage]]) {
      const out = stageWeightsFor(stage, difficulty);
      assert.ok(Math.abs(sum(out) - sum(row)) < 1e-9);
      // 표시된 칸과 안 된 칸의 가중치 비는 정확히 1.4배가 된다.
      const iMarked = row.findIndex((w, i) => w > 0 && mark(i + 1));
      const iOther = row.findIndex((w, i) => w > 0 && !mark(i + 1));
      if (iMarked < 0 || iOther < 0) continue;
      const ratio = out[iMarked] / out[iOther] / (row[iMarked] / row[iOther]);
      assert.ok(Math.abs(ratio - 1.4) < 1e-9, `${difficulty} ${stage}단계 비 ${ratio}`);
      const share = (w) => sum(w.filter((_, i) => mark(i + 1))) / sum(w);
      assert.ok(share(out) > share(row), `${difficulty} ${stage}단계에서 비중이 늘어난다`);
    }
  }
  assert.deepEqual([1, 2, 3, 4, 5].map(stage => stageWeightsFor(stage, 'normal')), [
    [1, 0, 0, 0, 0], [0.35, 0.45, 0.2, 0, 0], [0.05, 0.15, 0.35, 0.3, 0.15],
    [0.02, 0.08, 0.25, 0.4, 0.25], [0, 0.04, 0.16, 0.35, 0.45],
  ]);
});

test('spawnStage: 노말은 그대로, 이지는 낮은 단계가 늘고 하드는 높은 단계가 는다', () => {
  for (const stage of [2, 3, 4, 5]) {
    const normal = distribution((r) => spawnStage(stage, r) );
    const easy = distribution((r) => spawnStage(stage, r, 'easy'));
    const hard = distribution((r) => spawnStage(stage, r, 'hard'));
    const low = (d) => sum(d.filter((_, s) => s >= 1 && s < stage));
    const high = (d) => sum(d.filter((_, s) => s > stage));
    assert.ok(low(easy) > low(normal) + 1e-3, `이지 ${stage}단계: 낮은 단계 비중 증가`);
    assert.ok(high(easy) < high(normal) + 1e-9);
    if (high(normal) > 0) assert.ok(high(hard) > high(normal) + 1e-3, `하드 ${stage}단계: 높은 단계 비중 증가`);
    assert.ok(low(hard) < low(normal) + 1e-9);
  }
  // 1단계는 적이 모두 1단계라 난이도로 바뀌지 않는다.
  assert.equal(spawnStage(1, () => 0.9, 'hard'), 1);
  assert.equal(spawnStage(1, () => 0.9, 'easy'), 1);
});

test('startStage도 난이도를 따른다(3단계 이후)', () => {
  assert.deepEqual([3, 4, 5].map(stage => stageWeightsFor(stage, 'normal', CONFIG.enemy.startStageWeights)), [
    [0.05, 0.2, 0.4, 0.25, 0.1], [0.03, 0.12, 0.3, 0.35, 0.2], [0.01, 0.06, 0.2, 0.35, 0.38],
  ]);
  const normal = distribution((r) => startStage(4, r));
  const hard = distribution((r) => startStage(4, r, 'hard'));
  assert.ok(hard[5] > normal[5]);
  assert.equal(startStage(2, () => 0.9, 'hard'), 1);
});

test('sizeWeights: 이지는 작은 적 구간, 하드는 큰 적 구간만 ×1.4(합 그대로)', () => {
  for (const stage of [1, 4]) {
    const normal = sizeWeights(100, stage);
    const easy = sizeWeights(100, stage, 'easy');
    const hard = sizeWeights(100, stage, 'hard');
    assert.ok(Math.abs(sum(easy) - sum(normal)) < 1e-9);
    assert.ok(Math.abs(sum(hard) - sum(normal)) < 1e-9);
    assert.ok(easy[0] > normal[0] && easy[2] < normal[2]);
    assert.ok(hard[2] > normal[2] && hard[0] < normal[0]);
    assert.ok(Math.abs(easy[0] / easy[1] / (normal[0] / normal[1]) - 1.4) < 1e-9);
    assert.ok(Math.abs(hard[2] / hard[1] / (normal[2] / normal[1]) - 1.4) < 1e-9);
  }
  assert.deepEqual(sizeWeightsFor([1, 1, 1], 'normal'), [1, 1, 1]);
  assert.deepEqual(sizeWeightsFor([1, 1, 1], 'easy'), [1.4 / 3.4, 1 / 3.4, 1 / 3.4]);
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

test('크기 보정은 같은 단계에만 적용하고 노말은 기존 크기·단계 추첨 순서와 구간을 보존한다', () => {
  const playerSize = CONFIG.player.startSize;
  for (const difficulty of ['normal', 'easy', 'hard']) {
    for (const enemyStage of [2, 4]) {
      assert.deepEqual(sizeWeights(playerSize, 3, difficulty, enemyStage), [0.35, 0.15, 0.5]);
    }
  }
  const draws = [0.39, 0.25, 0.71];
  const rng = () => draws.shift();
  const roll = rollSpawnSize(rng);
  const stage = startStage(3, rng, 'normal');
  assert.equal(stage, 4);
  assert.equal(spawnSize(playerSize, 3, 'normal', stage, roll), playerSize * 0.96);
  assert.equal(spawnSize(playerSize, 3, 'easy', 3, roll), playerSize * 0.59);
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
