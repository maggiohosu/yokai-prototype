import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import {
  CALM_RELAX_DELAY_SEC,
  THREAT_DANGER_RADIUS,
  createMoodTracker,
  evaluateMoodState,
} from '../src/systems/musicMood.js';
import {
  BGM_VOLUME_KEY,
  DEFAULT_BGM_VOLUME,
  DUCK_GAIN_RATIO,
  FADE_TO_CALM_MS,
  FADE_TO_TENSE_MS,
  FIELD_TRACKS,
  LOOP_SEC,
  SOFT_STOP_SEC,
  createBgm,
  storedBgmVolume,
} from '../src/audio/bgm.js';

// 가짜 AudioContext 구현 (Node.js 환경 단위 테스트용)
function makeFakeAudioContext() {
  let time = 0;
  const nodes = [];

  class FakeParam {
    constructor(val = 1) {
      this.value = val;
      this.events = [];
    }
    setValueAtTime(val, t) {
      this.value = val;
      this.events.push({ type: 'set', val, t });
    }
    linearRampToValueAtTime(val, t) {
      this.value = val;
      this.events.push({ type: 'linearRamp', val, t });
    }
    cancelScheduledValues(t) {
      this.events.push({ type: 'cancel', t });
    }
  }

  class FakeGainNode {
    constructor() {
      this.gain = new FakeParam(1);
      this.connectedTo = null;
      nodes.push(this);
    }
    connect(dest) {
      this.connectedTo = dest;
    }
    disconnect() {
      this.connectedTo = null;
    }
  }

  class FakeSourceNode {
    constructor() {
      this.buffer = null;
      this.loop = false;
      this.started = false;
      this.stopped = false;
      this.startTime = null;
      this.connectedTo = null;
      nodes.push(this);
    }
    connect(dest) {
      this.connectedTo = dest;
    }
    disconnect() {
      this.connectedTo = null;
    }
    start(t = 0, offset = 0) {
      this.offset = offset;
      this.started = true;
      this.startTime = t;
    }
    stop(t = 0) {
      this.stopped = true;
      this.stopTime = t;
    }
  }

  const destination = { id: 'destination' };

  return {
    destination,
    get currentTime() {
      return time;
    },
    advanceTime(dt) {
      time += dt;
    },
    state: 'running',
    createGain: () => new FakeGainNode(),
    createBufferSource: () => new FakeSourceNode(),
    decodeAudioData: (buf, success) => {
      const audioBuf = { duration: 48, numberOfChannels: 2, sampleRate: 44100 };
      success?.(audioBuf);
      return Promise.resolve(audioBuf);
    },
    get nodes() {
      return nodes;
    },
  };
}

// 1. 순수 상황 판정 (evaluateMoodState)
test('상황 판정: 평상시 위험이 없으면 calm', () => {
  const mood = evaluateMoodState({
    heraldAlive: false,
    recentHit: false,
    nearbyThreatCount: 0,
    minThreatDist: Infinity,
  });
  assert.equal(mood, 'calm');
});

test('상황 판정: 나보다 큰 적이 위험 반경(350px) 밖에 있으면 calm 유지', () => {
  const mood = evaluateMoodState({
    heraldAlive: false,
    recentHit: false,
    nearbyThreatCount: 2,
    minThreatDist: 400,
    dangerRadius: THREAT_DANGER_RADIUS,
  });
  assert.equal(mood, 'calm');
});

test('상황 판정: 나보다 큰 적이 위험 반경 내에 들어오면 tense', () => {
  const mood = evaluateMoodState({
    heraldAlive: false,
    recentHit: false,
    nearbyThreatCount: 1,
    minThreatDist: 250,
    dangerRadius: THREAT_DANGER_RADIUS,
  });
  assert.equal(mood, 'tense');
});

test('상황 판정: 굶주림으로 생명력이 소모 중이거나 최근 피격되었으면 tense', () => {
  assert.equal(evaluateMoodState({ hungerState: 'draining' }), 'tense');
  assert.equal(evaluateMoodState({ recentHit: true }), 'tense');
});

