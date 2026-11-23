import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FX, SOUNDS, chargePlan, fxTier, planFx, revealPlan, sellPlan, startClock, tapClock, tickClock,
} from '../src/ui/enhanceFx.js';
import { clampVolume, createSfx, extensionOrder } from '../src/audio/sfx.js';
import { tryUpgrade } from '../src/systems/treasure.js';

const outcomes = (from) => [
  { result: 'success', from, to: from + 1, shards: 0 },
  { result: 'fail', from, to: from, shards: 0 },
  { result: 'break', from, to: null, shards: from },
];

test('강도 구간: +9까지 기본, +10~12 금빛, +13 이상 화면 전체', () => {
  assert.equal(fxTier(1), 'base');
  assert.equal(fxTier(9), 'base');
  assert.equal(fxTier(10), 'gold');
  assert.equal(fxTier(12), 'gold');
  assert.equal(fxTier(13), 'grand');
  assert.equal(fxTier(15), 'grand');
  assert.equal(revealPlan({ result: 'success', from: 9, to: 10 }).tier, 'gold');
  assert.equal(revealPlan({ result: 'success', from: 12, to: 13 }).fullscreen, true);
  assert.equal(revealPlan({ result: 'success', from: 11, to: 12 }).fullscreen, false);
});

test('긴장 구간은 결과와 무관하다(성공·실패·파괴가 같은 긴장을 보인다)', () => {
  for (const from of [0, 4, 9, 12, 14]) {
    const plans = outcomes(from).map(attempt => planFx(attempt).charge);
    assert.deepEqual(plans[1], plans[0]);
    assert.deepEqual(plans[2], plans[0]);
    assert.equal(plans[0].ms, FX.chargeMs);
    assert.equal(plans[0].sound, SOUNDS.charge);
  }
  assert.equal(FX.chargeMs, 800);
});

test('레벨이 오를수록 성공 연출이 줄지 않는다(불꽃·번쩍임·충격·글자 크기·시간)', () => {
  let prev = null;
  for (let from = 0; from < 15; from++) {
    const plan = revealPlan({ result: 'success', from, to: from + 1 });
    const charge = chargePlan(from);
    if (prev) {
      for (const key of ['sparks', 'flash', 'impactPx', 'textScale', 'ms', 'fireworks']) {
        assert.ok(plan[key] >= prev.plan[key], key + ' +' + (from + 1));
      }
      assert.ok(charge.shakePx >= prev.charge.shakePx);
      assert.ok(charge.motes >= prev.charge.motes);
    }
    prev = { plan, charge };
  }
  assert.equal(revealPlan({ result: 'success', from: 8, to: 9 }).rays, false);
  assert.equal(revealPlan({ result: 'success', from: 9, to: 10 }).rays, true);
  assert.ok(revealPlan({ result: 'success', from: 12, to: 13 }).fireworks > 0);
});

test('결과별 글자와 소리: 성공=종, 실패=둔탁, 파괴=깨짐, 대성공=팡파르·폭죽', () => {
  const success = revealPlan({ result: 'success', from: 4, to: 5 });
  assert.equal(success.title, '+5 성공');
  assert.deepEqual(success.sounds.map(s => s.name), [SOUNDS.success]);
  const fail = revealPlan({ result: 'fail', from: 7, to: 7 });
  assert.equal(fail.title, '실패');
  assert.equal(fail.sub, '+7 유지');
  assert.ok(fail.cracks > 0 && fail.shards === 0);
  assert.deepEqual(fail.sounds.map(s => s.name), [SOUNDS.fail]);
  const broken = revealPlan({ result: 'break', from: 11, to: null, shards: 11 });
  assert.equal(broken.title, '파괴');
  assert.equal(broken.sub, '파편 +11');
  assert.ok(broken.shards > 0 && broken.cracks > fail.cracks);
  assert.deepEqual(broken.sounds.map(s => s.name), [SOUNDS.break]);
  const great = revealPlan({ result: 'great', from: 3, to: 5 });
  assert.equal(great.title, '+5 대성공');
  assert.ok(great.fireworks > 0 && great.fullscreen);
  assert.deepEqual(great.sounds.map(s => s.name), [SOUNDS.great]);
  const top = revealPlan({ result: 'success', from: 14, to: 15 });
  assert.deepEqual(top.sounds.map(s => s.name), [SOUNDS.success, SOUNDS.great]);
});

