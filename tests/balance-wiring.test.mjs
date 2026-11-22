import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { Enemy } from '../src/game/enemy.js';
import { Player } from '../src/game/player.js';
import { carryDecay, easePace, evolveCarrySize, growthGain, rivalSizeCap, sizeSpeedMultiplier, stageZoomMultiplier, startPace, tempoMultiplier } from '../src/systems/balance.js';
import { worldFor } from '../src/systems/worldScale.js';
import { followPlayer, zoomFor, zoomFloor } from '../src/game/camera.js';
import { EnemyFire } from '../src/game/enemyFire.js';
import { makeWorld } from './fixtures-abilities.mjs';
import { enemySizeCap } from '../src/systems/growthCap.js';

// Phaser 없이 Enemy·Player를 만드는 가짜 씬(이미지·텍스트만 흉내 낸다). 맞수·성장 둔화가 게임 객체에 제대로 연결됐는지 본다.
function fakeScene(playerSize = 100, playerStage = 5) {
  const sprite = (x, y, key) => {
    const sp = {
      x, y, key, active: true, scaleX: 1, setOrigin: () => sp, setFlipX: () => sp, setDepth: () => sp,
      setDisplaySize(w) { sp.scaleX = w; return sp; },
      setTexture(k) { sp.key = k; return sp; },
      destroy() { sp.active = false; },
    };
    return sp;
  };
  const texts = [];
  const text = (x, y, content, style) => {
    const t = {
      x, y, content, style, active: true, scale: 1,
      setOrigin: () => t, setDepth: () => t,
      setPosition(px, py) { t.x = px; t.y = py; return t; },
      setScale(v) { t.scale = v; return t; },
      destroy() { t.active = false; },
    };
    texts.push(t);
    return t;
  };
  return {
    simTime: 0, pace: 1, texts,
    player: { size: playerSize, stage: playerStage },
    textures: { exists: () => true },
    add: { image: (x, y, key) => sprite(x, y, key), text },
  };
}

const at = (stage, speed = 0) => ({ stage, enh: { growth: 0, speed, vitality: 0 } });
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, a + ' ≈ ' + b);
const prey = (size) => ({ x: 0, y: 0, size, dir: 'east', stage: 1, grade: 'C', special: false });

test('맞수: 이름표 \'맞수\'가 붙고, 특수 적이 아니며, 따라다니다가 죽으면 이름표도 사라진다', () => {
  const scene = fakeScene(100, 5);
  const rival = new Enemy(scene, { x: 500, y: 600 }, 100, 'east', 5);
  rival.special = true; // 일반 적은 특수 적일 수 있다
  rival.markRival();
  assert.equal(rival.rival, true);
  assert.equal(rival.special, false, '맞수는 구슬을 쏘지 않는다');
  assert.equal(scene.texts.length, 1);
  assert.equal(scene.texts[0].content, CONFIG.balance.rival.label);
  assert.equal(scene.texts[0].content, '맞수');
  rival.sprite.x = 800;
  rival.sprite.y = 900;
  rival.followLabel();
  assert.equal(scene.texts[0].x, 800);
  assert.ok(scene.texts[0].y > 900, '몸 아래쪽에 붙는다');
  rival.destroy();
  assert.equal(scene.texts[0].active, false);
  assert.equal(rival.sprite.active, false);
  rival.destroy(); // 두 번 불려도 안전
});

test('일반 적에게는 이름표가 없고 destroy는 예전처럼 동작한다', () => {
  const scene = fakeScene();
  const enemy = new Enemy(scene, { x: 500, y: 600 }, 40, 'east', 2);
  assert.equal(enemy.rival, undefined);
  assert.equal(scene.texts.length, 0);
  enemy.followLabel(); // 이름표가 없으면 아무 일도 없다
  enemy.destroy();
  assert.equal(enemy.sprite.active, false);
});

test('맞수는 진화·몸집 강화를 하지 않는다(같은 단계 규칙을 지킨다). 일반 적은 한다', () => {
  const scene = fakeScene(100, 4);
  const rival = new Enemy(scene, { x: 500, y: 500 }, 100, 'east', 4);
  rival.markRival();
  rival.yoryeok = 9e9;
  assert.equal(rival.autoProgress(), null);
  assert.equal(rival.stage, 4);
  assert.equal(rival.bodyLevel, 0);
  const before = rival.size;
  assert.equal(rival.eat(prey(40)), null, '먹어도 진화·강화 결과가 없다');
  assert.equal(rival.stage, 4);
  assert.ok(rival.size >= before);
  const normal = new Enemy(scene, { x: 500, y: 500 }, 30, 'east', 3);
  normal.yoryeok = 9e9;
  assert.ok(normal.autoProgress(), '일반 적은 요력이 쌓이면 진화한다');
});

