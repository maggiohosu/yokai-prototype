import test from 'node:test';
import assert from 'node:assert/strict';
import { viewportBounds } from '../src/main.js';

const layout = { innerWidth: 844, innerHeight: 390 };

test('주소창이 보이면 실제 표시 영역의 크기와 원점을 쓴다', () => {
  const visualViewport = { width: 843.5, height: 314.25, offsetLeft: 0.5, offsetTop: 12 };
  assert.deepEqual(viewportBounds({ ...layout, visualViewport }), {
    width: 843.5, height: 314.25, left: 0.5, top: 12,
  });
});

test('표시 영역 API가 없거나 회전 중 한 변이 0이면 창 크기를 쓴다', () => {
  for (const visualViewport of [undefined, { width: 844, height: 0 }, { width: 0, height: 390 }]) {
    assert.deepEqual(viewportBounds({ ...layout, visualViewport }), {
      width: 844, height: 390, left: 0, top: 0,
    });
  }
});