test('동작 줄이기: 흔들림·입자·번쩍임 없이 짧게, 소리와 글자는 그대로', () => {
  for (const attempt of [...outcomes(13), { result: 'great', from: 3, to: 5 }]) {
    const { charge, reveal } = planFx(attempt, { reduced: true });
    assert.equal(charge.shakePx, 0);
    assert.equal(charge.motes, 0);
    assert.ok(charge.ms < FX.chargeMs);
    for (const key of ['sparks', 'fireworks', 'shards', 'flash', 'impactPx']) assert.equal(reveal[key], 0, key);
    assert.equal(reveal.rays, false);
    assert.equal(reveal.ms, FX.reducedRevealMs);
    assert.ok(reveal.title.length > 0);
    assert.ok(reveal.sounds.length > 0);
  }
  assert.equal(sellPlan(5000, { reduced: true }).coins, 0);
});

test('진행 상태: 시간이 지나면 긴장 → 결과 → 끝', () => {
  const timing = { chargeMs: 800, revealMs: 1300 };
  let clock = startClock(1000);
  assert.equal(tickClock(clock, 1799, timing).phase, 'charge');
  clock = tickClock(clock, 1800, timing);
  assert.deepEqual(clock, { phase: 'reveal', since: 1800, skipped: false });
  assert.equal(tickClock(clock, 3099, timing).phase, 'reveal');
  assert.equal(tickClock(clock, 3100, timing).phase, 'done');
  // 탭이 늦게 처리돼도(탭 사이 프레임 없음) 한 번에 끝까지 간다.
  assert.equal(tickClock(startClock(0), 99999, timing).phase, 'done');
});

test('탭: 긴장 중이면 결과로 건너뛰고, 결과를 잠깐 본 뒤 탭하면 닫힌다', () => {
  const timing = { chargeMs: 800, revealMs: 1300 };
  let clock = tapClock(startClock(0), 200, timing);
  assert.deepEqual(clock, { phase: 'reveal', since: 200, skipped: true });
  // 건너뛰기 탭이 곧바로 결과까지 닫지 않는다.
  assert.equal(tapClock(clock, 200 + FX.tapCloseAfterMs - 1, timing).phase, 'reveal');
  assert.equal(tapClock(clock, 200 + FX.tapCloseAfterMs, timing).phase, 'done');
  // 긴장이 이미 끝난 시각의 탭은 건너뛰기가 아니라 결과 위의 탭이다.
  const late = tapClock(startClock(0), 900, timing);
  assert.equal(late.phase, 'reveal');
  assert.equal(late.skipped, false);
  const done = { phase: 'done', since: 5, skipped: false };
  assert.deepEqual(tapClock(done, 99, timing), done);
});

test('연출은 결과를 바꾸지 않는다: 계획을 세워도 tryUpgrade 결과와 여의주 상태가 그대로', () => {
  const treasure = { level: 9 };
  const attempt = tryUpgrade(treasure, { rng: () => 0.99 });
  const frozen = structuredClone({ attempt, treasure });
  planFx(attempt);
  planFx(attempt, { reduced: true });
  assert.deepEqual({ attempt, treasure }, frozen);
});

test('판매: 비싼 여의주일수록 엽전이 많고 상한이 있다', () => {
  const small = sellPlan(5);
  const mid = sellPlan(300);
  const big = sellPlan(100000);
  assert.ok(small.coins >= 6);
  assert.ok(mid.coins > small.coins && big.coins >= mid.coins);
  assert.ok(big.coins <= 36);
  assert.equal(big.big, true);
  assert.equal(small.big, false);
  assert.equal(big.sound, SOUNDS.sell);
});