test('맞수 몸집 상한은 플레이어 × 1.3(일반 적은 × 2.5)', () => {
  const scene = fakeScene(100, 5);
  const rival = new Enemy(scene, { x: 500, y: 500 }, 100, 'east', 5);
  rival.markRival();
  rival.setSize(180);
  rival.capSize();
  assert.equal(rival.size, rivalSizeCap(100));
  assert.equal(rival.size, 130);
  const normal = new Enemy(scene, { x: 500, y: 500 }, 100, 'east', 5);
  normal.setSize(190);
  normal.capSize();
  assert.equal(normal.size, Math.min(190, enemySizeCap(100)), '일반 적 상한은 그대로(플레이어 × 2.5 또는 절대 상한)');
  // 플레이어 크기를 모를 때(씬에 플레이어가 없을 때) 맞수도 일반 상한으로 돌아가 크기가 0이 되지 않는다.
  const orphan = new Enemy({ ...fakeScene(), player: undefined }, { x: 500, y: 500 }, 50, 'east', 4);
  orphan.markRival();
  orphan.capSize();
  assert.ok(orphan.size > 0);
});

test('맞수가 먹이를 먹고 커져도 상한 안에 머문다', () => {
  const scene = fakeScene(100, 5);
  const rival = new Enemy(scene, { x: 500, y: 500 }, 120, 'east', 5);
  rival.markRival();
  for (let i = 0; i < 50; i++) rival.eat(prey(120));
  assert.ok(rival.size <= rivalSizeCap(100) + 1e-9, '크기 ' + rival.size);
});

test('Player.eat: 성장 둔화(balance.growthGain)를 쓴다 — refSize 이하는 예전 식 그대로, 위에서는 덜 자란다', () => {
  const area = CONFIG.eating.areaGain;
  const small = new Player(fakeScene(), 'mimul', { areaGain: area });
  small.setSize(CONFIG.balance.growth.refSize * 0.6);
  const s0 = small.size;
  small.eat({ size: 20 });
  assert.ok(Math.abs(small.size - Math.sqrt(s0 ** 2 + area * 20 ** 2)) < 1e-9, 'refSize 아래는 예전 식');
  const big = new Player(fakeScene(), 'mimul', { areaGain: area });
  big.setSize(CONFIG.balance.growth.refSize * 3);
  const b0 = big.size;
  big.eat({ size: 40 });
  assert.ok(Math.abs(big.size - growthGain(b0, 40, area)) < 1e-9);
  assert.ok(big.size < Math.sqrt(b0 ** 2 + area * 40 ** 2), '예전 식보다 덜 자란다');
  assert.equal(big.eaten, 1);
  assert.equal(big.maxSize, big.size);
});

test('Player.step: 이동 거리는 stats.speed × 시간(템포 곡선은 시뮬레이션 시간에만 들어 있다)', () => {
  const player = new Player(fakeScene(), 'mimul', { speed: 131 });
  const x0 = player.x;
  player.step({ x: 1, y: 0 }, 0.5);
  assert.ok(Math.abs(player.x - (x0 + 65.5)) < 1e-9);
  const x1 = player.x;
  player.step({ x: 1, y: 0 }, 0.5, 0.25, 1.3); // 부스터 0.25초 구간은 1.3배
  assert.ok(Math.abs(player.x - (x1 + 131 * (0.5 + 0.25 * 0.3))) < 1e-9);
});

test('Player.step: 크기가 클수록 같은 시간에 덜 움직인다(크기별 감속)', () => {
  const small = new Player(fakeScene(), 'mimul', { speed: 200 });
  const big = new Player(fakeScene(), 'mimul', { speed: 200 });
  big.setSize(150);
  const [sx, bx] = [small.x, big.x];
  small.step({ x: 1, y: 0 }, 0.5);
  big.step({ x: 1, y: 0 }, 0.5);
  const smallMove = small.x - sx, bigMove = big.x - bx;
  assert.ok(Math.abs(smallMove - 100) < 1e-9, '시작 크기는 감속 없음');
  assert.ok(Math.abs(bigMove - 100 * sizeSpeedMultiplier(150)) < 1e-9);
  assert.ok(bigMove < smallMove * 0.5, '크기 150은 절반 아래');
});

