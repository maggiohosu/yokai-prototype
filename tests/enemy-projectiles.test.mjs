import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { EnemyFire } from '../src/game/enemyFire.js';

const shooter = () => ({ x: 100, y: 500, size: 10, special: true, stage: 5, fireCd: 0 });
const target = (dx, dy = 0) => ({ x: 100 + dx, y: 500 + dy, size: 10 });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≠ ${b}`);

// 처음 속도 260을 사용자 지시로 1/2(130), 같은 날(2026-11-23) 다시 1/2로 줄였다. 지금은 처음의 1/4(65)이고
// 사거리 380·최대 비행 거리 570은 그대로라 수명은 처음의 4배(약 8.77초)다. 회귀를 막으려고 처음 값을 고정해 둔다.
const ORIGINAL_SPEED = 260;
const ORIGINAL_LIFETIME = 570 / ORIGINAL_SPEED;

test('적 구슬 속도는 처음 값의 1/4(65)이고 사거리 380·최대 비행 거리 570은 그대로다', () => {
  assert.equal(CONFIG.special.orbSpeed, ORIGINAL_SPEED * 0.25);
  assert.equal(CONFIG.special.orbSpeed, 65);
  assert.equal(CONFIG.special.range, 380);
});

test('적 구슬은 거리 380까지 발사하며 처음 속도의 1/4로 570까지 날아간다', () => {
  const fire = new EnemyFire(null);
  assert.equal(fire.tryFire(shooter(), target(380.01), 0), false);
  assert.equal(fire.tryFire(shooter(), target(380), 0), true);
  const [orb] = fire.orbs;
  const start = orb.x;
  near(orb.life, 4 * ORIGINAL_LIFETIME);
  fire.step(2 * ORIGINAL_LIFETIME, target(0, 200));
  near(orb.x - start, 285);
  assert.equal(fire.orbs.length, 1);
  // 남은 수명보다 긴 프레임에서도 최대 비행 거리 너머의 플레이어를 맞히지 않는다.
  assert.deepEqual(fire.step(4 * ORIGINAL_LIFETIME + 1, target(620)), []);
  near(orb.x - start, 570);
  assert.equal(fire.orbs.length, 0);
});

test('적은 느려진 구슬의 도달 시간으로 가로질러 움직이는 플레이어를 앞질러 조준한다', () => {
  const fire = new EnemyFire(null);
  fire.step(1, target(260, -50));
  fire.step(1, target(260));
  assert.equal(fire.tryFire(shooter(), target(260), 0), true);
  const [orb] = fire.orbs;
  near(Math.hypot(orb.vx, orb.vy), 65);
  // 260까지 4초, 추정 이동 속도 50, 선행 계수 0.6이면 120만큼 앞선다.
  near(orb.vy / orb.vx, 120 / 260);
});

test('수명이 쿨타임보다 길어도 범위 안 특수 적 24마리 이상이 쿨타임이 가장 짧은 칸에서 계속 쏠 수 있다', () => {
  assert.equal(CONFIG.special.maxOrbs, 96);
  const lifetime = CONFIG.special.range * 1.5 / CONFIG.special.orbSpeed;
  const cooldowns = Object.values(CONFIG.special.byStage).flatMap(rows => Object.values(rows).map(row => row.cooldown));
  const cooldown = Math.min(...cooldowns);
  // 한 적이 수명 동안 동시에 띄우는 구슬 수. 쿨타임이 짧을수록 많다.
  const perShooter = Math.ceil(lifetime / cooldown);
  const count = Math.floor(CONFIG.special.maxOrbs / perShooter);
  assert.ok(count >= 24, `쿨타임 ${cooldown}초에서 상한 ${CONFIG.special.maxOrbs}발은 특수 적 ${count}마리만 받친다`);
  const fire = new EnemyFire(null);
  const aim = target(380), dodge = target(380, 300);
  // 준비된 count마리가 쿨타임마다 한꺼번에 쏜다. 앞선 파가 수명이 다할 때까지 떠 있어 최대 perShooter 파가 겹친다.
  for (let wave = 0; wave < perShooter + 2; wave++) {
    for (let i = 0; i < count; i++) assert.equal(fire.tryFire(shooter(), aim, 0), true);
    const alive = Math.min(wave + 1, perShooter);
    assert.equal(fire.orbs.length, count * alive, `${wave + 1}번째 파`);
    fire.step(cooldown, dodge);
  }
});
