// 여의주 강화·판매 연출. 확률 결과는 treasure.tryUpgrade가 먼저 정하고, 여기서는 보여주기만 한다.
//   playEnhanceFx(attempt, { shake, sub, onDone, skipCharge })  attempt = tryUpgrade 결과({ result, from, to, shards })
//   보호권을 쓸 수 있는 깨짐은 두 번에 나눠 보여 준다(사용자 지시 2026-11-24, 변경 이력 23):
//     ① result 'suspense'(깨짐 직전): 긴장 → '깨질 위기' 한 장면을 보이고 끝난다. 이어서 호출 측이 보호권 선택창을 연다.
//     ② 선택 뒤 result 'protected'(보호됨) 또는 'break'(기존 깨짐 연출)를 skipCharge: true로 결과 장면만 보여 준다(긴장은 ①에서 이미 봤다).
//   playSellFx({ origin, wallet, amount, from, to, format, level })
// 위쪽의 순수 함수(fxTier·planFx·clock)는 node 테스트에서 그대로 쓴다. DOM은 play* 안에서만 만진다.

import { sfx } from '../audio/sfx.js';

export const FX = {
  chargeMs: 800,
  reducedChargeMs: 250,
  revealMs: { success: 1300, great: 2100, fail: 1000, break: 1500, suspense: 900, protected: 1300 },
  tierRevealBonus: { base: 0, gold: 250, grand: 650 },
  reducedRevealMs: 900,
  // 긴장을 건너뛴 탭이 결과까지 곧바로 닫지 않게 한다.
  tapCloseAfterMs: 220,
  goldFrom: 10,
  grandFrom: 13,
  maxLevel: 15,
};

export const SOUNDS = {
  charge: 'enhance-charge',
  success: 'enhance-success',
  great: 'enhance-great',
  fail: 'enhance-fail',
  break: 'enhance-break',
  sell: 'sell-coins',
};

const MOTION_KEY = 'yokai-fx-motion';

export function fxTier(level) {
  if (level >= FX.grandFrom) return 'grand';
  if (level >= FX.goldFrom) return 'gold';
  return 'base';
}

const round1 = (value) => Math.round(value * 10) / 10;

// 긴장 구간은 시도한 레벨만 보고 정한다. 결과를 미리 흘리지 않기 위해 attempt.result를 읽지 않는다.
export function chargePlan(from, { reduced = false } = {}) {
  const target = from + 1;
  const tier = fxTier(target);
  const t = Math.min(1, target / FX.maxLevel);
  return {
    target,
    tier,
    ms: reduced ? FX.reducedChargeMs : FX.chargeMs,
    shakePx: reduced ? 0 : round1(1.2 + t * 2.8 + (tier === 'grand' ? 1.5 : 0)),
    motes: reduced ? 0 : Math.round(16 + t * 44),
    spread: tier === 'grand' ? 'screen' : 'stage',
    sound: SOUNDS.charge,
  };
}