test('Enemy.step: 적도 크기가 클수록 느리다(배회 속도로 비교)', () => {
  const player = { size: 50, stage: 5, x: 0, y: 0 };
  const speedOf = (size) => {
    const scene = fakeScene();
    const enemy = new Enemy(scene, { x: 2000, y: 2000 }, size, 'east', 5);
    enemy.wanderTime = 10;
    enemy.wanderAngle = 0; // +x 방향 배회
    enemy.step(player, 1 / 60, null);
    return enemy.vx;
  };
  const small = speedOf(CONFIG.player.startSize), big = speedOf(150);
  assert.ok(small > 0 && big > 0);
  assert.ok(Math.abs(big / small - sizeSpeedMultiplier(150)) < 1e-6, `비 ${big / small}`);
});

// ---- 진화: 맵이 더 커져서 내가 작고 느려 보이게(사용자 지시 2026-11-23) ----
test('carryDecay: 진화 직후 이어 가는 크기는 tauSec마다 e분의 1로 줄고, 입력이 이상해도 0 이상이다', () => {
  const { tauSec, carry } = CONFIG.balance.evolveSlow;
  assert.ok(Math.abs(carryDecay(100, tauSec) - 100 / Math.E) < 1e-9);
  assert.equal(carryDecay(100, 0), 100);
  assert.equal(carryDecay(0, 10), 0);
  assert.equal(carryDecay(NaN, 10), 0);
  assert.equal(carryDecay(100, -5), 100);
  assert.ok(carryDecay(100, 1000) < 1e-6);
  assert.equal(evolveCarrySize(100), 100 * carry);
  assert.equal(evolveCarrySize(-3), 0);
});

test('Player.carryOnEvolve(옛 규칙, 설정 carry > 0일 때): 직전 크기 기준으로 느리다가 서서히 빨라진다', () => {
  const evolveSlow = CONFIG.balance.evolveSlow;
  const savedCarry = evolveSlow.carry;
  evolveSlow.carry = 1; // 기본값은 0(꺼짐). 규칙이 살아 있는지만 본다
  const player = new Player(fakeScene(), 'mimul', { speed: 200 });
  const dir = { x: 1, y: 0 };
  const distance = (pl) => { const x = pl.x; pl.step(dir, 0.1); return pl.x - x; };
  player.setSize(CONFIG.player.startSize);
  const fresh = distance(player); // 진화한 적 없는 시작 크기: 감속 없음
  player.carryOnEvolve(100); // 크기 100에서 진화, 크기는 시작 크기로 돌아온 상태
  const right = distance(player);
  assert.ok(Math.abs(right - 20 * sizeSpeedMultiplier(100)) < 0.02, '직후는 크기 100 기준: ' + right);
  assert.ok(right < fresh * 0.55, '진화 직후는 느리다');
  let last = right;
  for (let i = 0; i < 20; i++) {
    for (let k = 0; k < 100; k++) player.step({ x: 0, y: 0 }, 0.5); // 제자리에서 시간이 흐른다
    const d = distance(player);
    assert.ok(d >= last - 1e-9, '시간이 지나며 빨라진다');
    last = d;
  }
  assert.ok(Math.abs(last - fresh) < 0.01, '충분히 지나면 원래 속도: ' + last);
  assert.ok(player.carry < 1e-6);
  // 크기가 이어 가는 값보다 커지면 크기가 기준이다
  player.carry = 30;
  player.setSize(60);
  assert.ok(Math.abs(distance(player) - 20 * sizeSpeedMultiplier(60)) < 0.02);
  evolveSlow.carry = savedCarry;
});

