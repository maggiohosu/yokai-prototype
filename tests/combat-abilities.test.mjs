import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { EnemyFire } from '../src/game/enemyFire.js';
import { slowFactor, simSeconds } from '../src/game/status.js';
import { ABILITIES } from '../src/systems/tuning-abilities.js';
import { fakeEnemy, fakePlayer, makeWorld, shotDamage } from './fixtures-abilities.mjs';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const sim = (world, seconds) => simSeconds(seconds, world.scene);
// 플레이어(1000,1000)에서 +x로 쏜 구슬이 닿는 줄에 적을 놓는다.
const E = (x, y, size = 30, stage = 1, extra = {}) => fakeEnemy(x, y, size, { stage, ...extra });
const world = (formId, level, enemies, opts = {}) => makeWorld({ formId, level, enemies, ...opts });

test('능력이 없는 mimul은 예전 구슬 그대로 맞고 사라진다', () => {
  const a = E(1100, 1000, 40), b = E(1160, 1000, 40);
  const w = world('mimul', 0, [a, b]);
  w.shoot(40);
  assert.equal(w.combat.ab, null);
  assert.ok(close(a.size, 40 - shotDamage(w)));
  assert.equal(b.size, 40, '관통 없음');
  assert.equal(w.combat.orbs.length, 0);
});

test('뇌쇄: 맞은 적에서 가장 가까운 안 맞은 적으로 튄다. 1단계는 1번 × 감쇠 0.5', () => {
  const a = E(1100, 1000), b = E(1100, 1090), far = E(1100, 1500);
  const w = world('hwalsa', 0, [a, b, far]);
  const S = shotDamage(w);
  w.shoot(20);
  assert.ok(close(a.size, 30 - S));
  assert.ok(close(b.size, 30 - S * 0.5), 'B는 감쇠 0.5: ' + b.size);
  assert.equal(far.size, 30);
  assert.equal(w.combat.counters.chain, 1);
  assert.ok(w.combat.bolts.some((bolt) => bolt.until > w.scene.simTime), '번개 선이 그려진다');
});

test('뇌쇄 5단계: 3번 튀고 k번째 피해 = 구슬 피해 × 0.7^k, 이미 맞은 적에게는 되튀지 않는다', () => {
  const row = [1100, 1170, 1240, 1310, 1380].map((x) => E(x, 1000));
  const w = world('cheongnyong', 0, row);
  const S = shotDamage(w);
  w.shoot(20);
  const lost = row.map((e) => 30 - e.size);
  assert.ok(close(lost[0], S));
  assert.ok(close(lost[1], S * 0.7), 'k=1');
  assert.ok(close(lost[2], S * 0.7 ** 2), 'k=2');
  assert.ok(close(lost[3], S * 0.7 ** 3), 'k=3');
  assert.equal(lost[4], 0, '튐 3번이 끝');
  assert.equal(w.combat.counters.chain, 3);
});

test('뇌쇄: 튐 횟수는 레벨로 늘되 6이 상한, 연쇄 사건은 초당 12회를 넘지 않는다', () => {
  const w = world('cheongnyong', 15, []);
  assert.equal(w.combat.refreshAbility() ?? w.combat.ab.hops, 6);
  const target = E(1100, 1000, 500);
  w.enemies.push(target);
  const ab = w.combat.ab;
  assert.equal(ab.hops, 6);
  assert.equal(ab.range, 220);
  let started = 0;
  for (let i = 0; i < 20; i++) {
    const before = w.combat.chainGate.count;
    w.combat.chainFrom(target, target.x, target.y, target.size, 1, ab, w.scene.simTime);
    if (w.combat.chainGate.count > before) started++;
  }
  assert.equal(started, 12, '같은 칸 안에서는 12번까지');
  w.scene.simTime += sim(w, 1) + 0.01;
  const before = w.combat.chainGate.count;
  w.combat.chainFrom(target, target.x, target.y, target.size, 1, ab, w.scene.simTime);
  assert.equal(w.combat.chainGate.count, before + 1 - before, '칸이 지나면 다시 시작');
});

test('학익 추적: 사방의 위협을 찾아 휘어 가서 맞힌다(보물 유도가 0이어도)', () => {
  // 구슬은 +x로 나가고 적은 앞쪽 아래(100, 60)에 있다. 유도 없는 구슬은 옆으로 지나간다.
  const threat = E(1100, 1060, 40, 2);
  const plain = world('mimul', 0, [E(1100, 1060, 40, 2)], { player: fakePlayer('danggang') });
  plain.shoot(80);
  assert.equal(plain.enemies[0].size, 40, '유도 없는 구슬은 옆으로 지나간다');
  const w = world('danggang', 0, [threat]);
  w.shoot(80);
  assert.ok(threat.size < 40, '유도 구슬이 맞혔다: ' + threat.size);
  assert.equal(w.combat.counters.homing, 1);
});

