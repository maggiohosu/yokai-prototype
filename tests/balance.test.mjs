import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { preyValue } from '../src/systems/rules.js';
import { zoomFor } from '../src/game/camera.js';
import { applyWorldScale } from '../src/systems/worldScale.js';
import {
  ascension, createRivalState, growthDamping, growthGain, playerFeelMultiplier, playerSpeedMultiplier,
  easePace, rivalPlan, rivalRetry, rivalSizeCap, sizeSpeedMultiplier, stageZoomMultiplier, tempoMultiplier, upkeep,
} from '../src/systems/balance.js';

const B = CONFIG.balance;
const at = (stage, speed = 0) => ({ stage, enh: { growth: 0, speed, vitality: 0 } });
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, a + ' ≈ ' + b);
// 플레이어·적이 예전의 1/3 크기에서 시작하도록 바뀌었다(커밋 25c7d7f). 크기 값은 '예전 수치 × K'로 쓴다.
const K = 1 / 3;
// 예전 속도 곡선(2단계에서 제거됨): f = 1/3 → 1.5가 템포와 플레이어 속도에 두 번 곱해졌다. 비교용 상수.
const OLD_F = { min: 1 / 3, max: 1.5 };

// ---- 속도: 단계 곡선은 템포에만, 이동 속도 강화는 플레이어 속도에만 ----
test('tempoMultiplier: 단계별 1/3, 0.6, 0.85, 1.0, 1.1', () => {
  near(tempoMultiplier(at(1)), 1 / 3);
  near(tempoMultiplier(at(2)), 0.6);
  near(tempoMultiplier(at(3)), 0.85);
  near(tempoMultiplier(at(4)), 1.0);
  near(tempoMultiplier(at(5)), 1.1);
});

test('tempoMultiplier는 단계가 오를수록 커지고, 이동 속도 강화 레벨과 무관하며, 이상한 입력도 1~5단계로 자른다', () => {
  for (let stage = 1; stage <= 5; stage++) {
    if (stage > 1) assert.ok(tempoMultiplier(at(stage)) > tempoMultiplier(at(stage - 1)));
    for (const level of [0, 5, 10]) near(tempoMultiplier(at(stage, level)), tempoMultiplier(at(stage, 0)));
  }
  near(tempoMultiplier(at(99)), B.pace.stageMult[5]);
  near(tempoMultiplier(at(-3)), B.pace.stageMult[1]);
  near(tempoMultiplier({}), B.pace.stageMult[1]);
  near(tempoMultiplier(undefined), B.pace.stageMult[1]);
  near(tempoMultiplier({ stage: NaN }), B.pace.stageMult[1]);
});

test('playerSpeedMultiplier: baseMult 0.5 × (1 + 0.04 × 이동 속도 강화 레벨)(+10이면 기본의 1.4배), 단계와 무관', () => {
  const base = B.pace.baseMult;
  assert.equal(base, 0.5);
  near(playerSpeedMultiplier(at(1, 0)), base);
  near(playerSpeedMultiplier(at(1, 5)), base * 1.2);
  near(playerSpeedMultiplier(at(1, 10)), base * 1.4);
  for (let stage = 1; stage <= 5; stage++) near(playerSpeedMultiplier(at(stage, 7)), base * 1.28);
  for (let level = 1; level <= 10; level++) assert.ok(playerSpeedMultiplier(at(1, level)) > playerSpeedMultiplier(at(1, level - 1)));
  near(playerSpeedMultiplier(at(1, 99)), base * 1.4);
  near(playerSpeedMultiplier(at(1, -4)), base);
  near(playerSpeedMultiplier({ stage: 3 }), base);
  near(playerSpeedMultiplier({ stage: 3, enh: {} }), base);
});

test('플레이어 체감 배율(템포 × 속도): 5단계·+10은 1단계·+0의 약 4.6배(예전 f²는 약 20배)', () => {
  const ratio = playerFeelMultiplier(at(5, 10)) / playerFeelMultiplier(at(1, 0));
  assert.ok(ratio > 4.55 && ratio < 4.7, '체감 배율 ' + ratio);
  near(ratio, (1.1 * 1.4) / (1 / 3));
  // 예전 곡선: f = 1/3 → 1.5가 템포와 플레이어 속도에 두 번 곱해졌다.
  const old = (OLD_F.max / OLD_F.min) ** 2;
  assert.ok(old > 20 && ratio < old / 4);
  // 이동 속도 강화는 템포(= 적·발사체·쿨타임)에는 영향이 없고 플레이어에게만 곱해진다.
  near(playerFeelMultiplier(at(3, 10)) / playerFeelMultiplier(at(3, 0)), 1.4);
});