export function revealPlan(attempt, { reduced = false } = {}) {
  const kind = { great: 'great', break: 'break', success: 'success', protected: 'protected', suspense: 'suspense' }[attempt.result] ?? 'fail';
  const up = kind === 'success' || kind === 'great';
  const level = up ? attempt.to : attempt.from + 1;
  const tier = fxTier(level);
  const t = Math.min(1, level / FX.maxLevel);
  const rank = { base: 0, gold: 1, grand: 2 }[tier];
  const plan = {
    kind,
    level,
    tier,
    fullscreen: tier === 'grand' || kind === 'great',
    ms: reduced ? FX.reducedRevealMs : FX.revealMs[kind] + FX.tierRevealBonus[tier],
    sparks: 0,
    fireworks: 0,
    shards: 0,
    cracks: 0,
    rays: false,
    flash: 0,
    impactPx: 0,
    textScale: round1(1 + t * 0.5 + (kind === 'great' ? 0.2 : 0)),
    sounds: [{ name: SOUNDS[kind], volume: 1 }],
    title: '',
    sub: '',
  };
  if (kind === 'success' || kind === 'great') {
    plan.title = '+' + attempt.to + (kind === 'great' ? ' 대성공' : ' 성공');
    plan.sparks = Math.round(36 + t * 60 + rank * 30);
    plan.rays = rank > 0 || kind === 'great';
    plan.flash = round1(Math.min(1, 0.45 + rank * 0.25 + (kind === 'great' ? 0.3 : 0)));
    plan.impactPx = round1(2 + rank * 3 + t * 2);
    plan.fireworks = kind === 'great' ? 4 + rank : rank === 2 ? 2 : 0;
    // 최고 구간 성공은 팡파르를 겹쳐 울린다.
    if (kind === 'success' && tier === 'grand') plan.sounds.push({ name: SOUNDS.great, volume: 0.7 });
  } else if (kind === 'fail') {
    plan.title = '실패';
    plan.sub = '+' + attempt.from + ' 유지';
    plan.cracks = 2 + rank;
    plan.impactPx = round1(3 + rank * 1.5);
  } else if (kind === 'suspense') {
    // 깨짐 직전: 금만 가고 결과는 아직이다. 소리는 내지 않아 긴장이 끊긴 정적이 된다.
    plan.title = '깨질 위기';
    plan.sub = '보호권으로 막을 수 있어요';
    plan.cracks = 3 + rank;
    plan.impactPx = round1(2 + rank * 1.5);
    plan.sounds = [];
  } else if (kind === 'protected') {
    plan.title = '보호됨';
    plan.sub = '+' + attempt.from + ' 유지 · 보호권 1장 사용';
    plan.sparks = Math.round(24 + t * 30);
    plan.flash = round1(0.35 + rank * 0.1);
    plan.impactPx = round1(1.5 + rank);
    plan.sounds = [{ name: SOUNDS.success, volume: 0.7 }];
  } else {
    plan.title = '파괴';
    plan.sub = '파편 +' + (attempt.shards ?? 0);
    plan.cracks = 5 + rank;
    plan.shards = 14 + rank * 7;
    plan.flash = round1(0.3 + rank * 0.15);
    plan.impactPx = round1(5 + rank * 2.5);
  }
  if (reduced) {
    Object.assign(plan, { sparks: 0, fireworks: 0, shards: 0, rays: false, flash: 0, impactPx: 0, textScale: 1 });
  }
  return plan;
}

export function planFx(attempt, { reduced = false } = {}) {
  return { charge: chargePlan(attempt.from, { reduced }), reveal: revealPlan(attempt, { reduced }), reduced };
}

// 결과 장면만 보이는 연출인가(보호권 선택 뒤의 보호됨·깨짐). 이때 긴장 구간은 건너뛴다.
export const resultOnly = (attempt) => attempt.result === 'protected';

export function sellPlan(amount, { reduced = false } = {}) {
  const coins = reduced ? 0 : Math.round(Math.min(36, Math.max(6, Math.log10(Math.max(1, amount)) * 7)));
  return { coins, big: amount >= 5000, countMs: reduced ? 0 : 650, sound: SOUNDS.sell };
}

// 시각(ms)만으로 움직이는 진행 상태. charge → reveal → done.
export function startClock(now = 0) {
  return { phase: 'charge', since: now, skipped: false };
}

export function tickClock(clock, now, timing) {
  let next = clock;
  for (;;) {
    if (next.phase === 'charge' && now - next.since >= timing.chargeMs) {
      next = { ...next, phase: 'reveal', since: next.since + timing.chargeMs };
    } else if (next.phase === 'reveal' && now - next.since >= timing.revealMs) {
      next = { ...next, phase: 'done', since: next.since + timing.revealMs };
    } else {
      return next;
    }
  }
}

// 탭: 긴장 중이면 곧바로 결과, 결과가 조금 보인 뒤면 닫기.
export function tapClock(clock, now, timing) {
  const current = tickClock(clock, now, timing);
  if (current.phase === 'charge') return { phase: 'reveal', since: now, skipped: true };
  if (current.phase === 'reveal' && now - current.since >= FX.tapCloseAfterMs) {
    return { ...current, phase: 'done', since: now };
  }
  return current;
}