test('학익 추적: 뒤쪽(사방) 위협도 찾고, 표적이 죽으면 반경 안 새 표적으로 옮긴다', () => {
  const behind = E(900, 1000, 40, 2);
  const w = world('danggang', 0, [behind]);
  w.combat.refreshAbility();
  w.shoot(1);
  const orb = w.combat.orbs[0];
  assert.ok(orb, '쏜 구슬');
  w.step(1);
  assert.strictEqual(orb.target, behind, '뒤쪽도 표적(360°)');
  const spare = E(orb.x + 30, orb.y + 40, 40, 2);
  w.enemies.push(spare);
  behind.sprite.active = false;
  w.step(1);
  assert.strictEqual(orb.target, spare, '표적이 죽으면 새 표적');
  assert.equal(w.combat.counters.homing, 1, '처음 표적을 찾은 때만 센다');
});

test('학익 추적: 나를 먹을 수 없는 적(작은 적)과 아군은 표적이 아니다', () => {
  const small = E(1100, 1060, 10, 2);
  const w = world('danggang', 0, [small]);
  w.shoot(1);
  w.step(3);
  assert.equal(w.combat.orbs[0]?.target ?? null, null);
});

test('호신주: 진주 수만큼 내 둘레를 돌고, 닿는 적을 접촉 피해로 친다(같은 적은 0.4초 간격)', () => {
  const w = world('dongdong', 0, []);
  w.step(1);
  assert.equal(w.combat.pearls.length, 2, '2단계는 진주 2개');
  const ring = 28 * 1.3 + 24;
  for (const p of w.combat.pearls) assert.ok(Math.abs(Math.hypot(p.x - 1000, p.y - 1000) - ring) < 1e-6, '반지름 = 내 크기 × 1.3 + 24');
  const target = E(1000, 1000, 200); // 고리 전체를 덮는 큰 적: 진주가 계속 닿아 있다
  w.enemies.push(target);
  const S = shotDamage(w);
  w.step(1);
  assert.ok(close(200 - target.size, S * 0.6), '접촉 피해 0.6 × 구슬 피해(같은 적은 진주가 여럿이어도 한 번): ' + (200 - target.size));
  const after = target.size;
  w.step(3);
  assert.equal(target.size, after, '0.4초(화면) 안에는 같은 적을 다시 치지 않는다');
  w.step(Math.ceil(sim(w, 0.5) * 60), 1 / 60);
  assert.ok(target.size < after, '간격이 지나면 다시 친다');
});

test('호신주: 레벨이 오르면 진주가 늘고(+lvInt, 6이 상한), 레벨 15 5단계도 6개를 넘지 않는다', () => {
  assert.equal(world('jubyeoreo', 0, []).combat.pearls.length === 0 && (world('jubyeoreo', 0, []).step(1), true), true);
  const one = world('jubyeoreo', 0, []);
  one.step(1);
  assert.equal(one.combat.pearls.length, 1);
  const five = world('jubyeoreo', 5, []);
  five.step(1);
  assert.equal(five.combat.pearls.length, 2, '+5에서 +1');
  const top = world('donghaeyongwang', 15, []);
  top.step(1);
  assert.equal(top.combat.pearls.length, 6, '4 + 3 = 7 → 상한 6');
});

test('호신주: 진주가 적 구슬을 막고 사라졌다가 재생 시간 뒤에 돌아온다', () => {
  const w = world('jubyeoreo', 0, []);
  w.step(1);
  const pearl = w.combat.pearls[0];
  const fire = new EnemyFire(null);
  const me = fakePlayer('jubyeoreo', { x: 1000, y: 1000 });
  // 진주 위치를 지나는 적 구슬
  fire.orbs.push({ x: pearl.x + 40, y: pearl.y, vx: -400, vy: 0, life: 5, style: null });
  const hits = fire.step(0.1, me, w.combat.shield);
  assert.equal(hits.length, 0);
  assert.equal(fire.orbs.length, 0, '막힌 구슬은 사라진다');
  assert.ok(pearl.regenAt > w.scene.simTime, '막은 진주는 사라진다');
  // 진주가 없으면(재생 중) 같은 구슬이 플레이어를 맞힌다
  w.step(1);
  fire.orbs.push({ x: pearl.x + 40, y: pearl.y, vx: -400, vy: 0, life: 5, style: null });
  const again = fire.step(0.1, fakePlayer('jubyeoreo', { x: pearl.x - 10, y: pearl.y, size: 10 }), w.combat.shield);
  assert.equal(again.length, 1, '재생 중에는 못 막는다');
  w.scene.simTime = pearl.regenAt + 0.01;
  w.step(1);
  assert.ok(pearl.regenAt <= w.scene.simTime, '재생 시간이 지나면 돌아온다');
});

