import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createProgress } from '../src/systems/progress.js';
import { CONFIG } from '../src/config.js';
import { attachSession, mealYoryeok, paceMultiplier, playerStats } from '../src/game/session.js';
import { TREASURE } from '../src/systems/tuning-upgrade.js';

test('같은 씬을 restart해도 eat 리스너는 한 번만 붙는다', () => {
  const scene = { events: new EventEmitter() };
  const progress = createProgress();
  let saves = 0;
  let rolls = 0;
  const save = () => { saves++; };
  const rng = () => { rolls++; return 0; };
  const meal = { dir: 'east', preySize: 10 };
  for (let round = 1; round <= 3; round++) {
    const run = attachSession(scene, progress, rng, save);
    assert.equal(scene.events.listenerCount('eat'), 1);
    assert.equal(scene.events.listenerCount('runEnd'), 1);
    scene.events.emit('eat', meal);
    assert.equal(progress.diet.east, round * meal.preySize);
    assert.equal(progress.yoryeok, round * mealYoryeok(meal));
    assert.equal(run.drops, 1);
    assert.equal(rolls, round);
    assert.equal(saves, round);
    scene.events.emit('shutdown');
    assert.equal(scene.events.listenerCount('eat'), 0);
    assert.equal(scene.events.listenerCount('runEnd'), 0);
  }
});

test('보관함이 가득 차면 드롭이 일어나도 treasureDrop 없이 버려진다', () => {
  const scene = { events: new EventEmitter() };
  const progress = createProgress();
  progress.treasure = { level: 3 };
  for (let i = 0; i < TREASURE.inventorySlots; i++) progress.inventory.push({ level: i });
  let drops = 0;
  scene.events.on('treasureDrop', () => { drops++; });
  const run = attachSession(scene, progress, () => 0, () => {});
  scene.events.emit('eat', { dir: 'east', preySize: 10 });
  assert.equal(drops, 0);
  assert.equal(run.drops, 0);
  assert.equal(progress.inventory.length, TREASURE.inventorySlots);
});

// ---- 성장에 따른 속도 곡선(pace) ----
const at = (stage, speed) => Object.assign(createProgress(), { stage, enh: { growth: 0, speed, vitality: 0 } });
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, a + ' ≈ ' + b);

test('paceMultiplier 경계: 1단계·0레벨 = minMult, 5단계·10레벨 = maxMult', () => {
  const { minMult, maxMult, maxStage, maxSpeedLevel } = CONFIG.pace;
  near(paceMultiplier(at(1, 0)), minMult);
  near(paceMultiplier(at(maxStage, maxSpeedLevel)), maxMult);
});

test('paceMultiplier: 진화 단계가 증가분의 절반, 이동 속도 레벨이 나머지 절반', () => {
  const { minMult, maxMult, maxStage, maxSpeedLevel } = CONFIG.pace;
  const span = maxMult - minMult;
  near(paceMultiplier(at(maxStage, 0)), minMult + span * 0.5);
  near(paceMultiplier(at(1, maxSpeedLevel)), minMult + span * 0.5);
  near(paceMultiplier(at(3, 0)), minMult + span * 0.25);
  near(paceMultiplier(at(3, maxSpeedLevel)), minMult + span * 0.75);
  near(paceMultiplier(at(2, 5)), minMult + span * (0.5 * 0.25 + 0.5 * 0.5));
});

test('paceMultiplier는 단계·레벨이 오를수록 단조 증가하고, 범위를 벗어난 값은 자른다', () => {
  for (let stage = 1; stage <= CONFIG.pace.maxStage; stage++) {
    for (let level = 0; level <= CONFIG.pace.maxSpeedLevel; level++) {
      const f = paceMultiplier(at(stage, level));
      assert.ok(f >= CONFIG.pace.minMult - 1e-9 && f <= CONFIG.pace.maxMult + 1e-9);
      if (level) assert.ok(f > paceMultiplier(at(stage, level - 1)));
    }
    if (stage > 1) assert.ok(paceMultiplier(at(stage, 0)) > paceMultiplier(at(stage - 1, 0)));
  }
  near(paceMultiplier(at(99, 99)), CONFIG.pace.maxMult);
  near(paceMultiplier(at(-3, -5)), CONFIG.pace.minMult);
  near(paceMultiplier({}), CONFIG.pace.minMult);
});

test('playerStats.speed는 항상 유한한 수이고 player.speed × pace이다(예전 speedPerLevel을 읽지 않는다)', () => {
  assert.equal('speedPerLevel' in CONFIG.progression, false);
  for (const [stage, level] of [[1, 0], [1, 10], [3, 0], [3, 7], [5, 10]]) {
    const progress = at(stage, level);
    const stats = playerStats(progress);
    assert.ok(Number.isFinite(stats.speed) && stats.speed > 0, `stage=${stage} level=${level}: ${stats.speed}`);
    near(stats.speed, CONFIG.player.speed * paceMultiplier(progress));
    near(stats.pace, paceMultiplier(progress));
    for (const key of ['areaGain', 'vitalityMax', 'gradeMult']) assert.ok(Number.isFinite(stats[key]), key);
  }
  // 저장본에 enh가 없거나 일부만 있어도 NaN이 되지 않는다.
  assert.ok(Number.isFinite(playerStats({ stage: 2, grade: 'C' }).speed));
  assert.ok(Number.isFinite(playerStats({ stage: 2, grade: 'C', enh: {} }).speed));
});

test('playerStats: 여의주 위력(signature)은 더 이상 없고, 생명력 최대치는 레벨을 따른다', () => {
  const stats = playerStats(at(1, 0));
  assert.equal('signature' in stats, false);
  near(stats.vitalityMax, CONFIG.vitality.baseSec);
  const high = Object.assign(createProgress(), { enh: { growth: 0, speed: 0, vitality: 10 } });
  near(playerStats(high).vitalityMax, CONFIG.vitality.baseSec + CONFIG.vitality.perLevelSec * 10);
});
