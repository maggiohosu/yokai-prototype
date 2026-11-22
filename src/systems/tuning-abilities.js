// 여의주 능력 16종의 수치표. 설계: docs/design-forms-abilities.md 4-3.
// - 배열은 모두 [1단계, 2단계, 3단계, 4단계, 5단계] 순서다. 시간은 화면 시간(초), 거리는 월드 단위, 비율은 구슬 1발 피해(등급·보물 레벨 포함) 기준.
// - scale: 여의주 강화 레벨(0~15)을 적용하는 방식. 'lv' = × (1 + perLevel × L), 'int' = + floor(L / intEvery),
//          'int10' = + floor(L / 10), 'div' = ÷ (1 + perLevel × L).
// - cap: 위로 막는 상한(scale 적용 뒤), floor: 아래로 막는 하한. 저항(resist)은 combat이 걸 때 곱한다(abilities.resisted).
//   resist 값 'time' = 지속 시간(최소 minSec 미만이면 안 건다), 'size' = 끌기·밀기·둔화 크기(기본값의 minRatio 미만이면 안 건다).
// - 등급 배율은 능력의 피해에만 곱한다(구슬 피해에서 나오므로 자연히 따라간다). 지속·범위에는 곱하지 않는다(사용자 결정 2026-11-23).
// - 적은 능력을 쓰지 않는다(사용자 결정 2026-11-23). 이 표는 플레이어의 여의주에만 쓰인다.

// lv(L) = 1 + perLevel × L (L = 0~15, +15에서 ×1.6), 정수 수치는 + floor(L / intEvery).
export const ABILITY_LEVEL = { perLevel: 0.04, intEvery: 5, maxLevel: 15 };

// 상위 단계 적 저항 r(Δ) = base^max(0, Δ), Δ = 적 단계 − 내 단계. 하위 단계 적에게 더 세지지는 않는다.
export const ABILITY_RESIST = { base: 0.5, minSec: 0.15, minRatio: 0.1 };

// 표에 없는 고정 규칙(화면 초). 사건 상한은 초당 횟수.
export const ABILITY_RULES = {
  charm: { graceSec: 1.0, immuneSec: 1.5, leash: 260, senseMult: 1.2 },
  freeze: { immuneSec: 1.0 },
  fear: { immuneSec: 1.0 },
  orbit: { rehitSec: 0.4, radiusMult: 1.3, radiusPad: 24, pearlRadiusMult: 1.7, spinRadPerSec: 3.4 },
  gust: { pushSec: 0.15, stunSec: 0.2, rehitSec: 0.3, areaMult: 0.5 },
  vortex: { gateSec: 0.5 },
  explode: { eventsPerSec: 15 },
  chain: { eventsPerSec: 12 },
  drain: { growthPerSec: 0.04 },
  mark: { lureMinStage: 3, lureMult: 0.6 },
  split: { speedMult: 0.8, radiusMult: 0.8 },
  boomerang: { returnRangeMult: 2.2 },
};

