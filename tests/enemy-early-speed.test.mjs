import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';

test('초반 적 속도 배율: 1단계 70%, 2단계 85%, 3단계 이상 100%', () => {
  const m = (stage) => CONFIG.enemy.earlySpeedMult?.[stage] ?? 1;
  assert.equal(m(1), 0.7);
  assert.equal(m(2), 0.85);
  assert.equal(m(3), 1);
  assert.equal(m(5), 1);
});
