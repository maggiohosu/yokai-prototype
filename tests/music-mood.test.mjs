import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMoodState } from '../src/systems/musicMood.js';

test('굶주림 상태별 분위기 판정', () => {
  assert.equal(evaluateMoodState({}), 'calm');
  assert.equal(evaluateMoodState({ hungerState: 'grace' }), 'calm');
  assert.equal(evaluateMoodState({ hungerState: 'draining' }), 'tense');
  assert.equal(evaluateMoodState({ hungerState: 'starving' }), 'tense');
  assert.equal(evaluateMoodState({ hungerState: undefined }), 'calm');
  assert.equal(evaluateMoodState({ hungerState: 'starving', heraldAlive: true }), 'boss');
});