test('1단계 플레이어 실제 속도 약 170: 예전(113)의 1.5배, 1단계 추격 적의 약 1.73배', () => {
  const real = CONFIG.player.speed * CONFIG.tempo * tempoMultiplier(at(1)) * playerSpeedMultiplier(at(1, 0));
  const old = CONFIG.player.speed * CONFIG.tempo * OLD_F.min ** 2;
  const enemy = CONFIG.enemy.chaseSpeed * CONFIG.enemy.earlySpeedMult[1] * CONFIG.tempo * tempoMultiplier(at(1));
  // 사용자 지시(2026-11-23): 나·적 기본 속도 0.5배 → 실제 속도도 절반(약 85), 비율은 그대로
  assert.ok(Math.abs(real - 170.3 * 0.5) < 0.5, '1단계 속도 ' + real);
  assert.ok(Math.abs(real / old - 1.5) < 0.01, '예전 대비 ' + real / old);
  assert.ok(Math.abs(real / enemy - 1.733) < 0.01, '적 대비 ' + real / enemy);
});

test('이동 속도 레벨 0의 플레이어도 어느 단계에서든 도망치는 적보다 느리지 않다(3단계부터 1.01배)', () => {
  const { speed } = CONFIG.player;
  const { fleeSpeed } = CONFIG.enemy;
  for (let stage = 1; stage <= 5; stage++) {
    const early = CONFIG.enemy.earlySpeedMult[stage] ?? 1;
    // 템포는 플레이어와 적에 똑같이 곱해지므로 시뮬레이션 초당 속도로 비교하면 된다.
    const ratio = (speed * playerSpeedMultiplier(at(stage, 0))) / (fleeSpeed * early);
    assert.ok(ratio >= 1, `stage ${stage}: ${ratio}`);
  }
  near((speed * B.pace.baseMult) / fleeSpeed, 131 / 130);
});

test('플레이어는 같은 단계의 추격 적(맞수 포함)보다 빠르다: 3단계부터 속도비는 일정하고 이동 속도 레벨이 키운다', () => {
  const { speed } = CONFIG.player;
  const { chaseSpeed } = CONFIG.enemy;
  for (let stage = 1; stage <= 5; stage++) {
    const early = CONFIG.enemy.earlySpeedMult[stage] ?? 1;
    const ratio0 = (speed * playerSpeedMultiplier(at(stage, 0))) / (chaseSpeed * early);
    const ratio10 = (speed * playerSpeedMultiplier(at(stage, 10))) / (chaseSpeed * early);
    assert.ok(ratio0 > 1 && ratio10 > ratio0, `stage ${stage}: ${ratio0} ${ratio10}`);
    if (stage >= 3) near(ratio0, (CONFIG.player.speed * B.pace.baseMult) / chaseSpeed);
  }
});

// ---- 성장 둔화 ----
test('growthGain: refSize 이하에서는 예전 식과 같다', () => {
  const a = CONFIG.eating.areaGain;
  for (const size of [28 * K, 60 * K, B.growth.refSize]) {
    near(growthDamping(size), 1);
    near(growthGain(size, 40 * K, a), Math.sqrt(size ** 2 + a * (40 * K) ** 2));
  }
});

test('growthGain: 클수록 같은 먹이로 덜 자란다(둔화 계수 단조 감소, 증가분 단조 감소)', () => {
  const a = CONFIG.eating.areaGain;
  const prey = 80 * K;
  let lastDamp = 1, lastDelta = Infinity;
  for (let size = 50 * K; size <= 700 * K; size += 10 * K) {
    const damp = growthDamping(size);
    const next = growthGain(size, prey, a);
    const delta = next - size;
    assert.ok(damp <= lastDamp + 1e-12, `size=${size} damping`);
    assert.ok(delta > 0 && delta <= lastDelta + 1e-12, `size=${size} delta ${delta} > ${lastDelta}`);
    if (size > B.growth.refSize * (1 + 1e-9)) assert.ok(next < Math.sqrt(size ** 2 + a * prey ** 2), `size=${size}: 둔화가 적용되어야 한다`);
    lastDamp = damp;
    lastDelta = delta;
  }
  near(growthDamping(B.growth.refSize * 4), Math.pow(0.25, B.growth.exp));
  near(growthDamping(600 * K), Math.pow(150 / 600, 0.5));
});