test('상황 판정: 대요괴(herald)가 출현해 있으면 최우선으로 boss', () => {
  const mood = evaluateMoodState({
    heraldAlive: true,
    hungerState: 'draining',
    recentHit: true,
    nearbyThreatCount: 5,
    minThreatDist: 50,
  });
  assert.equal(mood, 'boss');
});

// 2. 이력 현상 (createMoodTracker)
test('이력 현상: tense 진입은 즉시 반영되고, 위험 해소 후 4초 동안 calm으로 복귀하지 않는다', () => {
  const tracker = createMoodTracker({ relaxDelaySec: 4.0, initialMood: 'calm' });
  assert.equal(tracker.mood, 'calm');

  // t = 1.0s: 위험 발생 -> 즉시 tense
  assert.equal(tracker.update('tense', 1.0), 'tense');
  assert.equal(tracker.mood, 'tense');

  // t = 2.0s: 위험 해소(raw: calm) -> 아직 1초밖에 안 지남 -> tense 유지
  assert.equal(tracker.update('calm', 2.0), 'tense');
  assert.equal(tracker.isRelaxing, true);

  // t = 4.0s: 위험 해소 후 2초 경과 -> tense 유지
  assert.equal(tracker.update('calm', 4.0), 'tense');

  // t = 5.9s: 위험 해소 후 3.9초 경과 -> tense 유지 (깜빡임 방지)
  assert.equal(tracker.update('calm', 5.9), 'tense');

  // t = 6.0s: 위험 해소 후 정확히 4.0초 경과 -> calm 복귀
  assert.equal(tracker.update('calm', 6.0), 'calm');
  assert.equal(tracker.mood, 'calm');
  assert.equal(tracker.isRelaxing, false);
});

test('이력 현상: 4초 대기 중 위험이 재발하면 대기 시간이 초기화된다', () => {
  const tracker = createMoodTracker({ relaxDelaySec: 4.0, initialMood: 'calm' });

  tracker.update('tense', 0.0);
  assert.equal(tracker.mood, 'tense');

  // t = 1.0s에 위험 해소
  tracker.update('calm', 1.0);
  assert.equal(tracker.isRelaxing, true);

  // t = 3.5s에 다시 위험 발생 (2.5초 만에 재발)
  tracker.update('tense', 3.5);
  assert.equal(tracker.mood, 'tense');
  assert.equal(tracker.isRelaxing, false);

  // t = 4.0s에 다시 위험 해소 -> 새 기준점 4.0s부터 다시 4초 카운트
  tracker.update('calm', 4.0);
  assert.equal(tracker.mood, 'tense');

  // t = 7.9s -> 해소 후 3.9초 -> tense 유지
  assert.equal(tracker.update('calm', 7.9), 'tense');

  // t = 8.0s -> 해소 후 4.0초 경과 -> calm 복귀
  assert.equal(tracker.update('calm', 8.0), 'calm');
});

test('이력 현상: boss 출현도 즉시 진입하고, 보스 처치 후 4초 뒤 calm으로 복귀한다', () => {
  const tracker = createMoodTracker({ relaxDelaySec: 4.0 });
  assert.equal(tracker.update('boss', 10.0), 'boss');
  assert.equal(tracker.mood, 'boss');

  // t = 12.0s: 보스 처치 후 calm -> 4초 대기
  assert.equal(tracker.update('calm', 12.0), 'boss');
  assert.equal(tracker.update('calm', 15.9), 'boss');
  assert.equal(tracker.update('calm', 16.0), 'calm');
});