export function prefersReducedFx() {
  try {
    const stored = globalThis.localStorage?.getItem(MOTION_KEY);
    if (stored === 'reduced') return true;
    if (stored === 'full') return false;
  } catch { /* 저장소가 막혀도 시스템 설정을 따른다 */ }
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// 게임 설정 화면에서 'reduced' | 'full' | null(시스템 따름)로 부른다.
export function setFxMotion(mode) {
  try {
    if (mode === 'reduced' || mode === 'full') globalThis.localStorage?.setItem(MOTION_KEY, mode);
    else globalThis.localStorage?.removeItem(MOTION_KEY);
  } catch { /* 이번 세션은 시스템 설정을 따른다 */ }
}

export function preloadEnhanceSounds() {
  sfx.preload(Object.values(SOUNDS));
}

/* ───────────── 여기부터 DOM ───────────── */

const PALETTE = {
  base: { spark: ['#fffbe9', '#d9f0de', '#9fd3b4'], shard: ['#8dbfa4', '#5d917a', '#c4e6d1'], edge: '#f4fbf2' },
  gold: { spark: ['#fff6d6', '#f3d68a', '#e0a93b'], shard: ['#e3b85a', '#a8741f', '#f6dc98'], edge: '#fff4cf' },
  grand: { spark: ['#ffffff', '#ffe9a8', '#ffd36b', '#ffb44a'], shard: ['#f2c96a', '#b98325', '#fff0c2'], edge: '#ffffff' },
};
// 보호됨은 불꽃 대신 차가운 청록 빛으로 감싼다(깨짐의 붉은 빛과 구분).
const WARD = { spark: ['#ffffff', '#d4fff1', '#8fe3c8', '#5fc8aa'], shard: [], edge: '#ffffff' };
const FIREWORK_COLORS = ['#ffd36b', '#f28a6b', '#9fe0bd', '#ffffff', '#f6b3d0'];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const SOLID = new Set(['shard', 'dust', 'coin']);
const rand = (min, max) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const easeIn = (t) => t * t * t;
const easeOut = (t) => 1 - (1 - t) ** 3;

function crackPath() {
  const angle = rand(0, Math.PI * 2);
  let x = 50 + rand(-6, 6);
  let y = 50 + rand(-6, 6);
  let d = 'M' + x.toFixed(1) + ' ' + y.toFixed(1);
  const steps = 4 + Math.floor(rand(0, 3));
  for (let i = 0; i < steps; i++) {
    const a = angle + rand(-0.7, 0.7);
    const len = rand(7, 13);
    x += Math.cos(a) * len;
    y += Math.sin(a) * len;
    d += ' L' + x.toFixed(1) + ' ' + y.toFixed(1);
  }
  return d;
}

function crackSvg(count) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'ykfx-crack');
  svg.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) {
    const d = crackPath();
    for (const cls of ['ykfx-crack-glow', 'ykfx-crack-line']) {
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', d);
      path.setAttribute('pathLength', '1');
      path.setAttribute('class', cls);
      path.style.setProperty('--i', String(i));
      svg.append(path);
    }
  }
  return svg;
}

function makeCanvas(layer) {
  const canvas = el('canvas', 'ykfx-canvas');
  canvas.setAttribute('aria-hidden', 'true');
  layer.append(canvas);
  const ctx = canvas.getContext('2d');
  let dpr = 1;
  function fit() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
  }
  fit();
  window.addEventListener('resize', fit);
  return {
    ctx,
    clear() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    },
    dispose() { window.removeEventListener('resize', fit); },
  };
}