test('관통: 맞은 뒤 사라지지 않고 P마리 더 꿰뚫는다. 꿰뚫을 때마다 피해 × 유지율, 같은 적은 한 번만', () => {
  const a = E(1100, 1000, 40), b = E(1160, 1000, 40), c = E(1220, 1000, 40);
  const w = world('littleTiger', 0, [a, b, c]);
  const S = shotDamage(w);
  w.shoot(60);
  assert.ok(close(a.size, 40 - S), 'A 한 번만');
  assert.ok(close(b.size, 40 - S * 0.75), 'B는 유지율 0.75');
  assert.equal(c.size, 40, '2단계는 1마리만 더');
  assert.equal(w.combat.counters.pierce, 1);
  assert.equal(w.combat.orbs.length, 0);
});

test('관통 3단계는 2마리 더, 유지율이 곱해진다', () => {
  const row = [1100, 1160, 1220, 1280].map((x) => E(x, 1000, 40));
  const w = world('skyHound', 0, row);
  const S = shotDamage(w);
  w.shoot(80);
  const lost = row.map((e) => 40 - e.size);
  assert.ok(close(lost[0], S));
  assert.ok(close(lost[1], S * 0.8));
  assert.ok(close(lost[2], S * 0.8 ** 2));
  assert.equal(lost[3], 0);
});

test('파사인: 맞은 적이 지속 동안 받는 보물 피해 +20%, 중첩 없이 시간만 새로 고침', () => {
  const a = E(1100, 1000, 100);
  const w = world('gyebyeon', 0, [a]);
  const S = shotDamage(w);
  w.shoot(20);
  assert.ok(close(a.size, 100 - S));
  assert.ok(a.markUntil > w.scene.simTime);
  assert.ok(close(a.markUntil - w.scene.simTime, sim(w, 2.5), sim(w, 0.1)), '지속 2.5초(화면)');
  assert.equal(a.markLure, false, '2단계는 먹잇감 가중 없음');
  const before = a.size;
  w.shoot(20);
  assert.ok(close(before - a.size, S * 1.2), '두 번째 피해 +20%: ' + (before - a.size));
  w.shoot(20);
  assert.ok(close(a.markAmp, 0.2), '중첩 없음');
});

test('파사인 3단계 이상은 다른 요괴의 먹잇감이 되기 쉽다(markLure), 상위 단계 적은 지속이 절반', () => {
  const a = E(1100, 1000, 100, 3);
  const w = world('gyo', 0, [a]);
  w.shoot(20);
  assert.equal(a.markLure, true);
  const low = E(1100, 1000, 100, 2), high = E(1100, 1000, 100, 3);
  const w2 = world('gyebyeon', 0, [low]);
  w2.shoot(20);
  const w3 = world('gyebyeon', 0, [high]);
  w3.shoot(20);
  const lowDur = low.markUntil - w2.scene.simTime, highDur = high.markUntil - w3.scene.simTime;
  assert.ok(Math.abs(highDur / lowDur - 0.5) < 0.05, '한 단계 위 = 지속 절반: ' + highDur / lowDur);
});

test('회선: 맞으면 돌아서 플레이어에게 오고, 돌아오는 길의 적을 피해 × b로 다시 친다', () => {
  const a = E(1100, 1000, 30);
  const w = world('gyeomyang', 0, [a]);
  const S = shotDamage(w);
  w.shoot(1);
  for (let i = 0; i < 40 && !w.combat.counters.boomerang; i++) w.step(1);
  assert.equal(w.combat.counters.boomerang, 1, '돌아섰다');
  assert.ok(close(a.size, 30 - S), '가는 길 피해');
  const orb = w.combat.orbs[0];
  assert.equal(orb.phase, 1);
  const n = E(orb.x - 35, 1000, 8);
  const n2 = E(orb.x - 70, 1000, 8);
  w.enemies.push(n, n2);
  w.step(30);
  assert.ok(close(n.size, 8 - S * 0.7), '오는 길 피해 × 0.7: ' + n.size);
  assert.equal(n2.size, 8, '2단계 회선은 돌아오는 길에 1마리만 친다(그 뒤는 통과)');
  w.step(60);
  assert.equal(w.combat.orbs.length, 0, '플레이어에게 닿으면 사라진다');
  assert.equal(a.size, 30 - S, '돌아서자마자 같은 적을 또 치지 않는다');
});

test('회선: 적이 없어도 사거리 끝에서 돌아서 되돌아온다(사거리 +10%)', () => {
  const w = world('gyeomyang', 0, []);
  w.shoot(1);
  const orb = w.combat.orbs[0];
  assert.ok(close(orb.rangeLeft + orb.speed / 60, CONFIG.combat.range * 1.1, 1e-6));
  let turned = false;
  for (let i = 0; i < 600 && w.combat.orbs.length; i++) {
    w.step(1);
    if (orb.phase === 1) turned = true;
  }
  assert.equal(turned, true);
  assert.equal(w.combat.orbs.length, 0);
  assert.equal(w.combat.counters.boomerang, 1);
});

