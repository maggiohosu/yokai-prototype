import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { Enemy } from '../src/game/enemy.js';
import { Player } from '../src/game/player.js';
import { growthGain, rivalSizeCap, sizeSpeedMultiplier } from '../src/systems/balance.js';
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
