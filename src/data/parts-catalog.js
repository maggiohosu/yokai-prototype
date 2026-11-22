// 부품 목록: 기존 56개(src/art/creature.js의 PARTS) + 새 부품 39개(docs/research/art-direction.md 7장) = 95개.
// 형태(forms.js)의 parts·deco가 쓰는 이름은 모두 여기에 있어야 한다(tests/forms-data.test.mjs가 검사).
// 새 부품 39개의 그림은 T2가 creature.js에 그린다. 그전까지 creature.js는 모르는 부품을 건너뛴다.
//
// 항목 모양
//   group  existing 기존 | structure 몸 구조(실루엣) | headDeco 머리·몸 장식 | pattern 문양·띠 | light 빛·받침
//   stages 주로 쓰는 단계 [최소, 최대] (새 부품만, 참고용)
//   score  장식 점수(art-direction 6장). 숫자이거나 인자({ n, key })를 받는 함수. 기존 부품은 0
//   halo   선(仙) 갈래의 흰 테두리를 받는가(설계 6-2 충돌 2). 몸·뿔·꼬리·날개 같은 실루엣 부품만 true,
//          비단 띠·구슬·광배·부적·문양 같은 장식은 false. 기존 부품은 지금 그림과 같게 모두 true
//   n      인자형 부품의 n이 가질 수 있는 값(문서 기준)

const EXISTING_PART_NAMES = [
  'body', 'face', 'shell', 'antlers', 'droplet', 'flame', 'sixLegs', 'paws', 'birdFeet', 'antennae',
  'leafMark', 'segments', 'longSerpent', 'scales', 'tongue', 'stripedTail', 'tigerEars', 'foxEars', 'catEars',
  'deerEars', 'fourEars', 'threeTails', 'nineTails', 'stripes', 'muzzle', 'foxMuzzle', 'wings', 'plumage',
  'longNeck', 'beak', 'whiteBeak', 'longBeak', 'crest', 'crown', 'flippers', 'turtleHead', 'littleHorns',
  'twinHorns', 'oneHorn', 'backEyes', 'ramHorns', 'whiteHead', 'spots', 'oneLeg', 'redMarks', 'club', 'hat',
  'fang', 'topknot', 'robe', 'peach', 'waveHands', 'wetHair', 'smoke', 'bigHead', 'snakeTail',
];

// 수 부품 점수: n=2는 1점, n=3~5는 2점, n≥6은 3점.
const byCount = ({ n } = {}) => ((n ?? 1) >= 6 ? 3 : (n ?? 1) >= 3 ? 2 : 1);