function drawParticles(ctx, list, dt, now) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    if (p.delay > 0) { p.delay -= dt; continue; }
    p.age += dt;
    if (p.age >= p.life) { list.splice(i, 1); p.onEnd?.(); continue; }
    const k = p.age / p.life;
    ctx.globalCompositeOperation = SOLID.has(p.kind) ? 'source-over' : 'lighter';
    if (p.kind === 'mote') {
      const r = p.r0 * (1 - easeIn(k));
      const a = p.a + k * p.swirl;
      const x = p.cx() + Math.cos(a) * r;
      const y = p.cy() + Math.sin(a) * r;
      ctx.globalAlpha = Math.min(1, k * 3) * (0.5 + 0.5 * k);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x, y, p.size * (0.6 + k), 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    if (p.kind === 'coin') {
      const t = easeOut(Math.min(1, k));
      const u = 1 - t;
      const x = u * u * p.x0 + 2 * u * t * p.x1 + t * t * p.x2();
      const y = u * u * p.y0 + 2 * u * t * p.y1 + t * t * p.y2();
      const spin = Math.abs(Math.cos(now / 90 + p.phase));
      const shrink = 1 - 0.55 * t * t;
      ctx.globalAlpha = k > 0.9 ? (1 - k) * 10 : 1;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(Math.max(0.15, spin) * shrink, shrink);
      ctx.fillStyle = '#d9a63a';
      ctx.strokeStyle = '#8a5f16';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#5b3d0c';
      const hole = p.size * 0.38;
      ctx.fillRect(-hole / 2, -hole / 2, hole, hole);
      ctx.restore();
      continue;
    }
    p.vx *= 1 - p.drag * dt;
    p.vy = p.vy * (1 - p.drag * dt) + p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const fade = 1 - k;
    if (p.kind === 'spark') {
      ctx.globalAlpha = fade;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.size * (0.4 + fade * 0.6);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
      ctx.stroke();
    } else if (p.kind === 'ring') {
      ctx.globalAlpha = fade * p.alpha;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.size * fade + 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r0 + easeOut(k) * p.r1, 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.kind === 'shard') {
      p.rot += p.vr * dt;
      ctx.globalAlpha = Math.min(1, fade * 1.6);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.edge;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      p.poly.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else if (p.kind === 'dust') {
      ctx.globalAlpha = fade * 0.8;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function burst(list, x, y, { count, colors, speed = [260, 620], gravity = 260, life = [0.5, 1.1], size = [1.6, 3.4], drag = 1.6 }) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2);
    const v = rand(speed[0], speed[1]);
    list.push({
      kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      gravity, drag, age: 0, life: rand(life[0], life[1]), size: rand(size[0], size[1]),
      color: pick(colors), delay: 0,
    });
  }
}

let active = null;