export const ABILITIES = {
  chain: {
    id: 'A01', stem: 'E1', name: '뇌쇄', hanja: '雷鎖',
    hops: [1, 1, 2, 2, 3], range: [90, 100, 110, 125, 140], falloff: [0.5, 0.55, 0.6, 0.65, 0.7],
    scale: { hops: 'int', range: 'lv' }, cap: { hops: 6, range: 220 }, resist: {},
  },
  charm: {
    id: 'A02', stem: 'E2', name: '매혹', hanja: '魅惑',
    duration: [2.0, 2.5, 3.0, 3.5, 4.5], cooldown: [3.0, 2.6, 2.2, 1.8, 1.4], allies: [1, 1, 2, 2, 3],
    scale: { duration: 'lv', allies: 'int10' }, cap: { duration: 8.0, allies: 4 }, resist: { duration: 'time' },
  },
  homing: {
    id: 'A03', stem: 'E3', name: '학익 추적', hanja: '鶴翼',
    strength: [0.4, 0.55, 0.7, 0.85, 1.0], turn: [1.0, 1.1, 1.25, 1.4, 1.6], retarget: [120, 140, 160, 190, 220],
    scale: { turn: 'lv' }, cap: { strength: 1.0, turn: 2.4 }, resist: {},
  },
  orbit: {
    id: 'A04', stem: 'E4', name: '호신주', hanja: '護身珠',
    count: [1, 2, 2, 3, 4], damage: [0.5, 0.6, 0.7, 0.8, 1.0], regen: [3.0, 2.5, 2.0, 1.6, 1.2],
    scale: { count: 'int', regen: 'div' }, cap: { count: 6 }, floor: { regen: 0.8 }, resist: {},
  },
  pierce: {
    id: 'A05', stem: 'W1', name: '관통', hanja: '貫通',
    extra: [1, 1, 2, 2, 3], keep: [0.7, 0.75, 0.8, 0.85, 0.9],
    scale: { extra: 'int' }, cap: { extra: 6 }, resist: {},
  },
  mark: {
    id: 'A06', stem: 'W2', name: '파사인', hanja: '破邪印',
    amp: [15, 20, 25, 30, 40], duration: [2.0, 2.5, 3.0, 3.5, 4.0],
    scale: { amp: 'lv', duration: 'lv' }, cap: { amp: 80, duration: 6.4 }, resist: { duration: 'time' },
  },
  boomerang: {
    id: 'A07', stem: 'W3', name: '회선', hanja: '回旋',
    damage: [0.6, 0.7, 0.8, 0.9, 1.0], pierce: [1, 1, 2, 2, 3], rangeBonus: [0, 10, 15, 20, 25],
    scale: { pierce: 'int' }, cap: { pierce: 5 }, resist: {},
  },
  fear: {
    id: 'A08', stem: 'W4', name: '위협', hanja: '威嚇',
    duration: [1.0, 1.3, 1.6, 2.0, 2.5],
    scale: { duration: 'lv' }, cap: { duration: 4.0 }, resist: { duration: 'time' },
  },
  burn: {
    id: 'A09', stem: 'S1', name: '작열', hanja: '灼熱',
    total: [0.6, 0.8, 1.0, 1.3, 1.6], duration: [1.5, 2.0, 2.5, 3.0, 3.5],
    scale: { duration: 'lv' }, cap: { duration: 5.6 }, resist: { duration: 'time' },
  },
  split: {
    id: 'A10', stem: 'S2', name: '분화', hanja: '分火',
    count: [2, 2, 3, 3, 4], damage: [0.4, 0.45, 0.5, 0.55, 0.6], range: [120, 130, 150, 170, 200],
    scale: { count: 'int', range: 'lv' }, cap: { count: 6, range: 280 }, resist: {},
  },
  zone: {
    id: 'A11', stem: 'S3', name: '선무', hanja: '仙霧',
    radius: [40, 50, 60, 70, 85], duration: [1.5, 2.0, 2.5, 3.0, 3.5], slow: [0.20, 0.25, 0.30, 0.35, 0.40],
    dps: [0.20, 0.25, 0.30, 0.35, 0.40], clouds: [3, 3, 4, 5, 6],
    scale: { radius: 'lv' }, cap: { radius: 130, slow: 0.40, clouds: 6 }, resist: { slow: 'size' },
  },
  explode: {
    id: 'A12', stem: 'S4', name: '폭염', hanja: '爆炎',
    radius: [40, 50, 60, 75, 90], damage: [0.5, 0.55, 0.6, 0.7, 0.8],
    scale: { radius: 'lv' }, cap: { radius: 140 }, resist: {},
  },
  freeze: {
    id: 'A13', stem: 'N1', name: '빙결', hanja: '氷結',
    duration: [0.6, 0.8, 1.0, 1.3, 1.6],
    scale: { duration: 'lv' }, cap: { duration: 2.6 }, resist: { duration: 'time' },
  },
  drain: {
    id: 'A14', stem: 'N2', name: '흡정', hanja: '吸精',
    rate: [0.10, 0.13, 0.16, 0.20, 0.25],
    scale: { rate: 'lv' }, cap: { rate: 0.40 }, resist: {},
  },
  vortex: {
    id: 'A15', stem: 'N3', name: '와류', hanja: '渦流',
    radius: [80, 95, 110, 130, 150], pull: [60, 75, 90, 110, 130], duration: [0.8, 1.0, 1.2, 1.4, 1.6], count: [2, 2, 3, 3, 4],
    scale: { radius: 'lv' }, cap: { radius: 220, count: 4 }, resist: { pull: 'size' },
  },
  gust: {
    id: 'A16', stem: 'N4', name: '대풍', hanja: '大風',
    distance: [40, 55, 70, 90, 110], areaRadius: [0, 0, 0, 40, 60],
    scale: { distance: 'lv' }, cap: { distance: 180 }, resist: { distance: 'size' },
  },
};

export const ABILITY_IDS = Object.keys(ABILITIES);
