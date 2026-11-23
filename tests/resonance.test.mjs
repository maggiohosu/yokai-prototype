import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, REGIONS } from '../src/config.js';
import { RESONANCE_DIRS, createResonanceState, recordMeal, resonanceRule, resonanceView } from '../src/systems/resonance.js';

const R = CONFIG.resonance;

// CONFIG.resonance를 잠깐 바꿔서 실행하고 되돌린다(streak·cycle 안쪽 객체도 복사해 둔다).
function withResonance(patch, fn) {
  const saved = { ...CONFIG.resonance, streak: { ...CONFIG.resonance.streak }, cycle: { ...CONFIG.resonance.cycle } };
  Object.assign(CONFIG.resonance, patch);
  try {
    return fn();
  } finally {
    Object.assign(CONFIG.resonance, saved);
  }
}

// 방위 목록을 1초 간격으로 먹이고, 터진 결과를 [{ at, hit }]로 돌려준다. 먹이 요력은 기본 10.
function feed(state, dirs, { gain = 10, start = 0, step = 1 } = {}) {
  const hits = [];
  dirs.forEach((dir, i) => {
    const hit = recordMeal(state, { dir, gain: Array.isArray(gain) ? gain[i] : gain }, start + i * step);
    if (hit) hits.push({ at: i, hit });
  });
  return hits;
}

const E = 'east', W = 'west', S = 'south', N = 'north';

test('기본 설정: 규칙 both, 같은 방위 3연속, 방위 4곳은 지도(REGIONS)와 같다', () => {
  assert.equal(R.rule, 'both');
  assert.equal(R.streak.length, 3);
  assert.ok(R.streak.bonus > 0 && R.cycle.bonus > 0);
  assert.equal(resonanceRule(), 'both');
  assert.deepEqual([...RESONANCE_DIRS].sort(), Object.keys(REGIONS).sort());
});

test('규칙 A: 같은 방위 3연속이면 터지고 보너스 = 세 먹이 요력의 합 × streak.bonus', () => {
  const state = createResonanceState();
  const hits = feed(state, [S, S, S], { gain: [10, 20, 30] });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].at, 2, '세 번째에 터진다');
  assert.deepEqual(hits[0].hit, {
    rule: 'streak', dir: S, dirs: [S, S, S], count: 3, base: 60, bonus: Math.round(60 * R.streak.bonus),
  });
  assert.deepEqual(state.recent, [], '터지면 연쇄를 비운다');
});

test('규칙 A: 두 마리째에서 다른 방위가 끼면 끊긴다, 터진 뒤 같은 방위는 처음부터 다시 센다', () => {
  assert.deepEqual(feed(createResonanceState(), [E, E, W, E, E]), []);
  assert.equal(feed(createResonanceState(), [E, E, W, E, E, E]).length, 1);
  const state = createResonanceState();
  const hits = feed(state, [N, N, N, N, N, N, N]);
  assert.deepEqual(hits.map((h) => h.at), [2, 5], '3마리마다 한 번(4번째는 새 연쇄의 첫 마리)');
});

test('규칙 B: 연달아 4마리가 동·서·남·북을 한 번씩이면 터지고, 순서는 상관없다', () => {
  for (const order of [[E, W, S, N], [N, S, W, E], [S, E, N, W]]) {
    const state = createResonanceState();
    const hits = feed(state, order, { gain: [10, 10, 10, 10] });
    assert.equal(hits.length, 1);
    assert.equal(hits[0].at, 3);
    assert.equal(hits[0].hit.rule, 'cycle');
    assert.equal(hits[0].hit.dir, null);
    assert.deepEqual(hits[0].hit.dirs, order);
    assert.equal(hits[0].hit.count, 4);
    assert.equal(hits[0].hit.base, 40);
    assert.equal(hits[0].hit.bonus, Math.round(40 * R.cycle.bonus));
    assert.deepEqual(state.recent, []);
  }
});

test('규칙 B: 같은 방위가 끼면 거기서 끊기고, 앞의 한 마리는 빠진 채 이어서 채울 수 있다', () => {
  assert.deepEqual(feed(createResonanceState(), [E, W, S, S, N]), [], '남이 두 번이라 마지막 4마리가 서로 다르지 않다');
  // E, W, E, S, N → 마지막 4마리(W, E, S, N)가 서로 달라 N에서 터진다. 보너스는 그 4마리 요력만 센다.
  const hits = feed(createResonanceState(), [E, W, E, S, N], { gain: [1000, 10, 10, 10, 10] });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].at, 4);
  assert.deepEqual(hits[0].hit.dirs, [W, E, S, N]);
  assert.equal(hits[0].hit.base, 40);
});

