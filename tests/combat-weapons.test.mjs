import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { FORMS } from '../src/data/forms.js';
import { STEMS } from '../src/data/stems.js';
import { WEAPON_IDS } from '../src/data/weapons.js';
import { EnemyFire } from '../src/game/enemyFire.js';
import { simSeconds } from '../src/game/status.js';
import { weaponStats } from '../src/systems/weapons.js';
import { fakeEnemy, makeWorld } from './fixtures-abilities.mjs';

const target = (x, y = 0, size = 35) => fakeEnemy(1000 + x, 1000 + y, size);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} ≠ ${expected}`);
function world(kind, level = 0, enemies = [], ability) {
  const stem = STEMS.find(s => s.ability === ability);
  const form = stem && FORMS.find(f => f.stem === stem.id && f.entry && f.stage === 5);
  const w = makeWorld({ level, enemies, formId: form?.id ?? 'mimul' });
  w.progress.treasure.kind = kind;
  return w;
}
function recordDamage(w) {
  const hits = [];
  w.combat.applyTreasureDamage = (e, amount, options) => {
    assert.ok(Number.isFinite(amount) && amount >= 0);
    hits.push({ e, amount, silent: !!options?.silent });
    return amount;
  };
  return hits;
}
const distance = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

for (const kind of WEAPON_IDS) {
  test(kind + ' 개수·사거리·쿨타임은 장착 수치를 따른다', () => {
    for (const level of [0, 5, 10, 15]) {
      const w = world(kind, level), c = w.combat, st = weaponStats({ kind, level });
      c.fire();
      close(c.cooldown, st.cooldown);
      close(c.cooldownMax, st.cooldown);
      if (['yeouiju', 'fan', 'gourd', 'sword'].includes(kind)) {
        assert.equal(c.orbs.length, st.count);
        for (const orb of c.orbs) { close(orb.rangeLeft, st.reach); close(orb.speed, st.speed); }
      } else if (kind === 'mirror') {
        const beams = c.beams.filter(b => b.until > 0);
        assert.equal(beams.length, st.count);
        for (const b of beams) close(Math.hypot(b.x2 - b.x1, b.y2 - b.y1), st.reach);
      } else if (kind === 'beads') {
        w.step(1, st.burstOutSec);
        assert.equal(c.beads.length, st.count);
        for (const b of c.beads) close(distance(b, w.player), (w.player.size * st.orbitSizeMult + st.orbitPad) * st.burstMult);
      } else if (kind === 'bell') {
        assert.equal(c.waves.length, st.count);
        c.waves.forEach((wave, i) => { close(wave.maxR, st.reach); close(wave.delay, i * st.gapSec); });
      } else {
        assert.equal(c.seals.length, st.count);
        for (const s of c.seals) { close(s.x - w.player.x, st.fallback); close(s.y, w.player.y); close(s.at, st.delaySec); }
      }
    }
  });
  test(kind + ' 모든 형태 능력 16종이 실제로 발사·명중하고 전투 상한을 지킨다', () => {
    for (const { ability } of STEMS) {
      const enemies = [target(75, 0, 43), target(95, 6, 43), target(145, -5, 48), target(-90), target(70, 22), target(185)];
      const w = world(kind, 15, enemies, ability);
      const hits = recordDamage(w);
      for (let i = 0; i < 120; i++) {
        w.step(1, 1 / 60, { fire: true });
        const c = w.combat;
        assert.ok(c.orbs.length <= 120 && c.waves.length <= 6 && c.pools.length <= 6 && c.seals.length <= 6);
        assert.ok(c.pearls.length <= 6 && c.beads.length <= 10 && c.clouds.length <= 6 && c.vortices.length <= 4);
      }
      assert.equal(w.combat.ab.id, ability);
      assert.ok(w.combat.wc.fires > 0 && w.combat.wc.hits > 0 && hits.length > 0, kind + ' × ' + ability);
    }
  });
}

test('광선 한 줄은 가까운 순으로 한 번씩 맞히며 퍼지는 효과는 마지막 표적 1회다', () => {
  const enemies = [target(240), target(160), target(88), target(310), target(110, 120)];
  const w = world('mirror', 0, enemies, 'chain');
  const hits = recordDamage(w), anchors = [];
  w.combat.spreadAt = a => anchors.push(a.enemy);
  w.shoot();
  assert.deepEqual(hits.map(h => h.e), [enemies[2], enemies[1], enemies[0], enemies[3]]);
  assert.deepEqual(anchors, [enemies[3]]);
  assert.equal(hits.filter(h => !h.silent).length, 3);
});

test('겹친 고리는 각각 적마다 한 번, 가장 큰 표적에서 고리당 한 번만 분화한다', () => {
  const enemies = [target(90, 0, 38), target(95, 0, 50), target(95, 5, 34), target(91, 0, 29)];
  const w = world('bell', 15, enemies, 'split');
  const hits = recordDamage(w), anchors = [];
  w.combat.spreadAt = a => anchors.push(a.enemy);
  w.shoot(50);
  assert.deepEqual(anchors, Array(3).fill(enemies[1]));
  for (const e of enemies) assert.equal(hits.filter(h => h.e === e).length, 3);
  assert.equal(hits.filter(h => !h.silent).length, 9);
});

test('도목검은 같은 단계에 밀집한 적도 빠짐없이, 가는 길과 오는 길에 한 번씩 친다', () => {
  const enemies = Array.from({ length: 13 }, () => target(120, 0, 5));
  const w = world('sword', 0, enemies, 'split');
  const hits = recordDamage(w), anchors = [];
  w.combat.spreadAt = a => anchors.push(a.enemy);
  w.shoot(15, 0.08);
  assert.equal(anchors.length, 2);
  for (const e of enemies) assert.equal(hits.filter(h => h.e === e).length, 2);
});

test('학우선은 발사당 분화 2회, 가운데 깃의 선무·와류 각 1회다', () => {
  for (const [ability, expected] of [['split', 2], ['zone', 1], ['vortex', 1]]) {
    const w = world('fan', 15, [target(90, 0, 80)], ability);
    recordDamage(w);
    let spreads = 0;
    w.combat.spreadAt = () => { spreads++; };
    w.shoot(35);
    assert.equal(spreads, expected, ability);
  }
});

test('염주 한 번 퍼짐은 대상당 한 번, 회선은 귀환 때 한 번 더 친다', () => {
  for (const [ability, n] of [[null, 1], ['boomerang', 2]]) {
    const w = world('beads', 5, [target(0, 0, 170)], ability);
    recordDamage(w);
    w.shoot(38);
    assert.equal(w.combat.wc.burstHits, n);
    assert.equal(w.combat.wc.contactHits, 2);
  }
});

test('염주 분화는 같은 적에 화면 1초에 한 번만 발생한다', () => {
  const w = world('beads', 5, [target(0, 0, 170)], 'split');
  recordDamage(w);
  const times = [];
  w.combat.spreadAt = (_a, now) => times.push(now);
  for (let i = 0; i < 550; i++) w.step(1, 1 / 60, { fire: true });
  assert.ok(times.length >= 2);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= simSeconds(1, w.scene));
});

test('염주와 합쳐진 호신주는 적 구슬을 막고 재생 뒤 다시 막는다', () => {
  const w = world('beads', 15, [], 'orbit');
  w.step();
  assert.equal(w.combat.pearls.length, 0);
  assert.equal(w.combat.beads.length, 10);
  const fire = new EnemyFire(w.scene), bead = w.combat.beads[0];
  const incoming = () => {
    fire.orbs.push({ x: bead.x, y: bead.y, vx: 0, vy: 0, life: 1 });
    fire.step(0, w.player, w.combat.shield);
  };
  incoming();
  assert.equal(fire.orbs.length, 0);
  incoming();
  assert.equal(fire.orbs.length, 1);
  fire.orbs.length = 0;
  w.scene.simTime = bead.regenAt;
  incoming();
  assert.equal(fire.orbs.length, 0);
});

test('단호로는 겹친 웅덩이마다 4마리의 첫 진입만 세고 지속 피해는 각각 준다', () => {
  const enemies = Array.from({ length: 6 }, () => target(110, 0, 30));
  const w = world('gourd', 10, enemies, 'mark');
  const hits = recordDamage(w);
  const entries = new Map();
  const onHit = w.combat.onWeaponHit.bind(w.combat);
  w.combat.onWeaponHit = (ctx, e, now) => {
    if (ctx.kind === 'poolEnter') {
      if (!entries.has(ctx.eventId)) entries.set(ctx.eventId, []);
      entries.get(ctx.eventId).push(e);
    }
    return onHit(ctx, e, now);
  };
  w.shoot(45);
  assert.equal(entries.size, 2);
  for (const seen of entries.values()) { assert.equal(seen.length, 4); assert.equal(new Set(seen).size, 4); }
  assert.ok(hits.filter(h => h.silent).length > 6 * 40);
});

test('옥인 표적은 발사 때 고정하고 첫 낙하가 빗나가도 회선이 그 자리에 재낙하한다', () => {
  const e = target(90, 0, 55), w = world('seal', 0, [e], 'boomerang');
  w.player.stage = 1;
  const hits = recordDamage(w);
  w.shoot();
  close(w.combat.seals[0].x, e.x);
  e.x += 400;
  w.step(22);
  assert.equal(hits.length, 0);
  e.x -= 400;
  w.step(20);
  assert.equal(hits.length, 1);
  assert.equal(w.combat.wc.slams, 2);
});

test('무기 교체는 이전 무기의 효과를 지우고 적의 상태이상은 지속된다', () => {
  const e = target(110, 0, 45), w = world('gourd', 3, [e], 'freeze');
  w.shoot(20);
  assert.ok(w.combat.pools.length && e.frozenUntil > w.scene.simTime);
  const until = e.frozenUntil;
  w.progress.treasure = { kind: 'bell', level: 5 };
  w.step();
  assert.equal(w.combat.pools.length + w.combat.orbs.length, 0);
  assert.equal(e.frozenUntil, until);
  w.progress.treasure = null;
  w.shoot();
  assert.equal(w.combat.stats().kind, 'yeouiju');
  assert.equal(w.combat.stats().level, 0);
});

test('되돌아오는 칼의 대풍도 적을 플레이어 바깥으로 민다', () => {
  const e = target(140), w = world('sword', 0, [e], 'gust');
  w.shoot(30);
  e.gustGateUntil = 0;
  e.knockVx = 0;
  w.step(30);
  assert.ok(e.knockVx > 0);
});

test('겹친 고리·광선·인장의 역전·처치 보상은 적마다 한 번이다', () => {
  for (const kind of ['bell', 'mirror', 'seal']) {
    const e = target(90, 0, 32), w = world(kind, 15, [e]);
    for (let i = 0; i < 400 && e.sprite.active; i++) w.step(1, 1 / 60, { fire: true });
    // 옥인은 첫 낙하로 작아져 위협에서 빠지면 앞쪽 기본 지점에 남은 적을 맞힌다.
    if (e.sprite.active) { e.x = w.player.x + 200; w.shoot(40); }
    assert.equal(w.log.eat.length, 1, kind);
    assert.equal(w.log.reversal, 1, kind);
    assert.ok(w.log.eat[0].killedByTreasure);
  }
});
