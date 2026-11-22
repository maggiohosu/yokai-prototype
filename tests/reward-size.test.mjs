import test from 'node:test';
import assert from 'node:assert/strict';
import { rewardSizeOf } from '../src/game/combat.js';

test('보물로 깎여 작아진 적도 요력은 깎이기 전 가장 컸던 크기 기준', () => {
  const enemy = { size: 60 };
  enemy.rewardSize = rewardSizeOf(enemy); // 피격 직전 기록
  enemy.size = 20; // 깎임
  assert.equal(rewardSizeOf(enemy), 60);
  enemy.size = 70; // 그 뒤 먹어서 더 커지면 큰 쪽
  assert.equal(rewardSizeOf(enemy), 70);
  enemy.rewardSize = 0; enemy.size = 25; // 진화로 초기화
  assert.equal(rewardSizeOf(enemy), 25);
});