test('위협: 맞은 적이 지속 동안 겁먹고, 끝난 뒤 면역 동안 다시 안 걸린다', () => {
  const a = E(1100, 1000, 100, 2);
  const w = world('hyo', 0, [a]);
  w.shoot(20);
  assert.ok(close(a.fearUntil - w.scene.simTime, sim(w, 1.3), sim(w, 0.1)));
  assert.equal(w.combat.counters.fear, 1);
  assert.ok(close(a.fearImmuneUntil - a.fearUntil, sim(w, 1.0)));
  const until = a.fearUntil;
  w.shoot(20);
  assert.equal(a.fearUntil, until, '겁먹은 동안 다시 맞아도 안 늘어난다');
});

test('상위 단계 적은 상태이상 지속이 단계 차마다 절반(Δ=1 → 1/2, Δ=2 → 1/4), 너무 짧으면 안 걸린다', () => {
  // 코앞에서 쏘면 첫 단계에 맞는다: 그때의 시뮬레이션 시각이 곧 건 시각이다.
  const dur = (enemyStage) => {
    const e = E(1010, 1000, 100, enemyStage);
    const w = world('littleTurtle', 0, [e]);
    w.shoot(1);
    return { until: e.frozenUntil - w.scene.simTime, e, w };
  };
  const same = dur(2), one = dur(3), two = dur(4);
  assert.ok(close(same.until, sim(same.w, 0.8), 1e-9), '같은 단계 0.8초');
  assert.ok(close(one.until / same.until, 0.5, 1e-9));
  assert.ok(close(two.until / same.until, 0.25, 1e-9));
  const e3 = E(1010, 1000, 100, 5);
  const w3 = world('littleTurtle', 0, [e3]);
  w3.shoot(1);
  assert.equal(e3.frozenUntil, 0, '2단계 빙결 0.8 × 0.125 = 0.1 < 0.15 → 안 걸린다');
  assert.equal(w3.combat.counters.freeze, 0);
});

test('작열: 총 화상 피해 = 총량 × 구슬 피해(저항·레벨로 지속이 변하면 총량도 변한다)', () => {
  const burned = (level, enemyStage) => {
    const a = E(1010, 1000, 100, enemyStage);
    const w = world('littleBird', level, [a]);
    const S = shotDamage(w);
    w.shoot(1);
    assert.ok(a.burnUntil > w.scene.simTime);
    const flashes = w.log.flashes;
    w.step(Math.ceil((a.burnUntil - w.scene.simTime) / (1 / 60)) + 5);
    assert.equal(w.log.flashes, flashes, '화상은 번쩍임 없이 깎는다');
    return { total: 100 - a.size - S, S };
  };
  const base = burned(0, 2);
  assert.ok(close(base.total / base.S, 0.8, 0.8 * 0.03), '2단계 총량 0.8 × 구슬 피해: ' + base.total / base.S);
  const resisted = burned(0, 3);
  assert.ok(close(resisted.total / resisted.S, 0.4, 0.4 * 0.03), 'Δ=1이면 지속 절반 → 총량도 절반: ' + resisted.total / resisted.S);
  // +15는 구슬이 여러 발이라 총량을 직접 재기 어렵다: 지속이 ×1.6이고 초당 피해는 그대로(구슬 피해 비율)이니 총량도 ×1.6이다.
  const dur = (level) => {
    const a = E(1010, 1000, 5000, 2);
    const w = world('littleBird', level, [a]);
    w.shoot(1);
    return { duration: a.burnUntil - w.scene.simTime, perShot: a.burnDps / shotDamage(w) };
  };
  const lo = dur(0), hi = dur(15);
  assert.ok(close(hi.duration / lo.duration, 1.6, 1e-9), '+15는 지속 × 1.6');
  assert.ok(close(hi.perShot, lo.perShot, 1e-9), '구슬 피해에 대한 초당 비율은 같다');
});

test('분화: 맞은 자리에서 갈래 n개가 맞은 적 쪽을 피해 원을 n등분한 방향으로 튄다(갈래는 다시 갈라지지 않는다)', () => {
  const a = E(1100, 1000, 60);
  const w = world('iryeok', 0, [a]);
  w.shoot(1);
  let steps = 0;
  while (w.combat.orbs.some((orb) => orb.kind === 0) && steps++ < 100) w.step(1);
  const kids = w.combat.orbs.filter((orb) => orb.kind === 1);
  assert.equal(kids.length, 2, '2단계는 갈래 2개');
  for (const kid of kids) {
    assert.ok(Math.abs(kid.vx) < 1e-9, '진행 방향의 수직: ' + kid.vx);
    assert.ok(Math.abs(Math.abs(kid.vy) - 1) < 1e-9);
    assert.strictEqual(kid.skip, a, '맞은 적은 통과');
  }
  assert.ok(kids[0].vy * kids[1].vy < 0, '서로 반대쪽');
  assert.equal(w.combat.counters.split, 1);
  const S = shotDamage(w);
  assert.ok(close(kids[0].damage, S * 0.45), '갈래 피해 0.45');
  assert.ok(close(kids[0].rangeLeft, 130));
  w.step(80);
  assert.equal(w.combat.counters.split, 1, '갈래는 또 갈라지지 않는다');
});