// 3. 음량 저장 및 토글 (yokai-bgm-volume)
test('BGM 음량: 기본값은 0.5이며 0~1 범위로 저장 및 클램프된다', () => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)),
  };

  try {
    assert.equal(storedBgmVolume(), DEFAULT_BGM_VOLUME);

    const fakeCtx = makeFakeAudioContext();
    const bgm = createBgm({
      sfxInstance: { getContext: () => fakeCtx },
    });

    assert.equal(bgm.getVolume(), 0.5);
    assert.equal(bgm.isMuted(), false);

    // 음량 변경
    bgm.setVolume(0.8);
    assert.equal(bgm.getVolume(), 0.8);
    assert.equal(storage.get(BGM_VOLUME_KEY), '0.8');

    // 음소거 토글
    bgm.toggleMute();
    assert.equal(bgm.getVolume(), 0);
    assert.equal(bgm.isMuted(), true);

    // 켜기 단추는 항상 0.5를 저장한다.
    bgm.toggleMute();
    assert.equal(bgm.getVolume(), 0.5);
    assert.equal(storage.get(BGM_VOLUME_KEY), '0.5');
    assert.equal(bgm.isMuted(), false);
  } finally {
    delete globalThis.localStorage;
  }
});

// 4. 가짜 AudioContext를 이용한 버스, 크로스페이드, 덕킹 검증
test('BGM 버스 및 덕킹: 덕킹 시 -8dB(약 0.398) 게인으로 감쇄되고 복구 시 1.0으로 복원된다', async () => {
  const fakeCtx = makeFakeAudioContext();
  const bgm = createBgm({
    sfxInstance: { getContext: () => fakeCtx },
  });

  bgm.ensureBuses();
  assert.equal(bgm.isDucked(), false);

  // 덕킹 활성화 (진화/정비/레벨업 창 열림)
  bgm.duck(true);
  assert.equal(bgm.isDucked(), true);
  assert.deepEqual(fakeCtx.nodes[0].gain.events.at(-1), { type: 'linearRamp', val: DUCK_GAIN_RATIO, t: 0.25 });
  assert.equal(fakeCtx.nodes[1].gain.value, 0.25);

  // 덕킹 해제
  bgm.duck(false);
  assert.equal(bgm.isDucked(), false);
  assert.equal(fakeCtx.nodes[0].gain.events.at(-1).val, 1);
});

test('BGM 재생 및 크로스페이드 시간: tense 전환은 약 0.6초, calm 복귀는 약 2.5초', async () => {
  const fakeCtx = makeFakeAudioContext();
  const fakeFetch = async (url) => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(1024),
  });

  const bgm = createBgm({
    sfxInstance: { getContext: () => fakeCtx },
    fetchImpl: fakeFetch,
  });

  assert.equal(FADE_TO_TENSE_MS, 600);
  assert.equal(FADE_TO_CALM_MS, 2500);

  await bgm.play('calm');
  const sources = () => fakeCtx.nodes.filter(n => 'started' in n);
  const first = sources()[0];
  assert.equal(first.started, true);
  assert.equal(first.loopStart, 0);
  assert.equal(first.loopEnd, LOOP_SEC.calm);
  assert.equal(first.connectedTo.connectedTo.connectedTo.connectedTo, fakeCtx.destination);
  fakeCtx.advanceTime(2);
  await bgm.setMood('tense');
  const urgent = sources()[1];
  assert.equal(urgent.offset, 2);
  assert.equal(urgent.connectedTo.gain.events.at(-1).t, 2.6);
  assert.equal(first.stopTime, 2.6);
  fakeCtx.advanceTime(3);
  await bgm.setMood('calm');
  const calm = sources()[2];
  assert.equal(calm.offset, 5);
  assert.equal(urgent.stopTime, 7.5);
  assert.equal(calm.connectedTo.gain.events.at(-1).t, 7.5);
  bgm.stop({ fadeMs: 500 });
  assert.deepEqual(calm.connectedTo.gain.events.at(-1), { type: 'linearRamp', val: 0, t: 5.5 });
  assert.equal(calm.stopTime, 5.5);
  assert.equal(urgent.stopTime, 5.5);
  assert.equal(first.stopTime, 2.6);
  assert.equal(bgm.getCurrentTrack(), null);
});

