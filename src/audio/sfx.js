// 효과음 파일(assets/sfx/<이름>.ogg|.mp3)을 재생하는 작은 모듈.
// 휴대폰은 첫 터치 전에는 소리를 막으므로 AudioContext는 첫 사용자 입력 때 만든다.
// 파일이 없거나 브라우저가 소리를 못 내면 조용히 넘어간다(오류를 던지지 않는다).
//
//   import { sfx } from '../audio/sfx.js';
//   sfx.preload(['enhance-charge', 'enhance-success']);
//   const voice = sfx.play('enhance-charge', { volume: 0.8 }); voice.stop();
//   sfx.setVolume(0.5);

const BASE = new URL('../../assets/sfx/', import.meta.url).href;
const VOLUME_KEY = 'yokai-sfx-volume';
const GESTURES = ['pointerdown', 'touchend', 'keydown'];
const SILENT = Object.freeze({ started: false, stop() {} });
const REPLAY_SECONDS = 0.08;
const MAX_VOICES = 6;

function storedVolume() {
  try {
    const raw = globalThis.localStorage?.getItem(VOLUME_KEY);
    const value = raw == null ? NaN : Number(raw);
    return Number.isFinite(value) ? clampVolume(value) : 0.8;
  } catch {
    return 0.8;
  }
}

export function clampVolume(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

// 브라우저가 재생할 수 있는 확장자를 먼저 시도한다. 둘 다 모르면 두 가지를 모두 시도한다.
export function extensionOrder(canPlayType) {
  const ogg = canPlayType?.('audio/ogg; codecs="vorbis"') ?? '';
  const mp3 = canPlayType?.('audio/mpeg') ?? '';
  if (ogg && !mp3) return ['ogg'];
  if (mp3 && !ogg) return ['mp3'];
  return ogg === 'probably' || !mp3 ? ['ogg', 'mp3'] : ['mp3', 'ogg'];
}

export function createSfx({ base = BASE, fetchImpl, AudioCtor, target, canPlayType } = {}) {
  const win = globalThis.window;
  const Ctor = AudioCtor ?? win?.AudioContext ?? win?.webkitAudioContext;
  const doFetch = fetchImpl ?? globalThis.fetch?.bind(globalThis);
  const events = target ?? (typeof document !== 'undefined' ? document : null);
  const probe = canPlayType ?? (typeof Audio === 'function' ? (type) => new Audio().canPlayType(type) : null);
  let ctx = null;
  let master = null;
  let volume = storedVolume();
  const raw = new Map();      // 이름 → Promise<ArrayBuffer | null>
  const decoded = new Map();  // 이름 → Promise<AudioBuffer | null>
  const lastStart = new Map();
  let activeVoices = 0;
  let listening = false;
  const unlockListeners = new Set();

  function fetchRaw(name) {
    if (!raw.has(name)) {
      raw.set(name, (async () => {
        if (!doFetch) return null;
        for (const ext of extensionOrder(probe)) {
          try {
            const response = await doFetch(base + name + '.' + ext);
            if (response.ok) return await response.arrayBuffer();
          } catch { /* 다음 확장자 */ }
        }
        return null;
      })());
    }
    return raw.get(name);
  }

  function decode(name) {
    if (!ctx) return Promise.resolve(null);
    if (!decoded.has(name)) {
      decoded.set(name, fetchRaw(name).then(data => {
        if (!data) return null;
        // decodeAudioData는 버퍼를 넘겨받으므로 복사본을 준다.
        return new Promise(resolve => {
          try {
            const pending = ctx.decodeAudioData(data.slice(0), resolve, () => resolve(null));
            pending?.catch?.(() => resolve(null));
          } catch {
            resolve(null);
          }
        });
      }));
    }
    return decoded.get(name);
  }

  function unlock() {
    if (!Ctor) return false;
    try {
      if (!ctx) {
        ctx = new Ctor();
        master = ctx.createGain();
        master.gain.value = volume;
        master.connect(ctx.destination);
        for (const name of raw.keys()) decode(name);
      }
      if (ctx.state === 'suspended') ctx.resume?.()?.catch?.(() => {});
      for (const cb of unlockListeners) {
        try { cb(ctx); } catch {}
      }
      unlockListeners.clear();
      stopListening();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  const onGesture = () => unlock();
  function listen() {
    if (listening || ctx || !events?.addEventListener) return;
    listening = true;
    for (const type of GESTURES) events.addEventListener(type, onGesture, { capture: true, passive: true });
  }
  function stopListening() {
    if (!listening) return;
    listening = false;
    for (const type of GESTURES) events.removeEventListener(type, onGesture, { capture: true });
  }

  function preload(names) {
    listen();
    for (const name of names) {
      fetchRaw(name);
      if (ctx) decode(name);
    }
  }

  // 아직 불러오지 못했으면 이번 재생은 건너뛴다(늦게 울리는 소리는 결과와 어긋난다).
  function play(name, { volume: gain = 1, rate = 1, waitMs = 120, loop = false } = {}) {
    if (!ctx || volume <= 0) {
      preload([name]);
      return SILENT;
    }
    const startedAt = ctx.currentTime;
    let source = null;
    let cancelled = false;
    decode(name).then(buffer => {
      if (!buffer || cancelled || !ctx) return;
      if (ctx.currentTime - startedAt > waitMs / 1000) return;
      const now = ctx.currentTime;
      if (activeVoices >= MAX_VOICES || now < (lastStart.get(name) ?? -Infinity) + REPLAY_SECONDS) return;
      try {
        source = ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = rate;
        source.loop = !!loop;
        const level = ctx.createGain();
        level.gain.value = clampVolume(gain);
        source.connect(level);
        level.connect(master);
        source.onended = () => {
          activeVoices--;
          source.disconnect();
          level.disconnect();
        };
        source.start();
        activeVoices++;
        lastStart.set(name, now);
      } catch {
        source = null;
      }
    });
    return {
      get started() { return source !== null && !cancelled; },
      stop(fadeMs = 60) {
        cancelled = true;
        if (!source || !ctx) return;
        try {
          source.stop(ctx.currentTime + fadeMs / 1000);
        } catch { /* 이미 끝남 */ }
      },
    };
  }

  function setVolume(value) {
    volume = clampVolume(value);
    if (master) master.gain.value = volume;
    try {
      globalThis.localStorage?.setItem(VOLUME_KEY, String(volume));
    } catch { /* 저장소가 막혀도 이번 세션 음량은 적용된다 */ }
    return volume;
  }

  function onUnlock(fn) {
    if (typeof fn !== 'function') return () => {};
    if (ctx && ctx.state !== 'suspended') {
      try { fn(ctx); } catch {}
    } else {
      unlockListeners.add(fn);
    }
    return () => unlockListeners.delete(fn);
  }

  // 게임 어디서든 첫 입력이 오면 잠금을 푼다(정비창을 열기 전의 터치도 포함).
  listen();

  return {
    preload,
    play,
    unlock,
    setVolume,
    getVolume: () => volume,
    isReady: () => !!ctx,
    getContext: () => ctx,
    getMasterNode: () => master,
    onUnlock,
  };
}

export function getAudioContext() {
  return sfx.getContext();
}

export const sfx = createSfx();
export default sfx;
