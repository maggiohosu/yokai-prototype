import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bindHudDisclosure } from '../src/game/hud.js';
import { Joystick } from '../src/game/joystick.js';

const markup = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const compactQuery = '(orientation: landscape) and (max-height: 500px)';
const styles = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

function disclosure(matches, saved = new Map(), storage = null) {
  const media = Object.assign(new EventTarget(), { matches });
  const button = Object.assign(new EventTarget(), {
    setAttribute(key, value) { this[key] = value; },
    blurred: 0,
    blur() { this.blurred += 1; },
  });
  const panel = { collapsed: null, classList: { toggle(name, on) { if (name === 'is-collapsed') panel.collapsed = on; } } };
  const view = {
    matchMedia(query) { assert.equal(query, compactQuery); return media; },
    localStorage: storage ?? {
      getItem(key) { return saved.get(key) ?? null; },
      setItem(key, value) { saved.set(key, value); },
    },
  };
  bindHudDisclosure(panel, button, view, new AbortController().signal);
  return { media, button, saved, panel };
}

test('첫 판은 낮은 가로 화면에서 접히고 화면 조건이 바뀌면 기본값을 따라간다', () => {
  const { button, media, saved } = disclosure(true);
  assert.equal(button['aria-expanded'], 'false');
  media.matches = false;
  media.dispatchEvent(new Event('change'));
  assert.equal(button['aria-expanded'], 'true');
  assert.equal(saved.size, 0);
});

test('직접 접거나 펼친 값은 회전과 새 판에서도 유지되고 별도 키에만 저장된다', () => {
  const saved = new Map([['yokai-proto-v1', '기존 저장']]);
  for (const compact of [true, false]) {
    const { button, media } = disclosure(compact, saved);
    assert.equal(button['aria-expanded'], String(!compact));
    button.dispatchEvent(new Event('click'));
    assert.equal(saved.get('yokai-hud-collapsed'), String(!compact));
    media.matches = !compact;
    media.dispatchEvent(new Event('change'));
    assert.equal(button['aria-expanded'], String(compact));
    assert.equal(disclosure(compact, saved).button['aria-expanded'], String(compact));
  }
  assert.equal(saved.get('yokai-proto-v1'), '기존 저장');
  assert.equal(saved.size, 2);
});

test('HUD와 조작법의 화살표를 누르면 조이스틱이 손가락을 잡지 않는다', t => {
  const doc = new EventTarget();
  const node = () => ({ style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) });
  const pad = { ...node(), firstElementChild: node() };
  Object.assign(doc, { documentElement: { ...node(), clientWidth: 844 }, body: node(), querySelector: () => pad });
  globalThis.document = doc;
  globalThis.window = new EventTarget();
  t.after(() => { delete globalThis.document; delete globalThis.window; });
  const stick = new Joystick(doc);
  function press(ancestors) {
    const event = new Event('pointerdown', { cancelable: true });
    Object.defineProperty(event, 'target', { value: { closest: css => ancestors.find(tag => css.split(/,\s*/).includes(tag)) } });
    Object.assign(event, { pointerId: 3, pointerType: 'touch', clientX: 80, clientY: 30 });
    doc.dispatchEvent(event);
  }
  for (const id of ['hud-toggle', 'help-toggle']) {
    const tag = markup.match(new RegExp('<(\\w+)\\b[^>]*\\bid="' + id + '"'))?.[1];
    assert.equal(tag, 'button');
    press(['span', tag]);
    assert.equal(stick.pointer, null);
  }
  press(['canvas']);
  assert.equal(stick.pointer, 3);
  stick.destroy();
});


test('접힌 상태는 패널 클래스와 aria-label에 함께 반영된다', () => {
  const { button, panel } = disclosure(true);
  assert.equal(panel.collapsed, true);
  assert.equal(button['aria-label'], '플레이 현황 펼치기');
  button.dispatchEvent(new Event('click'));
  assert.equal(panel.collapsed, false);
  assert.equal(button['aria-expanded'], 'true');
  assert.equal(button['aria-label'], '플레이 현황 접기');
});

test('저장된 값이 true·false가 아니면 무시하고 화면 크기 기본값을 쓴다', () => {
  for (const bad of ['1', 'yes', '', 'null']) {
    assert.equal(disclosure(true, new Map([['yokai-hud-collapsed', bad]])).panel.collapsed, true);
    assert.equal(disclosure(false, new Map([['yokai-hud-collapsed', bad]])).panel.collapsed, false);
  }
  assert.equal(disclosure(false, new Map([['yokai-hud-collapsed', 'true']])).panel.collapsed, true);
  assert.equal(disclosure(true, new Map([['yokai-hud-collapsed', 'false']])).panel.collapsed, false);
});

test('저장소를 읽거나 쓸 수 없어도 접기·펼치기는 이번 판에서 동작한다', () => {
  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const { button, media, panel } = disclosure(false, new Map(), blocked);
  assert.equal(panel.collapsed, false);
  button.dispatchEvent(new Event('click'));
  assert.equal(panel.collapsed, true);
  media.matches = true;
  media.dispatchEvent(new Event('change'));
  assert.equal(panel.collapsed, true, '사용자가 고른 값은 화면 조건이 바뀌어도 유지된다');
});

test('접기 단추는 button이고 aria-expanded·aria-controls를 갖고 터치 영역이 44px 이상이다', () => {
  for (const id of ['hud-toggle', 'help-toggle']) {
    const tag = markup.match(new RegExp('<button\\b[^>]*\\bid="' + id + '"[^>]*>'))?.[0];
    assert.ok(tag, id + ' 단추가 있어야 한다');
    assert.match(tag, /type="button"/);
    assert.match(tag, /aria-expanded="(true|false)"/);
    assert.match(tag, /aria-controls="[^"]+"/);
  }
  const rule = styles.match(/\.fold-toggle\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(rule, /min-width:\s*44px/);
  assert.match(rule, /min-height:\s*44px/);
  assert.match(rule, /pointer-events:\s*auto/);
});

test('접힌 HUD는 판 중에 상시 보이는 설명을 한 줄 띠와 얇은 성장 막대로만 줄인다', () => {
  const collapsed = styles.match(/\.hud\.is-collapsed\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(collapsed, /height:\s*32px/);
  assert.match(styles, /\.hud\.is-collapsed #growth-meter\s*\{\s*height:\s*2px/);
  assert.doesNotMatch(markup, /class="field-size"/, '가운데 큰 크기 숫자 상자는 없앤다');
});

test('포인터로 누르면 포커스를 풀어 스페이스 발사가 단추를 다시 누르지 않고, 키보드로 누르면 포커스를 둔다', () => {
  const { button } = disclosure(false);
  button.dispatchEvent(Object.assign(new Event('click'), { detail: 0 }));
  assert.equal(button.blurred, 0);
  button.dispatchEvent(Object.assign(new Event('click'), { detail: 1 }));
  assert.equal(button.blurred, 1);
});

test('일시 안내는 위치를 지정해 필드 캔버스 위에 그려진다', () => {
  const rule = styles.match(/\.herald-notice,\s*\.reversal-notice\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(rule, /position:\s*relative/);
  assert.match(rule, /z-index:\s*[1-9]/);
  assert.match(rule, /pointer-events:\s*none/);
});
