import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { applyWorldScale, stageWorldScale, worldFor } from '../src/systems/worldScale.js';
import { zoomFloor, zoomFor } from '../src/game/camera.js';
import { drawWorld, regionAt } from '../src/game/world.js';
import { Actor } from '../src/game/actor.js';

const M = CONFIG.balance.map;

test.afterEach(() => {
  applyWorldScale(1); // 다른 시험에 월드 크기가 남지 않게 되돌린다
});

test('단계마다 맵이 커진다: 월드 크기 4000 → 6000 → 8000 → 10400 → 13200, 적 72 → 108 → 144 → 187 → 238', () => {
  const sizes = [1, 2, 3, 4, 5].map((stage) => worldFor(stage).size);
  const pops = [1, 2, 3, 4, 5].map((stage) => worldFor(stage).population);
  assert.deepEqual(sizes, [4000, 6000, 8000, 10400, 13200]);
  assert.deepEqual(pops, [72, 108, 144, 187, 238]);
  for (let i = 1; i < 5; i++) assert.ok(sizes[i] > sizes[i - 1] && pops[i] > pops[i - 1]);
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
  assert.equal(CONFIG.world.size, 10400);
  assert.equal(CONFIG.world.population, 187);
  assert.deepEqual(r, { scale: M.stageScale[4], size: 10400, population: 187 });
  applyWorldScale(4);
  assert.equal(CONFIG.world.size, 10400);
  applyWorldScale(1);
  assert.equal(CONFIG.world.size, 4000);
  assert.equal(CONFIG.world.population, 72);
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
  actor.move(5000, 5000); // 예전 월드(4000)였다면 4000 근처에서 막혔다
  assert.equal(sprite.x, CONFIG.world.size - 20);
  actor.move(-99999, -99999);
  assert.equal(sprite.x, 20);
});

test('카메라 한계: 월드가 커지면 더 멀리까지 물러설 수 있고, 시야가 월드를 넘지 않는다', () => {
  const [w, h] = [1264, 625];
  const small = zoomFloor(w, h, 3);
  applyWorldScale(5);
  const big = zoomFloor(w, h, 5);
  assert.ok(big < small, `${big} < ${small}`); // 5단계는 월드(13200)도 크고 단계 배율(0.45)로 한계가 낮아진다(minZoom × 0.45)
  // 크기가 아주 커져도 화면 긴 변이 월드를 넘지 않는다
  assert.ok(w / zoomFor(1e9, w, h, 5) <= CONFIG.world.size + 1e-6);
  // 시작 크기의 자연 배율은 한계보다 크다(월드가 커도 시작할 때는 가까이에서 시작한다)
  assert.ok(zoomFor(CONFIG.player.startSize, w, h, 5) > big);
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
  assert.deepEqual(tiles[0].args.slice(0, 4), [0, 0, 8000, 8000], '월드 크기만큼');
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
  assert.deepEqual(last.args.slice(0, 4), [0, 0, 13200, 13200]);
  again.destroy();
});
