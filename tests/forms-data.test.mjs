import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FORMS, FORM_BY_ID } from '../src/data/forms.js';
import { STEMS, STEM_BY_ID, stemBoostMult } from '../src/data/stems.js';
import {
  PARTS_CATALOG, DECO_SETS, partName, partArgs, partScore, isKnownPart, decoSetScore, decorationScore,
} from '../src/data/parts-catalog.js';
import { evolutionCatalog } from '../src/systems/levelup.js';

// creature.js의 PARTS 객체 키(그림이 있는 기존 부품). 파일을 텍스트로 읽어 최상위 키만 뽑는다.
function drawnPartNames() {
  const src = readFileSync(new URL('../src/art/creature.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const start = src.indexOf('const PARTS = {');
  const end = src.indexOf('\n};', start);
  return src.slice(start, end).split('\n').slice(1)
    .map((line) => line.match(/^  ([A-Za-z0-9]+)(?:[,(:]|\s*[:(])/)?.[1])
    .filter(Boolean);
}
const DRAW_PART_NAMES = drawnPartNames();

const DIRS = ['east', 'west', 'south', 'north'];
const byStage = (stage) => FORMS.filter((f) => f.stage === stage);

// 기존 17종(id·단계·방위·parts)은 HEAD~ 이전 커밋의 forms.js와 같아야 한다. 설계 문서에 적힌 값을 직접 박아 둔다.
const LEGACY = {
  mimul: [1, 'none', ['sixLegs', 'antennae', 'body', 'leafMark', 'face']],
  littleSnake: [2, 'east', ['segments', 'body', 'scales', 'face', 'tongue']],
  littleTiger: [2, 'west', ['stripedTail', 'paws', 'tigerEars', 'body', 'stripes', 'face', 'muzzle']],
  littleBird: [2, 'south', ['birdFeet', 'crest', 'body', 'wings', 'face', 'beak']],
  littleTurtle: [2, 'north', ['flippers', 'shell', 'turtleHead', 'face']],
  hillFox: [3, 'east', ['threeTails', 'paws', 'foxEars', 'body', 'face', 'foxMuzzle']],
  imugi: [3, 'east', ['longSerpent', 'littleHorns', 'body', 'scales', 'face', 'tongue']],
  crane: [3, 'east', ['birdFeet', 'plumage', 'longNeck', 'crown', 'face', 'longBeak']],
  boYi: [3, 'west', ['nineTails', 'paws', 'fourEars', 'body', 'backEyes', 'ramHorns', 'face', 'muzzle']],
  skyHound: [3, 'west', ['stripedTail', 'paws', 'catEars', 'body', 'whiteHead', 'stripes', 'face', 'muzzle']],
  whiteDeer: [3, 'west', ['paws', 'deerEars', 'antlers', 'body', 'spots', 'face', 'muzzle']],
  biFang: [3, 'south', ['oneLeg', 'plumage', 'longNeck', 'redMarks', 'face', 'whiteBeak', 'flame']],
  dokkaebi: [3, 'south', ['paws', 'club', 'body', 'hat', 'oneHorn', 'face', 'fang']],
  attendant: [3, 'south', ['paws', 'body', 'topknot', 'robe', 'face', 'peach']],
  waterSpirit: [3, 'north', ['waveHands', 'droplet', 'wetHair', 'face']],
  dueoksini: [3, 'north', ['smoke', 'paws', 'twinHorns', 'bigHead', 'face', 'fang']],
  darkTurtle: [3, 'north', ['snakeTail', 'flippers', 'shell', 'turtleHead', 'face', 'whiteBeak']],
};
const OLD_NEXT = {
  mimul: ['littleSnake', 'littleTiger', 'littleBird', 'littleTurtle'],
  littleSnake: ['hillFox', 'imugi', 'crane'],
  littleTiger: ['boYi', 'skyHound', 'whiteDeer'],
  littleBird: ['biFang', 'dokkaebi', 'attendant'],
  littleTurtle: ['waterSpirit', 'dueoksini', 'darkTurtle'],
};

// 설계 3-1: next(form) = 같은 줄기의 (stage+1) 형태 전부 ∪ 곁줄기 2개의 (stage+1) 입구. next(mimul) = 2단계 전부.
function expectedNext(form) {
  if (form.id === 'mimul') return byStage(2).map((f) => f.id);
  const cross = STEM_BY_ID[form.stem].cross;
  return FORMS.filter((f) => f.stage === form.stage + 1 && (f.stem === form.stem || (cross.includes(f.stem) && f.entry))).map((f) => f.id);
}

test('형태 171행 = mimul 1개 + 170종, 단계별 8/24/60/50/28, 방위별 42/43/42/43', () => {
  assert.equal(FORMS.length, 171);
  assert.equal(FORMS[0].id, 'mimul');
  assert.deepEqual([1, 2, 3, 4, 5].map((s) => FORMS.filter((f) => f.stage === s && f.id !== 'mimul').length), [8, 24, 60, 50, 28]);
  const dirCount = (dir) => FORMS.filter((f) => f.dir === dir).length;
  assert.deepEqual(DIRS.map(dirCount), [42, 43, 42, 43]);
  for (const dir of DIRS) {
    assert.equal(FORMS.filter((f) => f.dir === dir && f.stage === 1).length, 2, dir + ' 1단계');
    assert.equal(FORMS.filter((f) => f.dir === dir && f.stage === 2).length, 6, dir + ' 2단계');
    assert.equal(FORMS.filter((f) => f.dir === dir && f.stage === 3).length, 15, dir + ' 3단계');
    assert.equal(FORMS.filter((f) => f.dir === dir && f.stage === 5).length, 7, dir + ' 5단계');
  }
  assert.equal(FORMS.filter((f) => f.stage === 4 && (f.dir === 'east' || f.dir === 'south')).length, 24);
  assert.equal(FORMS.filter((f) => f.stage === 4 && (f.dir === 'west' || f.dir === 'north')).length, 26);
});

test('id는 겹치지 않고 FORM_BY_ID와 일치하며, 필수 필드가 모두 있다', () => {
  assert.equal(new Set(FORMS.map((f) => f.id)).size, FORMS.length);
  assert.equal(Object.keys(FORM_BY_ID).length, FORMS.length);
  for (const f of FORMS) {
    assert.strictEqual(FORM_BY_ID[f.id], f);
    assert.equal(typeof f.name, 'string');
    assert.ok(f.name.length > 0, f.id);
    assert.equal(typeof f.hanja, 'string');
    assert.ok(Number.isInteger(f.stage) && f.stage >= 1 && f.stage <= 5, f.id);
    assert.ok(DIRS.includes(f.dir) || f.dir === 'none', f.id);
    assert.ok(['yo', 'seon', 'none'].includes(f.branch), f.id);
    assert.equal(typeof f.entry, 'boolean', f.id);
    assert.ok(Array.isArray(f.parts) && f.parts.length > 0, f.id);
    assert.equal(typeof f.desc, 'string');
    assert.ok(f.desc.length > 0, f.id);
    assert.ok(Array.isArray(f.next), f.id);
  }
  // 한자가 있는 형태는 설계 문서처럼 이름 뒤 한자다(독음이 맞는지는 사람이 본다). 방위 없는 형태는 mimul뿐이다.
  assert.deepEqual(FORMS.filter((f) => f.dir === 'none').map((f) => f.id), ['mimul']);
  assert.deepEqual(FORMS.filter((f) => f.dir !== 'none' && !(f.stem && STEM_BY_ID[f.stem])).map((f) => f.id), []);
});

test('줄기 16개: 방위마다 4개, 곁줄기는 같은 방위의 다른 줄기 2개, 능력·보정·구슬 데이터', () => {
  assert.equal(STEMS.length, 16);
  assert.deepEqual(STEMS.map((s) => s.id), ['E1', 'E2', 'E3', 'E4', 'W1', 'W2', 'W3', 'W4', 'S1', 'S2', 'S3', 'S4', 'N1', 'N2', 'N3', 'N4']);
  assert.equal(new Set(STEMS.map((s) => s.ability)).size, 16, '줄기마다 능력이 다르다');
  assert.equal(new Set(STEMS.map((s) => s.orbStyle.shape)).size, 16, '줄기마다 구슬 모양이 다르다');
  const dirOf = { E: 'east', W: 'west', S: 'south', N: 'north' };
  const abilities = {
    E1: 'chain', E2: 'charm', E3: 'homing', E4: 'orbit', W1: 'pierce', W2: 'mark', W3: 'boomerang', W4: 'fear',
    S1: 'burn', S2: 'split', S3: 'zone', S4: 'explode', N1: 'freeze', N2: 'drain', N3: 'vortex', N4: 'gust',
  };
  const gradeRingColors = [0xff6fd8, 0xa46bff, 0x4a9dff, 0xffc53d, 0xc2185b, 0xffb3dd, 0x7b1fa2];
  for (const stem of STEMS) {
    assert.equal(stem.dir, dirOf[stem.id[0]], stem.id);
    assert.equal(stem.ability, abilities[stem.id], stem.id);
    assert.ok(stem.boostMult >= 0.9 && stem.boostMult <= 1.2, stem.id);
    assert.equal(stem.cross.length, 2);
    for (const other of stem.cross) {
      assert.notEqual(other, stem.id);
      assert.equal(STEM_BY_ID[other].dir, stem.dir, stem.id + '의 곁줄기는 같은 방위');
    }
    const { shape, main, sub, tail } = stem.orbStyle;
    assert.equal(typeof shape, 'string');
    for (const color of [main, sub, tail]) {
      assert.ok(Number.isInteger(color) && color >= 0 && color <= 0xffffff, stem.id);
      assert.ok(!gradeRingColors.includes(color), stem.id + ' 구슬이 등급 고리·특수 적 구슬 색을 쓴다');
    }
  }
  assert.equal(stemBoostMult(null), 1);
  assert.equal(stemBoostMult('Z9'), 1);
  assert.equal(STEM_BY_ID.W1.boostMult, 1.2);
  assert.equal(STEM_BY_ID.S1.boostMult, 1.2);
  assert.equal(STEM_BY_ID.N1.boostMult, 0.9);
  assert.equal(STEM_BY_ID.E4.boostMult, 0.9);
});

test('각 줄기는 2~5단계에 형태가 있고 단계마다 입구가 정확히 1개이며, 형태의 방위는 줄기의 방위다', () => {
  for (const stem of STEMS) {
    const own = FORMS.filter((f) => f.stem === stem.id);
    for (let stage = 2; stage <= 5; stage++) {
      const atStage = own.filter((f) => f.stage === stage);
      assert.ok(atStage.length >= 1, `${stem.id} ${stage}단계 형태 없음`);
      assert.equal(atStage.filter((f) => f.entry).length, 1, `${stem.id} ${stage}단계 입구`);
    }
    const roots = own.filter((f) => f.stage === 1);
    assert.ok(roots.length <= 1, stem.id + ' 1단계 뿌리');
    if (roots.length) assert.equal(roots[0].entry, true, stem.id + ' 1단계 뿌리는 입구');
    for (const f of own) assert.equal(f.dir, stem.dir, f.id);
  }
  // 1단계 뿌리가 있는 줄기는 8개(E1·E4·W3·W4·S2·S4·N2·N4)다.
  assert.deepEqual(
    byStage(1).filter((f) => f.stem).map((f) => f.stem).sort(),
    ['E1', 'E4', 'N2', 'N4', 'S2', 'S4', 'W3', 'W4'],
  );
  assert.equal(FORM_BY_ID.mimul.stem, null);
  assert.equal(FORM_BY_ID.mimul.entry, false);
  assert.equal(FORMS.filter((f) => f.entry).length, 16 * 4 + 8);
});

test('줄기별 형태 수(설계 2-3 집계)', () => {
  const expected = { E1: 11, E2: 10, E3: 10, E4: 11, W1: 10, W2: 9, W3: 11, W4: 13, S1: 12, S2: 9, S3: 11, S4: 10, N1: 11, N2: 10, N3: 9, N4: 13 };
  for (const [stem, count] of Object.entries(expected)) assert.equal(FORMS.filter((f) => f.stem === stem).length, count, stem);
  assert.equal(Object.values(expected).reduce((a, b) => a + b, 0), 170);
});

test('기존 17종의 id·단계·방위·parts는 바뀌지 않았다', () => {
  for (const [id, [stage, dir, parts]] of Object.entries(LEGACY)) {
    const f = FORM_BY_ID[id];
    assert.ok(f, id + ' 없음');
    assert.equal(f.stage, stage, id);
    assert.equal(f.dir, dir, id);
    assert.deepEqual(f.parts, parts, id);
  }
  // 박이는 west, 현구는 north를 유지한다(저장된 형태의 색).
  assert.equal(FORM_BY_ID.boYi.dir, 'west');
  assert.equal(FORM_BY_ID.darkTurtle.dir, 'north');
  // 기존 mimul·새끼 4종의 성향은 none이다.
  for (const id of ['mimul', 'littleSnake', 'littleTiger', 'littleBird', 'littleTurtle']) assert.equal(FORM_BY_ID[id].branch, 'none', id);
});

test('모든 형태의 parts·deco 이름이 부품 목록에 있고, 인자형 부품은 허용된 n을 쓴다', () => {
  for (const f of FORMS) {
    for (const spec of f.parts) {
      const name = partName(spec);
      assert.ok(isKnownPart(name), `${f.id}: 부품 ${name}이 catalog에 없다`);
      if (Array.isArray(spec)) {
        const args = partArgs(spec);
        const allowed = PARTS_CATALOG[name].n;
        assert.ok(allowed, `${f.id}: ${name}은 인자형이 아니다`);
        assert.ok(allowed.includes(args.n), `${f.id}: ${name}(${args.n})은 ${allowed}만 된다`);
      }
    }
    if (f.stage === 1) {
      assert.equal(f.deco ?? null, null, f.id + ' 1단계는 세트 없음');
    } else if (f.id !== 'mimul') {
      assert.ok(Object.hasOwn(DECO_SETS, f.deco), `${f.id}: deco ${f.deco}`);
    }
  }
});

test('장식 세트 7개는 단계·갈래와 맞고, 점수 합이 설계값이다', () => {
  assert.deepEqual(Object.keys(DECO_SETS), ['base2', 'seon3', 'yo3', 'seon4', 'yo4', 'seon5', 'yo5']);
  const expected = { base2: 1, seon3: 3, yo3: 3, seon4: 6, yo4: 6, seon5: 11, yo5: 10 };
  for (const [name, score] of Object.entries(expected)) assert.equal(decoSetScore(name), score, name);
  for (const specs of Object.values(DECO_SETS)) for (const spec of specs) assert.ok(isKnownPart(partName(spec)));
  for (const f of FORMS) {
    if (f.stage === 2) assert.equal(f.deco, 'base2', f.id);
    if (f.stage >= 3) assert.equal(f.deco, `${f.branch}${f.stage}`, f.id);
  }
});

test('부품 목록: 새 부품 39개 + 기존 56개(creature.js의 PARTS) = 95개, 수 부품 점수, halo 구분', () => {
  const groups = {};
  for (const e of Object.values(PARTS_CATALOG)) groups[e.group] = (groups[e.group] ?? 0) + 1;
  assert.deepEqual(groups, { existing: 56, structure: 17, headDeco: 10, pattern: 7, light: 5 });
  assert.equal(Object.keys(PARTS_CATALOG).length, 95);
  for (const name of DRAW_PART_NAMES) {
    assert.ok(PARTS_CATALOG[name]?.group === 'existing', `creature.js의 부품 ${name}이 catalog에 없다`);
  }
  assert.equal(DRAW_PART_NAMES.length, 56);
  assert.deepEqual([...DRAW_PART_NAMES].sort(), Object.keys(PARTS_CATALOG).filter((n) => PARTS_CATALOG[n].group === 'existing').sort());
  // 수 부품: n=2는 1점, n=3~5는 2점, n≥6은 3점.
  assert.deepEqual([2, 3, 5, 6, 9].map((n) => partScore(['multiHead', { n }])), [1, 2, 2, 3, 3]);
  assert.equal(partScore(['multiTail', { n: 9 }]), 3);
  assert.equal(partScore(['multiWings', { n: 2 }]), 1);
  assert.equal(partScore('paws'), 0);
  assert.equal(partScore('없는부품'), 0);
  // 장식(비단 띠·구슬·광배·부적·문양)은 흰 테두리를 받지 않고, 몸·뿔·꼬리·날개는 받는다.
  for (const name of ['cloudRibbon', 'jadeBeads', 'mandorla', 'flameAura', 'talismanStrip', 'patternBand', 'halo', 'lotusSeat']) {
    assert.equal(PARTS_CATALOG[name].halo, false, name);
  }
  for (const name of ['body', 'multiTail', 'multiWings', 'coilBody', 'backSpikes', 'tusks']) assert.equal(PARTS_CATALOG[name].halo, true, name);
  assert.ok(decorationScore(FORM_BY_ID.gumiho) >= decoSetScore('yo4'));
});

test('next는 설계 3-1 규칙(같은 줄기 다음 단계 전부 + 곁줄기 입구)과 같고 2단계 이상은 모두 부모가 있다', () => {
  for (const f of FORMS) {
    assert.deepEqual(f.next, f.stage === 5 ? [] : expectedNext(f), f.id);
    for (const id of f.next) {
      assert.ok(FORM_BY_ID[id], id);
      assert.equal(FORM_BY_ID[id].stage, f.stage + 1, `${f.id} → ${id}`);
    }
  }
  assert.equal(FORM_BY_ID.mimul.next.length, 24);
  const catalog = evolutionCatalog(FORMS);
  for (const f of catalog.filter((x) => x.stage >= 2)) assert.ok(f.from.length >= 1, f.id + ' 부모 없음');
  for (const f of catalog.filter((x) => x.stage === 2)) assert.ok(f.from.includes('mimul'), f.id);
  for (const f of catalog.filter((x) => x.stage === 1 && x.id !== 'mimul')) assert.equal(f.from.length, 0, f.id + '는 mimul에서 진화하지 않는다');
});

test('새끼 4종의 새 next는 옛 next를 모두 포함한다', () => {
  for (const [id, old] of Object.entries(OLD_NEXT)) {
    for (const target of old) assert.ok(FORM_BY_ID[id].next.includes(target), `${id} → ${target}`);
  }
});

test('3~5단계 형태의 성향은 설계대로 요/선이 정해져 있고 흰 테두리는 3단계부터다', () => {
  for (const f of FORMS.filter((x) => x.stage >= 3)) assert.ok(f.branch === 'yo' || f.branch === 'seon', f.id);
  assert.equal(FORM_BY_ID.gunggi.branch, 'yo');
  assert.equal(FORM_BY_ID.docheol.branch, 'yo');
  assert.equal(FORM_BY_ID.chongnyong.branch, 'yo');
  assert.equal(FORM_BY_ID.hondon.branch, 'yo');
  assert.equal(FORMS.filter((f) => f.stage === 5 && f.branch === 'yo').length, 4);
});

test('머리·꼬리·날개 수 부품은 단계 예외(◇)로 정한 형태만 많은 수를 쓴다', () => {
  const heads = FORMS.filter((f) => f.parts.some((p) => partName(p) === 'multiHead'));
  const headsN = (id) => FORM_BY_ID[id].parts.find((p) => partName(p) === 'multiHead')[1].n;
  assert.equal(headsN('sangnyu'), 9);
  assert.equal(headsN('gubong'), 9);
  assert.equal(headsN('changbu'), 3);
  assert.equal(headsN('ssangssang'), 3);
  assert.equal(headsN('byeongbong'), 2);
  assert.equal(headsN('biikjo'), 2);
  assert.ok(heads.length >= 8);
});
