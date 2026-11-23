import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { applyWorldScale, growthTarget, stageWorldScale, worldFor } from '../src/systems/worldScale.js';
import { followPlayer, zoomFloor, zoomFor } from '../src/game/camera.js';
import { drawWorld, regionAt } from '../src/game/world.js';
import { EnemyFire } from '../src/game/enemyFire.js';
import { Actor } from '../src/game/actor.js';

const M = CONFIG.balance.map;

test.afterEach(() => {
  applyWorldScale(1); // 다른 시험에 월드 크기가 남지 않게 되돌린다
});

test('단계마다 맵이 커지고(1000·1500·2000·2600·3300) 적 인구는 모든 단계에서 480마리다', () => {
  const sizes = [1, 2, 3, 4, 5].map((stage) => worldFor(stage).size);
  const pops = [1, 2, 3, 4, 5].map((stage) => worldFor(stage).population);
  assert.deepEqual(sizes, [1000, 1500, 2000, 2600, 3300]);
  assert.deepEqual(pops, [480, 480, 480, 480, 480]);
  assert.equal(CONFIG.world.fixedPopulation, 480);
  for (let i = 1; i < 5; i++) assert.ok(sizes[i] > sizes[i - 1]);
  assert.equal(stageWorldScale(1), 1);
});

test('단계 범위 밖·이상한 입력은 1~5단계로 자른다', () => {
  assert.equal(worldFor(99).size, worldFor(5).size);
  assert.equal(worldFor(-2).size, worldFor(1).size);
  assert.equal(worldFor(undefined).size, worldFor(1).size);
  assert.equal(worldFor(NaN).size, worldFor(1).size);
  assert.equal(worldFor(2.4).size, worldFor(2).size);
});

test('applyWorldScale: CONFIG.world의 크기와 적 수를 바꾸고, 같은 단계로 여러 번 불러도 같고, 1단계로 돌아온다', () => {
  const r = applyWorldScale(4);
  assert.equal(CONFIG.world.size, 2600);
  assert.equal(CONFIG.world.population, 480);
  assert.deepEqual(r, { scale: M.stageScale[4], size: 2600, population: CONFIG.world.population });
  applyWorldScale(4);
  assert.equal(CONFIG.world.size, 2600);
  applyWorldScale(1);
  assert.equal(CONFIG.world.size, 1000);
  assert.equal(CONFIG.world.population, 480);
});

test('월드를 읽는 코드는 새 크기를 본다: 방위 경계는 새 중심, 액터는 새 월드 안에서만 움직인다', () => {
  applyWorldScale(3);
  const mid = CONFIG.world.size / 2;
  assert.equal(regionAt(mid + 10, mid), 'east');
  assert.equal(regionAt(mid - 10, mid), 'west');
  assert.equal(regionAt(mid, mid + 10), 'south');
  assert.equal(regionAt(mid, mid - 10), 'north');
  const sprite = { x: 7000, y: 7000, setFlipX() {} };
  const actor = Object.create(Actor.prototype);
  Object.assign(actor, { sprite, size: 20 });
  actor.move(5000, 5000);
  assert.equal(sprite.x, CONFIG.world.size - 20);
  actor.move(-99999, -99999);
  assert.equal(sprite.x, 20);
});

test('카메라 하한은 단계별 최소 배율과 화면 긴 변을 월드에 담는 배율 중 큰 값이다', () => {
  const [w, h] = [1264, 625];
  applyWorldScale(1);
  const start = zoomFor(CONFIG.player.startSize, w, h, 1);
  assert.equal(zoomFloor(w, h, 1), 1264 / 1000);
  assert.equal(zoomFloor(844, 390, 1), 844 / 1000);
  assert.equal(zoomFor(200, 844, 390, 1), 844 / 1000);
  assert.equal(zoomFor(200, 1920, 1080, 1), 1.92);
  for (const stage of [2, 3, 4, 5]) {
    const { size } = applyWorldScale(stage);
    assert.equal(zoomFloor(1920, 1080, stage), Math.max(CONFIG.camera.minZoom, 1920 / size));
    assert.equal(zoomFor(CONFIG.player.startSize, w, h, stage), start);
  }
});

