import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPON_IDS } from '../src/data/weapons.js';
import { fakeEnemy, fakePlayer, makeWorld } from './fixtures-abilities.mjs';

function circle(count, radius, center, size) {
  return Array.from({ length: count }, (_, i) => {
    const angle = i * 2 * Math.PI / count;
    return [center + radius * Math.cos(angle), radius * Math.sin(angle), size];
  });
}

const formations = [
  [[90, 0, 45]], [[300, 0, 20]], circle(8, 70, 0, 12),
  [100, 150, 200, 250, 300].map(x => [x, 0, 14]), circle(6, 35, 150, 10),
];

function damage(kind, level, formation) {
  const enemies = formation.map(([x, y, size]) => fakeEnemy(1000 + x, 1000 + y, size));
  const w = makeWorld({ enemies, level, player: fakePlayer('mimul', { size: 30 }) });
  w.progress.treasure.kind = kind;
  let total = 0;
  w.combat.applyTreasureDamage = (_enemy, amount) => { total += amount; return 0; };
  for (let i = 0; i < 360; i++) w.step(1, 1 / 60, { fire: true });
  return total;
}

for (const level of [5, 10]) {
  const base = formations.map(f => damage('yeouiju', level, f));
  assert.ok(base.every(n => n > 0));
  for (const kind of WEAPON_IDS.filter(id => id !== 'yeouiju')) {
    test(`+${level} ${kind} 6초 허수아비 5종`, t => {
      const ratios = formations.map((f, i) => damage(kind, level, f) / base[i]);
      const row = ratios.map(v => v.toFixed(2)).join(' / ');
      t.diagnostic(row);
      assert.ok(Math.max(...ratios) >= 1.2, '주력 ≥ 1.2 — ' + row);
      assert.ok(ratios.filter(v => v <= 0.8).length >= 2, '약점 두 가지 ≤ 0.8 — ' + row);
      assert.ok(Math.max(...ratios) <= 4, '최대 ≤ 4.0 — ' + row);
    });
  }
}
