import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { CONFIG } from '../src/config.js';
import { FORMS } from '../src/data/forms.js';
import { STEMS } from '../src/data/stems.js';
import { buildGrid } from '../src/game/enemyAI.js';
import { seedWeaponStress } from '../src/game/weaponFire.js';
import { makeWorld, fakeEnemy } from './fixtures-abilities.mjs';

const heavy = { yeouiju: 'split', fan: 'split', mirror: 'chain', sword: 'explode', beads: 'orbit', gourd: 'vortex', bell: 'split', seal: 'chain' };
const step = 1 / 60;
const steps = 300;

function measure(kind, ability) {
  const stem = STEMS.find(s => s.ability === ability);
  const form = stem && FORMS.find(f => f.entry && f.stage === 5 && f.stem === stem.id);
  const enemies = Array.from({ length: 72 }, (_, i) => {
    const a = i * 2.399963, r = 66 + (i * 31) % 250, size = 16 + i % 38;
    // 크기가 고정된 적도 실제 피해·역전·능력 함수를 거친다.
    return fakeEnemy(1000 + Math.cos(a) * r, 1000 + Math.sin(a) * r, size, {
      stage: 5, setSize() {}, destroy() {}, fleeFrom() {}, push() {},
    });
  });
  const w = makeWorld({ formId: form?.id ?? 'mimul', level: 15, enemies });
  const c = w.combat;
  w.progress.treasure.kind = kind;
  const grid = buildGrid(enemies, CONFIG.hunt.detect);
  c.grid = grid;
  seedWeaponStress(c);
  assert.equal(c.orbs.length, CONFIG.combat.maxOrbs);
  if (kind === 'mirror') assert.equal(c.beams.filter(b => b.until > 0).length, 8);
  if (kind === 'gourd') assert.equal(c.pools.length, 6);
  if (kind === 'bell') assert.equal(c.waves.length, 6);
  if (kind === 'seal') assert.equal(c.seals.length, 6);
  if (kind === 'beads') assert.equal(c.beads.length, 10);
  const src = { ...c.shot, speed: CONFIG.combat.orbSpeed, vx: 1, vy: 0 };
  const fragment = { count: 8, range: 230, damage: 0.4 };
  const dir = { x: 1, y: 0 };
  let total = 0;
  for (let i = 0; i < steps; i++) {
    w.scene.simTime += step;
    dir.x = Math.cos(i * 0.015);
    dir.y = Math.sin(i * 0.015);
    // 직전 단계에서 소멸한 발사물을 다시 채운다. 발사 차례에는 해당 무기의 한 발사분을 비워 둔다.
    const room = c.cooldown <= step && c.stats().speed > 0 ? c.stats().count : 0;
    const cap = CONFIG.combat.maxOrbs - room;
    while (c.orbs.length < cap) {
      fragment.count = Math.min(8, cap - c.orbs.length);
      const enemy = enemies[(i + c.orbs.length) % enemies.length];
      c.splitFrom(src, null, enemy.x + 36, enemy.y, fragment);
    }
    const start = performance.now();
    c.step(dir, step, true, grid);
    total += performance.now() - start;
    assert.ok(c.orbs.length <= CONFIG.combat.maxOrbs && c.waves.length <= 6 && c.seals.length <= 6 && c.pools.length <= 6);
    assert.ok(c.beads.length <= 10 && c.clouds.length <= 6 && c.vortices.length <= 4);
  }
  return total / steps;
}

function median(values) {
  return values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
}

test(`72마리·구슬 ${CONFIG.combat.maxOrbs}개·+15 무기별 300단계의 추가 전투 처리 평균은 0.35ms 이내다`, t => {
  const base = [];
  const results = Object.fromEntries(Object.keys(heavy).map(kind => [kind, []]));
  // 첫 회는 JIT 예열이다. 이후 독립된 세 판을 각각 300단계 돌리고 그 평균들의 중앙값을 쓴다.
  for (let trial = 0; trial < 4; trial++) {
    const baseline = measure('yeouiju', null);
    if (trial) base.push(baseline);
    for (const [kind, ab] of Object.entries(heavy)) {
      const ms = measure(kind, ab);
      if (trial) results[kind].push(ms);
    }
  }
  const baseline = median(base);
  t.diagnostic(`기준 ${baseline.toFixed(3)} ms/단계`);
  for (const [kind, values] of Object.entries(results)) {
    const ms = median(values), delta = ms - baseline;
    t.diagnostic(`${kind} ${ms.toFixed(3)} ms/단계 (추가 ${delta.toFixed(3)})`);
    assert.ok(delta <= 0.35, `${kind} 추가 ${delta.toFixed(3)} ms/단계`);
  }
});
