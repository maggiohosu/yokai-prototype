import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { createProgress } from '../src/systems/progress.js';
import { enhanceCost, getEnhanceOdds } from '../src/systems/enhance.js';
import { evolutionCost } from '../src/systems/evolution.js';
import {
  bodyCost, createRunLevel, pauseOptions, cheapestCost, shouldPause, afterPause, applyBody,
} from '../src/systems/levelup.js';

const L = CONFIG.levelUp;

function setup(yoryeok = 0, patch = {}) {
  const progress = Object.assign(createProgress(), { yoryeok }, patch);
  return { progress, run: createRunLevel() };
}

test('bodyCost는 기본 비용에서 시작해 번마다 growth배로 늘어난다', () => {
  assert.equal(bodyCost(0), L.bodyBaseCost);
  assert.equal(bodyCost(1), Math.round(L.bodyBaseCost * L.bodyCostGrowth));
  assert.equal(bodyCost(3), Math.round(L.bodyBaseCost * L.bodyCostGrowth ** 3));
  for (let n = 0; n < 8; n++) assert.ok(bodyCost(n + 1) > bodyCost(n));
});

test('createRunLevel은 빈 판 상태를 만든다', () => {
  const run = createRunLevel();
  assert.deepEqual(run, { bodyLevel: 0, nextPauseAt: null, lastPauseSec: -Infinity });
  assert.notEqual(createRunLevel(), run);
});

test('pauseOptions는 진화·몸집·능력 순서로 비용과 확률을 담는다', () => {
  const { progress, run } = setup(0);
  const [evolve, body, ability] = pauseOptions(progress, run);
  assert.deepEqual(evolve, { kind: 'evolve', cost: evolutionCost(2), available: true });
  assert.deepEqual(body, { kind: 'body', cost: bodyCost(0), mult: L.bodyMult });
  assert.equal(ability.kind, 'ability');
  assert.deepEqual(ability.stats.map((s) => s.stat), ['growth', 'speed', 'signature']);
  for (const s of ability.stats) {
    assert.equal(s.level, 0);
    assert.equal(s.cost, enhanceCost(0));
    assert.deepEqual(s.odds, getEnhanceOdds(progress, s.stat));
  }
});

test('3단계에서는 진화를 고를 수 없고 몸집 비용은 강화 횟수를 따라간다', () => {
  const { progress, run } = setup(0, { stage: 3 });
  run.bodyLevel = 2;
  const [evolve, body] = pauseOptions(progress, run);
  assert.equal(evolve.available, false);
  assert.equal(body.cost, bodyCost(2));
});

test('최고 레벨 능력치는 비용이 Infinity이고 확률이 모두 0이다', () => {
  const { progress, run } = setup(0);
  progress.enh.growth = 10;
  const stat = pauseOptions(progress, run)[2].stats[0];
  assert.equal(stat.cost, Infinity);
  assert.deepEqual(stat.odds, { success: 0, great: 0, fail: 0, degrade: 0 });
});

test('cheapestCost는 고를 수 있는 가장 싼 선택지 비용이다', () => {
  const a = setup(0);
  assert.equal(cheapestCost(a.progress, a.run), Math.min(enhanceCost(0), bodyCost(0), evolutionCost(2)));

  // 능력치가 모두 최고이고 3단계면 몸집 강화만 남는다.
  const b = setup(0, { stage: 3 });
  for (const stat of Object.keys(b.progress.enh)) b.progress.enh[stat] = 10;
  b.run.bodyLevel = 4;
  assert.equal(cheapestCost(b.progress, b.run), bodyCost(4));
});

test('shouldPause: 기준이 없으면 가장 싼 비용으로 정하고, 요력이 모자라면 멈추지 않는다', () => {
  const { progress, run } = setup(0);
  const cheapest = cheapestCost(progress, run);
  assert.equal(shouldPause(progress, run, 100), false);
  assert.equal(run.nextPauseAt, cheapest);
  progress.yoryeok = cheapest - 1;
  assert.equal(shouldPause(progress, run, 100), false);
  progress.yoryeok = cheapest;
  assert.equal(shouldPause(progress, run, 100), true);
});

test('shouldPause: 이미 정한 기준은 다시 바꾸지 않는다', () => {
  const { progress, run } = setup(1000);
  run.nextPauseAt = 500;
  assert.equal(shouldPause(progress, run, 100), true);
  assert.equal(run.nextPauseAt, 500);
  run.nextPauseAt = 1001;
  assert.equal(shouldPause(progress, run, 100), false);
});

test('shouldPause: 실제 시간 쿨다운이 지나야 다시 멈춘다', () => {
  const { progress, run } = setup(1000);
  run.nextPauseAt = 500;
  run.lastPauseSec = 50;
  assert.equal(shouldPause(progress, run, 50 + L.pauseCooldownSec - 0.01), false);
  assert.equal(shouldPause(progress, run, 50 + L.pauseCooldownSec), true);
});

test('afterPause: 멈춘 시각을 기록하고 다음 기준을 최소 간격만큼 올린다', () => {
  const { progress, run } = setup(100);
  const cheapest = cheapestCost(progress, run);
  afterPause(progress, run, 42);
  assert.equal(run.lastPauseSec, 42);
  assert.equal(run.nextPauseAt, Math.max(cheapest, 100 + Math.max(cheapest, 100) * L.minGapRatio));
  // 같은 요력, 같은 시각 근처에서는 곧바로 다시 멈추지 않는다.
  assert.equal(shouldPause(progress, run, 43), false);
  progress.yoryeok = run.nextPauseAt;
  assert.equal(shouldPause(progress, run, 42 + L.pauseCooldownSec), true);
});

test('afterPause: 요력이 거의 없으면 다음 기준은 가장 싼 비용 아래로 내려가지 않는다', () => {
  const { progress, run } = setup(0);
  const cheapest = cheapestCost(progress, run);
  afterPause(progress, run, 10);
  assert.equal(run.nextPauseAt, cheapest);
});

test('applyBody: 요력을 차감하고 비용은 번마다 늘어난다', () => {
  const { progress, run } = setup(1000);
  const first = applyBody(progress, run);
  assert.deepEqual(first, { cost: bodyCost(0), mult: L.bodyMult });
  assert.equal(run.bodyLevel, 1);
  assert.equal(progress.yoryeok, 1000 - bodyCost(0));
  const second = applyBody(progress, run);
  assert.equal(second.cost, bodyCost(1));
  assert.ok(second.cost > first.cost);
  assert.equal(run.bodyLevel, 2);
  assert.equal(progress.yoryeok, 1000 - bodyCost(0) - bodyCost(1));
});

test('applyBody: 요력이 부족하면 null이고 아무것도 바뀌지 않는다', () => {
  const { progress, run } = setup(bodyCost(0) - 1);
  assert.equal(applyBody(progress, run), null);
  assert.equal(progress.yoryeok, bodyCost(0) - 1);
  assert.equal(run.bodyLevel, 0);
  // 비용과 같은 요력이면 살 수 있고 0이 된다.
  progress.yoryeok = bodyCost(0);
  assert.ok(applyBody(progress, run));
  assert.equal(progress.yoryeok, 0);
});
