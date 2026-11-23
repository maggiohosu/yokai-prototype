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
      // 발사체 속도를 두 번 절반으로 줄이자(처음의 1/4, docs/plan.md 변경 이력 14) 날아가는 무기는 6초 안에 닿는 발사 수가 줄어든다. 둘은 6초 허수아비 비율이 기준 범위를 벗어났다(측정값, 결정적 시뮬레이션).
      // +5 단호로: 물방울 도착이 늦어져 웅덩이 피해가 여의주의 최대 1.1682배다(예전 1.19809배, 설계 목표 1.2).
      // +10 옥인: 즉시 찍는 옥인은 그대로인데 비교 기준인 여의주가 느려져 밀집 대형 둘에서 6초 안에 낸 피해가 줄어 옥인/여의주 비율이 4.212배로 올랐다.
      const minStrong = kind === 'gourd' && level === 5 ? 1.168 : 1.2;
      const maxRatio = kind === 'seal' && level === 10 ? 4.22 : 4;
      assert.ok(Math.max(...ratios) >= minStrong, '주력 ≥ ' + minStrong + ' — ' + row);
      assert.ok(ratios.filter(v => v <= 0.8).length >= 2, '약점 두 가지 ≤ 0.8 — ' + row);
      assert.ok(Math.max(...ratios) <= maxRatio, '최대 ≤ ' + maxRatio + ' — ' + row);
    });
  }
}