test('첫 입력 대기 중에는 무음이고, 탭 숨김과 세로 화면이 모두 해제되면 같은 위치에서 재개한다', async () => {
  const ctx = makeFakeAudioContext();
  const target = new EventTarget();
  let unlocked = false, onUnlock;
  const sfxInstance = { getContext: () => unlocked ? ctx : null, onUnlock: fn => { onUnlock = fn; } };
  const bgm = createBgm({ target, sfxInstance, fetchImpl: async () => new Response(new Uint8Array(4)) });
  await bgm.play('calm');
  await bgm.setMood('tense');
  assert.equal(ctx.nodes.length, 0);
  unlocked = true;
  await onUnlock();
  assert.equal(bgm.getCurrentTrack(), 'tense');
  ctx.advanceTime(7);
  target.hidden = true;
  target.dispatchEvent(new Event('visibilitychange'));
  assert.equal(bgm.getCurrentTrack(), null);
  // 즉시 끊지 않고 60 ms 램프로 내린 뒤 80 ms에 정지한다(클릭 방지).
  const hiddenNode = ctx.nodes.find(n => n.started);
  assert.ok(Math.abs(hiddenNode.stopTime - (7 + SOFT_STOP_SEC)) < 1e-9);
  assert.deepEqual(hiddenNode.connectedTo.gain.events.at(-1).val, 0);
  assert.ok(Math.abs(hiddenNode.connectedTo.gain.events.at(-1).t - 7.06) < 1e-9);
  bgm.setRotationPaused(true);
  target.hidden = false;
  target.dispatchEvent(new Event('visibilitychange'));
  assert.equal(bgm.getCurrentTrack(), null);
  ctx.advanceTime(8);
  bgm.setRotationPaused(false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(bgm.getCurrentTrack(), 'tense');
  assert.deepEqual(ctx.nodes.filter(n => n.started).map(n => n.offset), [0, 7]);
  bgm.destroy();
});

test('해독 실패 시 MP3를 시도하고, 두 파일이 없으면 현재 재생을 유지한다', async () => {
  const ctx = makeFakeAudioContext();
  const events = [];
  let first = true;
  const decode = ctx.decodeAudioData;
  ctx.decodeAudioData = (...args) => {
    if (first) { first = false; return Promise.reject(new Error('decode')); }
    return decode(...args);
  };
  const bgm = createBgm({ sfxInstance: { getContext: () => ctx }, base: '/',
    fetchImpl: async url => {
      events.push(url);
      return url.includes('calm') ? new Response(new Uint8Array(1)) : new Response(null, { status: 404 });
    } });
  await bgm.play('calm');
  await bgm.play('missing');
  assert.deepEqual(events, ['/calm.ogg', '/calm.mp3', '/missing.ogg', '/missing.mp3']);
  assert.equal(bgm.getCurrentTrack(), 'calm');
  assert.equal(ctx.nodes.filter(n => n.started).length, 1);
});

test('미리 받은 탐색·위험 음원은 첫 입력에서 한 번만 해독하고 선택한 곡만 시작한다', async () => {
  const ctx = makeFakeAudioContext();
  let shared = null, unlock;
  const fetched = [];
  const bgm = createBgm({ base: '/', sfxInstance: {
    getContext: () => shared, onUnlock: fn => { unlock = fn; },
  }, fetchImpl: async url => { fetched.push(url); return new Response(new Uint8Array(1)); } });
  const decode = ctx.decodeAudioData;
  let decodes = 0;
  ctx.decodeAudioData = (...args) => { decodes++; return decode(...args); };
  bgm.preload(['calm', 'tense']);
  await bgm.play('calm');
  assert.equal(decodes, 0);
  shared = ctx;
  await unlock();
  await bgm.setMood('tense');
  assert.deepEqual(fetched, ['/calm.ogg', '/tense.ogg']);
  assert.equal(decodes, 2);
  assert.equal(ctx.nodes.filter(n => n.started).length, 2);
});

test('늦은 해독과 연속 전환 중 이미 취소한 곡은 시작하지 않는다', async () => {
  const ctx = makeFakeAudioContext();
  const response = () => new Response(new Uint8Array(1));
  const late = Promise.withResolvers();
  const bgm = createBgm({ sfxInstance: { getContext: () => ctx }, base: '/',
    fetchImpl: async url => url.includes('tense') ? late.promise : response() });
  await bgm.play('calm');
  const pending = bgm.setMood('tense');
  await bgm.setMood('boss');
  late.resolve(response());
  await pending;
  const [calm, boss] = ctx.nodes.filter(n => n.started);
  assert.equal(calm.stopped, true);
  assert.equal(boss.stopped, false);
  assert.equal(bgm.getCurrentTrack(), 'boss');
  assert.equal(ctx.nodes.filter(n => n.started).length, 2);
});

test('필드 음악은 줌이 물러난 시야·기존 격자를 사용하고 매혹된 적과 화면 밖의 적을 제외한다', async t => {
  globalThis.Phaser ??= { Scene: class {} };
  const { PlayScene } = await import('../src/scenes/PlayScene.js');
  const { buildGrid } = await import('../src/game/enemyAI.js');
  const { bgm } = await import('../src/audio/bgm.js');
  const moods = [];
  t.mock.method(bgm, 'setMood', mood => moods.push(mood));
  const enemy = { x: 950, y: 500, size: 40, sprite: { active: true } };
  const field = { player: { x: 500, y: 500, size: 20 }, grid: buildGrid([enemy], 128),
    hunger: { state: 'grace' }, heraldState: { alive: 0 }, musicTracker: createMoodTracker(),
    musicNearby: [], playSec: 0, simTime: 0, musicHitUntil: -Infinity };
  const view = { left: 0, right: 1000, top: 300, bottom: 700, width: 1000 };
  const step = () => PlayScene.prototype.updateFieldMusic.call(field, view);
  step(); // 큰 적이 450 거리, 현재 시야 반너비는 500이다.
  field.musicTracker.reset();
  enemy.charmUntil = 1;
  step();
  enemy.charmUntil = 0;
  enemy.x = 500;
  enemy.y = 750;
  field.grid = buildGrid([enemy], 128, field.grid);
  step();
  field.musicHitUntil = 1.5;
  step();
  field.heraldState.alive = 1;
  step();
  assert.deepEqual(moods, ['tense', 'calm', 'calm', 'tense', 'boss']);
});

// 클릭 방지·메모리·규격 보강
test('음량 변경은 즉시 값을 바꾸지 않고 50 ms 램프로 옮긴다', () => {
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  try {
    const ctx = makeFakeAudioContext();
    const bgm = createBgm({ sfxInstance: { getContext: () => ctx } });
    bgm.ensureBuses();
    const musicBus = ctx.nodes[1];
    ctx.advanceTime(3);
    bgm.setVolume(0.8);
    const [cancel, set, ramp] = musicBus.gain.events.slice(-3);
    assert.deepEqual([cancel.type, set.type, ramp.type], ['cancel', 'set', 'linearRamp']);
    assert.ok(Math.abs(ramp.val - 0.64) < 1e-9);
    assert.ok(Math.abs(ramp.t - 3.05) < 1e-9);
  } finally {
    delete globalThis.localStorage;
  }
});

test('destroy는 소리를 램프로 내린 뒤 정지를 예약한다', async () => {
  const ctx = makeFakeAudioContext();
  const bgm = createBgm({ sfxInstance: { getContext: () => ctx }, base: '/',
    fetchImpl: async () => new Response(new Uint8Array(1)) });
  await bgm.play('calm');
  const source = ctx.nodes.find(n => n.started);
  ctx.advanceTime(5);
  bgm.destroy();
  assert.ok(Math.abs(source.stopTime - (5 + SOFT_STOP_SEC)) < 1e-9);
  assert.equal(source.connectedTo.gain.events.at(-1).val, 0);
});

test('판 시작 때 필드 곡만 남기고, 버린 곡은 다시 받지 않고 압축본에서 해독한다', async () => {
  const ctx = makeFakeAudioContext();
  const fetched = [];
  const decode = ctx.decodeAudioData;
  let decodes = 0;
  ctx.decodeAudioData = (...args) => { decodes++; return decode(...args); };
  const bgm = createBgm({ sfxInstance: { getContext: () => ctx }, base: '/',
    fetchImpl: async url => { fetched.push(url); return new Response(new Uint8Array(8)); } });
  assert.deepEqual(FIELD_TRACKS, ['calm', 'tense', 'boss']);
  await bgm.play('title');
  await bgm.play('calm', { crossfadeMs: 0 });
  ctx.nodes.find(n => n.started).onended(); // 크로스페이드가 끝나 title 소스가 사라진 상태
  bgm.keepOnly(FIELD_TRACKS);
  bgm.preload(['calm']);
  await Promise.resolve();
  assert.equal(decodes, 2); // 재생 중인 곡은 건드리지 않아 calm을 다시 해독하지 않는다.
  await bgm.preload(['title']);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(decodes, 3); // title은 버렸으므로 다시 해독하되
  assert.deepEqual(fetched, ['/title.ogg', '/calm.ogg']); // 압축본은 다시 받지 않는다.
});

test('boss는 압축 파일만 미리 받고 해독은 처음 나올 때 한다', async () => {
  const ctx = makeFakeAudioContext();
  const decode = ctx.decodeAudioData;
  let decodes = 0;
  ctx.decodeAudioData = (...args) => { decodes++; return decode(...args); };
  const fetched = [];
  const bgm = createBgm({ sfxInstance: { getContext: () => ctx }, base: '/',
    fetchImpl: async url => { fetched.push(url); return new Response(new Uint8Array(8)); } });
  bgm.prefetch(['boss']);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(fetched, ['/boss.ogg']);
  assert.equal(decodes, 0);
  await bgm.setMood('boss');
  assert.deepEqual(fetched, ['/boss.ogg']);
  assert.equal(decodes, 1);
});

test('곡별 반복 길이 표는 생성 스크립트·README와 같고, 파일 크기는 규격 안이다', () => {
  const dir = new URL('../assets/bgm/', import.meta.url);
  const script = readFileSync(new URL('generate_bgm.py', dir), 'utf8');
  const table = script.match(/^LOOP_SEC = (\{[^}]*\})/m)?.[1];
  assert.ok(table, 'generate_bgm.py에 LOOP_SEC 표가 있어야 한다');
  assert.deepEqual(JSON.parse(table), LOOP_SEC);
  const readme = readFileSync(new URL('README.md', dir), 'utf8');
  const totals = { ogg: 0, mp3: 0 };
  for (const [name, seconds] of Object.entries(LOOP_SEC)) {
    assert.match(readme, new RegExp(`\\| ${name} \\|.*\\| ${seconds}초`), name + ' 행의 길이');
    for (const ext of Object.keys(totals)) {
      const { size } = statSync(new URL(name + '.' + ext, dir));
      assert.ok(size <= 600_000, name + '.' + ext + ' ' + size);
      totals[ext] += size;
    }
  }
  assert.ok(totals.ogg <= 3_000_000 && totals.mp3 <= 3_000_000, JSON.stringify(totals));
});