test('844×390에서는 기존 시작 배율이고, 진화 연출 중 넓어진 화면도 경계 안에 담는다', () => {
  applyWorldScale(1);
  const phoneZoom = zoomFor(CONFIG.player.startSize, 844, 390);
  assert.ok(Math.abs(phoneZoom - 1.4394859765554318) < 1e-9);
  assert.equal(zoomFloor(844, 390), 844 / 1000, '1단계는 맵 한 변 1000이라 긴 변이 월드에 담기는 배율이 기본 하한 0.43보다 크다');
  applyWorldScale(5);
  assert.equal(zoomFloor(844, 390), CONFIG.camera.minZoom, '5단계(3300)에서는 기본 하한 0.43이다');
  applyWorldScale(1);
  const cam = {
    width: 1688, height: 780, zoom: 1,
    setSize(w, h) { this.width = w; this.height = h; return this; },
    setZoom(z) { this.zoom = z; return this; },
    setBounds() { return this; }, centerOn() { return this; }, startFollow() { return this; },
  };
  globalThis.window = { devicePixelRatio: 2 };
  try {
    const follow = followPlayer({ cameras: { main: cam }, time: { now: 0 } }, { size: 200, stage: 1 });
    follow.expand();
    follow.recenter({ width: 5120, height: 2160 });
    assert.equal(cam.width / cam.zoom, CONFIG.world.size);
  } finally { delete globalThis.window; }
});

test('적탄은 단계별 새 경계를 넘을 때 제거된다', () => {
  for (const stage of [1, 3, 5]) {
    const { size } = applyWorldScale(stage);
    const fire = new EnemyFire({});
    const orb = { x: size - 2, y: 100, vx: 1, vy: 0, life: 10 };
    fire.orbs.push(orb);
    fire.step(1, { x: 100, y: 100, size: 10 });
    assert.deepEqual(fire.orbs, [orb]);
    fire.step(2, { x: 100, y: 100, size: 10 });
    assert.equal(fire.orbs.length, 0);
  }
});

// ---- drawWorld: Phaser 없이 가짜 씬으로 만든 것을 모두 지우는지 본다 ----
function fakeScene() {
  const created = [];
  const make = (kind, args) => {
    const object = new Proxy({ kind, args, destroyed: false }, {
      get(target, key) {
        if (key === 'destroy') return () => { target.destroyed = true; };
        if (key in target) return target[key];
        return () => object; // setDepth·fillTriangle·lineStyle 등은 자기 자신을 돌려준다(체이닝)
      },
    });
    created.push(object);
    return object;
  };
  return {
    created,
    textures: { exists: () => true },
    add: {
      graphics: () => make('graphics', []),
      tileSprite: (...args) => make('tileSprite', args),
      text: (...args) => make('text', args),
      image: (...args) => make('image', args),
    },
  };
}

test('drawWorld: 바닥 무늬는 tileSprite 하나이고, 돌려준 destroy가 만든 것을 모두 지운다(다시 그릴 수 있다)', () => {
  applyWorldScale(3);
  const scene = fakeScene();
  const view = drawWorld(scene);
  const tiles = scene.created.filter((o) => o.kind === 'tileSprite');
  assert.equal(tiles.length, 1, '타일 이미지 수백 개가 아니라 tileSprite 하나');
  assert.deepEqual(tiles[0].args.slice(0, 4), [0, 0, 2000, 2000], '월드 크기만큼');
  assert.equal(scene.created.filter((o) => o.kind === 'text').length, 4, '방위 글자 4개');
  assert.ok(scene.created.length >= 7);
  assert.ok(scene.created.every((o) => !o.destroyed));
  view.destroy();
  assert.ok(scene.created.every((o) => o.destroyed), '모두 지워진다');
  view.destroy(); // 두 번 불러도 안전
  // 월드가 커진 뒤 다시 그린다
  applyWorldScale(5);
  const again = drawWorld(scene);
  const last = scene.created.filter((o) => o.kind === 'tileSprite').at(-1);
  assert.deepEqual(last.args.slice(0, 4), [0, 0, 3300, 3300]);
  again.destroy();
});

test('growthTarget: 판 안에서는 맵이 커지기만 한다(정비 역진화로 낮은 단계가 되어도 줄이지 않는다)', () => {
  // 진화(커지는 경우): 새 월드를 돌려준다
  assert.deepEqual(growthTarget(2, 1000), worldFor(2));
  assert.equal(growthTarget(3, 1500).size, 2000);
  assert.equal(growthTarget(5, 2600).size, 3300);
  // 같은 크기·작아지는 경우(2→1단계 역진화, 5→4단계 등): null이라 월드를 건드리지 않는다
  assert.equal(growthTarget(2, 1500), null);
  assert.equal(growthTarget(1, 1500), null);
  assert.equal(growthTarget(4, 3300), null);
  // 확인만 하므로 CONFIG.world는 바뀌지 않는다(applyWorldScale을 먼저 부르면 바뀐다)
  applyWorldScale(2);
  growthTarget(5, CONFIG.world.size);
  growthTarget(1, CONFIG.world.size);
  assert.equal(CONFIG.world.size, 1500);
  assert.equal(CONFIG.world.population, worldFor(2).population);
});
