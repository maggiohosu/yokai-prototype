import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createProgress } from '../src/systems/progress.js';
import { CONFIG } from '../src/config.js';
import { attachSession, mealYoryeok, playerStats } from '../src/game/session.js';
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

test('playerStats.pace는 단계 곡선(tempoMultiplier)이고 이동 속도 레벨과 무관하다', () => {
  const { stageMult } = CONFIG.balance.pace;
  for (let stage = 1; stage <= 5; stage++) {
    for (const level of [0, 5, 10]) near(playerStats(at(stage, level)).pace, stageMult[stage]);
  }
  near(playerStats(at(99, 99)).pace, stageMult[5]);
  near(playerStats(at(-3, -5)).pace, stageMult[1]);
  near(playerStats({}).pace, stageMult[1]);
});

test('playerStats.speed = player.speed × baseMult × (1 + 0.04 × 레벨): 단계와 무관하고 템포 곡선을 곱하지 않는다(예전 f 두 번 곱 제거)', () => {
  assert.equal('speedPerLevel' in CONFIG.progression, false);
  assert.equal('minMult' in CONFIG.pace, false);
  assert.equal('maxMult' in CONFIG.pace, false);
  const { baseMult, speedPerLevel } = CONFIG.balance.pace;
  for (const [stage, level] of [[1, 0], [1, 10], [3, 0], [3, 7], [5, 10]]) {
    const stats = playerStats(at(stage, level));
    assert.ok(Number.isFinite(stats.speed) && stats.speed > 0, `stage=${stage} level=${level}: ${stats.speed}`);
    near(stats.speed, CONFIG.player.speed * baseMult * (1 + speedPerLevel * level));
    for (const key of ['areaGain', 'vitalityMax', 'gradeMult']) assert.ok(Number.isFinite(stats[key]), key);
  }
  // 같은 속도 레벨이면 단계가 달라도 플레이어 속도는 같다(단계는 템포에만 곱한다).
  near(playerStats(at(1, 4)).speed, playerStats(at(5, 4)).speed);
  // 저장본에 enh가 없거나 일부만 있어도 NaN이 되지 않는다.
  assert.ok(Number.isFinite(playerStats({ stage: 2, grade: 'C' }).speed));
  assert.ok(Number.isFinite(playerStats({ stage: 2, grade: 'C', enh: {} }).speed));
});

test('화면 체감 속도(템포 × 플레이어 속도): 5단계·+10은 1단계·+0의 약 4.6배', () => {
  const feel = (progress) => { const s = playerStats(progress); return s.pace * s.speed; };
  const ratio = feel(at(5, 10)) / feel(at(1, 0));
  assert.ok(ratio > 4.55 && ratio < 4.7, '체감 배율 ' + ratio);
});

test('playerStats: 여의주 위력(signature)은 더 이상 없고, 생명력 최대치는 레벨을 따른다', () => {
  const stats = playerStats(at(1, 0));
  assert.equal('signature' in stats, false);
  near(stats.vitalityMax, CONFIG.vitality.baseSec);
  const high = Object.assign(createProgress(), { enh: { growth: 0, speed: 0, vitality: 10 } });
  near(playerStats(high).vitalityMax, CONFIG.vitality.baseSec + CONFIG.vitality.perLevelSec * 10);
});

test('요괴가 떨어뜨리는 보물은 { kind: "yeouiju", level: 0 }뿐이다(빈 장착 칸 → 보관함 순서)', () => {
  const scene = { events: new EventEmitter() };
  const progress = createProgress();
  attachSession(scene, progress, () => 0, () => {});
  scene.events.emit('eat', { dir: 'east', preySize: 10 });
  assert.deepEqual(progress.treasure, { kind: 'yeouiju', level: 0 });
  scene.events.emit('eat', { dir: 'east', preySize: 10 });
  scene.events.emit('eat', { dir: 'east', preySize: 10, killedByTreasure: true });
  assert.deepEqual(progress.inventory, [{ kind: 'yeouiju', level: 0 }, { kind: 'yeouiju', level: 0 }]);
});
