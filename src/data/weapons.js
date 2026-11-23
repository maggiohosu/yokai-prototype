// 보패(寶貝) 무기 데이터 8행 — 여의주(기준 무기) + 상점에서 사는 보패 7종. 설계: docs/design-weapons.md 2-1·2-2·2-5.
// 기본 수치는 설계 2-2, 비행 속도는 docs/plan.md 변경 이력 14를 따른다(원래 값 × 0.5 × 0.5: 여의주 520 → 130 등).
//
// 읽는 법 (L = 강화 레벨 0~15, W·K·S·H = TREASURE.levels의 방향 수·방향당 발사·속도 배율·유도, P = 구슬 1발 피해):
//   hit        한 번 피해 계수(× P, 개수에 K를 곱하는 무기는 × K P).  abilityBase  능력 기준 피해 B = abilityBase × P(3-1).
//   cdMult     쿨타임 배율(× CONFIG.combat.cooldown).  reach 사거리(월드 단위).  speed 날아가는 것의 속도(× S).
//   homingMult 유도 배율(× H). 0이면 그 무기는 날아가며 휘지 않는다(팔괘경 조준 보정은 H를 따로 읽는다).  priceMult 판매가·강화비 배율(지금 모두 1.0, 결정 D4).  unlockStage 해금에 필요한 '지금까지 닿은 최고 단계'.
//   order      상점 진열 순서(해금 단계 순, 같은 단계는 설계 5-1 표 순서).  droppable 요괴가 떨어뜨리는가(여의주만, 결정 D2).
//   [base, perLevel, max] 꼴 값은 min(max, base + perLevel × L).
// 시간 값은 모두 시뮬레이션 초다(결정 D8).

export const WEAPONS = [
  { id: 'yeouiju', name: '여의주', hanja: '如意珠', unlockStage: 1, order: 0, priceMult: 1, droppable: true,
    pattern: 'orb', hit: 1.0, cdMult: 1.0, reach: 360, speed: 130, homingMult: 1.0, abilityBase: 1.0,
    line: '이동 방향으로 구슬을 쏜다', strong: '고르게 쓸 만함', weak: '특기가 없음' },
  { id: 'fan', name: '학우선', hanja: '鶴羽扇', unlockStage: 2, order: 1, priceMult: 1, droppable: false,
    pattern: 'fan', hit: 0.65, cdMult: 1.0, reach: 200, speed: 117.5, homingMult: 0.5, abilityBase: 0.6,
    perK: 3, spread: { base: 50, perWay: 10, max: 120 },
    line: '앞쪽으로 바람 깃을 넓게 흩뿌린다', strong: '가까운 큰 요괴·뭉친 무리', weak: '짧은 사거리·뒤쪽' },
  { id: 'sword', name: '도목검', hanja: '桃木劍', unlockStage: 2, order: 2, priceMult: 1, droppable: false,
    pattern: 'boomerang', hit: 0.6, cdMult: 1.3, reach: 260, speed: 142.5, homingMult: 1.0, abilityBase: 0.9,
    blades: 'ceilW2', fanDeg: 12,
    line: '앞으로 꿰뚫고 날아갔다가 돌아오며 다시 꿰뚫는다', strong: '한 줄의 적·큰 요괴에 두 번', weak: '뒤쪽을 못 침' },
  { id: 'mirror', name: '팔괘경', hanja: '八卦鏡', unlockStage: 3, order: 3, priceMult: 1, droppable: false,
    pattern: 'beam', hit: 1.5, cdMult: 1.8, reach: 470, speed: 0, homingMult: 0, abilityBase: 1.0,
    beams: 'ceilW2', halfWidth: { base: 4, perK: 3 }, aimSnapDeg: 20,
    line: '빛줄기가 한 줄 위의 적을 모두 꿰뚫는다', strong: '일렬로 선 적·가장 긴 사거리', weak: '긴 쿨타임·줄을 맞춰야 함' },
  { id: 'beads', name: '염주', hanja: '念珠', unlockStage: 3, order: 4, priceMult: 1, droppable: false,
    pattern: 'orbit', hit: 0.4, cdMult: 1.2, reach: 0, speed: 0, homingMult: 0, abilityBase: 0.6,
    count: { plusW: 1, max: 8 }, orbit: { sizeMult: 1.3, pad: 24, burstMult: 1.8 }, contactHit: 0.4, burstHit: 0.8, rehitSec: 0.45, spinRadPerSec: 3.0, burstOutSec: 0.25, burstBackSec: 0.25,
    line: '알이 내 둘레를 돌며 닿는 적을 친다', strong: '포위당했을 때·붙는 적', weak: '멀리 있는 큰 요괴' },
  { id: 'seal', name: '옥인', hanja: '玉印', unlockStage: 4, order: 5, priceMult: 1, droppable: false,
    pattern: 'slam', hit: 2.6, cdMult: 2.0, reach: 270, speed: 0, homingMult: 0, abilityBase: 1.4,
    seals: 'ceilW3', slam: { pad: 12, perLevel: 0.8, delaySec: 0.35, sense: 270, coneDeg: 35, fallback: 200, max: 6 },
    line: '위협 위에 그림자를 띄우고 인장이 떨어져 크게 깎는다', strong: '큰 요괴 하나를 크게 깎기', weak: '느림·움직이는 적·무리' },
  { id: 'gourd', name: '단호로', hanja: '丹葫蘆', unlockStage: 4, order: 6, priceMult: 1, droppable: false,
    pattern: 'pool', hit: 0.6, cdMult: 1.6, reach: 220, speed: 90, homingMult: 1.0, abilityBase: 0.8,
    drops: 'ceilW3', dropSpreadDeg: 15, pool: { radius: [45, 2, 75], duration: [2.0, 0.1, 3.5], dpsK: 0.9, max: 6 },
    line: '닿은 곳에 잠시 남는 웅덩이를 만든다', strong: '뭉친 무리·길목 막기', weak: '약한 즉시 피해·빠른 적' },
  { id: 'bell', name: '삼청령', hanja: '三清鈴', unlockStage: 5, order: 7, priceMult: 1, droppable: false,
    pattern: 'ring', hit: 0.5, cdMult: 1.5, reach: 150, speed: 0, homingMult: 0, abilityBase: 0.6,
    rings: 'ceilW3', ring: { radius: [150, 5, 225], spreadSec: 0.3, gapSec: 0.12, max: 6 },
    line: '몸에서 소리 고리가 퍼져 닿는 적을 모두 친다', strong: '사방의 적·뒤쪽 적', weak: '작은 한 번 피해·반경 밖' },
];

export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));
export const WEAPON_IDS = WEAPONS.map((w) => w.id);
export const DEFAULT_WEAPON = 'yeouiju';
