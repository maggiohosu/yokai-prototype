import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { applyWorldScale, worldFor } from '../src/systems/worldScale.js';
import { buildGrid, findMeals, pickIntent } from '../src/game/enemyAI.js';
import { fakeEnemy, fakePlayer } from './fixtures-abilities.mjs';

test.afterEach(() => applyWorldScale(1));

test('적 수 3배: 단계별 인구가 예전(72·115·160·216·284)의 3배다', () => {
  const pops = [1, 2, 3, 4, 5].map((stage) => worldFor(stage).population);
  assert.equal(CONFIG.world.populationMult, 3);
  assert.deepEqual(pops, [72, 115, 160, 216, 284].map(base => base * 3));
});

// 전체 프레임 예산은 Chrome 시험에서 검증한다. 이 보조 시험은 단일 AI·충돌 단계의 큰 회귀를 잡는다.
test('성능: 5단계 인구에서 AI·충돌 한 단계 시간을 잰다', (t) => {
  const n = worldFor(5).population;
  let r = 12345;
  const rnd = () => (r = (r * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const world = 13200;
  const enemies = [];
  for (let i = 0; i < n; i++) {
    enemies.push(fakeEnemy(rnd() * world, rnd() * world, 6 + rnd() * 40, { stage: 1 + Math.floor(rnd() * 5) }));
  }
  const player = fakePlayer('mimul', { x: world / 2, y: world / 2 });
  const STEPS = 120;
  let total = 0;
  let worst = 0;
  let grid;
  for (let i = 0; i < STEPS; i++) {
    const t0 = process.hrtime.bigint();
    grid = buildGrid(enemies, CONFIG.render.enemyCell, grid);
    for (const e of enemies) pickIntent(e, player, grid, CONFIG.hunt, 1 / 60, i / 60);
    findMeals(grid, undefined, i / 60);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    total += ms;
    worst = Math.max(worst, ms);
  }
  t.diagnostic(`적 ${n}마리: 단계당 평균 ${(total / STEPS).toFixed(3)}ms, 최악 ${worst.toFixed(3)}ms`);
  assert.ok(total / STEPS <= 6, `단계당 평균 ${(total / STEPS).toFixed(3)}ms > 6ms`);
});