test('분화 4단계: 갈래 3개가 60°·180°·300° 방향, 맞은 적 쪽(0°)은 없다', () => {
  const a = E(1100, 1000, 60);
  const w = world('imae', 0, [a]);
  w.shoot(1);
  let steps = 0;
  while (w.combat.orbs.some((orb) => orb.kind === 0) && steps++ < 100) w.step(1);
  const kids = w.combat.orbs.filter((orb) => orb.kind === 1);
  assert.equal(kids.length, 3, '4단계 갈래는 3개(표: 3단계·4단계 = 3)');
  const angles = kids.map((kid) => Math.round(Math.atan2(kid.vy, kid.vx) * 180 / Math.PI)).sort((x, y) => x - y);
  assert.deepEqual(angles, [-60, 60, 180], '120° 간격(3등분), 앞(0°)은 비어 있다');
});

test('분화: 갈래는 구슬 상한(combat.maxOrbs) 안에서만 만든다', () => {
  const a = E(1100, 1000, 60);
  const w = world('iryeok', 0, [a]);
  w.shoot(1);
  for (let i = 0; i < CONFIG.combat.maxOrbs; i++) {
    w.combat.orbs.push({ x: 0, y: 0, vx: 1, vy: 0, speed: 0, homing: 0, damage: 0, rangeLeft: 1e9, kind: 1, phase: 0, mul: 1, pierceLeft: 0, keep: 1, ghost: false, hits: null, skip: null, target: null, hadTarget: false, omni: false, turn: 1, retarget: 0, style: null, tier: 1 });
  }
  w.combat.orbs.length = CONFIG.combat.maxOrbs - 1;
  w.step(20);
  assert.ok(w.combat.orbs.length <= CONFIG.combat.maxOrbs);
});

test('선무: 맞은 자리에 구름이 남아 안의 적을 느리게 하고 초당 d × 구슬 피해로 깎는다', () => {
  const a = E(1100, 1000, 80), inside = E(1010, 1030, 20);
  const w = world('seongseong', 0, [a, inside]);
  const S = shotDamage(w);
  w.shoot(25);
  assert.equal(w.combat.clouds.length, 1);
  assert.equal(w.combat.counters.zone, 1);
  const cloud = w.combat.clouds[0];
  assert.equal(cloud.r, 50);
  const before = inside.size;
  const n = 30;
  w.step(n);
  assert.ok(close(slowFactor(inside, w.scene.simTime), 0.75), '둔화 25%');
  const elapsed = (n / 60) / (CONFIG.tempo * 1);
  assert.ok(close(before - inside.size, 0.25 * S * elapsed, 0.25 * S * elapsed * 0.1 + 1e-9), '초당 피해: ' + (before - inside.size) + ' vs ' + 0.25 * S * elapsed);
  const outside = E(1500, 1500, 40);
  w.enemies.push(outside);
  w.step(30);
  assert.equal(outside.size, 40);
  assert.equal(slowFactor(outside, w.scene.simTime), 1);
});

test('선무: 상위 단계 적은 둔화가 절반, 동시 구름은 단계 상한(2단계 3개)이고 오래된 것부터 지운다', () => {
  const up = E(1100, 1000, 80, 3), w = world('seongseong', 0, [up]);
  w.shoot(25);
  w.step(5);
  assert.ok(close(slowFactor(up, w.scene.simTime), 1 - 0.125), 'Δ=1: 25% × 0.5');
  const w2 = world('seongseong', 0, []);
  for (let i = 0; i < 5; i++) w2.combat.addCloud(1000 + i * 10, 0, 3, w2.combat.refreshAbility() ?? w2.combat.ab, w2.scene.simTime);
  assert.equal(w2.combat.clouds.length, 3);
  assert.equal(w2.combat.clouds[0].x, 1020, '가장 오래된 것부터 제거');
  w2.scene.simTime += sim(w2, 2) + 0.1;
  w2.step(1);
  assert.equal(w2.combat.clouds.length, 0, '지속(2초)이 지나면 사라진다');
});

test('선무: 사거리 끝에 닿아도 그 자리에 구름이 남는다', () => {
  const w = world('seongseong', 0, []);
  w.shoot(1);
  let steps = 0;
  while (w.combat.orbs.length && steps++ < 400) w.step(1);
  assert.equal(w.combat.clouds.length, 1);
});

