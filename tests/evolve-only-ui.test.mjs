import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Hud } from '../src/game/hud.js';
import { Joystick } from '../src/game/joystick.js';
import { QuickPick } from '../src/ui/QuickPick.js';
import { FORMS } from '../src/data/forms.js';
import { createProgress } from '../src/systems/progress.js';
import { allQuickCards, createRunLevel, growthView, pickQuickCards } from '../src/systems/levelup.js';

// 2단계 이상 진화 전용 화면(계획서 변경 이력 21): HUD 성장 표시·'진화 가능' 단추와 카드 화면의 [계속 모으기].
const markup = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const pickStyles = readFileSync(new URL('../src/ui/quickpick.css', import.meta.url), 'utf8');

// ---- HUD ----
function fakeHud() {
  const classes = new Set();
  const node = (extra = {}) => ({ hidden: false, textContent: '', ...extra });
  const hud = Object.create(Hud.prototype);
  Object.assign(hud, {
    gaugeRow: node({ classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)), contains: (name) => classes.has(name) } }),
    gauge: node({ max: 1, value: 0, classList: { toggle() {} } }),
    gaugeLabel: node(),
    gaugeCount: node(),
    evolveButton: node({ hidden: true }),
  });
  return { hud, classes };
}

function viewOf(stage, yoryeok, formId = 'littleSnake') {
  const progress = Object.assign(createProgress(), { stage, formId, yoryeok });
  return growthView(progress, createRunLevel(progress));
}

test('HUD 성장 표시: 2단계 이상은 "다음 진화까지 n 요력"이고 막대는 비용 대비 요력이다', () => {
  const { hud } = fakeHud();
  hud.setGrowth(viewOf(2, 150));
  assert.equal(hud.gaugeRow.hidden, false);
  assert.equal(hud.gaugeLabel.textContent, '다음 진화까지');
  assert.equal(hud.gaugeCount.textContent, '250 요력');
  assert.equal(hud.gauge.max, 400);
  assert.equal(hud.gauge.value, 150);
  assert.equal(hud.evolveButton.hidden, true);
  hud.setGrowth(viewOf(4, 1000, 'gumiho'));
  assert.equal(hud.gaugeCount.textContent, '15000 요력');
  assert.equal(hud.gauge.max, 16000);
});

test('HUD 성장 표시: 1단계는 예전 "다음 성장까지 현재 / 목표" 게이지 그대로다', () => {
  const { hud } = fakeHud();
  hud.setGrowth(viewOf(1, 10, 'mimul'));
  assert.equal(hud.gaugeLabel.textContent, '다음 성장까지');
  assert.match(hud.gaugeCount.textContent, /^\d+ \/ \d+$/);
  assert.equal(hud.evolveButton.hidden, true);
});

test('HUD 성장 표시: 요력이 진화 비용에 닿으면 게이지 자리에 "진화 가능" 단추가 뜨고, 진화해 모자라지면 게이지로 돌아온다', () => {
  const { hud, classes } = fakeHud();
  hud.gaugeRow.hidden = true;
  hud.setGrowth(viewOf(2, 400));
  assert.equal(hud.evolveButton.hidden, false);
  assert.equal(hud.gaugeRow.hidden, false);
  assert.ok(classes.has('is-evolve-ready'));
  hud.setGrowth(viewOf(2, 9000));
  assert.equal(hud.evolveButton.hidden, false);
  hud.setGrowth(viewOf(3, 100, 'hillFox'));
  assert.equal(hud.evolveButton.hidden, true);
  assert.ok(!classes.has('is-evolve-ready'));
  assert.equal(hud.gaugeCount.textContent, '1900 요력');
});

test('HUD 성장 표시: 5단계는 게이지도 단추도 숨긴다', () => {
  const { hud } = fakeHud();
  hud.setGrowth(viewOf(2, 150));
  hud.setGrowth(viewOf(5, 1e9, 'cheonho'));
  assert.equal(hud.gaugeRow.hidden, true);
  assert.equal(hud.evolveButton.hidden, true);
});