export const PARTS_CATALOG = {
  // ---- 기존 ----
  ...Object.fromEntries(EXISTING_PART_NAMES.map((name) => [name, { group: 'existing', score: 0, halo: true }])),

  // ---- A. 몸 구조 17 ----
  multiHead: { group: 'structure', stages: [3, 5], score: byCount, halo: true, n: [2, 3, 6, 9] },
  multiTail: { group: 'structure', stages: [3, 5], score: byCount, halo: true, n: [3, 4, 6, 9] },
  multiWings: { group: 'structure', stages: [3, 5], score: byCount, halo: true, n: [1, 2, 3] },
  sixArms: { group: 'structure', stages: [4, 5], score: 2, halo: true, n: [4, 6] },
  foreheadEye: { group: 'structure', stages: [3, 5], score: 1, halo: false },
  oneEye: { group: 'structure', stages: [3, 4], score: 1, halo: false },
  bellyFace: { group: 'structure', stages: [4, 5], score: 2, halo: false },
  humanFace: { group: 'structure', stages: [3, 5], score: 1, halo: false },
  coilBody: { group: 'structure', stages: [3, 5], score: ({ n } = {}) => ((n ?? 3) >= 5 ? 2 : 1), halo: true },
  fishTail: { group: 'structure', stages: [3, 5], score: 1, halo: true },
  backSpikes: { group: 'structure', stages: [3, 5], score: 1, halo: true },
  hexShell: { group: 'structure', stages: [3, 5], score: 1, halo: true },
  antlerTree: { group: 'structure', stages: [4, 5], score: 2, halo: true },
  maneFlame: { group: 'structure', stages: [3, 5], score: ({ n } = {}) => ((n ?? 1) >= 2 ? 2 : 1), halo: true },
  maneCloud: { group: 'structure', stages: [3, 5], score: ({ n } = {}) => ((n ?? 1) >= 2 ? 2 : 1), halo: true },
  tusks: { group: 'structure', stages: [3, 5], score: 1, halo: true },
  tailFan: { group: 'structure', stages: [4, 5], score: 2, halo: true },

  // ---- B. 머리·몸 장식 10 ----
  featherCrown: { group: 'headDeco', stages: [4, 5], score: 2, halo: true },
  taoCrown: { group: 'headDeco', stages: [3, 4], score: 1, halo: true },
  beadCurtainCrown: { group: 'headDeco', stages: [5, 5], score: 3, halo: true },
  hornWrap: { group: 'headDeco', stages: [3, 5], score: 1, halo: false },
  foreheadMark: { group: 'headDeco', stages: [2, 5], score: 1, halo: false },
  jadeBeads: { group: 'headDeco', stages: [3, 5], score: 1, halo: false },
  tasselKnot: { group: 'headDeco', stages: [3, 5], score: 1, halo: false },
  talismanStrip: { group: 'headDeco', stages: [3, 5], score: 1, halo: false },
  goldTrim: { group: 'headDeco', stages: [4, 5], score: 1, halo: false },
  goldLeaf: { group: 'headDeco', stages: [5, 5], score: 1, halo: false },

  // ---- C. 문양·띠 7 ----
  cloudRibbon: { group: 'pattern', stages: [3, 5], score: ({ n } = {}) => n ?? 1, halo: false, n: [1, 2, 3] },
  cloudMark: { group: 'pattern', stages: [4, 5], score: 1, halo: false },
  cloudBase: { group: 'pattern', stages: [4, 5], score: ({ n } = {}) => ((n ?? 3) >= 5 ? 2 : 1), halo: false },
  waveRim: { group: 'pattern', stages: [4, 5], score: ({ n } = {}) => ((n ?? 1) >= 2 ? 2 : 1), halo: false },
  // key: 'hoeja' 回字 | 'thunder' 雷紋 | 'wave' 물결 | 'whiteLine' 판화식 흰 선
  patternBand: { group: 'pattern', stages: [4, 5], score: 1, halo: false, keys: ['hoeja', 'thunder', 'wave', 'whiteLine'] },
  starDots: { group: 'pattern', stages: [3, 5], score: 1, halo: false },
  eyeSpots: { group: 'pattern', stages: [4, 5], score: 1, halo: false },

  // ---- D. 빛·받침 5 ----
  halo: { group: 'light', stages: [4, 5], score: 2, halo: false, n: [1, 2] },
  mandorla: { group: 'light', stages: [5, 5], score: 3, halo: false },
  flameAura: { group: 'light', stages: [5, 5], score: 3, halo: false },
  lotusSeat: { group: 'light', stages: [4, 5], score: 2, halo: false },
  sunMoonDisc: { group: 'light', stages: [4, 5], score: 1, halo: false },
};

// 장식 세트 7개(설계 2-2). 세트 부품의 그리기 층은 T2의 그리기 코드가 정한다.
// 점수 합: base2 1 / seon3 3 / yo3 3 / seon4 6 / yo4 6 / seon5 11 / yo5 10.
export const DECO_SETS = {
  base2: ['foreheadMark'],
  seon3: ['foreheadMark', 'jadeBeads', ['cloudRibbon', { n: 1 }]],
  yo3: ['foreheadMark', 'talismanStrip', 'tasselKnot'],
  seon4: ['goldTrim', ['halo', { n: 1 }], ['cloudRibbon', { n: 2 }], 'cloudBase'],
  yo4: ['goldTrim', 'foreheadMark', 'talismanStrip', ['patternBand', { key: 'thunder' }], 'cloudMark', 'tasselKnot'],
  seon5: ['goldTrim', 'goldLeaf', ['halo', { n: 2 }], 'mandorla', ['cloudRibbon', { n: 2 }], 'lotusSeat'],
  yo5: ['goldTrim', 'goldLeaf', 'flameAura', 'talismanStrip', ['patternBand', { key: 'thunder' }], 'foreheadMark', 'tasselKnot', 'cloudMark'],
};

// 부품 지정은 '이름' 또는 ['이름', { n, key }]다.
export const partName = (spec) => (Array.isArray(spec) ? spec[0] : spec);
export const partArgs = (spec) => (Array.isArray(spec) ? spec[1] ?? {} : {});
export const isKnownPart = (name) => Object.hasOwn(PARTS_CATALOG, name);

// 부품 하나의 장식 점수. 모르는 부품은 0.
export function partScore(spec) {
  const name = partName(spec);
  if (!isKnownPart(name)) return 0;
  const { score } = PARTS_CATALOG[name];
  return typeof score === 'function' ? score(partArgs(spec)) : score;
}

export const decoSetScore = (setName) => (DECO_SETS[setName] ?? []).reduce((sum, spec) => sum + partScore(spec), 0);

// 형태의 장식 점수 = 장식 세트 점수 + 구조 부품 점수(덜어 내기 전 값. 구간에 맞추는 일은 T2의 decorate가 한다).
export function decorationScore(form) {
  return decoSetScore(form.deco) + (form.parts ?? []).reduce((sum, spec) => sum + partScore(spec), 0);
}
