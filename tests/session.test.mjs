import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createProgress } from '../src/systems/progress.js';
import { attachSession } from '../src/game/session.js';

test('같은 씬을 restart해도 eat 리스너는 한 번만 붙는다', () => {
  const scene = { events: new EventEmitter() };
  const progress = createProgress();
  let saves = 0;
  const save = () => void saves++;
  const meal = { preySize: 10, killedByTreasure: false, direction: 'east' };
  for (let round = 0; round < 3; round++) {
    attachSession(scene, progress, () => 1, save);
    scene.events.emit('shutdown');
  }
  assert.equal(scene.events.listenerCount('eat'), 0);
  attachSession(scene, progress, () => 1, save);
  assert.equal(scene.events.listenerCount('eat'), 1);
  const before = progress.yoryeok;
  scene.events.emit('eat', meal);
  const once = progress.yoryeok - before;
  assert.ok(once > 0);
  assert.equal(saves, 1);
});
