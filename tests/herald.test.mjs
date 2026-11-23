import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { createRivalState, rivalPlan } from '../src/systems/balance.js';
import {
  createHeraldState, heraldBonusYoryeok, heraldEnabled, heraldRetry, heraldSizeCap, heraldView, stepHerald,
} from '../src/systems/herald.js';

const H = CONFIG.herald;
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, a + ' ≈ ' + b);

// CONFIG.herald를 잠깐 바꿔서 실행하고 되돌린다.
function withHerald(patch, fn) {
  const saved = { ...CONFIG.herald };
  Object.assign(CONFIG.herald, patch);
  try {
    return fn();
  } finally {
    Object.assign(CONFIG.herald, saved);
  }
}

// dt초씩 sec초 동안 진행한다. 지시(spawn)가 나온 첫 순간까지의 결과를 돌려준다.
function run(state, sec, input = {}, step = 0.1) {
  const cues = [];
  let elapsed = 0;
  for (let i = 0; i < Math.round(sec / step); i++) {
    elapsed += step;
    const out = stepHerald(state, { dt: step, alive: 0, playerStage: 1, playerSize: 10, ...input }, () => 0.5);
    if (out.cue) cues.push({ cue: out.cue, at: +elapsed.toFixed(3) });
    if (out.spawn) return { spawn: out.spawn, at: +elapsed.toFixed(3), cues };
  }
  return { spawn: null, at: elapsed, cues };
}

test('기본 설정: 45초 간격, 크기 1.1~1.4배, 이름표 대요괴, 보상은 보패 1개', () => {
  assert.equal(H.enabled, true);
  assert.equal(H.intervalSec, 45);
  assert.equal(H.sizeMin, 1.1);
  assert.equal(H.sizeMax, 1.4);
  assert.equal(H.label, '대요괴');
  assert.equal(H.dropChance, undefined, '여의주 드롭 확률 추가 굴림은 보패 보상(heraldReward.js)으로 바뀌었다');
  assert.equal(H.reward.yoryeokMult, 2, '보패를 줄 수 없을 때의 요력 배수');
  assert.ok(H.bonusMult > 0);
  assert.ok(H.warnSec > 0 && H.warnSec < H.intervalSec);
});

test('실제 시간으로 intervalSec(45초)가 지나야 등장 지시가 나온다', () => {
  const state = createHeraldState();
  const early = run(state, 44.8);
  assert.equal(early.spawn, null);
  const late = run(state, 0.5);
  assert.ok(late.spawn, '45초를 넘기면 나온다');
  near(late.at + 44.8, 45, 0.11);
  // 다음 대요괴도 45초 뒤(타이머가 0으로 돌아간다)
  assert.equal(run(state, 44.5).spawn, null);
  assert.ok(run(state, 1).spawn);
});

test('모든 단계에서 나오고, 나와 같은 단계다(1단계 판에서도 2단계로 올리지 않는다)', () => {
  for (let stage = 1; stage <= 5; stage++) {
    const { spawn } = run(createHeraldState(), 46, { playerStage: stage });
    assert.ok(spawn, stage + '단계에서 나온다');
    assert.equal(spawn.stage, stage);
    assert.equal(spawn.herald, true);
  }
  // 이상한 단계 값도 1~5로 자른다
  assert.equal(run(createHeraldState(), 46, { playerStage: 99 }).spawn.stage, 5);
  assert.equal(run(createHeraldState(), 46, { playerStage: NaN }).spawn.stage, 1);
});

test('맞수(rivalPlan)와 겹치지 않는다: 맞수는 4·5단계만, 대요괴는 모든 단계', () => {
  for (const stage of [1, 2, 3]) {
    const rival = createRivalState();
    assert.equal(rivalPlan(stage, 10, rival, 1e6), null, stage + '단계에는 맞수가 없다');
    assert.ok(run(createHeraldState(), 46, { playerStage: stage }).spawn, stage + '단계에도 대요괴는 있다');
  }
  // 두 타이머는 따로 센다: 대요괴 상태를 돌려도 맞수 상태는 그대로다
  const rival = createRivalState();
  const herald = createHeraldState();
  run(herald, 30, { playerStage: 4 });
  assert.deepEqual(rival, { timer: 0, alive: 0 });
  assert.equal(rivalPlan(4, 10, rival, 1, () => 0.5), null);
});

test('크기는 내 크기의 1.1~1.4배: rng 0 → 1.1배, rng 1 → 1.4배, 중간값은 그 사이', () => {
  const at = (r, size = 10) => {
    const state = createHeraldState();
    return stepHerald(state, { dt: H.intervalSec, alive: 0, playerStage: 2, playerSize: size }, () => r).spawn.size;
  };
  near(at(0), 11);
  near(at(1), 14);
  near(at(0.5), 12.5);
  for (const size of [28 / 3, 50, 120]) {
    for (const r of [0, 0.3, 0.77, 1]) {
      const s = at(r, size);
      assert.ok(s >= size * H.sizeMin - 1e-9 && s <= size * H.sizeMax + 1e-9);
    }
  }
});

test('heraldSizeCap: 내 크기 × sizeMax, 절대 상한은 일반 적과 같다', () => {
  near(heraldSizeCap(10), 10 * H.sizeMax);
  assert.equal(heraldSizeCap(1e6), CONFIG.enemy.growthCap.maxSize);
  assert.equal(heraldSizeCap(0), 0);
  assert.equal(heraldSizeCap(NaN), 0);
});

