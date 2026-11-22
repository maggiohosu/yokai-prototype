import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { bodyCostAt, preyValue } from '../src/systems/rules.js';
import { canEnemyBodyUp, enemySizeCap } from '../src/systems/growthCap.js';

const cfg = CONFIG.enemy.growthCap;

test('적 크기 상한: 플레이어 크기 × 배수, 최소·절대 상한', () => {
  assert.equal(enemySizeCap(28), cfg.minCap);
  assert.equal(enemySizeCap(100), 100 * cfg.maxSizeVsPlayer);
  assert.equal(enemySizeCap(10000), cfg.maxSize);
  assert.equal(enemySizeCap(undefined), cfg.minCap);
});

test('몸집 강화 횟수 상한', () => {
  assert.equal(canEnemyBodyUp(0), true);
  assert.equal(canEnemyBodyUp(cfg.maxBodyLevel - 1), true);
  assert.equal(canEnemyBodyUp(cfg.maxBodyLevel), false);
});

test('재현: 3단계 적이 40마리를 먹어도 플레이어 크기 기준 상한을 넘지 않는다(수정 전에는 수십만까지 커짐)', () => {
  const playerSize = 40;
  let size = 40, yoryeok = 0, bodyLevel = 0;
  let rng = 1;
  const rand = () => (rng = (rng * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 40; i++) {
    const prey = size * (0.4 + rand() * 0.5);
    size = Math.sqrt(size ** 2 + CONFIG.eating.areaGain * prey ** 2);
    size = Math.min(size, enemySizeCap(playerSize));
    yoryeok += preyValue({ size: prey, stage: rand() < 0.5 ? 2 : 3 });
    if (yoryeok >= bodyCostAt(bodyLevel) && canEnemyBodyUp(bodyLevel)) {
      yoryeok -= bodyCostAt(bodyLevel); bodyLevel++;
      size = Math.min(size * CONFIG.levelUp.bodyMult, enemySizeCap(playerSize));
    }
  }
  assert.ok(size <= enemySizeCap(playerSize));
  assert.ok(bodyLevel <= cfg.maxBodyLevel);
});
