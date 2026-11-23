import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { HUNGER_HINT } from '../src/data/ability-guides.js';
import { createVitality, feedVitality, hitVitality, stepHunger, starvingSize, vitalityMax } from '../src/systems/vitality.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, a + ' ≈ ' + b);

test('기본 생명력 4초, 강화 한 번에 0.6초, +10에서 10초', () => {
  near(vitalityMax(-1), 4);
  near(vitalityMax(0), 4);
  near(vitalityMax(1), 4.6);
  near(vitalityMax(10), 10);
});

test('먹지 않고 3초가 지나면 생명력이 줄기 시작한다(사용자 지시 2026-11-23: 5초 → 3초, 모든 난이도 공통)', () => {
  assert.equal(CONFIG.vitality.hungerGraceSec, 3);
  // 난이도별로 따로 두는 값이 없다: 이지·노말·하드가 같은 3초를 쓴다.
  for (const id of CONFIG.difficulty.ids) assert.equal(CONFIG.difficulty[id]?.hungerGraceSec, undefined, id);
  const h = createVitality(4);
  near(stepHunger(h, 2.99, 4), 0);
  assert.equal(h.state, 'grace');
  near(h.value, 4);
  near(stepHunger(h, 0.01, 4), 0); // 정확히 3초: 아직 한 방울도 안 줄었다
  near(h.value, 4);
  stepHunger(h, 1.01, 4);
  assert.equal(h.state, 'draining');
  near(h.value, 2.99);
  // 종전 5초 규칙이라면 4초째에도 4였다. 지금은 이미 줄어 있어야 한다.
  const fourSec = createVitality(4);
  stepHunger(fourSec, 4, 4);
  assert.ok(fourSec.value < 4);
});

test('3초가 지나야 초당 1초를 쓰고, 바닥난 다음 시간만 몸집에서 뺀다', () => {
  const h = createVitality(4);
  near(stepHunger(h, 2.9, 4), 0);
  assert.equal(h.state, 'grace');
  near(h.speedMult, 1);
  near(h.value, 4);
  stepHunger(h, 2.1, 4);
  assert.equal(h.state, 'draining');
  near(h.value, 2);
  near(h.speedMult, 1.125);
  near(stepHunger(h, 3.5, 4), 1.5);
  assert.equal(h.state, 'starving');
  near(h.value, 0);
  near(h.speedMult, 1.4);
  const oneFrame = createVitality(4);
  near(stepHunger(oneFrame, 8.5, 4), 1.5);
  near(oneFrame.speedMult, h.speedMult);
});

test('화면 안내의 유예 시간은 설정값과 같은 3초다', () => {
  assert.match(HUNGER_HINT, /^3초 동안 직접 먹지 않으면 생명력이 줄어요\.$/);
  assert.ok(!/5초/.test(HUNGER_HINT));
});

test('직접 먹은 순간 크기로 회복량을 정하고 3초를 다시 센다', () => {
  for (const [prey, restored] of [[7, 1], [9, 2], [12, 4]]) {
    const h = createVitality(4);
    stepHunger(h, 10, 4);
    feedVitality(h, prey, 10, 4);
    near(h.value, restored);
    assert.equal(h.sinceMeal, 0);
    assert.equal(h.state, 'grace');
    near(h.speedMult, 1.4);
    stepHunger(h, 0.25, 4);
    near(h.speedMult, 1.2);
    stepHunger(h, 0.25, 4);
    near(h.speedMult, 1);
    stepHunger(h, 2.5, 4);
    near(h.value, restored);
    near(h.speedMult, 1);
    stepHunger(h, restored / 2, 4);
    near(h.speedMult, 1.125);
    feedVitality(h, 12, 10, 4);
    near(h.value, 4);
  }
});

test('몸집은 한 초에 3% 줄고 단계 시작 크기에서 멈춘다', () => {
  near(starvingSize(30, 1, 3), 29.1);
  near(starvingSize(30, 2, 3), starvingSize(29.1, 1, 3));
  near(starvingSize(30, 10000, 1), 28 / 3);
  near(starvingSize(30, 10000, 5), 28 / 3);
  near(starvingSize(6, 1, 1), 6); // 구슬로 이미 작아졌으면 굶주림으로 커지지 않는다.
});

test('구슬은 생명력을 0.5초 깎고 이미 비었을 때만 몸집에 피해를 준다', () => {
  const h = createVitality(4);
  stepHunger(h, 2, 4); // 유예 3초 중 2초
  for (let i = 0; i < 8; i++) assert.equal(hitVitality(h), false);
  assert.equal(hitVitality(h), true);
  near(h.sinceMeal, 2);
  near(h.value, 0);
  near(stepHunger(h, 3, 4), 2); // 유예가 1초 남았으므로 3초 중 2초만 몸집에서 뺀다
  const low = createVitality(0.1);
  assert.equal(hitVitality(low), false);
  near(low.value, 0);
});

test('정비·선택지로 판을 멈춘 시간은 제외하고, 느린 활성 프레임은 실제 초로 센다', async () => {
  globalThis.Phaser ??= { Scene: class {} };
  const { PlayScene } = await import('../src/scenes/PlayScene.js');
  const scene = Object.assign(Object.create(PlayScene.prototype), {
    hunger: createVitality(4), hungerTimeMs: null, playerStats: { vitalityMax: 4 },
    player: { size: 20, stage: 1 }, pace: 0.33,
  });
  scene.advanceHunger(1000);
  scene.advanceHunger(3000);
  scene.pauseForDialog();
  scene.tick(16000, 20000);
  scene.resumeAfterDialog();
  scene.advanceHunger(23000);
  near(scene.hunger.sinceMeal, 2);
  scene.pace = 1.1;
  scene.advanceHunger(25000);
  near(scene.hunger.sinceMeal, 4);
  near(scene.hunger.value, 3);
  assert.equal(scene.hunger.state, 'draining');
  scene.paused = true;
  scene.tick(20000, 46000);
  scene.paused = false;
  scene.advanceHunger(46010);
  near(scene.hunger.value, 3);
});

test('같은 몸집·입력일 때 굶주림은 부스터와 이지의 이동 속도에도 곱해진다', async () => {
  const { Player } = await import('../src/game/player.js');
  const { playerStats } = await import('../src/game/session.js');
  const distance = (difficulty, speed, boostSec, hungerMult) => {
    let dx = 0;
    const p = { size: 25, carry: 0, stats: playerStats({ stage: 3, difficulty, enh: { speed } }), move(x) { dx = x; } };
    Player.prototype.step.call(p, { x: 1, y: 0 }, 1, boostSec, 1.3, hungerMult);
    return dx;
  };
  const base = distance('normal', 5, 0, 1);
  near(distance('normal', 5, 1, 1.4), base * 1.3 * 1.4);
  near(distance('hard', 5, 0, 1.125), base * 1.125);
  near(distance('easy', 5, 0, 1.4), base * 2 * 1.4);
});
