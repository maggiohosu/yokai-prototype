import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { FORMS, FORM_BY_ID } from '../src/data/forms.js';
import { STEM_BY_ID } from '../src/data/stems.js';
import { boosterMult, createBooster, stepBooster, stepBoosterSim } from '../src/game/booster.js';

const B = CONFIG.booster;
const MAX = B.maxSec;
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, a + ' ≈ ' + b);
const H = 1 / 60;

// dt 간격으로 seconds만큼 흘린다. 이 구간에서 실제로 가속한 시간(초)의 합을 돌려준다.
function run(state, pressed, seconds, dt = H) {
  let t = 0;
  let boosted = 0;
  while (t < seconds - 1e-12) {
    const step = Math.min(dt, seconds - t);
    t += step;
    boosted += stepBooster(state, { pressed, dt: step, max: MAX }).boostSec;
  }
  return boosted;
}

test('설정값이 사용자 결정과 같다(2초·0.4초·5초·0.5초, 1.3배, 레벨당 0.02)', () => {
  assert.equal(B.maxSec, 2);
  assert.equal(B.minRestartSec, 0.4);
  assert.equal(B.regenFullSec, 5);
  assert.equal(B.regenDelaySec, 0.5);
  assert.equal(B.baseMult, 1.3);
  assert.equal(B.perSpeedLevel, 0.02);
});

// ---- 배율 공식 ----

test('배율: 줄기 보정 1.0·속도 레벨 0이면 1.3, 속도 +10이면 1.5', () => {
  near(boosterMult({ enh: { speed: 0 } }, { id: 'mimul' }), 1.3);
  near(boosterMult({ enh: { speed: 10 } }, { id: 'mimul' }), 1.5);
  near(boosterMult({ enh: { speed: 5 } }, { id: 'mimul' }), 1.4);
});

test('배율: 거북 보정(0.9)은 줄기 항에만 곱하고, 속도 레벨 항은 그대로 더한다', () => {
  near(boosterMult({ enh: { speed: 0 } }, FORM_BY_ID.littleTurtle), 1.3 * 0.9);
  near(boosterMult({ enh: { speed: 10 } }, FORM_BY_ID.darkTurtle), 1.3 * 0.9 + 0.2);
  assert.ok(boosterMult({ enh: { speed: 0 } }, FORM_BY_ID.crane) > boosterMult({ enh: { speed: 0 } }, FORM_BY_ID.mimul));
});

test('배율: 보정 순서는 form.stem → stems.js의 boostMult → 1.0', () => {
  const progress = { enh: { speed: 0 } };
  near(boosterMult(progress, { id: 'x', stem: 'N1' }), 1.3 * STEM_BY_ID.N1.boostMult, 1e-12); // 줄기 보정
  near(boosterMult(progress, { id: 'x', stem: 'W1' }), 1.3 * 1.2, 1e-12);
  near(boosterMult(progress, { id: 'mimul', stem: null }), 1.3, 1e-12); // 줄기가 없으면 1.0
  near(boosterMult(progress, { id: '줄기를 모르는 형태', stem: 'Z9' }), 1.3, 1e-12); // 모르는 줄기도 1.0
  near(boosterMult(progress, undefined), 1.3, 1e-12);
  near(boosterMult(progress, { id: 'x', stem: 'W1', boostMult: 'x' }), 1.3 * 1.2, 1e-12); // 숫자가 아닌 boostMult는 무시
  near(boosterMult(progress, { id: 'x', stem: 'W1', boostMult: 1.0 }), 1.3, 1e-12); // 형태가 직접 적은 숫자는 줄기보다 먼저
});

test('배율: 진행 정보가 비어 있어도 레벨 0, 레벨은 0~10으로 자른다', () => {
  near(boosterMult(undefined, { id: 'mimul' }), 1.3);
  near(boosterMult({}, { id: 'mimul' }), 1.3);
  near(boosterMult({ enh: { speed: -3 } }, { id: 'mimul' }), 1.3);
  near(boosterMult({ enh: { speed: 99 } }, { id: 'mimul' }), 1.5);
});

