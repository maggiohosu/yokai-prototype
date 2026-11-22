import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../src/config.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');
const walk = (dir) => readdirSync(join(root, dir)).flatMap((name) => {
  const path = `${dir}/${name}`;
  return statSync(join(root, path)).isDirectory() ? walk(path) : [path];
});

// 눈누 694번 프리텐다드(SIL OFL 1.1) 가변 웹폰트. 눈누가 '웹폰트로 사용'에 안내하는 주소 그대로다.
const NOONNU_URL = 'https://cdn.jsdelivr.net/gh/Project-Noonnu/2611030106@font-variable-694/variable-694/PretendardVariable.woff2';

test('style.css: 눈누 프리텐다드 가변 웹폰트를 @font-face로 불러오고 굵기 45~930을 쓴다', () => {
  const css = read('src/style.css');
  const face = css.match(/@font-face\s*\{[^}]*\}/)?.[0] ?? '';
  assert.match(face, /font-family:\s*'PretendardVariable'/);
  assert.ok(face.includes(NOONNU_URL), '눈누가 안내한 가변 woff2 주소');
  assert.match(face, /font-weight:\s*45 930/);
  assert.match(face, /font-display:\s*swap/);
});

test('CSS 글꼴 토큰은 모두 프리텐다드 하나로 통일되고, 한자를 위한 시스템 글꼴이 뒤에 있다', () => {
  const css = read('src/style.css');
  const font = css.match(/--font:\s*([^;]+);/)?.[1] ?? '';
  assert.ok(font.startsWith("'PretendardVariable'"), font);
  assert.ok(/Malgun Gothic/.test(font) && /Apple SD Gothic Neo/.test(font) && /Noto Sans KR/.test(font), '한자·예외 글자를 받는 대체 글꼴');
  assert.match(css, /--serif:\s*var\(--font\)/);
  assert.match(css, /--sans:\s*var\(--font\)/);
  assert.ok(!/Batang|Myeongjo|Georgia/.test(css), '예전 명조 계열 글꼴이 남아 있지 않다');
});

test('Phaser 글자는 모두 CONFIG.font.family를 쓴다(소스에 글꼴 이름이 박혀 있지 않다)', () => {
  const files = walk('src').filter((f) => f.endsWith('.js'));
  const offenders = [];
  for (const file of files) {
    const text = read(file);
    if (file !== 'src/config.js' && /fontFamily:\s*['"`]/.test(text)) offenders.push(file + ': 글꼴 이름이 박혀 있다');
    if (/system-ui|Batang|'serif'|"serif"/.test(text) && file !== 'src/config.js') offenders.push(file + ': 예전 글꼴 이름');
  }
  assert.deepEqual(offenders, []);
  // 글자를 만드는 곳은 공통 설정을 읽는다
  for (const file of ['src/game/enemy.js', 'src/game/fx.js', 'src/game/world.js', 'src/scenes/PlayScene.js']) {
    assert.ok(read(file).includes('fontFamily: CONFIG.font.family'), file);
  }
});

test('CONFIG.font: 프리텐다드 우선, 한자 대체 글꼴, 시작 전에 글꼴을 기다리는 설정', () => {
  const { family, load, loadText, timeoutMs } = CONFIG.font;
  assert.ok(family.startsWith("'PretendardVariable'"));
  assert.ok(family.includes('Malgun Gothic') && family.endsWith('sans-serif'));
  assert.ok(load.includes('PretendardVariable'));
  assert.ok(/[北東南西終]/.test(loadText), '한자도 미리 확인');
  assert.ok(timeoutMs >= 1000 && timeoutMs <= 5000, '오프라인이어도 오래 막지 않는다');
});

test('index.html: 같은 글꼴 파일을 미리 불러오고(preload), main.js는 Phaser를 만들기 전에 글꼴을 기다린다', () => {
  const html = read('index.html');
  assert.ok(html.includes(`rel="preload"`) && html.includes(NOONNU_URL) && html.includes('crossorigin'));
  const main = read('src/main.js');
  assert.ok(/function fontsReady\(/.test(main));
  assert.ok(main.indexOf('await fonts') > 0 && main.indexOf('await fonts') < main.indexOf('new Phaser.Game'), '게임을 만들기 전에 기다린다');
});