test('index.html: 진화 가능 단추는 게이지 행 안의 button이고 CSS는 44px 이상·눌림 허용·접힌 HUD에서도 눌리는 자리다', () => {
  const row = markup.match(/<div class="growth-gauge" id="growth-gauge"[\s\S]*?<\/div>/)?.[0] ?? '';
  const tag = row.match(/<button\b[^>]*\bid="evolve-ready"[^>]*>/)?.[0];
  assert.ok(tag, '게이지 행 안에 #evolve-ready가 있어야 한다');
  assert.match(tag, /type="button"/);
  assert.match(tag, /\bhidden\b/);
  assert.match(tag, /aria-label="[^"]*진화 가능/);
  const rule = styles.match(/\.evolve-ready\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(rule, /min-height:\s*44px/);
  assert.match(rule, /pointer-events:\s*auto/);
  assert.match(styles, /\.growth-gauge\.is-evolve-ready\s*>\s*:not\(\.evolve-ready\)\s*\{\s*display:\s*none/);
  assert.match(styles, /\.hud\.is-collapsed #growth-gauge\.is-evolve-ready\s*\{[^}]*inset:\s*calc\(100% \+ 4px\)/);
});

test('"진화 가능" 단추를 누르면 조이스틱이 손가락을 잡지 않는다(이동 입력 제외)', (t) => {
  const doc = new EventTarget();
  const node = () => ({ style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) });
  const pad = { ...node(), firstElementChild: node() };
  Object.assign(doc, { documentElement: { ...node(), clientWidth: 844 }, body: node(), querySelector: () => pad });
  globalThis.document = doc;
  globalThis.window = new EventTarget();
  t.after(() => { delete globalThis.document; delete globalThis.window; });
  const stick = new Joystick(doc);
  const tag = markup.match(/<(\w+)\b[^>]*\bid="evolve-ready"/)?.[1];
  assert.equal(tag, 'button');
  const event = new Event('pointerdown', { cancelable: true });
  Object.defineProperty(event, 'target', { value: { closest: (css) => ['span', tag].find((name) => css.split(/,\s*/).includes(name)) } });
  Object.assign(event, { pointerId: 4, pointerType: 'touch', clientX: 80, clientY: 30 });
  doc.dispatchEvent(event);
  assert.equal(stick.pointer, null);
  stick.destroy();
});

// ---- 카드 화면의 [계속 모으기] ----
// 카드 화면이 쓰는 만큼만 흉내 낸 DOM.
function fakeDom() {
  class Node {
    constructor(tag) {
      Object.assign(this, { tagName: tag, children: [], attrs: {}, listeners: {}, dataset: {}, hidden: false, textContent: '', removed: false });
      this.style = { setProperty: (key, value) => { this.style[key] = value; } };
      this.classes = new Set();
      this.classList = { add: (name) => this.classes.add(name), contains: (name) => this.classes.has(name) };
    }
    set className(value) { this.classes = new Set(String(value).split(/\s+/).filter(Boolean)); }
    get className() { return [...this.classes].join(' '); }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = [...nodes]; }
    setAttribute(key, value) { this.attrs[key] = value; }
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
    remove() { this.removed = true; }
    focus() {}
    fire(type, init = {}) {
      const event = { type, detail: 0, pointerType: 'touch', button: 0, preventDefault() {}, stopPropagation() {}, ...init };
      for (const fn of this.listeners[type] ?? []) fn(event);
    }
    find(predicate, out = []) {
      if (predicate(this)) out.push(this);
      for (const child of this.children) child.find(predicate, out);
      return out;
    }
  }
  const keys = [];
  const body = new Node('body');
  const doc = {
    createElement: (tag) => new Node(tag),
    querySelectorAll: () => [],
    head: new Node('head'),
    body,
  };
  const win = {
    addEventListener: (type, fn) => { if (type === 'keydown') keys.push(fn); },
    removeEventListener: (type, fn) => { const i = keys.indexOf(fn); if (type === 'keydown' && i >= 0) keys.splice(i, 1); },
  };
  return { doc, win, body, keys };
}