test('줄기 보정 표: 임시 형태 표(CONFIG.booster.formMult)는 없고, 모든 형태가 줄기 보정 0.9~1.2 안이다', () => {
  assert.equal(B.formMult, undefined);
  assert.equal(FORMS.length, 171);
  for (const form of FORMS) {
    const mult = boosterMult({ enh: { speed: 0 } }, form) / B.baseMult;
    assert.ok(mult >= 0.9 - 1e-12 && mult <= 1.2 + 1e-12, form.id + ' ' + mult);
  }
  near(boosterMult({ enh: { speed: 0 } }, FORM_BY_ID.mimul), 1.3); // mimul은 줄기가 없어 1.0
  near(boosterMult({ enh: { speed: 0 } }, FORM_BY_ID.littleTurtle), 1.3 * 0.9); // N1
  near(boosterMult({ enh: { speed: 0 } }, FORM_BY_ID.baekho), 1.3 * 1.2); // W1: 설계값 1.20(옛 임시 표의 1.1~1.15와 다르다)
  near(boosterMult({ enh: { speed: 0 } }, FORM_BY_ID.jujak), 1.3 * 1.2); // S1: 1.20
  near(boosterMult({ enh: { speed: 10 } }, FORM_BY_ID.darkTurtle), 1.3 * 0.9 + 0.2); // 속도 레벨 항은 그대로 더한다
});

// ---- 게이지 소모 ----

test('가득 시작하고, 누르는 동안 시뮬레이션 시간만큼 닳는다', () => {
  const state = createBooster(MAX);
  assert.deepEqual(state, { value: 2, sinceRelease: Infinity, locked: false });
  const boosted = run(state, true, 1);
  near(boosted, 1, 1e-9);
  near(state.value, 1, 1e-9);
  assert.equal(state.locked, false);
});

test('누르지 않으면 닳지 않고 가속도 없다', () => {
  const state = createBooster(MAX);
  assert.deepEqual(stepBooster(state, { pressed: false, dt: 1, max: MAX }), { boosting: false, boostSec: 0 });
  assert.equal(state.value, MAX);
});

test('게이지가 0이 되면 가속이 끝난다: 계속 눌러도 총 가속 시간은 정확히 2초', () => {
  const state = createBooster(MAX);
  const boosted = run(state, true, 5);
  near(boosted, MAX, 1e-9);
  assert.equal(state.value, 0);
  assert.equal(state.locked, true);
  assert.deepEqual(stepBooster(state, { pressed: true, dt: H, max: MAX }), { boosting: false, boostSec: 0 });
});

test('한 단계 도중 바닥나면 남은 만큼만 가속한다(큰 dt에서도 거리가 정확)', () => {
  const state = { value: 0.05, sinceRelease: 0, locked: false };
  const step = stepBooster(state, { pressed: true, dt: 0.2, max: MAX });
  assert.equal(step.boosting, true);
  near(step.boostSec, 0.05);
  assert.equal(state.value, 0);
  assert.equal(state.locked, true);
});

test('단계를 잘게 나누든 크게 나누든 같은 결과다', () => {
  const fine = createBooster(MAX);
  const coarse = createBooster(MAX);
  const a = run(fine, true, 1.3, H) + run(fine, false, 2.2, H);
  const b = run(coarse, true, 1.3, 0.26) + run(coarse, false, 2.2, 0.55);
  near(a, b, 1e-9);
  near(fine.value, coarse.value, 1e-9);
});

// ---- 회복과 지연 ----

test('뗀 직후 regenDelaySec(0.5초) 동안은 회복하지 않는다', () => {
  const state = createBooster(MAX);
  run(state, true, 1);
  const drained = state.value;
  run(state, false, B.regenDelaySec - 0.01);
  near(state.value, drained, 1e-9);
  run(state, false, 0.01 + 1);
  near(state.value, drained + 1 * (MAX / B.regenFullSec), 1e-9);
});

test('빈 상태에서 가득 차기까지 지연 0.5초 + 5초', () => {
  const state = createBooster(MAX);
  run(state, true, 5);
  assert.equal(state.value, 0);
  run(state, false, B.regenDelaySec + B.regenFullSec - 0.02);
  assert.ok(state.value < MAX);
  run(state, false, 0.04);
  assert.equal(state.value, MAX);
  run(state, false, 10);
  assert.equal(state.value, MAX, '가득 차면 넘치지 않는다');
});

test('회복은 큰 dt 한 번으로 지연을 넘겨도 지연 이후 시간만 계산한다', () => {
  const state = { value: 0, sinceRelease: 0, locked: true };
  stepBooster(state, { pressed: false, dt: 1, max: MAX });
  near(state.value, (1 - B.regenDelaySec) * (MAX / B.regenFullSec));
});

