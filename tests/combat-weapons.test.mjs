import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { FORMS } from '../src/data/forms.js';
import { STEMS } from '../src/data/stems.js';
import { WEAPON_IDS } from '../src/data/weapons.js';
import { sfx } from '../src/audio/sfx.js';
import { EnemyFire } from '../src/game/enemyFire.js';
import { Fx, announceWeaponUnlocks, isNewWeapon } from '../src/game/fx.js';
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

// 처음 속도(여의주 520·학우선 470·도목검 570·단호로 360)를 사용자 지시로 1/2(2026-11-23), 같은 날 다시 1/2로 줄였다. 지금은 처음의 1/4이고
// 사거리는 그대로라 같은 거리를 가는 데 처음의 4배 시간이 든다. 회귀를 막으려고 처음 값을 이 시험에 고정해 둔다.
const ORIGINAL_SPEED = { yeouiju: 520, fan: 470, sword: 570, gourd: 360 };

test('비행형 보패는 모든 강화 단계에서 처음 속도의 1/4로 같은 사거리 끝에 도착한다', () => {
  const flights = [
    ['yeouiju', 360], ['fan', 200], ['sword', 260], ['gourd', 220],
  ];
  for (const [kind, reach] of flights) {
    for (let level = 0; level <= 15; level++) {
      const w = world(kind, level, [], 'homing');
      w.combat.fire();
      const orb = w.combat.orbs[0], start = { x: orb.x, y: orb.y };
      const speedMult = w.combat.stats().speedMult;
      close(orb.speed, ORIGINAL_SPEED[kind] * 0.25 * speedMult);
      const originalFlight = reach / (ORIGINAL_SPEED[kind] * speedMult);
      w.step(1, originalFlight);
      close(distance(start, orb), reach / 4);
      close(orb.rangeLeft, reach * 3 / 4);
      w.step(1, originalFlight * 2);
      close(distance(start, orb), reach * 3 / 4);
      w.step(1, originalFlight + 1e-9);
      close(distance(start, orb), reach);
      if (kind === 'sword') {
        assert.equal(orb.phase, 1);
        close(orb.rangeLeft, reach * 2.2);
        const turn = { x: orb.x, y: orb.y };
        w.step(1, originalFlight);
        close(distance(turn, orb), reach / 4);
      } else {
        assert.ok(!w.combat.orbs.includes(orb));
      }
    }
  }
});

test('보패 8종에서 생긴 분화 갈래도 속도만 처음의 1/4이 된다', () => {
  for (const kind of WEAPON_IDS) {
    const originalSpeed = kind === 'fan' ? 470 : kind === 'sword' ? 570 : 520;
    const enemy = kind === 'beads' ? target(0, 0, 75) : target(75, 0, 45);
    enemy.stage = 5;
    const w = world(kind, 0, [enemy], 'split');
    w.shoot();
    for (let i = 0; !w.combat.orbs.some(orb => orb.kind === 1) && i < 60; i++) w.step();
    const child = w.combat.orbs.find(orb => orb.kind === 1);
    assert.ok(child, kind);
    const reach = kind === 'gourd' ? 140 : 200;
    close(child.reach, reach);
    w.enemies.length = 0;
    const start = { x: child.x, y: child.y };
    const remaining = child.rangeLeft;
    close(child.speed, originalSpeed * 0.8 * 0.25);
    w.step(1, 0.1);
    close(distance(start, child), originalSpeed * 0.8 * 0.25 * 0.1);
    w.step(1, 6);
    close(distance(start, child), remaining);
    assert.ok(!w.combat.orbs.includes(child));
  }
});

test('+15 여의주는 회선 복귀·분화 중에도 쿨타임마다 40발을 모두 쏜다', () => {
  for (const ability of ['boomerang', 'split']) {
    const enemies = ability === 'split' ? [target(0, 0, 70)] : [];
    const w = world('yeouiju', 15, enemies, ability);
    recordDamage(w);
    for (let frame = 0; frame < 600; frame++) {
      if (ability === 'boomerang') w.player.x += 10;
      const seq = w.combat.shotSeq, fires = w.combat.wc.fires;
      w.step(1, 1 / 60, { fire: true });
      if (w.combat.wc.fires > fires) assert.equal(w.combat.shotSeq - seq, 40, ability);
      assert.ok(w.combat.orbs.length <= CONFIG.combat.maxOrbs);
    }
    assert.equal(w.combat.wc.fires, 18);
  }
});