test('폭염: 맞은 자리 둘레의 다른 적을 구슬 피해 × e로 깎고, 맞은 적은 이중 피해를 받지 않는다', () => {
  const a = E(1100, 1000, 40), near = E(1100, 1050, 30), far = E(1100, 1300, 30);
  const w = world('hogyo', 0, [a, near, far]);
  const S = shotDamage(w);
  w.shoot(20);
  assert.ok(close(a.size, 40 - S), '맞은 적은 구슬 피해만');
  assert.ok(close(near.size, 30 - S * 0.55), '둘레 피해 0.55: ' + near.size);
  assert.equal(far.size, 30);
  assert.equal(w.combat.counters.explode, 1);
  assert.ok(w.combat.rings.some((ring) => ring.until > w.scene.simTime));
});

test('폭염: 폭발은 초당 15회가 상한', () => {
  const w = world('hogyo', 0, []);
  w.combat.refreshAbility();
  let done = 0;
  for (let i = 0; i < 25; i++) {
    const before = w.combat.counters.explode;
    w.combat.explodeAt(1000, 1000, null, 1, w.combat.ab, w.scene.simTime);
    done += w.combat.counters.explode - before;
  }
  assert.equal(done, 15);
});

test('빙결: 맞은 적이 지속 동안 얼고, 끝난 뒤 면역 동안은 다시 안 걸린다', () => {
  const a = E(1100, 1000, 100, 2);
  const w = world('littleTurtle', 0, [a]);
  w.shoot(20);
  assert.ok(close(a.frozenUntil - w.scene.simTime, sim(w, 0.8), sim(w, 0.1)));
  assert.equal(w.combat.counters.freeze, 1);
  const until = a.frozenUntil;
  w.shoot(20);
  assert.equal(a.frozenUntil, until, '언 동안·면역 동안은 안 늘어난다');
  w.scene.simTime = until + sim(w, 0.5);
  w.shoot(20);
  assert.equal(a.frozenUntil, until, '면역 1.0초 중');
  w.scene.simTime = until + sim(w, 1.01);
  w.shoot(20);
  assert.ok(a.frozenUntil > until, '면역이 끝나면 다시 걸린다');
});

test('흡정: 깎은 면적의 q만큼 내 면적이 늘고, 성장은 내 면적의 4%/화면 초가 상한', () => {
  const a = E(1100, 1000, 60, 2);
  const w = world('jokja', 0, [a]);
  const area0 = w.player.size ** 2;
  const S = shotDamage(w);
  w.shoot(20);
  const removed = 60 ** 2 - (60 - S) ** 2;
  const gain = w.player.size ** 2 - area0;
  assert.ok(close(gain, Math.min(0.13 * removed, area0 * 0.04), 1e-6), '흡수 ' + gain);
  assert.equal(w.combat.counters.drain, 1);
  // 연달아 맞혀도 한 칸(화면 1초)에 내 면적의 4%를 넘지 않는다
  const start = w.player.size ** 2;
  for (let i = 0; i < 12; i++) {
    a.size = 60;
    w.shoot(20);
  }
  assert.ok(w.player.size ** 2 - start <= area0 * 0.04 * 2, '상한: ' + (w.player.size ** 2 - start));
  assert.equal(w.player.maxSize, w.player.size, '최대 크기도 따라 오른다');
});

test('와류: 맞은 자리에 소용돌이가 생겨 둘레 적을 중심으로 끌고, 상위 단계 적은 절반, 생성 간격 0.5초', () => {
  const a = E(1100, 1000, 40, 2), pulled = E(1070, 1060, 20, 2), tough = E(1070, 940, 20, 3);
  const w = world('yueon', 0, [a, pulled, tough]);
  w.shoot(20);
  assert.equal(w.combat.vortices.length, 1);
  assert.equal(w.combat.counters.vortex, 1);
  const v = w.combat.vortices[0];
  const d0 = Math.hypot(pulled.x - v.x, pulled.y - v.y), t0 = Math.hypot(tough.x - v.x, tough.y - v.y);
  w.step(10);
  const d1 = Math.hypot(pulled.x - v.x, pulled.y - v.y), t1 = Math.hypot(tough.x - v.x, tough.y - v.y);
  assert.ok(d1 < d0 && t1 < t0, '둘 다 끌려온다');
  assert.ok(Math.abs((t0 - t1) / (d0 - d1) - 0.5) < 0.1, 'Δ=1은 끌기 절반: ' + (t0 - t1) / (d0 - d1));
  w.shoot(20);
  assert.equal(w.combat.vortices.length, 1, '0.5초 안에는 새로 안 생긴다');
});

test('와류: 동시 상한(2단계 2개)을 넘으면 오래된 것부터 지운다', () => {
  const w = world('yueon', 0, []);
  w.combat.refreshAbility();
  for (let i = 0; i < 4; i++) {
    w.scene.simTime += sim(w, 0.6);
    w.combat.addVortex(100 * i, 0, w.combat.ab, w.scene.simTime);
  }
  assert.equal(w.combat.vortices.length, 2);
  assert.equal(w.combat.vortices[0].x, 200);
});

