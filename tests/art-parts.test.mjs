import test from 'node:test';
import assert from 'node:assert/strict';
import { FORMS } from '../src/data/forms.js';
import { PARTS_CATALOG, partScore } from '../src/data/parts-catalog.js';
import { decorate, paintCreature } from '../src/art/creature.js';

// 허용한 Graphics 명령만 제공한다. 글자, 비정상 좌표, 비어 있는 부품도 검출한다.
function recorder() {
  const calls = [];
  const g = {};
  for (const op of ['beginPath', 'moveTo', 'lineTo', 'closePath', 'fillStyle', 'fillPath', 'lineStyle',
    'strokePath', 'fillCircle', 'fillEllipse', 'strokeEllipse', 'save', 'restore', 'scaleCanvas',
    'translateCanvas', 'rotateCanvas']) {
    g[op] = (...args) => {
      assert.ok(args.every(Number.isFinite), op);
      calls.push([op, ...args]);
      return g;
    };
  }
  return { g, calls };
}

test('목록의 모든 부품과 수·띠 변형은 글자 없이 실제 도형을 그린다', () => {
  for (const [name, item] of Object.entries(PARTS_CATALOG)) {
    for (const args of [...(item.n ?? [1]).map(n => ({ n })), ...(item.keys ?? []).map(key => ({ key }))]) {
      const { g, calls } = recorder();
      paintCreature(g, { ...FORMS[0], parts: [[name, args]] }, 320);
      assert.ok(calls.some(([op]) => ['fillEllipse', 'strokePath', 'fillPath'].includes(op)), name);
    }
  }
});

test('171종을 그리며 3~5단계의 실제 그리기 목록이 단계별 장식 점수를 지킨다', () => {
  assert.equal(FORMS.length, 171);
  for (const form of FORMS) {
    const score = decorate(form).reduce((sum, part) => sum + partScore(part), 0);
    const limits = { 3: [3, 4], 4: [6, 8], 5: [10, 13] }[form.stage];
    if (limits) assert.ok(score >= limits[0] && score <= limits[1], form.id + ' ' + score);
    const { g, calls } = recorder();
    paintCreature(g, form, 128);
    assert.equal(calls.some(([op, width, color]) => op === 'lineStyle' && width === 11 && color === 0xfffdf1),
      form.stage >= 3 && form.branch === 'seon', form.id);
  }
});

test('광배·비단·문양만 있는 선 형태는 흰 실루엣을 남기지 않는다', () => {
  const { g, calls } = recorder();
  const parts = Object.keys(PARTS_CATALOG).filter(name => !PARTS_CATALOG[name].halo);
  paintCreature(g, { ...FORMS[0], stage: 5, branch: 'seon', parts }, 480);
  assert.ok(!calls.some(([op, width]) => op === 'lineStyle' && width === 11));
});