test('발사체 속도가 처음의 1/4이어도 +15 여의주는 달리는 중에도 25초 동안 한 발도 막히지 않는다', () => {
  // 비행 시간이 처음의 4배라 회선·분화가 한꺼번에 떠 있는 구슬이 많다. 상한이 240이던 때는 회선 복귀 중 발사가 막혔다(측정: 25초에 최대 640발).
  assert.equal(CONFIG.combat.orbSpeed, 130);
  assert.equal(CONFIG.combat.maxOrbs, 480);
  for (const [ability, speed] of [['boomerang', 0], ['boomerang', 250], ['split', 0]]) {
    const enemies = ability === 'split' ? [target(75, 0, 43), target(95, 6, 43), target(145, -5, 48), target(-90), target(70, 22), target(185)] : [];
    const w = world('yeouiju', 15, enemies, ability);
    w.combat.applyTreasureDamage = () => 0;
    const count = w.combat.stats().count;
    let fires = 0, peak = 0;
    for (let frame = 0; frame < 25 * 60; frame++) {
      w.player.x += speed / 60;
      const seq = w.combat.shotSeq, before = w.combat.wc.fires;
      w.step(1, 1 / 60, { fire: true });
      if (w.combat.wc.fires > before) {
        fires++;
        assert.equal(w.combat.shotSeq - seq, count, ability + ' ' + speed + ' 발사 ' + fires);
      }
      peak = Math.max(peak, w.combat.orbs.length);
    }
    assert.ok(fires >= 40, ability + ' ' + speed);
    assert.ok(peak <= CONFIG.combat.maxOrbs);
  }
});

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
        assert.ok(c.orbs.length <= CONFIG.combat.maxOrbs && c.waves.length <= 6 && c.pools.length <= 6 && c.seals.length <= 6);
        assert.ok(c.pearls.length <= 6 && c.beads.length <= 10 && c.clouds.length <= 6 && c.vortices.length <= 4);
      }
      assert.equal(w.combat.ab.id, ability);
      assert.ok(w.combat.wc.fires > 0 && w.combat.wc.hits > 0 && hits.length > 0, kind + ' × ' + ability);
    }
  });
}

test('표적이 없는 발사도 선무를 퍼짐·고리·낙하 위치에 각각 남긴다', () => {
  for (const [kind, count, offset] of [['beads', 1, 0], ['bell', 3, 0], ['seal', 3, 200]]) {
    const w = world(kind, 15, [], 'zone');
    w.shoot(44);
    assert.equal(w.combat.clouds.length, count, kind);
    for (const cloud of w.combat.clouds) {
      close(cloud.x, w.player.x + offset);
      close(cloud.y, w.player.y);
    }
  }
});

test('호신주 접촉 피해도 장착 무기의 능력 기준 피해 B를 따른다', () => {
  const e = target(0, 0, 125), w = world('fan', 5, [e], 'orbit');
  const hits = recordDamage(w);
  w.step();
  assert.equal(hits.length, 1);
  close(hits[0].amount, w.combat.stats().B * w.combat.ab.damage);
});

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
  w.shoot(60, 0.08);
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
  w.shoot(90);
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
  w.shoot(40);
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
  w.shoot(120);
  e.gustGateUntil = 0;
  e.knockVx = 0;
  w.step(60);
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

test('같은 progress로 다시 시작하면 이전 판의 해금 표시는 사라진다', () => {
  const { scene, progress } = world('yeouiju');
  scene.progress = progress;
  const start = () => { new Fx(scene); scene.events.emit('create'); };
  start();
  progress.stage = 2;
  assert.equal(announceWeaponUnlocks(progress, 1), '상점에 새 보패 · 학우선 · 도목검');
  assert.equal(isNewWeapon(progress, 2), true);
  assert.equal(isNewWeapon(progress, 1), false);
  assert.equal(announceWeaponUnlocks(progress, 1), '');
  start();
  assert.equal(isNewWeapon(progress, 2), false);
  progress.stage = 3;
  assert.equal(announceWeaponUnlocks(progress, 2), '상점에 새 보패 · 팔괘경 · 염주');
  assert.equal(isNewWeapon(progress, 3), true);
  assert.equal(isNewWeapon(progress, 2), false);
});

test('무기 여덟 종은 발사 한 번에 발사음과 섬광을 한 번씩 낸다', t => {
  const sounds = t.mock.method(sfx, 'play', () => {});
  for (const kind of WEAPON_IDS) {
    const w = world(kind, 15);
    const flashes = [];
    w.scene.fx.muzzleFlash = (player, dir) => flashes.push([player, dir.x, dir.y]);
    sounds.mock.resetCalls();
    const opts = { fire: true, direction: { x: 0, y: 1 } };
    w.step(1, 1 / 60, opts);
    w.step(1, 1 / 60, opts);
    assert.deepEqual(flashes, [[w.player, 0, 1]]);
    assert.deepEqual(sounds.mock.calls.map(call => call.arguments[0]), [kind === 'yeouiju' ? 'orb-fire' : 'shot-' + kind]);
  }
});

test('역전된 적 여섯 마리도 광선 한 줄·고리 하나에서 세 마리만 번쩍인다', () => {
  for (const kind of ['mirror', 'bell']) {
    const enemies = Array.from({ length: 6 }, (_, i) => target(50 + i * 8, 0, 32));
    const w = world(kind, 0, enemies);
    w.scene.fx.reversal = Fx.prototype.reversal.bind({ burst() {}, flash: w.scene.fx.flash,
      scene: { cameras: { main: { shake() {} } } }, m: {} });
    // 첫 타격으로 모두 역전되는 조건에서도 명중당 피해와 역전 처리는 여섯 번이다.
    const damage = w.combat.applyTreasureDamage.bind(w.combat);
    w.combat.applyTreasureDamage = (e, _, options) => damage(e, 10, options);
    w.shoot(35);
    assert.equal(w.log.reversal, 6, kind);
    assert.equal(w.log.flashes, 3, kind);
  }
});