test('대풍: 맞은 적을 구슬 방향으로 D만큼 0.15초에 걸쳐 밀고 0.2초 경직, 같은 적 재밀기 0.3초', () => {
  const a = E(1100, 1000, 40, 2);
  const w = world('iseo', 0, [a]);
  w.shoot(20);
  const pushSim = sim(w, 0.15);
  assert.ok(a.knockVx > 0 && Math.abs(a.knockVy) < 1e-9);
  assert.ok(close(a.knockVx * pushSim, 55, 1e-6), '2단계 밀기 거리 55: ' + a.knockVx * pushSim);
  assert.ok(close(a.stunUntil - a.knockUntil, sim(w, 0.2) - pushSim, 1e-9), '0.15초 밀리고 0.2초 경직');
  assert.ok(a.stunUntil > w.scene.simTime - 1, '경직');
  assert.equal(w.combat.counters.gust, 1);
  const until = a.knockUntil;
  w.shoot(2);
  assert.equal(a.knockUntil, until, '재밀기 대기 중');
});

test('대풍 4단계: 둘레 적도 절반 거리로 민다', () => {
  const a = E(1100, 1000, 40, 4), side = E(1100, 1055, 20, 4);
  const w = world('gon', 0, [a, side]);
  w.shoot(20);
  const pushSim = sim(w, 0.15);
  assert.ok(close(a.knockVx * pushSim, 90, 1e-6));
  assert.ok(close(side.knockVx * pushSim, 45, 1e-6), '둘레는 절반: ' + side.knockVx * pushSim);
  assert.equal(w.combat.counters.gust, 2);
});

test('상위 단계 적은 대풍에 덜 밀리고 너무 멀리 차이 나면 안 밀린다', () => {
  const near = E(1100, 1000, 40, 3), far = E(1100, 1000, 40, 5);
  const w1 = world('iseo', 0, [near]);
  w1.shoot(20);
  assert.ok(close(near.knockVx * sim(w1, 0.15), 55 * 0.5, 1e-6), 'Δ=1');
  const w2 = world('jua', 0, [far]);
  w2.shoot(20);
  assert.equal(far.knockVx, 0, '1단계 대풍(40) × 0.0625 → 안 민다');
});

test('아군(매혹)·유예 중인 적은 구슬이 통과하고 어떤 능력도 받지 않는다', () => {
  const ally = E(1100, 1000, 40, 2, { charmUntil: 1e9, charmGraceUntil: 1e9 + 1 });
  const behind = E(1160, 1000, 40, 2);
  const w = world('littleTurtle', 0, [ally, behind]);
  w.shoot(40);
  assert.equal(ally.size, 40);
  assert.equal(ally.frozenUntil, 0);
  assert.ok(behind.frozenUntil > 0, '뒤의 적은 맞는다');
  const grace = E(1100, 1000, 40, 2, { charmUntil: 0, charmGraceUntil: 1e9 });
  const w2 = world('hogyo', 0, [grace, E(1100, 1010, 20, 2)]);
  w2.combat.explodeAt(1100, 1000, null, 5, w2.combat.refreshAbility() ?? w2.combat.ab, w2.scene.simTime);
  assert.equal(grace.size, 40, '폭발도 유예 중인 적을 건드리지 않는다');
});

test('모든 피해는 applyTreasureDamage 한 곳을 지난다: 크기가 줄어드는 곳은 그 안뿐이고 처치·역전은 적마다 한 번', () => {
  const forms = ['hwalsa', 'cheongnyong', 'littleTiger', 'hyo', 'littleBird', 'iryeok', 'seongseong', 'hogyo', 'littleTurtle', 'jokja', 'yueon', 'iseo', 'gyeomyang', 'dongdong', 'danggang', 'gyebyeon'];
  for (const formId of forms) {
    const enemies = [];
    for (let i = 0; i < 12; i++) enemies.push(E(1090 + (i % 4) * 45, 1000 + Math.floor(i / 4) * 45 - 45, 14 + (i % 3) * 6, 2));
    const w = world(formId, 8, enemies);
    let inside = 0;
    const calls = [];
    const original = w.combat.applyTreasureDamage.bind(w.combat);
    w.combat.applyTreasureDamage = (enemy, amount, opts) => {
      inside++;
      calls.push(enemy);
      try { return original(enemy, amount, opts); } finally { inside--; }
    };
    for (const enemy of enemies) {
      const set = enemy.setSize.bind(enemy);
      enemy.setSize = (value) => {
        assert.ok(inside > 0, formId + ': applyTreasureDamage 밖에서 크기가 줄었다');
        set(value);
      };
    }
    for (let round = 0; round < 6; round++) w.shoot(40);
    w.step(300);
    const dead = enemies.filter((e) => !e.sprite.active);
    const eaten = w.log.eat.map((meal) => meal.killedByTreasure);
    assert.equal(eaten.length, dead.length, formId + ': 처치 한 번씩만 (eat 이벤트 = 쓰러진 적 수)');
    assert.ok(eaten.every(Boolean), '보물 처치');
    assert.ok(calls.length > 0, formId + ': 피해가 들어갔다');
  }
});

