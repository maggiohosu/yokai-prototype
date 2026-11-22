import test from 'node:test';
import assert from 'node:assert/strict';
import { forms } from './fixtures-forms.mjs';
import { createProgress, recordEat, recordTreasureSuccess, yoryeokFor } from '../src/systems/progress.js';
import {
  evolutionCost, canEvolve, buildChoices, evolve, rollGrade, gradeOdds, gradeMultiplier, devolve, GRADES,
} from '../src/systems/evolution.js';

function seeded(seed = 12345) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const approx = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('fixture 17종', () => assert.equal(forms.length, 17));

test('progress: 생성/요력/식성/성향', () => {
  const p = createProgress();
  assert.equal(p.formId, 'mimul');
  assert.equal(p.grade, 'C');
  assert.equal(yoryeokFor(10, false), 10);
  assert.equal(yoryeokFor(10, true), 15);
  recordEat(p, { dir: 'east', preySize: 5, myOriginalSizeAtEngage: 8 });
  assert.equal(p.diet.east, 5);
  assert.equal(p.alignment, -2);
  recordEat(p, { dir: 'west', preySize: 10, myOriginalSizeAtEngage: 8 });
  assert.equal(p.alignment, -8);
  recordEat(p, { dir: 'west', preySize: 4, myOriginalSizeAtEngage: 8, killedByTreasure: true });
  assert.equal(p.alignment, -5);
  recordTreasureSuccess(p);
  assert.equal(p.alignment, 0);
  for (let i = 0; i < 100; i++) recordTreasureSuccess(p);
  assert.equal(p.alignment, 100);
});

test('진화 비용', () => {
  assert.equal(evolutionCost(2), 100);
  assert.equal(evolutionCost(3), 400);
  const p = createProgress();
  assert.equal(canEvolve(p), false);
  p.yoryeok = 100;
  assert.equal(canEvolve(p), true);
});

test('gradeOdds: 합 100, 기본값, 보정', () => {
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  for (const n of [0, 1, 10, 30, 99]) approx(sum(gradeOdds(n)), 100, 1e-9, 'sum' + n);
  const o0 = gradeOdds(0);
  assert.deepEqual(o0, { 'S+': 1, S: 4, A: 10, B: 20, C: 25, D: 20, E: 12, F: 8 });
  const o10 = gradeOdds(10); // 5%p 이동: F 8 -> 3
  approx(o10.F, 3, 1e-9, 'F');
  approx(o10['S+'], 1.5, 1e-9, 'S+');
  approx(o10.S, 5, 1e-9, 'S');
  approx(o10.A, 11.5, 1e-9, 'A');
  approx(o10.B, 22, 1e-9, 'B');
  const o30 = gradeOdds(30); // 15%p: F 8, E 7
  assert.equal(o30.F, 0);
  approx(o30.E, 5, 1e-9, 'E30');
  assert.equal(o30.D, 20);
  assert.deepEqual(gradeOdds(500), o30);
});

test('rollGrade 몬테카를로 10만 회', () => {
  for (const n of [0, 30]) {
    const odds = gradeOdds(n);
    const rng = seeded(n + 7);
    const cnt = Object.fromEntries(GRADES.map((g) => [g, 0]));
    const N = 100000;
    for (let i = 0; i < N; i++) cnt[rollGrade(n, { rng })]++;
    for (const g of GRADES) approx((cnt[g] / N) * 100, odds[g], 1, `${g}@${n}`);
  }
});

test('rollGrade 경계 rng', () => {
  assert.equal(rollGrade(0, { rng: () => 0 }), 'S+');
  assert.equal(rollGrade(0, { rng: () => 0.9999999 }), 'F');
});

test('gradeMultiplier', () => {
  assert.equal(gradeMultiplier('S+'), 2.0);
  assert.equal(gradeMultiplier('F'), 0.5);
  assert.equal(gradeMultiplier('C'), 1.0);
});

test('buildChoices 1->2: 방위만', () => {
  const p = createProgress();
  p.diet = { east: 2, west: 10, south: 5, north: 0 };
  const c = buildChoices(p, forms, { rng: seeded() });
  assert.equal(c.length, 3);
  assert.equal(c[0].form.id, 'beom');
  assert.equal(c[1].form.id, 'sae');
  assert.equal(c[2].unknown, true);
});