test('growthGain: 먹이가 크거나 areaGain이 크면 더 자라고, 아무 것도 먹지 않으면 그대로이며, 줄거나 NaN이 되지 않는다', () => {
  assert.ok(growthGain(100, 33, 0.32) > growthGain(100, 17, 0.32));
  assert.ok(growthGain(100, 33, 0.576) > growthGain(100, 33, 0.32));
  near(growthGain(100, 0, 0.32), 100);
  near(growthGain(100, 33, 0), 100);
  for (const size of [1, 28 * K, 250 * K, 450 * K, 2000]) for (const prey of [0, 1, 70 * K, 140 * K, 600]) {
    const next = growthGain(size, prey, 0.32);
    assert.ok(Number.isFinite(next) && next >= size);
  }
  near(growthGain(100, NaN, 0.32), 100);
  near(growthGain(100, -17, 0.32), 100);
});

// ---- 크기 유지비 ----
test('upkeep: start 아래·start에서는 그대로, 위에서는 초당 rate × (크기 - start)만큼 준다', () => {
  const { start, rate } = B.upkeep;
  for (const size of [1, 28 * K, start - 1, start]) near(upkeep(size, 5), size);
  near(upkeep(150, 1), 150 - rate * (150 - start));
  near(upkeep(150, 0.5), 150 - rate * (150 - start) * 0.5);
  near(upkeep(100, 1 / 60), 100 - (rate * (100 - start)) / 60);
  near(upkeep(150, 0), 150);
  near(upkeep(150, -1), 150);
  near(upkeep(150, NaN), 150);
});

test('upkeep: start 아래로 내려가지 않고, 클수록 더 많이 줄며, 큰 dt에도 start에서 멈춘다', () => {
  const { start } = B.upkeep;
  assert.equal(upkeep(100, 1e6), start);
  assert.ok(upkeep(100, 100) >= start);
  let lastLoss = 0;
  for (let size = start + 3; size <= 700 * K; size += 3) {
    const loss = size - upkeep(size, 1);
    assert.ok(loss > lastLoss, `size=${size}`);
    lastLoss = loss;
  }
  // 작은 단계로 오래 돌려도 start 아래로 내려가지 않고 start로 수렴한다.
  let size = 600 * K;
  for (let i = 0; i < 60 * 600; i++) size = upkeep(size, 1 / 60);
  assert.ok(size >= start && size < start + 1, '600초 뒤 ' + size);
});

// ---- 균형점: 같은 먹이 속도에서 크기가 어디로 수렴하는가 ----
// 시뮬레이션 시간 1/60초 단계로, 초당 bites마리의 크기 prey인 먹이를 일정하게 먹는다.
function simulate({ start, bites, prey, areaGain = CONFIG.eating.areaGain, seconds = 900, gain = growthGain, keep = upkeep }) {
  const dt = 1 / 60;
  let size = start, acc = 0, sum = 0, n = 0;
  for (let t = 0; t < seconds; t += dt) {
    acc += bites * dt;
    while (acc >= 1) {
      size = gain(size, prey, areaGain);
      acc -= 1;
    }
    size = keep(size, dt);
    if (t > seconds - 60) { sum += size; n++; }
  }
  return { final: size, mean: sum / n };
}