// attempt는 이미 정해진 결과다. onDone은 연출이 끝나거나 건너뛰어 닫힐 때 한 번 불린다.
export function playEnhanceFx(attempt, { shake, sub, onDone, reduced = prefersReducedFx(), skipCharge = false } = {}) {
  active?.finish();
  const plan = planFx(attempt, { reduced });
  const { charge, reveal } = plan;
  const timing = { chargeMs: skipCharge ? 0 : charge.ms, revealMs: reveal.ms };
  const palette = reveal.kind === 'protected' ? WARD : PALETTE[reveal.tier];

  const layer = el('dialog', 'ykfx');
  layer.dataset.tier = skipCharge ? reveal.tier : charge.tier;
  layer.dataset.phase = skipCharge ? 'reveal' : 'charge';
  layer.dataset.kind = reveal.kind;
  layer.dataset.full = String(reveal.fullscreen);
  if (reduced) layer.dataset.reduced = 'true';
  layer.setAttribute('aria-label', '여의주 강화');
  layer.style.setProperty('--text-scale', String(reveal.textScale));
  layer.style.setProperty('--flash', String(reveal.flash));
  const veil = el('div', 'ykfx-veil');
  const rays = el('div', 'ykfx-rays');
  const canvas = makeCanvas(layer);
  const stage = el('div', 'ykfx-stage');
  const orbBox = el('div', 'ykfx-orb-box');
  const aura = el('div', 'ykfx-aura');
  const orb = el('div', 'ykfx-orb');
  orbBox.append(aura, orb);
  const words = el('div', 'ykfx-words');
  words.setAttribute('role', 'status');
  const stake = el('p', 'ykfx-stake', '+' + attempt.from + ' → +' + charge.target);
  const title = el('p', 'ykfx-title');
  const subLine = el('p', 'ykfx-sub');
  words.append(stake, title, subLine);
  stage.append(orbBox, words);
  const flash = el('div', 'ykfx-flash');
  const hint = el('p', 'ykfx-hint', skipCharge ? '탭하면 닫기' : '탭하면 건너뛰기');
  layer.prepend(veil, rays);
  layer.append(stage, flash, hint);
  document.body.append(layer);
  try {
    layer.showModal();
  } catch {
    layer.setAttribute('open', '');
  }
  layer.focus({ preventScroll: true });

  const particles = [];
  const center = () => {
    const box = orb.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2, r: box.width / 2 };
  };
  // 레이아웃은 프레임마다 한 번만 읽는다.
  let orbCenter = center();
  const spawnRadius = () => (charge.spread === 'screen'
    ? Math.hypot(window.innerWidth, window.innerHeight) * 0.55
    : Math.min(window.innerWidth, window.innerHeight) * 0.42);

  const t0 = performance.now();
  let clock = skipCharge ? { phase: 'reveal', since: t0, skipped: true } : startClock(t0);
  let revealedAt = 0;
  let last = t0;
  let raf = 0;
  let impact = { at: 0, px: 0, ms: 1 };
  let ended = false;
  let moteBudget = charge.motes;
  let moteClock = 0;
  const schedule = [];
  const chargeVoice = skipCharge ? { stop() {} } : sfx.play(charge.sound, { waitMs: 300 });

  function setShake(px) {
    if (!shake) return;
    shake.style.translate = px > 0.05 ? rand(-px, px).toFixed(1) + 'px ' + rand(-px, px).toFixed(1) + 'px' : '';
  }

  function enterReveal(now) {
    revealedAt = now;
    chargeVoice.stop(40);
    layer.dataset.phase = 'reveal';
    layer.dataset.tier = reveal.tier;
    hint.textContent = '탭하면 닫기';
    title.textContent = reveal.title;
    subLine.textContent = (reveal.kind === 'success' || reveal.kind === 'great') ? (sub ?? '') : reveal.sub;
    for (const sound of reveal.sounds) sfx.play(sound.name, { volume: sound.volume, waitMs: 200 });
    impact = { at: now, px: reveal.impactPx, ms: reveal.kind === 'fail' ? 260 : 380 };
    particles.length = 0;
    if (reveal.cracks) orbBox.append(crackSvg(reveal.cracks));
    if (reduced) return;
    const c = center();
    if (reveal.kind === 'success' || reveal.kind === 'great' || reveal.kind === 'protected') {
      burst(particles, c.x, c.y, {
        count: reveal.sparks, colors: palette.spark,
        speed: reveal.fullscreen ? [380, 1100] : [240, 640],
        life: reveal.fullscreen ? [0.7, 1.5] : [0.5, 1.1],
      });
      const ringSize = reveal.fullscreen ? Math.hypot(window.innerWidth, window.innerHeight) * 0.6 : c.r * 3.2;
      particles.push({ kind: 'ring', x: c.x, y: c.y, r0: c.r, r1: ringSize, size: 10, alpha: 0.9, color: palette.spark[1], age: 0, life: 0.6, vx: 0, vy: 0, gravity: 0, drag: 0, delay: 0 });
      if (reveal.tier !== 'base' || reveal.kind === 'protected') particles.push({ kind: 'ring', x: c.x, y: c.y, r0: c.r, r1: ringSize * 0.7, size: 5, alpha: 0.7, color: '#ffffff', age: 0, life: 0.75, vx: 0, vy: 0, gravity: 0, drag: 0, delay: 0.12 });
      for (let i = 0; i < reveal.fireworks; i++) {
        schedule.push({
          at: now + 180 + i * 260,
          run() {
            const x = rand(0.15, 0.85) * window.innerWidth;
            const y = rand(0.12, 0.5) * window.innerHeight;
            const color = FIREWORK_COLORS[i % FIREWORK_COLORS.length];
            burst(particles, x, y, { count: 46, colors: [color, '#ffffff', color], speed: [120, 420], gravity: 180, life: [0.8, 1.4], drag: 2.2 });
            particles.push({ kind: 'ring', x, y, r0: 4, r1: 70, size: 6, alpha: 0.8, color, age: 0, life: 0.45, vx: 0, vy: 0, gravity: 0, drag: 0, delay: 0 });
          },
        });
      }
    } else if (reveal.kind === 'fail' || reveal.kind === 'suspense') {
      for (let i = 0; i < 14; i++) {
        particles.push({ kind: 'dust', x: c.x + rand(-c.r, c.r) * 0.7, y: c.y + rand(-c.r, c.r) * 0.5, vx: rand(-30, 30), vy: rand(10, 80), gravity: 320, drag: 0.5, size: rand(1.5, 3), color: '#c9c2a8', age: 0, life: rand(0.5, 0.9), delay: rand(0, 0.15) });
      }
    } else {
      // 금이 번진 뒤 조각난다.
      schedule.push({
        at: now + 170,
        run() {
          layer.dataset.broken = 'true';
          const p = center();
          for (let i = 0; i < reveal.shards; i++) {
            const a = (i / reveal.shards) * Math.PI * 2 + rand(-0.2, 0.2);
            const v = rand(220, reveal.fullscreen ? 900 : 620);
            const s = rand(p.r * 0.18, p.r * 0.42);
            const poly = [];
            const corners = 3 + Math.floor(rand(0, 3));
            for (let j = 0; j < corners; j++) {
              const b = (j / corners) * Math.PI * 2 + rand(-0.4, 0.4);
              poly.push([Math.cos(b) * s * rand(0.5, 1), Math.sin(b) * s * rand(0.5, 1)]);
            }
            particles.push({
              kind: 'shard', x: p.x + Math.cos(a) * p.r * 0.3, y: p.y + Math.sin(a) * p.r * 0.3,
              vx: Math.cos(a) * v, vy: Math.sin(a) * v - 160, gravity: 1100, drag: 0.6,
              rot: rand(0, 6), vr: rand(-9, 9), poly, color: palette.shard[i % palette.shard.length], edge: palette.edge,
              age: 0, life: rand(0.9, 1.3), delay: 0,
            });
          }
          burst(particles, p.x, p.y, { count: 26, colors: ['#ffffff', palette.edge, '#f2b2a0'], speed: [160, 520], life: [0.3, 0.7] });
          impact = { at: performance.now(), px: reveal.impactPx, ms: 420 };
        },
      });
    }
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    orbCenter = center();
    const before = clock.phase;
    clock = tickClock(clock, now, timing);
    if (before === 'charge' && clock.phase !== 'charge') enterReveal(now);
    if (clock.phase === 'done') return finish();

    let shakePx = 0;
    if (clock.phase === 'charge') {
      const p = Math.min(1, (now - clock.since) / timing.chargeMs);
      layer.style.setProperty('--p', p.toFixed(3));
      shakePx = charge.shakePx * p ** 1.6;
      if (!reduced && moteBudget > 0) {
        // 끝으로 갈수록 빛이 더 빠르게 모인다.
        moteClock += dt * charge.motes * (0.6 + p * 2.2) / (timing.chargeMs / 1000);
        while (moteClock >= 1 && moteBudget > 0) {
          moteClock -= 1;
          moteBudget--;
          const r0 = spawnRadius() * rand(0.7, 1);
          particles.push({
            kind: 'mote', a: rand(0, Math.PI * 2), r0, swirl: rand(0.6, 1.4) * (Math.random() < 0.5 ? -1 : 1),
            cx: () => orbCenter.x, cy: () => orbCenter.y, size: rand(1.5, 3.2),
            color: pick(PALETTE[charge.tier].spark), age: 0, life: rand(0.32, 0.5), delay: 0,
          });
        }
      }
    }
    const since = now - impact.at;
    if (impact.px && since < impact.ms) shakePx = Math.max(shakePx, impact.px * (1 - since / impact.ms));
    setShake(reduced ? 0 : shakePx);

    for (let i = schedule.length - 1; i >= 0; i--) {
      if (now >= schedule[i].at) schedule.splice(i, 1)[0].run();
    }
    canvas.clear();
    drawParticles(canvas.ctx, particles, dt, now);
    raf = requestAnimationFrame(frame);
  }

  function tap(event) {
    event?.preventDefault?.();
    const now = performance.now();
    const before = clock.phase;
    clock = tapClock(clock, now, timing);
    if (before === 'charge' && clock.phase === 'reveal') {
      layer.dataset.skipped = 'true';
      enterReveal(now);
    }
    if (clock.phase === 'done') finish();
  }

  function finish() {
    if (ended) return;
    ended = true;
    cancelAnimationFrame(raf);
    if (!revealedAt) chargeVoice.stop(20);
    setShake(0);
    canvas.dispose();
    layer.removeEventListener('pointerdown', tap);
    layer.dataset.phase = 'done';
    if (active === controller) active = null;
    // 창이 닫힌 뒤에 알린다. 그래야 정비 화면이 다시 입력과 초점을 받는다.
    const remove = () => {
      if (layer.open) layer.close();
      layer.remove();
      onDone?.(attempt);
    };
    if (reduced) remove();
    else window.setTimeout(remove, 160);
  }

  if (skipCharge) enterReveal(t0);
  layer.addEventListener('pointerdown', tap);
  layer.addEventListener('cancel', (event) => { event.preventDefault(); tap(); });
  // 브라우저가 Esc 연타로 창을 강제로 닫아도 결과 알림은 한 번 보낸다.
  layer.addEventListener('close', () => finish());
  layer.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === ' ' || event.key === 'Enter') tap(event);
  });
  layer.addEventListener('keyup', (event) => event.stopPropagation());
  raf = requestAnimationFrame(frame);

  const controller = { skip: () => tap(), finish, plan, get phase() { return clock.phase; } };
  active = controller;
  return controller;
}

