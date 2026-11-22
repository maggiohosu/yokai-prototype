import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createProgress } from '../src/systems/progress.js';
import { attachSession, mealYoryeok } from '../src/game/session.js';
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