// 균형 조건 bites × (growthGain - size) = rate × (size - start)의 해(이분법).
function equilibrium(bites, prey, areaGain = CONFIG.eating.areaGain) {
  const { start, rate } = B.upkeep;
  const g = (s) => bites * (growthGain(s, prey, areaGain) - s) - rate * (s - start);
  let lo = start + 1e-9, hi = 20000;
  if (g(lo) <= 0) return start;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (g(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

test('균형점: 위에서든 아래에서든 같은 크기로 수렴하고, 계산한 균형점과 같다', () => {
  for (const [bites, prey] of [[1, 100 * K], [2, 100 * K], [1, 140 * K]]) {
    const target = equilibrium(bites, prey);
    const fromBelow = simulate({ start: 260 * K, bites, prey }).mean;
    const fromAbove = simulate({ start: 900 * K, bites, prey }).mean;
    assert.ok(Math.abs(fromBelow - target) / target < 0.02, `아래에서 ${fromBelow} vs ${target}`);
    assert.ok(Math.abs(fromAbove - target) / target < 0.02, `위에서 ${fromAbove} vs ${target}`);
    assert.ok(Math.abs(fromBelow - fromAbove) / target < 0.02);
  }
});

test('균형점: 먹이 속도가 빠를수록·먹이가 클수록 높고, 항상 start 위이며, 느리면 start 근처에 머문다', () => {
  const { start } = B.upkeep;
  let last = start;
  for (const bites of [0.25, 0.5, 1, 2, 4, 8]) {
    const eq = equilibrium(bites, 100 * K);
    assert.ok(eq > last, `bites=${bites}: ${eq} > ${last}`);
    last = eq;
  }
  assert.ok(equilibrium(1, 140 * K) > equilibrium(1, 100 * K) && equilibrium(1, 100 * K) > equilibrium(1, 70 * K));
  assert.ok(equilibrium(1, 100 * K, 0.576) > equilibrium(1, 100 * K, 0.32), '성장 강화 레벨이 균형점을 올린다');
  const slow = simulate({ start: 400 * K, bites: 0.05, prey: 100 * K });
  assert.ok(slow.final >= start && slow.final < start + 20 * K, '느린 먹이 속도: ' + slow.final);
  // 균형점 값(초안 수치): 크기 33.3(예전 100)짜리를 초당 1마리 / 2마리 먹으면 약 127 / 151에서 멈춘다(예전 크기로 381 / 453).
  assert.ok(Math.abs(equilibrium(1, 100 * K) - 381 * K) < 2 * K);
  assert.ok(Math.abs(equilibrium(2, 100 * K) - 453 * K) < 2 * K);
});

test('재현: 예전 규칙(둔화·유지비 없음)은 같은 먹이로 600초에 목표의 2배를 넘게 커지고, 새 규칙은 목표 크기 아래에서 멈춘다', () => {
  const run = (extra) => simulate({ start: 28 * K, bites: 1, prey: 100 * K, seconds: 600, ...extra }).final;
  const oldRule = run({ gain: (s, p, a) => Math.sqrt(s ** 2 + a * p ** 2), keep: (s) => s });
  const newRule = run({});
  assert.ok(oldRule > 2 * B.ascension.targetSize, '예전 규칙 ' + oldRule);
  assert.ok(newRule < B.ascension.targetSize, '새 규칙 ' + newRule);
});

// ---- 맞수 대요괴 ----
// 시뮬레이션 시간 dtSim = 실제 시간 × tempo × 단계 곡선. 맞수 간격은 실제 초로 센다.
const simFor = (stage, realSeconds) => realSeconds * CONFIG.tempo * tempoMultiplier(at(stage));

// seconds·dt는 실제 시간, t는 실제 초
function runRival({ stage, size = 100, seconds, dt = 1 / 60, alive = () => 0, rng = () => 0.5 }) {
  const state = createRivalState();
  const plans = [];
  for (let t = dt; t <= seconds + 1e-9; t += dt) {
    state.alive = alive(t, plans);
    const plan = rivalPlan(stage, size, state, simFor(stage, dt), rng);
    if (plan) plans.push({ t, plan });
  }
  return { state, plans };
}

test('맞수: 3단계 이하에서는 생기지 않고, 4·5단계에서 실제 25초마다 1마리씩 나온다(템포가 달라도 같다)', () => {
  for (const stage of [1, 2, 3]) assert.equal(runRival({ stage, seconds: 200 }).plans.length, 0);
  for (const stage of [4, 5]) {
    const { plans } = runRival({ stage, seconds: 80, alive: (t, p) => 0 });
    assert.equal(plans.length, 3, 'stage ' + stage); // 25, 50, 75초
    plans.forEach((p, i) => near(p.t, 25 * (i + 1), 0.05));
    assert.equal(runRival({ stage, seconds: 24.9 }).plans.length, 0);
    // 시뮬레이션 시간으로 환산: 4단계 25 × 3.9 = 97.5, 5단계 25 × 4.29 = 107.25. 1초 모자라면 안 나오고 딱 맞으면 나온다.
    const sim25 = 25 * CONFIG.tempo * B.pace.stageMult[stage];
    assert.equal(rivalPlan(stage, 100, createRivalState(), sim25 - 0.05), null);
    assert.ok(rivalPlan(stage, 100, createRivalState(), sim25 + 0.001));
  }
  near(25 * CONFIG.tempo * B.pace.stageMult[4], 97.5);
  near(25 * CONFIG.tempo * B.pace.stageMult[5], 107.25);
});

test('맞수 생성 지시: { stage: 플레이어 단계, size: 플레이어 × 0.8~1.3, rival: true }', () => {
  const state = createRivalState();
  for (const [stage, rng, expected] of [[4, () => 0, 0.8], [5, () => 1, 1.3], [5, () => 0.5, 1.05]]) {
    state.timer = 0;
    const plan = rivalPlan(stage, 100, state, simFor(stage, B.rival.interval), rng);
    assert.deepEqual(Object.keys(plan).sort(), ['rival', 'size', 'stage']);
    assert.equal(plan.stage, stage);
    assert.equal(plan.rival, true);
    near(plan.size, 100 * expected);
  }
  let min = Infinity, max = -Infinity;
  let seed = 7;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 500; i++) {
    state.timer = 0;
    const plan = rivalPlan(5, 100, state, simFor(5, B.rival.interval), rng);
    min = Math.min(min, plan.size / 100);
    max = Math.max(max, plan.size / 100);
  }
  assert.ok(min >= 0.8 - 1e-9 && max <= 1.3 + 1e-9);
  assert.ok(min < 0.85 && max > 1.25, `범위를 고르게 쓴다: ${min}~${max}`);
});

test('맞수 동시 최대 수: 2마리가 살아 있으면 더 만들지 않고, 자리가 나면 25초 뒤 보충한다', () => {
  // 맞수가 한 마리도 죽지 않으면 2마리(25초·50초)에서 멈추고, 이후 400초 동안 더 만들지 않는다.
  const full = runRival({ stage: 5, seconds: 400, alive: (t, plans) => plans.length });
  assert.equal(full.plans.length, B.rival.maxAlive);
  // 맞수가 40초 살다 죽는 시뮬레이션: 동시에 maxAlive를 넘지 않고, 지시 사이 간격은 interval 이상이다.
  const alive = [];
  const times = [];
  const st = createRivalState();
  let maxSeen = 0;
  for (let t = 0; t < 600; t += 1 / 60) {
    for (let i = alive.length - 1; i >= 0; i--) if (t - alive[i] >= 40) alive.splice(i, 1);
    st.alive = alive.length;
    const plan = rivalPlan(4, 100, st, simFor(4, 1 / 60));
    if (plan) {
      alive.push(t);
      times.push(t);
    }
    maxSeen = Math.max(maxSeen, alive.length);
  }
  assert.equal(maxSeen, B.rival.maxAlive);
  assert.ok(times.length >= 10);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= B.rival.interval - 0.05, `간격 ${times[i] - times[i - 1]}`);
});

test('맞수: 단계가 내려가면 타이머가 0으로 돌아가고, 생성 실패 뒤 rivalRetry로 바로 다시 받는다', () => {
  const state = createRivalState();
  rivalPlan(5, 100, state, simFor(5, 20));
  assert.ok(state.timer > 0 && state.timer < B.rival.interval);
  assert.equal(rivalPlan(3, 100, state, simFor(3, 1)), null);
  assert.equal(state.timer, 0);
  const plan = rivalPlan(5, 100, state, simFor(5, B.rival.interval));
  assert.ok(plan);
  rivalRetry(state);
  assert.ok(rivalPlan(5, 100, state, simFor(5, 1 / 60)));
  assert.equal(rivalPlan(5, 0, state, simFor(5, 100)), null);
});

test('맞수 몸집 상한: 플레이어 × 1.3(절대 상한은 일반 적과 같다)', () => {
  near(rivalSizeCap(100), 100 * 1.3);
  near(rivalSizeCap(B.ascension.targetSize), B.ascension.targetSize * 1.3);
  assert.ok(rivalSizeCap(B.ascension.targetSize) <= CONFIG.enemy.growthCap.maxSize, '승천 목표 크기에서 맞수 상한이 절대 상한에 걸리지 않는다');
  assert.equal(rivalSizeCap(10000), CONFIG.enemy.growthCap.maxSize);
  assert.ok(rivalSizeCap(100) < Math.min(CONFIG.enemy.growthCap.maxSize, 100 * CONFIG.enemy.growthCap.maxSizeVsPlayer));
  const state = createRivalState();
  const plan = rivalPlan(5, 100, state, simFor(5, B.rival.interval), () => 1);
  assert.ok(plan.size <= rivalSizeCap(100) + 1e-9);
});

// ---- 승천 ----
test('승천: 5단계이고 크기가 목표 이상일 때만 { reward }', () => {
  const { targetSize } = B.ascension;
  assert.equal(ascension(at(5), targetSize - 0.01), null);
  assert.ok(ascension(at(5), targetSize));
  assert.equal(ascension(at(4), 5000), null);
  assert.equal(ascension(at(1), 5000), null);
  assert.equal(ascension(at(5), NaN), null);
  assert.equal(ascension(at(5), undefined), null);
  assert.equal(ascension({}, 5000), null);
});

test('승천 보상: 기본 300000 + 크기 비례, 클수록 많고 5단계 큰 적 몇 마리 수준이다', () => {
  const { targetSize, baseReward, rewardPerSize } = B.ascension;
  assert.equal(baseReward, 300000);
  const atTarget = ascension(at(5), targetSize).reward;
  assert.equal(atTarget, Math.round(baseReward + rewardPerSize * targetSize));
  assert.equal(atTarget, 390000, '시작 크기가 1/3이 되어도 보상 총액은 그대로(예전 450 × 200 = 150 × 600)');
  assert.ok(atTarget > baseReward);
  assert.ok(ascension(at(5), targetSize + 30).reward > atTarget);
  assert.ok(Number.isInteger(ascension(at(5), 451.7).reward));
  assert.deepEqual(Object.keys(ascension(at(5), targetSize)), ['reward']);
  // 승천 보상은 변경 이력 18에서 바꾸지 않았다(고정값). 예전에는 5단계 크기 100 적 3~5마리 수준(예전 식은 먹이의 절대 크기로 셌다)이었지만,
  // 요력이 '내 크기 대비 먹이 크기'가 된 뒤에는 크기 150에서 크기 100 적을 먹어도 한 마리에 수백 요력이라 이 관계가 끊겼다. 값은 docs/balance-v4.md 18절이 비교한다.
  const bigPrey = preyValue({ size: 100, stage: 5, mySize: targetSize });
  assert.ok(bigPrey > 0 && atTarget > 100 * bigPrey, `보상 ${atTarget} / 큰 적 ${bigPrey}`);
});

test('설정: 초안 수치와 초안 구조', () => {
  assert.deepEqual(B.pace.stageMult, { 1: 1 / 3, 2: 0.6, 3: 0.85, 4: 1.0, 5: 1.1 });
  assert.equal(B.pace.baseMult, 0.5);
  assert.equal(B.pace.speedPerLevel, 0.04);
  assert.deepEqual(B.growth, { refSize: 150 / 3, exp: 0.5 });
  assert.deepEqual(B.upkeep, { start: 250 / 3, rate: 0.02 });
  assert.equal(B.ascension.rewardPerSize, 600);
  assert.equal(B.rival.interval, 25); // 실제 초
  assert.equal(B.rival.maxAlive, 2);
  assert.equal(B.ascension.targetSize, 150);
  assert.equal(B.rival.label, '맞수');
  assert.equal(B.ascension.title, '승천');
});

// ---- 크기별 감속과 단계별 시야(사용자 지시 2026-11-23) ----
test('sizeSpeedMultiplier: 시작 크기 이하에서는 1, 클수록 느려지고, 크기 150에서 약 0.43배, 최소값 아래로는 안 내려간다', () => {
  const { ref, exp, min } = B.sizeSlow;
  near(ref, CONFIG.player.startSize);
  for (const size of [0, 1, 5, ref]) near(sizeSpeedMultiplier(size), 1);
  let last = 1;
  for (let size = ref + 1; size <= 400; size += 7) {
    const m = sizeSpeedMultiplier(size);
    assert.ok(m < last + 1e-12 && m >= min, `size=${size}: ${m}`);
    last = m;
  }
  near(sizeSpeedMultiplier(150), Math.pow(ref / 150, exp));
  assert.ok(Math.abs(sizeSpeedMultiplier(150) - 0.43) < 0.01, '크기 150 배율 ' + sizeSpeedMultiplier(150));
  assert.equal(sizeSpeedMultiplier(1e9), min);
  near(sizeSpeedMultiplier(NaN), 1);
  near(sizeSpeedMultiplier(undefined), 1);
});

test('크기별 감속은 이동 속도 강화·템포와 따로 곱해진다(체감 4.6배 곡선은 그대로)', () => {
  // playerSpeedMultiplier·tempoMultiplier는 크기를 보지 않는다. 크기 감속은 Player.step·Enemy.step에서 곱한다.
  const ratio = playerFeelMultiplier(at(5, 10)) / playerFeelMultiplier(at(1, 0));
  assert.ok(ratio > 4.55 && ratio < 4.7);
  assert.equal(playerSpeedMultiplier.length, 1);
  assert.equal(sizeSpeedMultiplier.length, 1);
});

test('stageZoomMultiplier: 모두 1(진화한 뒤의 화면은 처음 시작 화면과 같다), 범위 밖은 1~5단계로 자른다', () => {
  for (let stage = 1; stage <= 5; stage++) near(stageZoomMultiplier(stage), 1);
  near(stageZoomMultiplier(99), B.view.stageZoom[5]);
  near(stageZoomMultiplier(-2), 1);
  near(stageZoomMultiplier(undefined), 1);
});

test('zoomFor(stage): 어느 단계에서든 같은 크기의 화면은 같고(처음 시작 화면), 1단계는 예전과 같고, 월드 밖이 보이지 않는다', () => {
  const [w, h] = [1280, 720];
  const size = CONFIG.player.startSize;
  try {
    applyWorldScale(5); // 맵이 화면보다 충분히 커서 하한이 기본 minZoom인 판(1단계 한 변 1000에서는 긴 변 / 1000이 하한이다)
    near(zoomFor(size, w, h, 1), zoomFor(size, w, h));
    for (let stage = 2; stage <= 5; stage++) near(zoomFor(size, w, h, stage), zoomFor(size, w, h, 1));
    near(zoomFor(size, w, h, 3) / zoomFor(size, w, h, 1), stageZoomMultiplier(3), 1e-9);
    // 아주 커져도 화면의 긴 변이 월드보다 넓어지지 않는다(월드 밖이 보이지 않는다)
    for (const stage of [1, 3, 5]) {
      applyWorldScale(stage);
      const z = zoomFor(1e9, w, h, stage);
      assert.ok(w / z <= CONFIG.world.size + 1e-6, `stage ${stage}: 시야 ${w / z}`);
    }
    applyWorldScale(5);
    assert.equal(zoomFor(1e9, 740, 360, 1), CONFIG.camera.minZoom);
  } finally { applyWorldScale(1); }
});

test('easePace: 진화로 단계 템포가 바뀌어도 곧바로 뛰지 않고 시정수(paceTauSec, 실제 40초)로 서서히 새 값에 다가간다', () => {
  const { paceTauSec } = B.evolveSlow;
  const [from, to] = [tempoMultiplier(at(1)), tempoMultiplier(at(2))];
  assert.equal(easePace(from, to, 0), from, '진화 순간에는 그대로');
  near(easePace(from, to, paceTauSec), to + (from - to) / Math.E, 1e-9);
  let pace = from, last = from;
  for (let t = 0; t < 12 * paceTauSec; t += 1 / 60) {
    pace = easePace(pace, to, 1 / 60);
    assert.ok(pace >= last - 1e-12 && pace <= to + 1e-12, '단조 증가');
    last = pace;
  }
  assert.equal(pace, to, '충분히 지나면 새 값에 닿는다');
  // 낮아질 때도 같은 방식, 입력이 이상해도 깨지지 않는다
  assert.ok(easePace(1, 0.5, 5) < 1 && easePace(1, 0.5, 5) > 0.5);
  assert.equal(easePace(0.5, 0.5, 3), 0.5);
  assert.ok(Number.isFinite(easePace(NaN, 0.6, 1)));
  assert.equal(easePace(0.3, 0.6, NaN), 0.3);
  // 장면은 dt가 작은 프레임을 여러 번 부르므로 한 번에 큰 dt를 주든 쪼개든 거의 같다
  let split = from;
  for (let i = 0; i < 100; i++) split = easePace(split, to, 0.1);
  near(split, easePace(from, to, 10), 1e-9);
});
