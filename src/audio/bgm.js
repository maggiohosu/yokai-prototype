// 배경음악(BGM) 재생 및 버스/크로스페이드/덕킹 관리 모듈.
// sfx.js와 같은 AudioContext를 공유하며, 첫 터치 전에는 소리를 내지 않습니다.
//
//   import { bgm } from '../audio/bgm.js';
//   bgm.play('calm');
//   bgm.setMood('tense'); // 0.6초 빠른 크로스페이드
//   bgm.setMood('calm');  // 2.5초 여유로운 크로스페이드
//   bgm.duck(true);       // -8dB 덕킹 (선택지/정비 패널 열림 시)
//   bgm.toggleMute();     // 켜기/끄기 토글 (yokai-bgm-volume 저장)

import { clampVolume, extensionOrder, sfx } from './sfx.js';

const BASE = new URL('../../assets/bgm/', import.meta.url).href;
// 곡별 반복 길이(초). assets/bgm/generate_bgm.py의 LOOP_SEC·README 표와 같은 값이다(tests/bgm.test.mjs가 대조한다).
export const LOOP_SEC = { calm: 48, tense: 48, boss: 48, title: 48 };
// 판 도중 해독본(PCM)을 들고 있는 곡. 한 곡이 48초 스테레오로 약 17 MB라 나머지는 판이 시작될 때 버린다.
export const FIELD_TRACKS = ['calm', 'tense', 'boss'];
export const BGM_VOLUME_KEY = 'yokai-bgm-volume';
export const DEFAULT_BGM_VOLUME = 0.5;

// 크로스페이드 규격
export const FADE_TO_TENSE_MS = 600;  // 긴급 전환: 약 0.6초
export const FADE_TO_CALM_MS = 2500;  // 여유 복귀: 약 2.5초
export const FADE_DEFAULT_MS = 1000;
export const FADE_OUT_STOP_MS = 1500; // 게임 오버 페이드아웃

// 덕킹 규격 (-8 dB)
export const DUCK_ATTENUATION_DB = -8.0;
export const DUCK_GAIN_RATIO = 10.0 ** (DUCK_ATTENUATION_DB / 20.0); // 약 0.3981
export const DUCK_TWEEN_SEC = 0.25;

// 클릭 방지: 즉시 정지 대신 짧게 내린 뒤 끈다(램프 60 ms, 정지는 80 ms 뒤).
export const SOFT_RAMP_SEC = 0.06;
export const SOFT_STOP_SEC = 0.08;
export const VOLUME_RAMP_SEC = 0.05;

export function storedBgmVolume() {
  try {
    const raw = globalThis.localStorage?.getItem(BGM_VOLUME_KEY);
    const value = raw == null ? NaN : Number(raw);
    return Number.isFinite(value) ? clampVolume(value) : DEFAULT_BGM_VOLUME;
  } catch {
    return DEFAULT_BGM_VOLUME;
  }
}

