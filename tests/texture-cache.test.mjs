import test from 'node:test';
import assert from 'node:assert/strict';
import { FORMS } from '../src/data/forms.js';
import { CONFIG } from '../src/config.js';
import { drawCreature, getFormPortrait, getFormThumbnail } from '../src/art/creature.js';
import { Actor } from '../src/game/actor.js';
import { drawStageMark } from '../src/art/marks.js';

function sceneRecorder() {
  const sizes = new Map(), removed = [], baked = [];
  const scene = {
    children: { list: [] },
    textures: {
      exists: key => sizes.has(key),
      remove(key) { removed.push(key); sizes.delete(key); },
      get: key => ({ getSourceImage: () => ({ toDataURL: () => key + '@' + sizes.get(key) }) }),
    },
    make: { graphics() {
      const g = new Proxy({}, { get: (_, op) => (...args) => {
        if (op === 'generateTexture') {
          const [key, w, h] = args;
          assert.equal(w, h);
          baked.push(key);
          sizes.set(key, w);
        }
        return g;
      } });
      return g;
    } },
  };
  return { scene, sizes, removed, baked };
}

test('24 MiB를 넘기면 오래된 미사용 그림부터 회수하고 사용 중·최근 조회한 그림은 보존한다', () => {
  const { scene, sizes, removed } = sceneRecorder();
  const ids = FORMS.filter(f => f.stage === 5).map(f => f.id);
  const draw = i => drawCreature(scene, ids[i]);
  const pinned = draw(0), oldest = draw(1), recent = draw(2);
  // 잠든 이웃 씬의 컨테이너가 참조한다.
  const sleeping = { children: { list: [{ list: [{ texture: { key: pinned } }] }] } };
  scene.game = { scene: { getScenes: () => [scene, sleeping] } };
  for (let i = 3; i < ids.length - 1; i++) draw(i);
  draw(2);
  draw(ids.length - 1);
  assert.deepEqual(removed, [oldest]);
  assert.ok(sizes.has(pinned) && sizes.has(recent));
  assert.ok([...sizes.values()].reduce((sum, px) => sum + px * px * 4, 0) <= 24 * 1024 ** 2);
  draw(1);
  assert.ok(sizes.has(oldest));
  assert.notEqual(removed.at(-1), recent);
});

test('그림 예산보다 많은 생물이 동시에 있어도 스프라이트에 빈 텍스처가 생기지 않는다', () => {
  const { scene, removed } = sceneRecorder();
  let afterStep;
  scene.game = { events: { once(name, fn) { assert.equal(name, 'poststep'); afterStep = fn; } } };
  for (const f of FORMS.filter(f => f.stage === 5)) {
    const key = drawCreature(scene, f.id);
    scene.children.list.push({ texture: { key } });
  }
  assert.deepEqual(removed, []);
  const unused = scene.children.list.shift();
  afterStep();
  assert.ok(removed.includes(unused.texture.key));
});

test('같은 형태는 한 번 굽고 128px 썸네일과 큰 도판은 필드 텍스처를 공유하지 않는다', () => {
  const { scene, sizes, baked } = sceneRecorder();
  const field = drawCreature(scene, 'cheongnyong');
  assert.equal(drawCreature(scene, 'cheongnyong', { grade: 'S' }), field);
  assert.equal(sizes.get(field), 480);
  const thumb = getFormThumbnail(scene, 'cheongnyong');
  assert.match(thumb, /@128$/);
  assert.equal(getFormThumbnail(scene, 'cheongnyong'), thumb);
  assert.equal(baked.length, 2);
  assert.match(getFormPortrait(scene, 'cheongnyong'), /@480$/);
  assert.deepEqual([...sizes.keys()], [field]);
});

test('같은 size에서 단계 1·4·5의 몸 반지름과 몸 중심이 같고, 단계 점은 관 위로 올라간다', () => {
  const { scene, sizes } = sceneRecorder();
  const size = 42;
  for (const [formId, stage, px, lift] of [['hwalsa', 1, 320, 1.7], ['gumiho', 4, 400, 2.1], ['cheongnyong', 5, 480, 2.5]]) {
    scene.add = { image(x, y) { return { x, y, setOrigin() { return this; }, setDisplaySize(w) { this.displayWidth = w; } }; } };
    const actor = new Actor(scene, 500, 500, size, formId);
    assert.equal(sizes.get('creature-' + formId), px);
    assert.equal(actor.sprite.displayWidth * (2 * CONFIG.render.bodyRadius / px), size);
    let dot, count = 0;
    const graphics = new Proxy({ scene: { cameras: { main: { zoom: 1, worldView: { top: 0, bottom: 999, left: 0, right: 999 } } } } },
      { get(target, op) { return target[op] ?? ((...args) => {
        if (op === 'arc') { dot = args; count++; }
      }); } });
    globalThis.window = { devicePixelRatio: 1 };
    drawStageMark(graphics, { ...actor, x: 500, y: 500, stage }, 1, 0);
    assert.equal(count, stage);
    assert.equal(dot[1], 500 - size * lift - 4 - 2);
    delete globalThis.window;
  }
});

test('도감에 들어오면 보이는 카드만 프레임당 최대 세 장을 그린다', async t => {
  let report, scheduled, observerOptions;
  class Element {
    constructor(tag) { this.tag = tag; }
    children = [];
    dataset = {};
    style = { setProperty() {} };
    classList = { toggle() {} };
    addEventListener() {}
    setAttribute() {}
    append(...elements) { this.children.push(...elements); }
    querySelector(tag) {
      for (const el of this.children) {
        const found = el.tag === tag ? el : el.querySelector(tag);
        if (found) return found;
      }
      return null;
    }
  }
  const ids = new Map(['cards', 'filters', 'form-count', 'gallery', 'specimen-dialog', 'loading']
    .map(id => [id, new Element('div')]));
  ids.get('specimen-dialog').append(new Element('img'));
  globalThis.document = { createElement: tag => new Element(tag), getElementById: id => ids.get(id) };
  globalThis.Phaser = { Scene: class {} };
  globalThis.IntersectionObserver = class {
    constructor(callback, opts) { report = callback; observerOptions = opts; }
    observe() {} unobserve() {} disconnect() {}
  };
  globalThis.requestAnimationFrame = fn => { scheduled = fn; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  t.after(() => {
    for (const key of ['document','Phaser','IntersectionObserver','requestAnimationFrame','cancelAnimationFrame']) delete globalThis[key];
  });
  const { GalleryScene } = await import('../src/scenes/GalleryScene.js');
  const { scene, baked } = sceneRecorder();
  scene.events = { once() {} };
  scene.game = { events: scene.events };
  GalleryScene.prototype.create.call(scene);
  const cards = ids.get('cards').children;
  assert.equal(cards.length, 171);
  assert.equal(ids.get('form-count').textContent, '171종');
  assert.equal(observerOptions.root, ids.get('gallery'));
  assert.equal(baked.length, 0);
  report(cards.slice(0, 10).map(target => ({ target, isIntersecting: true })));
  scheduled();
  assert.equal(baked.length, 3);
  cards[3].hidden = true;
  report([{ target: cards[4], isIntersecting: false }]);
  scheduled();
  scheduled();
  assert.deepEqual(baked, [0, 1, 2, 5, 6, 7, 8, 9].map(i => 'portrait-' + cards[i].dataset.form));
});