test("음악 단추는 글자를 '음악'으로 고정하고 켜짐·꺼짐은 aria-pressed로만 전한다", async () => {
  const made = [];
  globalThis.document = { createElement: tag => {
    const node = Object.assign(new EventTarget(), { tag, attrs: {}, className: '', textContent: '',
      setAttribute(key, value) { this.attrs[key] = value; } });
    made.push(node);
    return node;
  } };
  const saved = new Map();
  globalThis.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, String(value)) };
  try {
    const { musicToggle } = await import('../src/ui/TitleView.js');
    const { bgm } = await import('../src/audio/bgm.js');
    bgm.setVolume(0.5);
    const toggle = musicToggle();
    assert.equal(toggle.textContent, '음악');
    assert.equal(toggle.attrs['aria-label'], undefined);
    assert.match(toggle.className, /\byk-music\b/);
    assert.equal(toggle.attrs['aria-pressed'], 'true');
    toggle.dispatchEvent(new Event('click'));
    assert.equal(toggle.textContent, '음악');
    assert.equal(toggle.attrs['aria-pressed'], 'false');
    assert.equal(saved.get('yokai-bgm-volume'), '0');
    toggle.dispatchEvent(new Event('click'));
    assert.equal(toggle.attrs['aria-pressed'], 'true');
    assert.equal(saved.get('yokai-bgm-volume'), '0.5');
  } finally {
    delete globalThis.document;
    delete globalThis.localStorage;
  }
});