export function createBgm({ base = BASE, sfxInstance = sfx, fetchImpl, canPlayType, target } = {}) {
  const doFetch = fetchImpl ?? globalThis.fetch?.bind(globalThis);
  const events = target ?? globalThis.document;
  const probe = canPlayType ?? (typeof Audio === 'function' ? type => new Audio().canPlayType(type) : null);
  const debug = new URLSearchParams(globalThis.location?.search).get('debug') === 'music';
  let volume = storedBgmVolume();
  let ctx = null;
  let musicBus = null;
  let duckBus = null;
  let isDucked = false;
  const compressed = new Map(); // 압축 ArrayBuffer. 해독본을 버려도 다시 받지 않는다.
  const decoded = new Map();
  const goodExt = new Map(); // 곡별로 해독에 성공한 형식. 다시 해독할 때 먼저 쓴다.
  const warmAfterUnlock = new Set();
  let formats;
  const voices = new Set(); // 전환 도중에는 사라지는 곡도 정지할 수 있어야 한다.
  let currentTrack = null;
  let requested = null;
  let offset = 0;
  let rotationPaused = false;
  let visible = !events?.hidden;

  function ensureBuses() {
    if (!ctx) {
      ctx = sfxInstance.getContext?.() ?? null;
    }
    if (!ctx || musicBus) return !!musicBus;

    try {
      // 버스 구조: TrackGain -> duckBus (-8dB tween) -> musicBus (volume^2) -> ctx.destination
      duckBus = ctx.createGain();
      duckBus.gain.value = isDucked ? DUCK_GAIN_RATIO : 1.0;

      musicBus = ctx.createGain();
      musicBus.gain.value = volume * volume;

      duckBus.connect(musicBus);
      musicBus.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function readFile(name, ext) {
    const url = base + name + '.' + ext;
    if (!compressed.has(url)) {
      compressed.set(url, (async () => {
        const response = await doFetch(url);
        if (!response.ok) throw new Error(String(response.status));
        return response.arrayBuffer();
      })());
    }
    return compressed.get(url);
  }

  function preload(names) {
    if (!volume) return;
    formats ??= extensionOrder(probe);
    for (const name of names) {
      if (decoded.has(name)) continue;
      if (ensureBuses()) {
        decode(name);
        continue;
      }
      warmAfterUnlock.add(name);
      const url = base + name + '.' + formats[0];
      readFile(name, formats[0]).catch(() => compressed.delete(url));
    }
  }

  function decode(name) {
    if (!decoded.has(name)) {
      decoded.set(name, (async () => {
        formats ??= extensionOrder(probe);
        const first = goodExt.get(name);
        const order = first ? [first, ...formats.filter(ext => ext !== first)] : formats;
        for (const ext of order) {
          try {
            const data = await readFile(name, ext);
            // decodeAudioData는 넘긴 ArrayBuffer를 비우므로 복사본을 넘기고 압축본은 남긴다.
            const buffer = await new Promise((resolve, reject) => {
              ctx.decodeAudioData(data.slice(0), resolve, reject)?.then?.(resolve, reject);
            });
            goodExt.set(name, ext);
            return buffer;
          } catch { /* 해독에 실패하면 다음 파일 형식을 시도한다. */ }
          compressed.delete(base + name + '.' + ext);
        }
        decoded.delete(name);
        return null;
      })());
    }
    return decoded.get(name);
  }

  // 판 중에 쓰는 곡만 해독본으로 남긴다. 재생 중인 곡은 건드리지 않는다(소스가 버퍼를 쥐고 있다).
  function keepOnly(names) {
    const keep = new Set(names);
    for (const track of voices) keep.add(track.name);
    for (const name of [...decoded.keys()]) if (!keep.has(name)) decoded.delete(name);
  }

  // 해독 없이 압축 파일만 미리 받아 둔다(예: 처음 나올 때 해독하는 boss).
  function prefetch(names) {
    if (!volume) return;
    formats ??= extensionOrder(probe);
    for (const name of names) {
      const ext = goodExt.get(name) ?? formats[0];
      const url = base + name + '.' + ext;
      readFile(name, ext).catch(() => compressed.delete(url));
    }
  }

  function fadeOut(track, seconds, stopLag = 0) {
    const now = ctx.currentTime;
    const end = now + seconds;
    const stopAt = end + stopLag;
    if (track.stopAt <= stopAt) return;
    const gain = track.gainNode.gain;
    const from = gain.value;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(from, now);
    gain.linearRampToValueAtTime(0, end);
    track.source.stop(stopAt);
    track.stopAt = stopAt;
  }

  // 즉시 끄고 싶을 때(탭 숨김·음소거·회전): 클릭 없이 60 ms 램프 뒤 80 ms에 정지한다.
  function softStop(track) {
    fadeOut(track, SOFT_RAMP_SEC, SOFT_STOP_SEC - SOFT_RAMP_SEC);
  }

  function position(track) {
    return (ctx.currentTime - track.startedAt + track.offset) % track.source.loopEnd;
  }

  async function startRequested() {
    const request = requested;
    if (!request || !visible || rotationPaused || !volume || !ensureBuses()) return;
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') ctx.resume?.()?.catch(() => {});
    if (currentTrack?.name === request.name) return;
    const buffer = await decode(request.name);
    if (!buffer || requested !== request || !visible || rotationPaused || !volume ||
        currentTrack?.name === request.name) return;

    const previous = currentTrack;
    try {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      // MP3 인코더 앞뒤 지연이 남아 있어도 곡 길이에서 정확히 되감는다.
      source.loopStart = 0;
      source.loopEnd = Math.min(LOOP_SEC[request.name] ?? buffer.duration, buffer.duration);
      const gainNode = ctx.createGain();
      const now = ctx.currentTime;
      const seconds = request.crossfadeMs / 1000;
      const phase = previous && previous.name !== 'title' && request.name !== 'title'
        ? position(previous) : offset;
      const track = { name: request.name, source, gainNode, startedAt: now, offset: phase, stopAt: Infinity };
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(1, now + seconds);
      source.connect(gainNode);
      gainNode.connect(duckBus);
      source.onended = () => {
        source.disconnect();
        gainNode.disconnect();
        voices.delete(track);
      };
      source.start(now, phase % source.loopEnd);
      voices.add(track);
      currentTrack = track;
      if (previous) fadeOut(previous, seconds);
      if (debug) console.info('[music] ' + (previous?.name ?? '시작') + ' → ' + track.name);
    } catch { /* 오디오 장치가 없어도 게임은 계속 진행한다. */ }
  }

  function play(name, { crossfadeMs = FADE_DEFAULT_MS } = {}) {
    if (!name || requested?.name === name) return;
    requested = { name, crossfadeMs: Math.max(0, crossfadeMs) };
    offset = 0;
    return startRequested();
  }

  function stop({ fadeMs = FADE_OUT_STOP_MS } = {}) {
    requested = null;
    offset = 0;
    for (const track of voices) fadeOut(track, Math.max(SOFT_RAMP_SEC, fadeMs / 1000));
    currentTrack = null;
  }

  function setMood(mood) {
    if (mood === 'tense' || mood === 'boss') return play(mood, { crossfadeMs: FADE_TO_TENSE_MS });
    if (mood === 'calm') return play(mood, { crossfadeMs: FADE_TO_CALM_MS });
    if (mood === 'title') return play(mood);
  }

  function duck(active) {
    if (isDucked === !!active) return;
    isDucked = !!active;
    if (!ctx || !duckBus) return;
    try {
      const now = ctx.currentTime;
      const targetGain = isDucked ? DUCK_GAIN_RATIO : 1.0;
      duckBus.gain.cancelScheduledValues(now);
      duckBus.gain.setValueAtTime(duckBus.gain.value, now);
      duckBus.gain.linearRampToValueAtTime(targetGain, now + DUCK_TWEEN_SEC);
    } catch {}
  }

  function setVolume(val) {
    volume = clampVolume(val);

    if (musicBus && ctx) {
      try {
        const now = ctx.currentTime;
        const from = musicBus.gain.value;
        musicBus.gain.cancelScheduledValues(now);
        musicBus.gain.setValueAtTime(from, now);
        musicBus.gain.linearRampToValueAtTime(volume * volume, now + VOLUME_RAMP_SEC);
      } catch {}
    }
    try {
      globalThis.localStorage?.setItem(BGM_VOLUME_KEY, String(volume));
    } catch {}
    syncPlayback();
    return volume;
  }

  function toggleMute() {
    return setVolume(volume > 0 ? 0 : DEFAULT_BGM_VOLUME);
  }

  function syncPlayback() {
    if (visible && !rotationPaused && volume > 0) return startRequested();
    if (currentTrack && currentTrack.name === requested?.name) offset = position(currentTrack);
    currentTrack = null;
    for (const track of voices) softStop(track);
  }

  function handleVisibilityChange() {
    visible = !events.hidden;
    syncPlayback();
  }

  function setRotationPaused(paused) {
    if (rotationPaused === paused) return;
    rotationPaused = paused;
    syncPlayback();
  }

  const removeUnlock = sfxInstance.onUnlock?.(() => {
    const started = startRequested();
    preload(warmAfterUnlock);
    warmAfterUnlock.clear();
    return started;
  });
  events?.addEventListener?.('visibilitychange', handleVisibilityChange);

  return {
    preload,
    prefetch,
    keepOnly,
    play,
    stop,
    setMood,
    duck,
    setVolume,
    toggleMute,
    getVolume: () => volume,
    isMuted: () => volume <= 0,
    getCurrentTrack: () => currentTrack?.name ?? null,
    getCurrentMood: () => requested?.name ?? null,
    setRotationPaused,
    isDucked: () => isDucked,
    isReady: () => !!ctx,
    ensureBuses,
    destroy: () => {
      removeUnlock?.();
      if (ctx) for (const track of voices) softStop(track);
      if (events?.removeEventListener) {
        events.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      requested = null;
      currentTrack = null;
      decoded.clear();
      compressed.clear();
      warmAfterUnlock.clear();
      // 램프가 끝난 뒤에 버스를 끊는다.
      const buses = [duckBus, musicBus];
      setTimeout(() => { for (const bus of buses) bus?.disconnect(); }, SOFT_STOP_SEC * 1000 + 40).unref?.();
    },
  };
}

export const bgm = createBgm();
export default bgm;