function openPick(t, options = {}) {
  const dom = fakeDom();
  globalThis.document = dom.doc;
  globalThis.window = dom.win;
  t.after(() => { delete globalThis.document; delete globalThis.window; });
  const progress = Object.assign(createProgress(), { stage: 2, formId: 'littleSnake', yoryeok: 5000 });
  const run = createRunLevel(progress);
  const cards = pickQuickCards(progress, run, FORMS, { rng: () => 0.5 });
  let clock = 0;
  const log = { picked: [], deferred: 0 };
  const view = QuickPick(cards, {
    progress, yoryeok: progress.yoryeok, now: () => clock, ignoreMs: 150,
    onPick: (card) => log.picked.push(card), onDefer: () => { log.deferred += 1; },
    ...options,
  });
  const root = dom.body.children[0];
  const defer = root.find((n) => n.classes.has('qp-defer'))[0];
  return { dom, view, root, defer, cards, log, advance: (ms) => { clock += ms; } };
}

test('QuickPick: onDefer를 주면 [계속 모으기] 단추가 카드 아래에 생기고 누르면 아무것도 사지 않고 닫는다', (t) => {
  const { root, defer, log, advance } = openPick(t, { title: '진화할 수 있어요!', rerollsLeft: 0 });
  assert.ok(defer, '[계속 모으기] 단추');
  assert.equal(defer.textContent, '계속 모으기');
  assert.equal(defer.type, 'button');
  assert.equal(root.find((n) => n.classes.has('qp-title'))[0].textContent, '진화할 수 있어요!');
  assert.equal(root.find((n) => n.classes.has('qp-reroll')).length, 0, '진화 전용 선택은 다시 뽑기를 보이지 않는다(rerollsLeft 0)');
  defer.fire('pointerdown'); // 열린 직후 150ms는 무시한다(실수 방지)
  assert.equal(log.deferred, 0);
  assert.equal(root.removed, false);
  advance(200);
  defer.fire('pointerdown');
  assert.equal(log.deferred, 1);
  assert.deepEqual(log.picked, []);
  assert.equal(root.removed, true);
  defer.fire('pointerdown');
  assert.equal(log.deferred, 1, '닫힌 뒤에는 다시 불리지 않는다');
});

test('QuickPick: 키보드 C·Esc도 [계속 모으기]이고, 카드를 탭하면 onPick이 불리며 onDefer는 불리지 않는다', (t) => {
  const first = openPick(t);
  first.advance(200);
  first.dom.keys[0]({ code: 'KeyC', preventDefault() {}, stopPropagation() {} });
  assert.equal(first.log.deferred, 1);
  assert.equal(first.dom.keys.length, 0, '키 리스너를 뗀다');
  const second = openPick(t);
  second.advance(200);
  second.dom.keys[0]({ code: 'Escape', preventDefault() {}, stopPropagation() {} });
  assert.equal(second.log.deferred, 1);
  const third = openPick(t);
  third.advance(200);
  const card = third.root.find((n) => n.classes.has('qp-card'))[0];
  card.fire('pointerdown');
  assert.equal(third.log.picked.length, 1);
  assert.equal(third.log.picked[0].kind, 'evolve');
  assert.equal(third.log.deferred, 0);
});

test('QuickPick: onDefer가 없으면(1단계) [계속 모으기]가 없고 머리글은 예전 "성장할 때!"다', (t) => {
  const dom = fakeDom();
  globalThis.document = dom.doc;
  globalThis.window = dom.win;
  t.after(() => { delete globalThis.document; delete globalThis.window; });
  const progress = Object.assign(createProgress(), { yoryeok: 5000 });
  const run = createRunLevel(progress);
  QuickPick(pickQuickCards(progress, run, FORMS, { rng: () => 0.5 }), { progress, yoryeok: 5000, now: () => 0, onPick() {} });
  const root = dom.body.children[0];
  assert.equal(root.find((n) => n.classes.has('qp-defer')).length, 0);
  assert.equal(root.find((n) => n.classes.has('qp-title'))[0].textContent, '성장할 때!');
});

