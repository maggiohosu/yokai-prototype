import test from 'node:test';
import assert from 'node:assert/strict';
import { forms } from './fixtures-forms.mjs';
import { FORMS, FORM_BY_ID } from '../src/data/forms.js';
import { STEMS } from '../src/data/stems.js';
import { evolutionCatalog } from '../src/systems/levelup.js';
import { createProgress, recordEat, recordTreasureSuccess, yoryeokFor } from '../src/systems/progress.js';
import {
  evolutionCost, canEvolve, buildChoices, evolve, rollGrade, gradeOdds, gradeMultiplier, devolve, GRADES, unknownPool,
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

test('진화 비용: 4·5단계는 2,000 / 8,000(사용자 결정)', () => {
  assert.equal(evolutionCost(2), 100);
  assert.equal(evolutionCost(3), 400);
  assert.equal(evolutionCost(4), 2000);
  assert.equal(evolutionCost(5), 8000);
  assert.equal(evolutionCost(6), Infinity);
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

// ---- 실제 형태 171행으로 확인하는 진화 규칙(설계 3절) ----
const catalog = evolutionCatalog(FORMS);
function at(formId, { diet = {}, alignment = 0 } = {}) {
  const form = FORM_BY_ID[formId];
  const p = createProgress();
  Object.assign(p, { formId, stage: form.stage, alignment });
  Object.assign(p.diet, diet);
  return p;
}
const ids = (choices) => choices.map((c) => (c.unknown ? '?' : c.form.id));

test('buildChoices 3-2 예시 1: 청구 여우(E2), 동 80·남 20, 요 60 → 구미호(줄기 유지) / 선학(다른 줄기)', () => {
  const p = at('hillFox', { diet: { east: 80, south: 20 }, alignment: -60 });
  const c = buildChoices(p, catalog, { rng: seeded() });
  assert.deepEqual(ids(c), ['gumiho', 'seonhak', '?']);
  assert.equal(c[0].form.stem, 'E2');
  assert.equal(c[1].form.stem, 'E3');
});

test('buildChoices 3-2 예시 2: 청구 여우, 남 70·동 30, 요 60 → 이매(S2, 방위·능력을 바꿈) / 구미호(지금 줄기 유지)', () => {
  const p = at('hillFox', { diet: { east: 30, south: 70 }, alignment: -60 });
  const c = buildChoices(p, catalog, { rng: seeded() });
  assert.deepEqual(ids(c), ['imae', 'gumiho', '?']);
  assert.equal(c[0].form.dir, 'south');
  assert.equal(c[1].form.stem, 'E2');
});

test('buildChoices 3-2 예시 3: 미물, 서 60·북 40 → 새끼 범(W1) / 계변(W2), 같은 방위 줄기 넷은 줄기 순서', () => {
  const p = at('mimul', { diet: { west: 60, north: 40 } });
  const c = buildChoices(p, catalog, { rng: seeded() });
  assert.deepEqual(ids(c), ['littleTiger', 'gyebyeon', '?']);
});

test('buildChoices: ①과 ②의 줄기는 항상 다르다(5단계 미만 전 형태 × 식성·성향 조합), rng를 바꿔도 ①②는 같다', () => {
  const diets = [{}, { east: 5 }, { west: 5 }, { south: 5 }, { north: 5 }, { east: 3, south: 7 }, { west: 2, north: 2 }, { east: 1, west: 1, south: 1, north: 1 }];
  for (const form of FORMS.filter((f) => f.stage < 5)) {
    for (const diet of diets) {
      for (const alignment of [-80, 0, 80]) {
        const p = at(form.id, { diet, alignment });
        const a = buildChoices(p, catalog, { rng: seeded(1) });
        const b = buildChoices(p, catalog, { rng: seeded(999) });
        assert.equal(a.length, 3, form.id);
        assert.deepEqual(ids(a), ids(b), form.id + ' rng 영향');
        assert.notEqual(a[0].form.stem, a[1].form.stem, `${form.id} ${JSON.stringify(diet)} ${alignment}: ①②가 같은 줄기`);
        assert.equal(a[0].form.stage, form.stage + 1);
        assert.equal(a[1].form.stage, form.stage + 1);
        if (form.stem) {
          // 지금 줄기를 지키는 선택지는 늘 하나 남는다.
          assert.ok(a.slice(0, 2).some((c) => c.form.stem === form.stem), `${form.id}: 줄기 유지 선택지 없음`);
        }
      }
    }
  }
});

test('buildChoices: 미지는 ①②를 뺀 나머지 중 균등 무작위이고, 5단계는 선택지가 없다', () => {
  const p = at('hillFox', { diet: { east: 80, south: 20 }, alignment: -60 });
  const c = buildChoices(p, catalog, { rng: seeded() });
  assert.deepEqual(c[2].exclude, ['gumiho', 'seonhak']);
  const pool = unknownPool(c[2], catalog, 4);
  assert.equal(pool.length, 50 - 2);
  assert.ok(pool.every((f) => f.stage === 4 && f.id !== 'gumiho' && f.id !== 'seonhak'));
  // 실제로 뽑아 보면 ①② 형태는 나오지 않고 나머지는 고르게 나온다.
  const rng = seeded(4242);
  const seen = {};
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const q = at('hillFox', { diet: { east: 80, south: 20 }, alignment: -60 });
    q.yoryeok = 5000;
    const r = evolve(q, c[2], catalog, { rng });
    seen[r.form.id] = (seen[r.form.id] ?? 0) + 1;
  }
  assert.equal(seen.gumiho, undefined);
  assert.equal(seen.seonhak, undefined);
  assert.equal(Object.keys(seen).length, 48);
  for (const n of Object.values(seen)) approx((n / N) * 100, 100 / 48, 1, '미지 균등');
  assert.deepEqual(buildChoices(at('cheonho'), catalog), []);
  assert.deepEqual(buildChoices(at('baekho'), catalog), []);
});

test('buildChoices: 1→2 진화는 성향을 쓰지 않고(식성·줄기 가산점만), 2→3부터 성향을 쓴다', () => {
  // 1단계 뿌리 활사: 후보가 모두 2단계라 성향 90이어도 점수에 안 들어가고, 지금 줄기(E1)가 ①이다.
  const root = buildChoices(at('hwalsa', { alignment: 90 }), catalog, { rng: seeded() });
  assert.equal(root[0].form.stem, 'E1');
  assert.notEqual(root[1].form.stem, 'E1');
  assert.equal(root[0].form.branch === 'seon' || root[0].form.branch === 'yo' || root[0].form.branch === 'none', true);
  // 2단계 새끼 뱀: 후보가 3단계라 성향이 점수에 들어간다. 선기 90이면 선(仙) 갈래 청학(E3)이 ①, 줄기 유지가 ②다.
  const snake = buildChoices(at('littleSnake', { alignment: 90 }), catalog, { rng: seeded() });
  assert.equal(snake[0].form.id, 'crane');
  assert.equal(snake[1].form.stem, 'E1');
});

test('buildChoices: 4→5단계, 줄기 유지가 ①이면 ②는 곁줄기 입구로 들어간다', () => {
  const p = at('gumiho', { diet: { east: 10 }, alignment: -50 });
  const c = buildChoices(p, catalog, { rng: seeded() });
  assert.equal(c[0].form.id, 'cheonho'); // E2 5단계는 하나뿐, 줄기 유지
  assert.ok(['dongwanggong', 'donghaeyongwang'].includes(c[1].form.id));
  assert.equal(c[1].form.entry, true);
  for (const choice of c.slice(0, 2)) assert.ok(FORM_BY_ID.gumiho.next.includes(choice.form.id));
});

test('evolve: 4→5 비용 8,000을 내고, 3→4는 2,000이 있어야 한다', () => {
  const p = at('gumiho', { diet: { east: 10 } });
  p.yoryeok = 8000 + 123;
  const c = buildChoices(p, catalog, { rng: seeded() });
  const r = evolve(p, c[0], catalog, { rng: seeded(3) });
  assert.equal(r.form.stage, 5);
  assert.equal(p.stage, 5);
  assert.equal(p.yoryeok, 123);
  const q = at('hillFox');
  q.yoryeok = 1999;
  assert.equal(canEvolve(q), false);
  assert.throws(() => evolve(q, { unknown: true }, catalog), /요력/);
  q.yoryeok = 2000;
  assert.equal(canEvolve(q), true);
  assert.equal(canEvolve(at('cheonho')), false);
});

test('devolve: 같은 줄기 부모 → 같은 방위 부모 → mimul 순서', () => {
  const run = (formId) => {
    const p = at(formId);
    const r = devolve(p, catalog, { rng: seeded() });
    return { r, p };
  };
  // 3→2: 같은 줄기 2단계가 forms 순서로 첫째.
  assert.equal(run('imugi').p.formId, 'littleSnake');
  assert.equal(run('hillFox').p.formId, 'juyu');
  assert.equal(FORM_BY_ID[run('gumiho').p.formId].stem, 'E2');
  assert.equal(FORM_BY_ID[run('cheongnyong').p.formId].stem, 'E1');
  // 2→1: 같은 줄기에 1단계 뿌리가 있으면 그 미물.
  assert.equal(run('littleSnake').p.formId, 'hwalsa');
  assert.equal(run('jokja').p.formId, 'bijil');
  // 뿌리가 없는 줄기: 같은 방위 1단계 중 첫째. 서녘이면 나모(W3).
  assert.equal(run('littleTiger').p.formId, 'namo');
  assert.equal(run('gyebyeon').p.formId, 'namo');
  assert.equal(run('hoche').p.formId, 'namo');
  // 모든 2단계 이상 형태가 한 단계 아래로 돌아가고, 같은 줄기에 부모가 있으면 같은 줄기로 간다.
  for (const form of catalog.filter((f) => f.stage >= 2)) {
    const { r, p } = run(form.id);
    assert.ok(r, form.id);
    assert.equal(p.stage, form.stage - 1);
    const target = FORM_BY_ID[p.formId];
    const sameStemParent = catalog.some((f) => f.stage === form.stage - 1 && f.stem === form.stem && form.from.includes(f.id));
    if (sameStemParent) assert.equal(target.stem, form.stem, form.id);
    else assert.ok(target.dir === form.dir || target.id === 'mimul', form.id);
  }
});

test('모든 줄기에서 mimul부터 5단계까지 3택으로 끝까지 올라갈 수 있다', () => {
  for (const stem of STEMS) {
    const p = at('mimul', { diet: { [stem.dir]: 10 } });
    for (let stage = 2; stage <= 5; stage++) {
      p.yoryeok = 10000;
      const c = buildChoices(p, catalog, { rng: seeded() });
      assert.equal(c.length, 3);
      const pick = c.slice(0, 2).find((x) => x.form.stem === stem.id) ?? c[0];
      evolve(p, pick, catalog, { rng: seeded() });
      assert.equal(p.stage, stage);
      p.diet[stem.dir] = 10;
    }
    assert.equal(p.stage, 5);
  }
});
