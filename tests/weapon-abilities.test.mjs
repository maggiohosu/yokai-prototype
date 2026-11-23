import test from 'node:test';
import assert from 'node:assert/strict';
import { adapt, modsFor } from '../src/systems/weapon-abilities.js';

const weapons = ['yeouiju', 'fan', 'mirror', 'sword', 'beads', 'gourd', 'bell', 'seal'];
const status = 'hit hit hit hit hit hitEnter hit hit';
const spread = 'hit volley beamEnd pathFirst enemySec poolBorn ring slam';
const table = {
  chain: spread, charm: status,
  homing: 'steer steerCone aimSnap steerOmni orbitRadius steerOmni ringRadius senseOmni',
  orbit: 'pearls pearls pearls pearls merge pearls pearls pearls',
  pierce: 'pierce pierce beamPower bladePower beadPower poolRadius ringPower slamRadius',
  mark: status,
  boomerang: 'turnBack centerTurn reflect backPower backHit poolTime echoRing echoSlam',
  fear: status, burn: status, split: spread,
  zone: 'hit volleyCenter beamEnd turnPoint burstAtMe poolField ringAtMe slam',
  explode: 'hit volley beamEnd pathFirst enemySec poolBorn ring slamRadius', freeze: status,
  drain: 'drain drain drain drain drain drain drain drain',
  vortex: 'hit volleyCenter beamEnd turnPoint enemySec poolField ring slam',
  gust: 'push push pushLine push pushOut pushDrop pushOut pushOut',
};
const once = new Set('beamEnd pathFirst enemySec poolBorn ring slam volleyCenter turnPoint burstAtMe ringAtMe'.split(' '));
const statusIds = ['charm', 'mark', 'fear', 'burn', 'freeze'];
const fixed = {
  chain: { mirror: { hops: 1 }, seal: { hops: 1 } },
  split: { gourd: { rangeMult: 0.7 }, seal: { countBonus: 1 } },
  zone: { beads: { radiusMult: 0.8 }, bell: { radiusMult: 0.8 }, seal: { radiusMult: 1.2 } },
  gust: { fan: { pushMult: 0.5 }, mirror: { pushMult: 0.7 }, bell: { pushMult: 0.6 }, seal: { pushMult: 1, pushMultSecondary: 0.5 } },
};
for (const id of statusIds) fixed[id] = { bell: { durMul: 0.6 }, seal: { durMulSecondary: 0.6, primaryFirst: true } };

for (const [id, row] of Object.entries(table)) {
  test('설계 3-2 무기 8열 발동 단위·상한·고정 보정 ' + id, () => {
    row.split(' ').forEach((trigger, i) => {
      const cell = adapt(weapons[i], id);
      assert.equal(cell.trigger, trigger);
      assert.equal(cell.perEvent, once.has(trigger) ? 1 : trigger === 'volley' ? 2 : Infinity);
      assert.deepEqual(cell.mult, fixed[id]?.[weapons[i]] ?? {});
    });
  });
}

const ab = { extra: 3, damage: 0.8, rangeBonus: 25, strength: 0.8, count: 5, slow: 0.4, pull: 70, radius: 80 };
const stats = { H: 0.9, homing: 0.9 };
const overlaps = [
  ['mirror', 'pierce', { damageMult: 1.3, halfWidthAdd: 6 }],
  ['sword', 'pierce', { damageMult: 1.24 }],
  ['beads', 'pierce', { damageMult: 1.24 }],
  ['gourd', 'pierce', { poolRadiusMult: 1.18, poolRadiusCap: 90 }],
  ['bell', 'pierce', { damageMult: 1.24 }],
  ['seal', 'pierce', { slamRadiusMult: 1.24 }],
  ['fan', 'boomerang', { centerOnly: true }],
  ['mirror', 'boomerang', { reflectDelay: 0.15, reflectMult: 0.48 }],
  ['sword', 'boomerang', { backMult: 1.24, reachMult: 1.25 }],
  ['beads', 'boomerang', { backHit: true, backMult: 0.8 }],
  ['gourd', 'boomerang', { poolDurationMult: 1.16, poolDurationCap: 4.5 }],
  ['bell', 'boomerang', { echoMult: 0.48 }],
  ['seal', 'boomerang', { echoDelay: 0.3, echoMult: 0.4 }],
  ['fan', 'homing', { homingMin: 0.4 }],
  ['mirror', 'homing', { snapDeg: 33 }],
  ['beads', 'homing', { orbitMult: 1.12 }],
  ['gourd', 'homing', { homingMin: 0.9 }],
  ['bell', 'homing', { ringMult: 1.12, ringCap: 260 }],
  ['seal', 'homing', { omni: true, senseMult: 1.24 }],
  ['beads', 'orbit', { extraBeads: 2, maxBeads: 10, block: true, contactFloor: 0.8 }],
  ['gourd', 'zone', { poolSlow: 0.4, poolRadiusMult: 1.1 }],
  ['seal', 'explode', { slamRadiusAdd: 40 }],
];
overlaps.forEach(([kind, id, expected], i) => {
  test(`설계 3-3 보정 ${i + 1} · ${kind} × ${id}`, () => {
    assert.equal(adapt(kind, id).overlapId, i + 1);
    const mods = modsFor(kind, id, ab, stats);
    for (const [key, value] of Object.entries(expected)) {
      if (typeof value === 'number') assert.ok(Math.abs(mods[key] - value) < 1e-9, key);
      else assert.equal(mods[key], value, key);
    }
    if (i + 1 === 21) assert.deepEqual(modsFor('gourd', 'vortex', ab, stats), { poolPull: 42 });
  });
});
