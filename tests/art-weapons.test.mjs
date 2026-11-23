import test from 'node:test';
import assert from 'node:assert/strict';
import { drawWeaponIcon, drawWeaponShot } from '../src/art/weapons.js';
import { drawOrb, orbStyleOf } from '../src/art/orbs.js';
import { STEMS } from '../src/data/stems.js';
import { WEAPON_IDS } from '../src/data/weapons.js';

// 기록기에 있는 동작만 쓸 수 있다. 글자나 텍스처를 추가하면 테스트에서 바로 찾는다.
function record(draw) {
  const calls = [], g = {};
  for (const op of ['save','restore','translateCanvas','rotateCanvas','scaleCanvas','beginPath',
    'moveTo','lineTo','closePath','arc','fillStyle','lineStyle','fillPath','strokePath','fillCircle','lineBetween']) {
    g[op] = (...args) => {
      assert.ok(args.every(Number.isFinite), op + '의 좌표와 색은 유한수여야 한다');
      calls.push([op, ...args]);
      return g;
    };
  }
  draw(g);
  assert.equal(calls.filter(([op]) => op === 'save').length, calls.filter(([op]) => op === 'restore').length);
  return calls;
}
const shot = Object.freeze({ x: 20, y: 30, vx: .6, vy: .8 });
const variants = [
  ['fan', {}, 8], ['sword', {}, 8], ['beads', {}, 8], ['gourd', {}, 8],
  ['gourd', { effect: 'pool', r: 55 }, 6], ['mirror', { x2: 302, y2: 406, halfWidth: 7 }, 6],
  ['bell', { r: 120 }, 8], ['seal', { effect: 'shadow', r: 28 }, 8], ['seal', { height: 14 }, 8],
];
const draws = new Set(['fillPath','strokePath','fillCircle','lineBetween']);
const colors = calls => calls.flatMap(([op, a, b]) => op === 'fillStyle' ? [a] : op === 'lineStyle' ? [b] : []);

test('보패 7종과 웅덩이·그림자는 모든 줄기에서 5티어를 구별하고 그리기 상한을 지킨다', () => {
  for (const stem of [null, ...STEMS.map(s => s.id)]) {
    const first = new Set();
    for (const [kind, extra, limit] of variants) {
      const tiers = new Set();
      for (let tier = 1; tier <= 5; tier++) {
        const calls = record(g => drawWeaponShot(g, { ...shot, ...extra }, kind, stem, tier));
        const count = calls.filter(([op]) => draws.has(op)).length;
        assert.ok(count > 0 && count <= limit, [kind, stem, tier, count].join('/'));
        if (kind === 'bell') assert.ok(calls.filter(([op]) => op === 'strokePath').length <= 2);
        const paint = colors(calls), style = orbStyleOf(stem);
        assert.ok(paint.includes(style.main) || paint.includes(style.sub));
        if (tier >= 4) assert.ok(paint.includes(0xefbd6c));
        tiers.add(JSON.stringify(calls));
        if (tier === 1) first.add(JSON.stringify(calls));
      }
      assert.equal(tiers.size, 5, kind);
    }
    assert.equal(first.size, variants.length, '1티어부터 무기와 효과마다 그림이 다르다');
  }
});

test('광선은 실측 끝점, 파문·웅덩이는 실제 반경, 낙하는 높이를 따른다', () => {
  const beam = record(g => drawWeaponShot(g, { ...shot, x2: 23, y2: 34 }, 'mirror'));
  assert.ok(beam.some(([op, x, y]) => op === 'lineTo' && x === 5 && y === 0));
  assert.ok(beam.some(([op, a]) => op === 'rotateCanvas' && a === Math.atan2(4, 3)));
  const ring = record(g => drawWeaponShot(g, { ...shot, r: 93 }, 'bell'));
  assert.ok(ring.some(([op, x, y, r]) => op === 'arc' && x === 0 && y === 0 && r === 93));
  const pool = record(g => drawWeaponShot(g, { ...shot, effect: 'pool', r: 72 }, 'gourd'));
  assert.ok(pool.some(([op, x]) => op === 'moveTo' && x > 72 && x < 75));
  const seal = record(g => drawWeaponShot(g, { ...shot, height: 18 }, 'seal'));
  assert.ok(seal.some(([op, x, y]) => op === 'translateCanvas' && x === 0 && y === -18));
});

test('옥인 착지 충격 고리는 실제 낙하 반경과 줄기·티어 색을 쓴다', () => {
  for (const r of [24, 73]) {
    for (let tier = 1; tier <= 5; tier++) {
      const calls = record(g => drawWeaponShot(g, { ...shot, effect: 'impact', r }, 'seal', 'N1', tier));
      assert.ok(calls.some(([op, x, y]) => op === 'translateCanvas' && x === shot.x && y === shot.y));
      assert.ok(calls.some(([op, x, y, radius, start, end]) =>
        op === 'arc' && x === 0 && y === 0 && radius === r && start === 0 && end === Math.PI * 2));
      assert.ok(colors(calls).includes(orbStyleOf('N1').main));
      assert.equal(colors(calls).includes(0xefbd6c), tier >= 4);
    }
  }
});

test('여의주의 기존 구슬 그림을 유지한다', () => {
  for (const stem of [null, 'E4', 'S3']) {
    assert.deepEqual(record(g => drawWeaponShot(g, shot, 'yeouiju', stem, 5)), record(g => drawOrb(g, shot, stem, 5)));
  }
});

test('아이콘 8종은 서로 다른 64px 원판이며 잠그면 먹색만 남고 축소해도 경계 안에 들어간다', () => {
  const silhouettes = new Set();
  for (const kind of WEAPON_IDS) {
    const open = record(g => drawWeaponIcon(g, kind, 'E3', 64));
    assert.ok(colors(open).includes(orbStyleOf('E3').main), kind);
    assert.notDeepEqual(open, record(g => drawWeaponIcon(g, kind, 'N4', 64)));
    const locked = record(g => drawWeaponIcon(g, kind, 'E3', 64, { locked: true }));
    assert.deepEqual(new Set(colors(locked)), new Set([0x343a37]));
    silhouettes.add(JSON.stringify(locked));
    for (const size of [48,64]) {
      const calls = record(g => drawWeaponIcon(g, kind, 'E3', size));
      for (const [op, ...xy] of calls) {
        if (op === 'moveTo' || op === 'lineTo') assert.ok(xy.every(v => v >= 1 && v <= size - 1), kind);
      }
    }
  }
  assert.equal(silhouettes.size, 8);
});