test('진화 연출: 카메라는 직전보다 확대되지 않고 물러섰다가, 연출이 끝나면 처음 시작 화면 배율로 돌아온다(단계가 달라도 같다)', () => {
  globalThis.window = { devicePixelRatio: 1 };
  try {
    for (const stage of [2, 5]) {
      const camera = {
        zoom: 1, width: 1264, height: 625,
        setBounds() { return camera; }, setZoom(z) { camera.zoom = z; return camera; },
        centerOn() { return camera; }, startFollow() { return camera; },
      };
      const clock = { now: 0 };
      const scene = { cameras: { main: camera }, time: clock };
      const player = new Player(fakeScene(), 'mimul', {});
      player.stage = stage - 1;
      player.setSize(100);
      const follow = followPlayer(scene, player);
      const run = (seconds) => { for (let t = 0; t < seconds; t += 1 / 60) { clock.now += 1000 / 60; follow(1 / 60); } };
      run(2);
      const before = camera.zoom;
      const startZoom = zoomFor(CONFIG.player.startSize, 1264, 625, 1); // 처음 시작 화면의 배율
      // 진화: 단계가 오르고 크기가 시작 크기로 돌아간다 → 연출 없이는 여기서 배율이 확 커진다(맵이 작아 보임)
      player.stage = stage;
      player.setSize(CONFIG.player.startSize);
      follow.expand();
      assert.ok(startZoom > before * 1.5, '연출 없이는 시작 화면 배율(' + startZoom + ')로 곧바로 확대된다');
      let maxZoom = camera.zoom, minZoom = camera.zoom;
      const { evolveHoldSec, evolveExpandSec } = CONFIG.balance.view;
      for (let t = 0; t < evolveHoldSec; t += 1 / 60) { clock.now += 1000 / 60; follow(1 / 60); maxZoom = Math.max(maxZoom, camera.zoom); minZoom = Math.min(minZoom, camera.zoom); }
      assert.ok(maxZoom <= before + 1e-9, '머무는 동안 직전보다 확대되지 않는다');
      assert.ok(minZoom < before * 0.95, '맵이 넓어지는 것처럼 물러선다: ' + minZoom + ' < ' + before);
      assert.ok(minZoom >= Math.max(zoomFloor(1264, 625, stage), before * CONFIG.balance.view.evolveZoom) - 1e-6, '월드 밖이 보이는 한계 아래로는 안 간다');
      run(evolveExpandSec + 1);
      assert.ok(Math.abs(camera.zoom - startZoom) < 1e-3, `연출이 끝나면 처음 시작 화면 배율: ${camera.zoom} ≈ ${startZoom} (stage ${stage})`);
      // 연출이 끝난 뒤 평소처럼 크기를 따라간다(예전 cap이 다시 걸리지 않는다)
      player.setSize(100);
      run(3);
      assert.ok(Math.abs(camera.zoom - zoomFor(100, 1264, 625, stage)) < 1e-3);
      player.setSize(30);
      run(3);
      assert.ok(Math.abs(camera.zoom - zoomFor(30, 1264, 625, stage)) < 1e-3);
    }
  } finally {
    delete globalThis.window;
  }
});

test('진화한 뒤의 화면은 처음 시작 화면과 같다: 시작 크기의 배율·시야·나와 적의 화면 크기가 어느 단계든 같다', () => {
  const [w, h] = [1264, 625];
  const size = CONFIG.player.startSize;
  const zoom1 = zoomFor(size, w, h, 1);
  for (let stage = 1; stage <= 5; stage++) {
    assert.equal(stageZoomMultiplier(stage), 1, 'stage ' + stage + ': 단계가 시야를 바꾸지 않는다');
    near(zoomFor(size, w, h, stage), zoom1, 1e-12);
    near(w / zoomFor(size, w, h, stage), w / zoom1, 1e-9); // 보이는 월드 너비
    // 나(와 같은 크기의 적)의 몸이 화면에서 차지하는 반지름(월드 크기 × 배율)
    near(size * zoomFor(size, w, h, stage), size * zoom1, 1e-9);
    // 커진 뒤에도 같은 크기라면 단계와 무관하게 같은 화면
    near(zoomFor(60, w, h, stage), zoomFor(60, w, h, 1), 1e-12);
  }
  // 월드는 커지지만 시야는 그대로라 화면에는 월드의 일부만 보인다
  assert.ok(w / zoom1 < worldFor(1).size && worldFor(5).size > 3 * worldFor(1).size);
});

test('진화 연출 설정: 직전보다 물러서고(0 < evolveZoom < 1) 잠깐 머문 뒤 시작 화면으로 돌아오는 시간이 있다', () => {
  const { evolveZoom, evolveHoldSec, evolveExpandSec, pulse } = CONFIG.balance.view;
  assert.ok(evolveZoom > 0 && evolveZoom < 1);
  assert.ok(evolveHoldSec > 0 && evolveExpandSec > evolveHoldSec + 1, '머문 뒤 돌아오는 시간(약 1~2초)이 남는다');
  assert.ok(pulse.sec > 0 && pulse.reach > 0);
});