// 판매: 버튼에서 엽전이 튀어 요력 표시로 날아가고, 숫자가 튀어 오른다.
// wallet은 요력 글자 요소, format(v)은 그 글자(예: '요력 1,234'), label은 튀어 오르는 숫자(예: '+5,000').
export function playSellFx({ origin, wallet, amount, from, to, format = String, label = '+' + amount, host, reduced = prefersReducedFx() } = {}) {
  const plan = sellPlan(amount, { reduced });
  sfx.play(plan.sound, { volume: plan.big ? 1 : 0.8 });
  const parent = host ?? document.querySelector('dialog[open]') ?? document.body;
  const layer = el('div', 'ykfx-sell');
  layer.setAttribute('aria-hidden', 'true');
  if (plan.big) layer.dataset.big = 'true';
  if (reduced) layer.dataset.reduced = 'true';
  parent.append(layer);
  const ox = origin ? origin.left + origin.width / 2 : window.innerWidth / 2;
  const oy = origin ? origin.top + origin.height / 2 : window.innerHeight / 2;
  const pop = el('span', 'ykfx-pop', label);
  pop.style.left = ox + 'px';
  pop.style.top = oy + 'px';
  layer.append(pop);

  if (wallet && plan.countMs && from != null) wallet.textContent = format(from);
  let counted = false;
  function countUp() {
    if (counted || !wallet) return;
    counted = true;
    if (!reduced) {
      wallet.classList.remove('ykfx-bump');
      void wallet.offsetWidth;
      wallet.classList.add('ykfx-bump');
    }
    if (!plan.countMs || from == null || to == null) return;
    const start = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - start) / plan.countMs);
      wallet.textContent = format(Math.round(from + (to - from) * easeOut(k)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  if (!plan.coins) {
    countUp();
    window.setTimeout(() => layer.remove(), 900);
    return;
  }
  const canvas = makeCanvas(layer);
  const target = () => {
    const box = wallet?.isConnected ? wallet.getBoundingClientRect() : null;
    return box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : { x: ox, y: oy - 160 };
  };
  const particles = [];
  for (let i = 0; i < plan.coins; i++) {
    particles.push({
      kind: 'coin', x0: ox + rand(-10, 10), y0: oy + rand(-6, 6),
      x1: ox + rand(-120, 120), y1: oy - rand(90, 220),
      x2: () => target().x, y2: () => target().y,
      size: rand(5, plan.big ? 9 : 7.5), phase: rand(0, 6),
      age: 0, life: rand(0.55, 0.8), delay: i * 0.018, onEnd: countUp,
    });
  }
  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    canvas.clear();
    drawParticles(canvas.ctx, particles, dt, now);
    if (particles.length) requestAnimationFrame(frame);
    else {
      canvas.dispose();
      window.setTimeout(() => layer.remove(), 500);
    }
  };
  requestAnimationFrame(frame);
}