test('buildChoices 2->3: 방위+갈래, 후보 3개 중 상위 2', () => {
  const p = createProgress();
  Object.assign(p, { stage: 2, formId: 'baem' });
  p.diet.east = 10;
  p.alignment = 80;
  let c = buildChoices(p, forms, { rng: seeded() });
  assert.equal(c[0].form.id, 'cheonghak');
  assert.ok(['cheonggu', 'imugi'].includes(c[1].form.id));
  p.alignment = -80;
  c = buildChoices(p, forms, { rng: seeded() });
  assert.equal(c[0].form.branch, 'yo');
  assert.equal(c[1].form.branch, 'yo');
  assert.ok(c.every((x) => x.unknown || x.form.dir === 'east'));
});

test('buildChoices: 정규 후보가 1개면 같은 단계 전체에서 2위', () => {
  const small = forms.filter((f) => f.id !== 'imugi' && f.id !== 'cheonghak');
  const p = createProgress();
  Object.assign(p, { stage: 2, formId: 'baem' });
  p.diet = { east: 6, west: 4, south: 0, north: 0 };
  const c = buildChoices(p, small, { rng: seeded() });
  assert.equal(c[0].form.id, 'cheonggu');
  assert.equal(c[1].form.dir, 'west');
});

test('buildChoices: 마지막 단계는 빈 배열', () => {
  const p = createProgress();
  Object.assign(p, { stage: 3, formId: 'imugi' });
  assert.deepEqual(buildChoices(p, forms), []);
});

test('evolve: 일반 선택', () => {
  const p = createProgress();
  p.yoryeok = 150;
  p.diet.east = 9;
  const c = buildChoices(p, forms, { rng: seeded() });
  const r = evolve(p, c[0], forms, { rng: seeded(3) });
  assert.equal(r.form.id, 'baem');
  assert.equal(p.formId, 'baem');
  assert.equal(p.stage, 2);
  assert.equal(p.yoryeok, 50);
  assert.equal(p.diet.east, 0);
  assert.equal(r.firstDiscovery, true);
  assert.equal(p.protect, 1);
  assert.deepEqual(p.discovered, ['baem']);
  assert.ok(GRADES.includes(r.grade));
  assert.equal(p.grade, r.grade);
});

test('evolve: 재발견은 보호권 없음, 요력 부족은 throw', () => {
  const p = createProgress();
  p.discovered = ['baem'];
  p.yoryeok = 100;
  const r = evolve(p, { unknown: false, form: forms.find((f) => f.id === 'baem') }, forms);
  assert.equal(r.firstDiscovery, false);
  assert.equal(p.protect, 0);
  assert.throws(() => evolve(p, { unknown: true }, forms), /요력/);
});

test('evolve: 미지의 진화는 같은 단계 무작위 균등', () => {
  const rng = seeded(99);
  const cnt = {};
  const N = 100000;
  for (let i = 0; i < N; i++) {
    const p = createProgress();
    p.yoryeok = 100;
    const r = evolve(p, { unknown: true }, forms, { rng });
    assert.equal(r.form.stage, 2);
    cnt[r.form.id] = (cnt[r.form.id] || 0) + 1;
  }
  assert.equal(Object.keys(cnt).length, 4);
  for (const id of Object.keys(cnt)) approx((cnt[id] / N) * 100, 25, 1, id);
});

test('evolve: 강화 합계가 등급 굴림에 반영', () => {
  const p = createProgress();
  p.enh = { growth: 10, speed: 10, vitality: 10 };
  p.yoryeok = 100;
  const rng = seeded(5);
  const N = 100000;
  let f = 0;
  for (let i = 0; i < N; i++) if (rollGrade(30, { rng }) === 'F') f++;
  assert.equal(f, 0);
});

test('devolve', () => {
  const p = createProgress();
  assert.equal(devolve(p, forms), null);
  Object.assign(p, { stage: 3, formId: 'imugi', enh: { growth: 3, speed: 2, vitality: 1 } });
  p.diet.west = 5;
  const r = devolve(p, forms, { rng: seeded() });
  assert.equal(r.form.id, 'baem');
  assert.equal(p.stage, 2);
  assert.equal(p.formId, 'baem');
  assert.deepEqual(p.enh, { growth: 3, speed: 2, vitality: 1 });
  assert.equal(p.diet.west, 0);
  const r2 = devolve(p, forms);
  assert.equal(p.stage, 1);
  assert.equal(r2.form.id, 'mimul');
  assert.equal(devolve(p, forms), null);
});