test('진화 직후 속도: 처음 시작 템포에서 시작해 그 단계의 템포까지 서서히 오른다(나와 적이 함께 느려졌다가 함께 빨라진다)', () => {
  const { paceTauSec } = CONFIG.balance.evolveSlow;
  const start = startPace();
  assert.equal(start, tempoMultiplier(at(1)), '처음 시작 템포는 1단계 템포');
  for (let stage = 2; stage <= 5; stage++) {
    const target = tempoMultiplier(at(stage));
    assert.ok(target > start);
    let pace = start; // 진화하는 순간: 목표가 아니라 시작 템포로 떨어진다
    let atTau = null;
    for (let t = 0; t < 5 * paceTauSec; t += 1 / 60) {
      pace = easePace(pace, target, 1 / 60);
      if (atTau === null && t >= paceTauSec) atTau = pace;
    }
    assert.ok(atTau > start && atTau < target, '시정수 뒤에는 중간쯤');
    assert.ok(Math.abs(atTau - (target + (start - target) / Math.E)) < 0.01, `시정수 뒤 ${atTau}`);
    assert.ok(pace > target - 0.02 * (target - start), '충분히 지나면 단계 템포에 거의 닿는다');
  }
  // 나와 적에 같은 템포가 곱해지므로 둘의 속도 비는 템포와 무관하다(함께 느려졌다가 함께 빨라진다)
  const ratio = (pace) => (CONFIG.player.speed * 0.5 * pace) / (CONFIG.enemy.chaseSpeed * pace);
  near(ratio(start), ratio(tempoMultiplier(at(5))), 1e-12);
  // 나만 느려지던 옛 규칙(진화 직전 크기 기준)은 꺼져 있다
  assert.equal(CONFIG.balance.evolveSlow.carry, 0);
});

// ---- 진화로 맵이 커질 때(growWorld) 남은 효과를 지운다 ----
test('Combat.clearEffects: 구슬·구름·와류를 비우고 번개·고리는 만료시킨다(옛 좌표에 남아 엉뚱한 자리에서 작동하지 않는다)', () => {
  const w = makeWorld({ formId: 'mimul' });
  const { combat, scene } = w;
  const now = scene.simTime;
  combat.orbs.push({ x: 100, y: 100 }, { x: 300, y: 300 });
  combat.clouds.push({ x: 50, y: 50, r: 80, until: now + 5 });
  combat.vortices.push({ x: 60, y: 60, r: 90, until: now + 5 });
  for (const b of combat.bolts.slice(0, 3)) Object.assign(b, { until: now + 1, life: 0.12, x1: 1, y1: 1, x2: 5, y2: 5 });
  for (const ring of combat.rings.slice(0, 3)) Object.assign(ring, { until: now + 1, life: 0.15, x: 7, y: 7, r: 30 });
  combat.clearEffects();
  assert.equal(combat.orbs.length, 0);
  assert.equal(combat.clouds.length, 0);
  assert.equal(combat.vortices.length, 0);
  // 그리기는 until <= now를 건너뛴다. life가 0이 아니어야 (until - now) / life가 무한대가 되지 않는다.
  assert.ok(combat.bolts.every((b) => b.until <= now), '번개 만료');
  assert.ok(combat.rings.every((r) => r.until <= now), '고리 만료');
  assert.ok(combat.bolts.every((b) => b.life > 0) && combat.rings.every((r) => r.life > 0), 'life는 0으로 두지 않는다');
});

test('EnemyFire.clear: 구슬과 함께 플레이어 위치 기록·속도 추정도 비운다(맵이 커져 플레이어가 순간 이동해도 조준이 튀지 않는다)', () => {
  const fire = Object.create(EnemyFire.prototype);
  Object.assign(fire, { orbs: [{}, {}], prev: { x: 100, y: 100 }, vx: 4000, vy: -3000 });
  fire.clear();
  assert.equal(fire.orbs.length, 0);
  assert.equal(fire.prev, null);
  assert.equal(fire.vx, 0);
  assert.equal(fire.vy, 0);
});
