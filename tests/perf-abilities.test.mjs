import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { FORMS } from '../src/data/forms.js';
import { STEMS } from '../src/data/stems.js';
import { buildGrid } from '../src/game/enemyAI.js';
import { applyBurn, applyMark, applySlow, tryFear, tryFreeze } from '../src/game/status.js';
import { fakeEnemy, fakePlayer, makeWorld } from './fixtures-abilities.mjs';

// 설계 4-6: 적 72 + 구슬 120 + 모든 상한을 채운 상태로 300단계 → 능력 처리 추가 시간 평균 ≤ 0.25ms/단계(개발 PC).
// 템포 최대(3.9 × 1.5 = 5.85)에서 한 프레임 시뮬레이션은 약 0.0975초이고 6단계로 나뉘므로 단계 길이는 0.0975 / 6이다.
const STEPS = 300;
const H = 0.0975 / 6;
const LIMIT_MS = 0.25;

function lcg(seed) {
  let r = seed;
  return () => (r = (r * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

// 플레이어 둘레(반지름 60~360)에 단계·크기가 섞인 적 72마리. 크기는 매 단계 되돌려 쓰러지지 않게 한다.
function stressWorld(formId) {
  const rnd = lcg(7);
  const enemies = [];
  for (let i = 0; i < CONFIG.world.population; i++) {
    const a = rnd() * Math.PI * 2, d = 60 + rnd() * 300, size = 18 + rnd() * 60;
    const e = fakeEnemy(1000 + Math.cos(a) * d, 1000 + Math.sin(a) * d, size, { stage: 1 + Math.floor(rnd() * 5) });
    e.baseSize = size;
    enemies.push(e);
  }
  const w = makeWorld({ formId, level: 15, enemies, player: fakePlayer(formId) });
  w.combat.refreshAbility();
  return w;
}

// 능력마다 상한을 가득 채운 상태로 만든다: 구름 6·소용돌이 4·진주 6·아군 4·모든 적에 화상·표식·둔화 등.
function fillCaps(w) {
  const { combat, enemies } = w;
  const now = w.scene.simTime;
  const ab = combat.ab;
  const long = 1e9;
  if (ab) {
    switch (ab.id) {
      case 'zone':
        for (let i = 0; i < 6; i++) {
          const e = enemies[i * 7];
          combat.addCloud(e.x, e.y, combat.power(), ab, now);
        }
        for (const c of combat.clouds) c.until = long;
        break;
      case 'vortex':
        for (let i = 0; i < 4; i++) {
          w.scene.simTime += 10;
          const e = enemies[i * 9];
          combat.addVortex(e.x, e.y, ab, w.scene.simTime);
        }
        for (const v of combat.vortices) v.until = long;
        break;
      case 'charm':
        for (let i = 0; i < 4; i++) {
          enemies[i * 5].charmUntil = long;
          enemies[i * 5].charmDur = long;
          enemies[i * 5].charmGraceUntil = long + 1;
        }
        break;
      case 'burn':
        for (const e of enemies) applyBurn(e, now, long, 0.05);
        break;
      case 'mark':
        for (const e of enemies) applyMark(e, now, long, 0.64, true);
        break;
      case 'freeze':
        for (let i = 0; i < enemies.length; i += 2) tryFreeze(enemies[i], now, long, 0);
        break;
      case 'fear':
        for (let i = 0; i < enemies.length; i += 2) tryFear(enemies[i], now, long, 0);
        break;
      default:
        break;
    }
    for (const e of enemies) applySlow(e, now, long, 0.7);
  }
  // 구슬 120발
  let guard = 0;
  while (combat.orbs.length < CONFIG.combat.maxOrbs && guard++ < 20) {
    combat.cooldown = 0;
    combat.fire();
  }
}

function measure(formId, filled) {
  const w = stressWorld(formId);
  if (filled) fillCaps(w);
  const dir = { x: 1, y: 0 };
  let total = 0;
  let orbsMax = 0;
  for (let i = 0; i < STEPS; i++) {
    for (const e of w.enemies) {
      e.size = e.baseSize;
      e.sprite.active = true;
    }
    w.scene.simTime += H;
    const grid = buildGrid(w.enemies, CONFIG.hunt.detect);
    const a = i * 0.05;
    dir.x = Math.cos(a);
    dir.y = Math.sin(a);
    w.combat.cooldown = 0;
    const t0 = process.hrtime.bigint();
    w.combat.step(dir, H, true, grid);
    total += Number(process.hrtime.bigint() - t0) / 1e6;
    orbsMax = Math.max(orbsMax, w.combat.orbs.length);
  }
  return { ms: total / STEPS, orbsMax, w };
}

const best = (formId, filled, tries = 3) => {
  let result = null;
  for (let i = 0; i < tries; i++) {
    const r = measure(formId, filled);
    if (!result || r.ms < result.ms) result = r;
  }
  return result;
};

test('성능: 적 72 · 구슬 120 · 상한을 채운 상태에서 능력 16종 모두 추가 처리 시간 평균 ≤ 0.25ms/단계', (t) => {
  best('mimul', true, 1); // 예열
  const base = best('mimul', true);
  t.diagnostic(`기준(능력 없음) ${base.ms.toFixed(3)}ms/단계, 구슬 최대 ${base.orbsMax}`);
  const rows = [];
  for (const stem of STEMS) {
    const form = FORMS.find((f) => f.stem === stem.id && f.stage === 5 && f.entry);
    const r = best(form.id, true);
    const extra = r.ms - base.ms;
    rows.push(`${stem.ability} ${r.ms.toFixed(3)}ms (+${extra.toFixed(3)})`);
    assert.ok(extra <= LIMIT_MS, `${stem.ability}: 추가 ${extra.toFixed(3)}ms/단계 > ${LIMIT_MS}`);
    assert.ok(r.orbsMax <= CONFIG.combat.maxOrbs, '구슬 상한');
    assert.ok(r.w.combat.clouds.length <= 6 && r.w.combat.vortices.length <= 4 && r.w.combat.pearls.length <= 6, '구름 6·소용돌이 4·진주 6');
  }
  t.diagnostic(rows.join(' | '));
});

test('성능: 구슬 120발이 가득 찬 상태에서도 구슬·구름·소용돌이·진주·아군 상한이 지켜진다', () => {
  for (const stem of STEMS) {
    const form = FORMS.find((f) => f.stem === stem.id && f.stage === 5 && f.entry);
    const r = measure(form.id, true);
    const { combat } = r.w;
    assert.ok(combat.orbs.length <= CONFIG.combat.maxOrbs, stem.ability + ' 구슬');
    assert.ok(combat.clouds.length <= 6, stem.ability + ' 구름');
    assert.ok(combat.vortices.length <= 4, stem.ability + ' 소용돌이');
    assert.ok(combat.pearls.length <= 6, stem.ability + ' 진주');
    const allies = r.w.enemies.filter((e) => e.charmUntil > r.w.scene.simTime).length;
    assert.ok(allies <= 4 + 0, stem.ability + ' 아군 ' + allies);
  }
});