test('QuickPick: 진화 전용 카드 목록은 진화 카드뿐이고 단추 CSS는 44px 이상이다', (t) => {
  const { root, cards } = openPick(t);
  const shown = root.find((n) => n.classes.has('qp-card'));
  assert.equal(shown.length, cards.length);
  assert.ok(shown.every((n) => n.dataset.kind === 'evolve'));
  const rule = pickStyles.match(/\.qp-defer\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(rule, /min-height:\s*44px/);
  const all = allQuickCards(Object.assign(createProgress(), { stage: 2, formId: 'littleSnake', yoryeok: 5000 }), createRunLevel(), FORMS);
  assert.ok(all.every((card) => card.kind === 'evolve'));
});

// ---- PlayScene 연결 ----
test('PlayScene: HUD 단추는 판이 멈췄거나 끝났거나 요력이 모자라면 카드를 열지 않고, [계속 모으기]는 판을 재개하며 그 단계를 기억한다', async () => {
  globalThis.Phaser ??= { Scene: class {} };
  const { PlayScene } = await import('../src/scenes/PlayScene.js');
  const proto = PlayScene.prototype;
  const progress = Object.assign(createProgress(), { stage: 2, formId: 'littleSnake', yoryeok: 5000 });
  const level = createRunLevel(progress);
  let opened = 0;
  const scene = Object.assign(Object.create(proto), {
    progress, level, paused: false, ended: false, preview: false, stress: null, hudTime: 5, fireRequested: true,
    quickPick: {}, openQuickPick() { opened += 1; },
  });
  proto.openEvolveFromHud.call(scene);
  assert.equal(opened, 1, '요력이 닿았고 판이 돌고 있으면 연다');
  for (const patch of [{ paused: true }, { ended: true }, { preview: true }, { stress: {} }]) {
    proto.openEvolveFromHud.call(Object.assign(scene, { paused: false, ended: false, preview: false, stress: null }, patch));
  }
  assert.equal(opened, 1, '멈춤·끝남·미리보기·시험 판에서는 열지 않는다');
  Object.assign(scene, { paused: false, ended: false, preview: false, stress: null });
  progress.yoryeok = 399;
  proto.openEvolveFromHud.call(scene);
  assert.equal(opened, 1, '요력이 모자라면 열지 않는다');
  progress.yoryeok = 5000;

  scene.paused = true;
  proto.deferCard.call(scene);
  assert.equal(scene.paused, false, '재개한다');
  assert.equal(scene.quickPick, null);
  assert.equal(scene.hudTime, 0, 'HUD를 바로 갱신한다');
  assert.equal(scene.fireRequested, false);
  assert.equal(level.evolveDeferredStage, 2);
  assert.equal(progress.yoryeok, 5000, '요력은 그대로다');
  assert.equal(progress.stage, 2);
});

test('QuickPick: 1단계 능력 +1 카드의 문구가 +10 이후 효과를 따른다(레벨을 문구 계산에 넘긴다)', (t) => {
  const dom = fakeDom();
  globalThis.document = dom.doc;
  globalThis.window = dom.win;
  t.after(() => { delete globalThis.document; delete globalThis.window; });
  const progress = Object.assign(createProgress(), { yoryeok: 1e9 });
  progress.enh.growth = 10;
  const run = createRunLevel(progress);
  const card = allQuickCards(progress, run, FORMS).find((c) => c.kind === 'ability' && c.stat === 'growth');
  QuickPick([card], { progress, yoryeok: progress.yoryeok, now: () => 0, onPick() {} });
  const note = dom.body.children[0].find((n) => n.classes.has('qp-note'))[0];
  assert.equal(note.textContent, '먹을 때 자라는 양 +80% → +84%');
});
