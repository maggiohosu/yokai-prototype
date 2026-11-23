import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { padLimits, padVector, inStickZone, smoothAxis, keyVector } from '../src/game/joystick.js';
import { zoomFor } from '../src/game/camera.js';

const center = { x: 100, y: 300 };
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, a + ' ≈ ' + b);

test('padLimits: 최대 속도 거리는 fullSpeedPx이되 패드 반지름을 넘지 않는다', () => {
  const { deadZonePx, fullSpeedPx } = CONFIG.input;
  assert.deepEqual(padLimits(200), { deadZone: deadZonePx, full: fullSpeedPx });
  assert.deepEqual(padLimits(50), { deadZone: deadZonePx, full: 50 });
  const tiny = padLimits(10);
  assert.equal(tiny.full, 10);
  assert.ok(tiny.deadZone < tiny.full);
});

test('padVector: 데드존 안은 0, 패드 중심 기준 방향, 최대 거리에서 길이 1', () => {
  const limits = { deadZone: 10, full: 50 };
  assert.deepEqual(padVector(center, center, limits), { x: 0, y: 0 });
  assert.deepEqual(padVector({ x: 110, y: 300 }, center, limits), { x: 0, y: 0 }, '데드존 경계 이하');
  const right = padVector({ x: 150, y: 300 }, center, limits);
  near(right.x, 1);
  near(right.y, 0);
  const far = padVector({ x: 100, y: 300 - 500 }, center, limits);
  near(far.x, 0);
  near(far.y, -1);
  const mid = padVector({ x: 100, y: 330 }, center, limits); // 중심에서 30px 아래: (30-10)/(50-10)=0.5
  near(mid.x, 0);
  near(mid.y, 0.5);
});

test('padVector: 방향은 패드 중심에서 손가락까지이고 캐릭터 위치와 무관하다', () => {
  const limits = { deadZone: 10, full: 50 };
  const diag = padVector({ x: 100 + 40, y: 300 - 40 }, center, limits);
  assert.ok(diag.x > 0 && diag.y < 0);
  near(Math.hypot(diag.x, diag.y), 1);
  near(Math.abs(diag.x), Math.abs(diag.y));
  // 길이는 항상 0~1
  for (let angle = 0; angle < Math.PI * 2; angle += 0.3) {
    for (const r of [0, 5, 11, 25, 49, 50, 80, 1000]) {
      const v = padVector({ x: center.x + Math.cos(angle) * r, y: center.y + Math.sin(angle) * r }, center, limits);
      assert.ok(Math.hypot(v.x, v.y) <= 1 + 1e-9);
    }
  }
});

test('padVector: out을 넘기면 그 객체를 재사용한다', () => {
  const out = { x: 9, y: 9 };
  const result = padVector({ x: 150, y: 300 }, center, { deadZone: 10, full: 50 }, out);
  assert.strictEqual(result, out);
  near(out.x, 1);
  padVector(center, center, { deadZone: 10, full: 50 }, out);
  assert.deepEqual(out, { x: 0, y: 0 });
});

test('inStickZone: 화면 왼쪽 절반에서만 스틱을 잡는다', () => {
  assert.equal(inStickZone(0, 800), true);
  assert.equal(inStickZone(399, 800), true);
  assert.equal(inStickZone(400, 800), false);
  assert.equal(inStickZone(780, 800), false);
});

test('smoothAxis: 첫 호출은 바로 따라가고, 시간상수만큼 섞은 뒤 사실상 즉시 도달한다', () => {
  const axis = { x: 0, y: 0 };
  const first = smoothAxis(axis, { x: 1, y: -1 }, null, CONFIG.input.responseMs);
  assert.deepEqual(first, { x: 1, y: -1 });
  const a = { x: 0, y: 0 };
  smoothAxis(a, { x: 1, y: 0 }, CONFIG.input.responseMs, CONFIG.input.responseMs, a);
  near(a.x, 1 - Math.exp(-1));
  const b = { x: 0, y: 0 };
  smoothAxis(b, { x: 1, y: 0 }, 16.7, CONFIG.input.responseMs, b);
  assert.ok(b.x > 0.5, '한 프레임에 절반 넘게 따라간다');
});

test('keyVector: WASD·방향키, 대각선도 길이 1, 반대 키는 상쇄', () => {
  assert.deepEqual(keyVector(new Set()), { x: 0, y: 0 });
  assert.deepEqual(keyVector(new Set(['KeyD'])), { x: 1, y: 0 });
  assert.deepEqual(keyVector(new Set(['ArrowLeft'])), { x: -1, y: 0 });
  const diag = keyVector(new Set(['KeyW', 'ArrowRight']));
  near(Math.hypot(diag.x, diag.y), 1);
  assert.ok(diag.x > 0 && diag.y < 0);
  assert.deepEqual(keyVector(new Set(['KeyA', 'KeyD'])), { x: 0, y: 0 });
});

// ---- 카메라 배율: 화면의 짧은 변 기준 ----
test('zoomFor: 세로 화면은 짧은 변으로 배율을 정하고 긴 변을 월드 안에 담는다', () => {
  const cam = CONFIG.camera;
  const old = (size, width) =>
    Math.max(cam.minZoom, cam.baseZoom * Math.min(1, width / cam.portraitWidth) * ((cam.refSize ?? CONFIG.player.startSize) / size) ** cam.exponent);
  for (const [w, h] of [[360, 640], [390, 844], [585, 900], [800, 1200], [320, 480]]) {
    for (const size of [28, 40, 90, 400]) {
      near(zoomFor(size, w, h), Math.max(old(size, w), h / CONFIG.world.size));
      near(zoomFor(size, w), old(size, w));
    }
  }
});

test('zoomFor: 가로 화면은 높이(짧은 변)를 기준으로 잡아 시야가 너무 좁지 않다', () => {
  const portrait = zoomFor(28, 360, 740);
  const landscape = zoomFor(28, 740, 360);
  near(landscape, portrait);
  // 너비만 보던 예전 방식이라면 가로 폰에서 배율이 baseZoom(=1.18)으로 커져 세로 시야가 매우 좁았다.
  assert.ok(zoomFor(28, 740, 360) < CONFIG.camera.baseZoom);
  // 큰 화면(짧은 변이 portraitWidth 이상)은 그대로 baseZoom
  near(zoomFor(CONFIG.camera.refSize ?? CONFIG.player.startSize, 1280, 720), CONFIG.camera.baseZoom);
});

test('zoomFor: 커질수록 배율이 줄고 minZoom 아래로 내려가지 않는다', () => {
  assert.ok(zoomFor(100, 740, 360) < zoomFor(28, 740, 360));
  assert.equal(zoomFor(1e9, 740, 360), CONFIG.camera.minZoom);
});