test('다시 누르면 회복 지연이 처음부터다', () => {
  const state = createBooster(MAX);
  run(state, true, 0.5);
  run(state, false, 0.4);
  run(state, true, 0.2);
  const before = state.value;
  run(state, false, B.regenDelaySec - 0.02);
  near(state.value, before, 1e-9);
});

test('바닥난 채로 계속 누르고 있는 동안은 회복하지 않는다(떼야 회복)', () => {
  const state = createBooster(MAX);
  run(state, true, 2);
  run(state, true, 10);
  assert.equal(state.value, 0);
  run(state, false, B.regenDelaySec);
  assert.equal(state.value, 0, '뗀 직후 지연');
  run(state, false, 1);
  assert.ok(state.value > 0);
});

// ---- 재가속 조건 ----

test('재가속: 바닥난 뒤에는 minRestartSec(0.4초) 이상 찰 때까지 눌러도 가속하지 않는다', () => {
  const state = createBooster(MAX);
  run(state, true, 2);
  // 지연 0.5초 + 0.9초 회복 = 0.36초(0.4 미만)
  run(state, false, B.regenDelaySec + 0.9);
  assert.ok(state.value < B.minRestartSec);
  assert.equal(state.locked, true);
  assert.equal(stepBooster(state, { pressed: true, dt: H, max: MAX }).boosting, false, '0.4 미만에서는 안 켜진다');
  // 다시 떼고 0.4 이상까지 회복하면 켜진다. 지연 0.5초 + 1.0초 = 0.4초.
  run(state, false, B.regenDelaySec + 1.0 + 0.01);
  assert.ok(state.value >= B.minRestartSec - 1e-9);
  assert.equal(state.locked, false);
  const step = stepBooster(state, { pressed: true, dt: H, max: MAX });
  assert.equal(step.boosting, true);
  near(step.boostSec, H);
});

test('재가속: 0.4초가 막 찼을 때 다시 눌러 가속하면 그만큼만 가속하고 또 잠긴다', () => {
  const state = createBooster(MAX);
  run(state, true, 2);
  run(state, false, B.regenDelaySec + B.minRestartSec / (MAX / B.regenFullSec) + 0.001);
  const boosted = run(state, true, 3);
  assert.ok(boosted >= B.minRestartSec - 1e-9 && boosted < B.minRestartSec + 0.01, '가속 ' + boosted);
  assert.equal(state.locked, true);
});

test('바닥나지 않고 뗀 경우에는 남은 게이지가 적어도 바로 다시 가속한다', () => {
  const state = createBooster(MAX);
  run(state, true, 1.9); // 0.1초 남김
  run(state, false, 0.1);
  assert.equal(state.locked, false);
  const boosted = run(state, true, 1);
  assert.ok(boosted > 0.09 && boosted <= 0.1 + 1e-9, '가속 ' + boosted);
});

test('시뮬레이션 단계로 흘려도 화면 시간 기준 2초 가속·회복 지연 0.5초·회복 5초가 유지된다(속도 곡선 1/3~1.5배)', () => {
  for (const pace of [1 / 3, 1, 1.5]) {
    const scale = CONFIG.tempo * pace;
    const h = 0.02; // 시뮬레이션 단계
    const state = createBooster(MAX);
    let screen = 0;
    let boostedSim = 0;
    while (screen < 5) {
      screen += h / scale;
      boostedSim += stepBoosterSim(state, { pressed: true, h, scale, max: MAX }).boostSec;
    }
    near(boostedSim / scale, MAX, 1e-9); // 화면 시간 2초만 가속
    assert.equal(state.locked, true);
    screen = 0;
    while (screen < B.regenDelaySec + B.regenFullSec - 0.05) {
      screen += h / scale;
      stepBoosterSim(state, { pressed: false, h, scale, max: MAX });
    }
    assert.ok(state.value < MAX);
    for (let i = 0; i < 20; i++) stepBoosterSim(state, { pressed: false, h, scale, max: MAX });
    assert.equal(state.value, MAX);
  }
});

test('최대치가 줄면 현재치를 자른다', () => {
  const state = createBooster(3);
  stepBooster(state, { pressed: false, dt: 0, max: 1 });
  assert.equal(state.value, 1);
});