test('규칙 선택: streak은 한 바퀴를, cycle은 3연속을 무시한다. both는 둘 다, off는 아무것도 안 터진다', () => {
  const run3 = [S, S, S], cycle4 = [E, W, S, N];
  withResonance({ rule: 'streak' }, () => {
    assert.equal(feed(createResonanceState(), run3).length, 1);
    assert.equal(feed(createResonanceState(), cycle4).length, 0);
  });
  withResonance({ rule: 'cycle' }, () => {
    assert.equal(feed(createResonanceState(), run3).length, 0);
    assert.equal(feed(createResonanceState(), cycle4).length, 1);
  });
  withResonance({ rule: 'both' }, () => {
    assert.equal(feed(createResonanceState(), run3).length, 1);
    assert.equal(feed(createResonanceState(), cycle4).length, 1);
  });
  withResonance({ rule: 'off' }, () => {
    const state = createResonanceState();
    assert.equal(feed(state, [...run3, ...cycle4]).length, 0);
    assert.deepEqual(state.recent, [], '꺼져 있으면 기록도 하지 않는다');
  });
  // 모르는 값은 기본(both)으로 본다
  withResonance({ rule: '잘못된 값' }, () => {
    assert.equal(resonanceRule(), 'both');
    assert.equal(feed(createResonanceState(), run3).length, 1);
  });
});

test('같은 먹기에서 두 규칙이 동시에 터지지 않는다(무작위 5천 마리)', () => {
  let seed = 99;
  const rng = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const state = createResonanceState();
  let streaks = 0, cycles = 0;
  for (let i = 0; i < 5000; i++) {
    const dir = RESONANCE_DIRS[Math.floor(rng() * 4)];
    const hit = recordMeal(state, { dir, gain: 10 }, i);
    if (!hit) continue;
    assert.ok(['streak', 'cycle'].includes(hit.rule));
    if (hit.rule === 'streak') {
      streaks++;
      assert.equal(new Set(hit.dirs).size, 1);
      assert.equal(hit.count, R.streak.length);
    } else {
      cycles++;
      assert.equal(new Set(hit.dirs).size, 4);
    }
    assert.equal(state.recent.length, 0);
  }
  assert.ok(streaks > 50 && cycles > 50, '둘 다 실제로 터진다: ' + streaks + ' / ' + cycles);
});

test('windowSec가 지나면 연쇄가 끊긴다(마지막으로 먹은 시각 기준), 안에서는 이어진다', () => {
  const state = createResonanceState();
  recordMeal(state, { dir: E, gain: 10 }, 0);
  recordMeal(state, { dir: E, gain: 10 }, R.windowSec); // 딱 windowSec: 아직 이어진다
  assert.ok(recordMeal(state, { dir: E, gain: 10 }, R.windowSec * 2), '간격이 각각 windowSec 이하면 이어진다');
  const gap = createResonanceState();
  recordMeal(gap, { dir: E, gain: 10 }, 0);
  recordMeal(gap, { dir: E, gain: 10 }, 1);
  assert.equal(recordMeal(gap, { dir: E, gain: 10 }, 1 + R.windowSec + 0.01), null, '끊긴 뒤 첫 마리는 새 연쇄의 시작');
  assert.equal(gap.recent.length, 1);
  withResonance({ windowSec: Infinity }, () => {
    const s = createResonanceState();
    recordMeal(s, { dir: S, gain: 10 }, 0);
    recordMeal(s, { dir: S, gain: 10 }, 1e6);
    assert.ok(recordMeal(s, { dir: S, gain: 10 }, 2e6));
  });
});

test('방위가 네 곳이 아닌 먹이는 세지 않고 연쇄도 끊지 않는다', () => {
  const state = createResonanceState();
  recordMeal(state, { dir: S, gain: 10 }, 0);
  assert.equal(recordMeal(state, { dir: 'none', gain: 10 }, 1), null);
  assert.equal(recordMeal(state, { dir: undefined, gain: 10 }, 2), null);
  recordMeal(state, { dir: S, gain: 10 }, 3);
  assert.ok(recordMeal(state, { dir: S, gain: 10 }, 4));
});

test('gain이 없거나 이상해도 보너스는 0 이상의 정수다', () => {
  // feed()의 gain 기본값(10)이 undefined를 가리지 않게 배열로 넘긴다.
  for (const gain of [undefined, NaN, -5, 0]) {
    const hits = feed(createResonanceState(), [E, E, E], { gain: [gain, gain, gain] });
    assert.equal(hits[0].hit.bonus, 0);
  }
  const hit = feed(createResonanceState(), [E, E, E], { gain: [3.3, 3.3, 3.3] })[0].hit;
  assert.ok(Number.isInteger(hit.bonus));
  withResonance({ streak: { length: 3, bonus: 1 } }, () => assert.equal(feed(createResonanceState(), [E, E, E], { gain: 10 })[0].hit.bonus, 30));
});