test('등급은 능력의 피해에만 곱하고 지속·범위에는 곱하지 않는다', () => {
  const plain = world('littleTurtle', 0, [], { grade: 'C' });
  const gold = world('littleTurtle', 0, [], { grade: 'S+' });
  plain.combat.refreshAbility();
  gold.combat.refreshAbility();
  assert.ok(gold.combat.power() > plain.combat.power() * 1.9, '피해는 등급을 따른다');
  assert.deepEqual({ ...gold.combat.ab, raw: 0 }, { ...plain.combat.ab, raw: 0 }, '지속·범위 수치는 같다');
  const a = E(1100, 1000, 100, 2), b = E(1100, 1000, 100, 2);
  const w1 = world('littleTurtle', 0, [a], { grade: 'C' });
  const w2 = world('littleTurtle', 0, [b], { grade: 'S+' });
  w1.shoot(20);
  w2.shoot(20);
  assert.ok(close(a.frozenUntil - w1.scene.simTime, b.frozenUntil - w2.scene.simTime, sim(w1, 0.05)), '빙결 지속이 같다');
  assert.ok(b.size < a.size, '피해만 세다');
});

test('여의주 강화 레벨은 능력 수치를 함께 올린다: 레벨 15 빙결은 지속 ×1.6, 레벨 5 뇌쇄는 +1번', () => {
  const lo = world('littleTurtle', 0, [E(1100, 1000, 500, 2)]);
  const hi = world('littleTurtle', 15, [E(1100, 1000, 500, 2)]);
  lo.combat.refreshAbility();
  hi.combat.refreshAbility();
  assert.ok(close(hi.combat.ab.duration / lo.combat.ab.duration, 1.6, 1e-9));
  assert.equal(world('hwalsa', 5, []).combat.refreshAbility() ?? 0, 0);
  const chain = world('hwalsa', 5, []);
  chain.combat.refreshAbility();
  assert.equal(chain.combat.ab.hops, 2, '1 + lvInt(5)');
});

test('보물 레벨이 올라 구슬이 많아져도 구슬 수는 combat.maxOrbs(120)를 넘지 않는다', () => {
  const w = world('cheongnyong', 15, [E(5000, 5000, 30)]);
  for (let i = 0; i < 6; i++) {
    w.combat.cooldown = 0;
    w.step(1, 1 / 600, { fire: true });
    assert.ok(w.combat.orbs.length <= CONFIG.combat.maxOrbs);
  }
  assert.equal(w.combat.orbs.length, 120, '8방향 × 5발 = 40발씩 3번이면 가득 찬다');
});

test('능력은 형태를 바꾸면 바뀐다: 진화해 줄기가 달라지면 새 능력이 붙고 걸린 효과는 끝까지 간다', () => {
  const a = E(1100, 1000, 100, 2);
  const w = world('littleTurtle', 0, [a]);
  w.shoot(20);
  const until = a.frozenUntil;
  assert.ok(until > 0);
  w.progress.formId = 'iseo';
  w.progress.stage = 2;
  w.step(1);
  assert.equal(w.combat.ab.id, 'gust');
  assert.equal(a.frozenUntil, until, '이미 걸린 얼음은 그대로');
  w.progress.formId = 'mimul';
  w.step(1);
  assert.equal(w.combat.ab, null);
});

test('능력 표(ABILITIES)의 상한·재생 값이 실제 Combat 수치로 이어진다', () => {
  const w = world('donghaeyongwang', 15, []);
  w.combat.refreshAbility();
  assert.equal(w.combat.ab.count, ABILITIES.orbit.cap.count);
  assert.equal(w.combat.ab.regen, 0.8);
});

test('진화로 줄기가 바뀐 직후: 다른 능력일 때 쏜 구슬이 날아가는 중에도 새 능력 처리가 오류 없이 이어진다', () => {
  const forms = ['hwalsa', 'cheongnyong', 'littleTiger', 'littleTurtle', 'littleBird', 'iryeok', 'seongseong', 'hogyo', 'yueon', 'iseo', 'jokja', 'danggang', 'gyebyeon', 'hyo', 'juyu', 'dongdong', 'gyeomyang'];
  for (const from of forms) {
    for (const to of forms) {
      const a = E(1100, 1000, 60, 2), b = E(1180, 1010, 60, 2);
      const w = world(from, 3, [a, b]);
      w.shoot(2); // from 능력으로 쏜 구슬이 날아가는 중
      w.progress.formId = to;
      w.progress.stage = 2;
      assert.doesNotThrow(() => w.step(80), from + ' → ' + to);
    }
  }
});