test('대요괴가 살아 있는 동안은 타이머가 서 있다가, 사라진 뒤 intervalSec부터 다시 센다(동시에 maxAlive마리)', () => {
  const state = createHeraldState();
  assert.equal(run(state, 30).spawn, null);
  // 나와 있는 동안 100초가 흘러도 새로 나오지 않고 타이머는 0
  assert.equal(run(state, 100, { alive: H.maxAlive }).spawn, null);
  assert.equal(state.timer, 0);
  assert.equal(state.alive, H.maxAlive);
  // 사라진 직후부터 다시 45초
  assert.equal(run(state, 44.5).spawn, null);
  assert.ok(run(state, 1).spawn);
  // alive가 maxAlive 미만이면 센다(maxAlive를 올린 경우)
  withHerald({ maxAlive: 2 }, () => {
    const s = createHeraldState();
    assert.ok(run(s, 46, { alive: 1 }).spawn);
    assert.equal(run(createHeraldState(), 100, { alive: 2 }).spawn, null);
  });
});

test('남은 시간이 warnSec 이하가 되면 안내(cue warn)가 주기마다 한 번만 나온다', () => {
  const state = createHeraldState();
  const first = run(state, 46);
  assert.equal(first.cues.length, 1);
  assert.equal(first.cues[0].cue, 'warn');
  near(first.cues[0].at, H.intervalSec - H.warnSec, 0.11);
  // 다음 주기에도 한 번 더
  const second = run(state, 46);
  assert.equal(second.cues.length, 1);
  // 안내는 등장 시각 전에 난다
  assert.ok(first.cues[0].at < first.at);
});

test('자리를 못 찾으면 heraldRetry로 다음 호출에 바로 다시 지시를 받는다(안내는 다시 안 낸다)', () => {
  const state = createHeraldState();
  const { spawn } = run(state, 46);
  assert.ok(spawn);
  heraldRetry(state);
  const again = stepHerald(state, { dt: 0.016, alive: 0, playerStage: 3, playerSize: 10 }, () => 0.5);
  assert.ok(again.spawn);
  assert.equal(again.spawn.stage, 3);
  assert.equal(again.cue, null);
});

test('꺼져 있거나 플레이어 크기가 이상하면 나오지 않고 타이머는 0이다', () => {
  withHerald({ enabled: false }, () => {
    assert.equal(heraldEnabled(), false);
    const state = createHeraldState();
    assert.equal(run(state, 100).spawn, null);
    assert.equal(state.timer, 0);
    assert.equal(heraldView(state).mode, 'off');
  });
  withHerald({ intervalSec: 0 }, () => assert.equal(heraldEnabled(), false));
  for (const playerSize of [0, -5, NaN, undefined]) {
    const state = createHeraldState();
    assert.equal(run(state, 100, { playerSize }).spawn, null);
    assert.equal(state.timer, 0);
  }
});

test('dt가 음수·NaN이어도 타이머가 줄거나 망가지지 않는다', () => {
  const state = createHeraldState();
  stepHerald(state, { dt: 5, alive: 0, playerStage: 1, playerSize: 10 });
  const before = state.timer;
  for (const dt of [-3, NaN, undefined, Infinity * 0]) stepHerald(state, { dt, alive: 0, playerStage: 1, playerSize: 10 });
  assert.equal(state.timer, before);
});

test('heraldView: 세는 중 / 나와 있음 / 꺼짐, 게이지는 0~intervalSec 안', () => {
  const state = createHeraldState();
  let view = heraldView(state);
  assert.deepEqual(view, { mode: 'countdown', current: 0, target: H.intervalSec, remainSec: H.intervalSec, warn: false });
  run(state, 20);
  view = heraldView(state);
  assert.equal(view.mode, 'countdown');
  near(view.current, 20, 0.11);
  near(view.remainSec, 25, 0.11);
  assert.equal(view.warn, false);
  run(state, 20);
  view = heraldView(state);
  assert.equal(view.warn, true, '남은 시간이 warnSec 이하면 경고');
  assert.ok(view.current <= view.target);
  stepHerald(state, { dt: 0.1, alive: 1, playerStage: 1, playerSize: 10 });
  view = heraldView(state);
  assert.deepEqual(view, { mode: 'alive', current: H.intervalSec, target: H.intervalSec, remainSec: 0, warn: false });
});

test('heraldBonusYoryeok: 기본 요력 × bonusMult를 더한다(정수, 음수·NaN은 0)', () => {
  assert.equal(heraldBonusYoryeok(100), 100 * H.bonusMult);
  assert.equal(heraldBonusYoryeok(23.4), Math.round(23.4 * H.bonusMult));
  assert.equal(heraldBonusYoryeok(0), 0);
  assert.equal(heraldBonusYoryeok(-50), 0);
  assert.equal(heraldBonusYoryeok(NaN), 0);
  withHerald({ bonusMult: 5 }, () => assert.equal(heraldBonusYoryeok(10), 50));
  withHerald({ bonusMult: 0 }, () => assert.equal(heraldBonusYoryeok(10), 0));
  assert.ok(Number.isInteger(heraldBonusYoryeok(7.77)));
});