test('streak.length를 바꾸면 따라간다(2 미만은 2로)', () => {
  withResonance({ streak: { length: 4, bonus: 0.3 } }, () => {
    assert.equal(feed(createResonanceState(), [E, E, E]).length, 0);
    assert.equal(feed(createResonanceState(), [E, E, E, E]).length, 1);
  });
  withResonance({ streak: { length: 1, bonus: 0.3 } }, () => {
    assert.equal(feed(createResonanceState(), [E]).length, 0, '1마리만으로는 안 터진다');
    assert.equal(feed(createResonanceState(), [E, E]).length, 1);
  });
});

test('resonanceView: 이어진 같은 방위 수와 서로 다른 방위 목록, 규칙에서 꺼진 쪽은 비어 있다', () => {
  const state = createResonanceState();
  assert.deepEqual(resonanceView(state, 0), { rule: 'both', streak: { dir: null, count: 0, length: 3 }, cycle: { dirs: [], length: 4 }, remainSec: 0 });
  recordMeal(state, { dir: E, gain: 10 }, 0);
  recordMeal(state, { dir: W, gain: 10 }, 1);
  let view = resonanceView(state, 1);
  assert.deepEqual(view.streak, { dir: W, count: 1, length: 3 });
  assert.deepEqual(view.cycle.dirs, [E, W]);
  recordMeal(state, { dir: W, gain: 10 }, 2);
  view = resonanceView(state, 2);
  assert.deepEqual(view.streak, { dir: W, count: 2, length: 3 });
  assert.deepEqual(view.cycle.dirs, [W], '같은 방위가 나오면 한 바퀴는 거기서부터 다시');
  assert.equal(view.remainSec, R.windowSec);
  view = resonanceView(state, 2 + 3);
  assert.equal(view.remainSec, R.windowSec - 3);
  withResonance({ rule: 'streak' }, () => {
    const v = resonanceView(state, 2);
    assert.equal(v.streak.count, 2);
    assert.deepEqual(v.cycle.dirs, []);
  });
  withResonance({ rule: 'cycle' }, () => {
    const v = resonanceView(state, 2);
    assert.equal(v.streak.count, 0);
    assert.deepEqual(v.cycle.dirs, [W]);
  });
});

test('resonanceView: 시간이 지나 끊긴 연쇄는 비어 있고, 터지면 비워진다', () => {
  const state = createResonanceState();
  feed(state, [E, W]);
  assert.equal(resonanceView(state, 1).cycle.dirs.length, 2);
  const stale = resonanceView(state, 1 + R.windowSec + 0.5);
  assert.equal(stale.streak.count, 0);
  assert.deepEqual(stale.cycle.dirs, []);
  assert.equal(stale.remainSec, 0);
  const done = createResonanceState();
  feed(done, [S, S, S]);
  assert.equal(resonanceView(done, 3).streak.count, 0);
});

test('먹이 사이 간격이 짧은 일반 플레이: 같은 방위가 몰려 있을 때 규칙 A가 4색 섞일 때보다 자주 터진다', () => {
  // 한 구역(같은 방위가 72%)을 지나는 상황과 네 방위가 고르게 섞인 상황의 터지는 횟수를 센다(비교용 기록, 단언은 느슨하게).
  let seed = 7;
  const rng = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const count = (pick, rule) => withResonance({ rule }, () => {
    const state = createResonanceState();
    let hits = 0;
    for (let i = 0; i < 2000; i++) if (recordMeal(state, { dir: pick(), gain: 10 }, i)) hits++;
    return hits;
  });
  const zone = () => (rng() < 0.72 ? S : RESONANCE_DIRS[Math.floor(rng() * 4)]);
  const mixed = () => RESONANCE_DIRS[Math.floor(rng() * 4)];
  const streakZone = count(zone, 'streak'), streakMixed = count(mixed, 'streak');
  const cycleZone = count(zone, 'cycle'), cycleMixed = count(mixed, 'cycle');
  assert.ok(streakZone > streakMixed, '한 구역에서는 같은 색 3연속이 잘 나온다: ' + streakZone + ' > ' + streakMixed);
  assert.ok(cycleMixed > cycleZone, '네 방위를 오가면 한 바퀴가 잘 나온다: ' + cycleMixed + ' > ' + cycleZone);
});