test('소리: 확장자 순서·음량 범위', () => {
  assert.deepEqual(extensionOrder((type) => (type.includes('ogg') ? 'probably' : 'maybe')), ['ogg', 'mp3']);
  assert.deepEqual(extensionOrder((type) => (type.includes('mpeg') ? 'maybe' : '')), ['mp3']);
  assert.deepEqual(extensionOrder(null), ['ogg', 'mp3']);
  assert.equal(clampVolume(2), 1);
  assert.equal(clampVolume(-1), 0);
  assert.equal(clampVolume('x'), 0);
});

test('소리: 소리 장치가 없거나 파일이 없으면 조용히 넘어간다', async () => {
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return { ok: false, status: 404 }; };
  const none = createSfx({ fetchImpl, AudioCtor: null, target: null, canPlayType: () => '' });
  assert.equal(none.unlock(), false);
  const voice = none.play(SOUNDS.success);
  assert.doesNotThrow(() => voice.stop());
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(calls.map(url => url.split('/').pop()), ['enhance-success.ogg', 'enhance-success.mp3']);

  class FakeContext {
    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; this.started = 0; }
    createGain() { return { gain: { value: 1 }, connect() {} }; }
    decodeAudioData() { throw new Error('should not decode missing files'); }
    createBufferSource() { this.started++; return {}; }
  }
  const quiet = createSfx({ fetchImpl, AudioCtor: FakeContext, target: null, canPlayType: () => '' });
  assert.equal(quiet.unlock(), true);
  const muted = quiet.play(SOUNDS.break);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.doesNotThrow(() => muted.stop());
  assert.ok(quiet.setVolume(0.4) === 0.4 && quiet.getVolume() === 0.4);
});

test('해독이 겹쳐도 같은 소리 간격은 80ms이고, 끝난 소리만 동시 여섯 자리에서 빠진다', async () => {
  let ctx;
  const started = [];
  class Context {
    constructor() { ctx = this; this.currentTime = 0; this.destination = {}; }
    createGain() { return { gain: {}, connect() {}, disconnect() {} }; }
    decodeAudioData(_, done) { done({}); }
    createBufferSource() {
      return { playbackRate: {}, connect() {}, disconnect() {}, start() { started.push(this); }, stop() {} };
    }
  }
  const audio = createSfx({ AudioCtor: Context, fetchImpl: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }) });
  audio.unlock();
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const loop = audio.play('loop', { loop: true });
  for (const name of ['hit', 'hit', 'a', 'b', 'c', 'd', 'overflow']) audio.play(name);
  await flush();
  assert.equal(started.length, 6);
  loop.stop(60);
  audio.play('overflow');
  await flush();
  assert.equal(started.length, 6);
  started[0].onended();
  ctx.currentTime = 0.079;
  audio.play('hit');
  await flush();
  assert.equal(started.length, 6);
  ctx.currentTime = 0.08;
  audio.play('hit');
  await flush();
  assert.equal(started.length, 7);
});

test('소리: 첫 사용자 입력에서 잠금이 풀리고 불러온 소리를 재생한다', async () => {
  const listeners = new Map();
  const target = {
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
  };
  const played = [];
  class FakeContext {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; this.resumed = 0; }
    resume() { this.resumed++; this.state = 'running'; return Promise.resolve(); }
    createGain() { return { gain: { value: 1 }, connect() {} }; }
    decodeAudioData(data, ok) { ok({ duration: 0.3, bytes: data.byteLength }); }
    createBufferSource() {
      const source = { playbackRate: { value: 1 }, connect() {}, start() { played.push(source.buffer); }, stop() {} };
      return source;
    }
  }
  const fetchImpl = async (url) => (url.endsWith('.mp3')
    ? { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }
    : { ok: false, status: 404 });
  const sfx = createSfx({ fetchImpl, AudioCtor: FakeContext, target, canPlayType: () => '' });
  sfx.preload([SOUNDS.charge]);
  assert.equal(sfx.isReady(), false);
  assert.ok(listeners.has('pointerdown'));
  sfx.play(SOUNDS.charge).stop();
  listeners.get('pointerdown')();
  assert.equal(sfx.isReady(), true);
  assert.equal(listeners.size, 0);
  await new Promise(resolve => setTimeout(resolve, 0));
  sfx.play(SOUNDS.charge);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(played.length, 1);
  assert.equal(played[0].bytes, 8);
});
