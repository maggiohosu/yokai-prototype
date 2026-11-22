import test from 'node:test';
import assert from 'node:assert/strict';
import { STEMS } from '../src/data/stems.js';
import { CONFIG } from '../src/config.js';
import { drawOrb } from '../src/art/orbs.js';

function trace(stem, stage, orb, radius) {
  const calls = [];
  const g = new Proxy({}, { get: (_, op) => (...args) => {
    assert.ok(args.every(Number.isFinite), String(op));
    calls.push([op, ...args]);
    return g;
  } });
  drawOrb(g, orb, stem, stage, radius);
  return calls;
}
const shot = Object.freeze({ x: 13, y: -7, vx: .6, vy: .8 });

test('16줄기 × 5티어는 단계마다 다르며 구슬마다 도형 그리기 호출이 8회 이하다', () => {
  const contours = new Set();
  for (const stem of STEMS) {
    const tiers = new Set();
    for (let stage = 1; stage <= 5; stage++) {
      const calls = trace(stem.id, stage, shot);
      const draws = calls.filter(([op]) => /^(fill|stroke)(Path|Circle|Ellipse|Triangle|Points)$|^lineBetween$/.test(op));
      assert.ok(draws.length > 0 && draws.length <= 8, stem.id + '/' + stage);
      assert.ok(calls.some(([op, color]) => op === 'fillStyle' && color === stem.orbStyle.main), stem.id);
      tiers.add(JSON.stringify(calls));
      if (stage === 1) contours.add(JSON.stringify(calls.filter(([op]) => ['moveTo','lineTo','arc'].includes(op))));
    }
    assert.equal(tiers.size, 5, stem.id);
  }
  assert.equal(contours.size, 16);
});

test('적의 속도 벡터와 단위 방향은 같은 방향을 그리며 적 구슬의 기본 반지름을 지정할 수 있다', () => {
  const normal = trace('E1', 4, { ...shot, vx: 1, vy: 0 }, CONFIG.special.orbRadius);
  assert.deepEqual(trace('E1', 4, { ...shot, vx: 260, vy: 0 }, CONFIG.special.orbRadius), normal);
  assert.notDeepEqual(trace('E1', 4, { ...shot, vx: 1, vy: 0 }), normal);
  assert.doesNotThrow(() => trace('N4', 5, { ...shot, vx: 0, vy: 0 }));
});

test('미물과 모르는 줄기는 기존 옥색 구슬로 그린다', () => {
  const calls = trace(null, 1, shot);
  assert.deepEqual(trace('unknown', 5, shot), calls);
  assert.ok(calls.some(([op, color]) => op === 'fillStyle' && color === 0x9deed3));
});
