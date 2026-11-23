// 무기 × 능력 연결표(설계 docs/design-weapons.md 3-1·3-2·3-3)의 순수 데이터와 보정 계산. Phaser·DOM 의존 없음.
// 능력 16종(ABILITIES)은 지금 형태의 줄기로 정해지고 무기를 바꿔도 같다. 무기는 능력이 붙는 '명중 사건'의 모양만 다르다.
// - adapt(kind, abilityKey) → 표의 한 칸 { trigger, perEvent, overlap, overlapId, mult, calc }.
//     trigger  능력이 발동하는 단위(아래 TRIGGERS). perEvent 한 사건(발사·줄·고리 …)에서 능력이 발동할 수 있는 최대 횟수.
//     overlap  ⚙ 표시: 그 무기가 이미 가진 성질과 겹쳐서 3-3의 수치 보정을 받는 칸. overlapId는 3-3의 번호(1~22, 학우선×대풍은 겹침이 아니라 감쇠라서 null).
//     mult     그 칸이 항상 갖는 고정 보정(튐 +1, 갈래 사거리 ×0.7, 지속 ×0.6 …).
// - modsFor(kind, abilityKey, ab, stats) → 칸의 보정을 능력 수치(ab = abilityRuntime의 결과)와 합친 숫자 모음. combat이 형태·무기·레벨이 바뀔 때만 계산해 둔다.
// 표의 열 순서는 설계 3-2와 같다(여의주·학우선·팔괘경·도목검·염주·단호로·삼청령·옥인). ABILITY_ORDER는 A01~A16 행 순서다.

import { ABILITIES } from './tuning-abilities.js';

export const WEAPON_ORDER = ['yeouiju', 'fan', 'mirror', 'sword', 'beads', 'gourd', 'bell', 'seal'];
export const ABILITY_ORDER = ['chain', 'charm', 'homing', 'orbit', 'pierce', 'mark', 'boomerang', 'fear', 'burn', 'split', 'zone', 'explode', 'freeze', 'drain', 'vortex', 'gust'];

// 발동 단위. 같은 능력이라도 무기에 따라 단위가 다르다(설계 3-1 '무기별 발동 단위').
export const TRIGGERS = Object.freeze({
  hit: '명중마다(구슬·깃·칼·접촉·퍼짐·줄 위 적·고리가 지나간 적)',
  volley: '발사 1회당 perEvent회까지, 먼저 맞은 깃부터(학우선)',
  volleyCenter: '발사 1회당 1회, 가운데 깃이 맞았을 때만(학우선)',
  beamEnd: '줄 1개당 1회, 마지막으로 맞은 적(가장 먼 적) 자리(팔괘경)',
  pathFirst: '칼 1자루당 가는 길 첫 명중 1회 + 오는 길 첫 명중 1회(도목검)',
  turnPoint: '칼이 돌아서는 지점 1개(도목검)',
  enemySec: '같은 적에게 1 화면 초에 1회(염주)',
  burstAtMe: '퍼짐 1회당 내 자리에 1개(염주)',
  poolBorn: '웅덩이가 생길 때 1회, 웅덩이 중심(단호로)',
  poolField: '웅덩이가 그 능력의 장판을 겸한다(단호로 × 선무·와류)',
  ring: '고리 1개당 1회, 맞은 적 중 가장 큰 적 자리(삼청령)',
  ringAtMe: '고리 1개당 내 자리에 1개(삼청령)',
  slam: '인장 1개당 1회, 주 표적 자리(옥인)',
  hitEnter: '물방울 명중 + 적이 웅덩이에 처음 들어올 때(웅덩이당 4마리까지, 단호로)',
  // 아래는 상태이상·발사체 변형·상시 능력의 칸 이름이다(설명용).
  steer: '구슬 유도', steerCone: '깃 유도(앞쪽 부채꼴 탐지)', steerOmni: '사방 탐지 유도', aimSnap: '광선 조준 보정 각도 확대',
  orbitRadius: '도는·퍼지는 반지름 확대', ringRadius: '고리 최대 반경 확대', senseOmni: '표적 탐지가 사방·탐지 거리 확대',
  pearls: '진주가 따로 돈다', merge: '진주를 알에 합친다',
  pierce: '구슬 관통', beamPower: '광선 피해·폭 증가', bladePower: '칼 피해 증가', beadPower: '알 피해 증가', poolRadius: '웅덩이 반경 증가',
  ringPower: '고리 피해 증가', slamRadius: '낙하 반경 증가',
  turnBack: '구슬이 돌아옴', centerTurn: '가운데 깃 1장만 돌아옴', reflect: '반사 광선', backPower: '오는 길 피해·가는 거리 증가', backHit: '돌아오는 길에도 맞힘',
  poolTime: '웅덩이 지속 증가', echoRing: '메아리 고리', echoSlam: '한 번 더 떨어짐',
  drain: '모든 무기 피해에서 흡수', push: '구슬 방향으로 밀기', pushLine: '광선 방향으로 밀기', pushOut: '나 → 적(낙하 중심 → 바깥) 방향으로 밀기', pushDrop: '물방울 명중 때만 밀기',
});

const INF = Infinity;
const STATUS_ROW = (durMulBell = 0.6) => [
  ['hit', INF], ['hit', INF], ['hit', INF], ['hit', INF], ['hit', INF],
  ['hitEnter', INF],
  ['hit', INF, { durMul: durMulBell }],
  ['hit', INF, { durMulSecondary: 0.6, primaryFirst: true }],
];

// 한 칸 = [trigger, perEvent, mult?]. 행 = 능력, 열 = WEAPON_ORDER.
const ROWS = {
  chain: [['hit', INF], ['volley', 2], ['beamEnd', 1, { hops: 1 }], ['pathFirst', 1], ['enemySec', 1], ['poolBorn', 1], ['ring', 1], ['slam', 1, { hops: 1 }]],
  charm: STATUS_ROW(),
  homing: [['steer', INF], ['steerCone', INF], ['aimSnap', INF], ['steerOmni', INF], ['orbitRadius', INF], ['steerOmni', INF], ['ringRadius', INF], ['senseOmni', INF]],
  orbit: [['pearls', INF], ['pearls', INF], ['pearls', INF], ['pearls', INF], ['merge', INF], ['pearls', INF], ['pearls', INF], ['pearls', INF]],
  pierce: [['pierce', INF], ['pierce', INF], ['beamPower', INF], ['bladePower', INF], ['beadPower', INF], ['poolRadius', INF], ['ringPower', INF], ['slamRadius', INF]],
  mark: STATUS_ROW(),
  boomerang: [['turnBack', INF], ['centerTurn', INF], ['reflect', INF], ['backPower', INF], ['backHit', INF], ['poolTime', INF], ['echoRing', INF], ['echoSlam', INF]],
  fear: STATUS_ROW(),
  burn: STATUS_ROW(),
  split: [['hit', INF], ['volley', 2], ['beamEnd', 1], ['pathFirst', 1], ['enemySec', 1], ['poolBorn', 1, { rangeMult: 0.7 }], ['ring', 1], ['slam', 1, { countBonus: 1 }]],
  zone: [['hit', INF], ['volleyCenter', 1], ['beamEnd', 1], ['turnPoint', 1], ['burstAtMe', 1, { radiusMult: 0.8 }], ['poolField', INF], ['ringAtMe', 1, { radiusMult: 0.8 }], ['slam', 1, { radiusMult: 1.2 }]],
  explode: [['hit', INF], ['volley', 2], ['beamEnd', 1], ['pathFirst', 1], ['enemySec', 1], ['poolBorn', 1], ['ring', 1], ['slamRadius', INF]],
  freeze: STATUS_ROW(),
  drain: WEAPON_ORDER.map(() => ['drain', INF]),
  vortex: [['hit', INF], ['volleyCenter', 1], ['beamEnd', 1], ['turnPoint', 1], ['enemySec', 1], ['poolField', INF], ['ring', 1], ['slam', 1]],
  gust: [['push', INF], ['push', INF, { pushMult: 0.5 }], ['pushLine', INF, { pushMult: 0.7 }], ['push', INF], ['pushOut', INF], ['pushDrop', INF], ['pushOut', INF, { pushMult: 0.6 }], ['pushOut', INF, { pushMult: 1, pushMultSecondary: 0.5 }]],
};

// 겹침 조합 22개의 수치 보정(설계 3-3). calc(ab, stats)는 능력 수치 ab와 무기 수치 stats로 보정 숫자를 돌려준다.
// P(관통 수) = ab.extra, b(회선 되돌이 피해) = ab.damage, h(학익 유도 세기) = ab.strength, k(호신주 진주 수) = ab.count,
// s(선무 둔화) = ab.slow, v(와류 끌기 속도) = ab.pull, Re(폭염 반경) = ab.radius. 모두 형태 단계·강화 레벨을 적용한 뒤 값이다.
export const OVERLAPS = [
  { id: 1, kind: 'mirror', ability: 'pierce', why: '광선은 이미 줄 위를 모두 친다', calc: (ab) => ({ damageMult: 1 + 0.10 * ab.extra, halfWidthAdd: 2 * ab.extra }) },
  { id: 2, kind: 'sword', ability: 'pierce', why: '칼은 이미 무제한 관통', calc: (ab) => ({ damageMult: 1 + 0.08 * ab.extra }) },
  { id: 3, kind: 'beads', ability: 'pierce', why: '알은 여러 적에 닿는다', calc: (ab) => ({ damageMult: 1 + 0.08 * ab.extra }) },
  { id: 4, kind: 'gourd', ability: 'pierce', why: '장판', calc: (ab) => ({ poolRadiusMult: 1 + 0.06 * ab.extra, poolRadiusCap: 90 }) },
  { id: 5, kind: 'bell', ability: 'pierce', why: '고리는 이미 모두 친다', calc: (ab) => ({ damageMult: 1 + 0.08 * ab.extra }) },
  { id: 6, kind: 'seal', ability: 'pierce', why: '범위 공격', calc: (ab) => ({ slamRadiusMult: 1 + 0.08 * ab.extra }) },
  { id: 7, kind: 'fan', ability: 'boomerang', why: '깃이 모두 돌아오면 구슬 수·화면이 넘친다', calc: () => ({ centerOnly: true }) },
  { id: 8, kind: 'mirror', ability: 'boomerang', why: '날아가는 구슬이 없다', calc: (ab) => ({ reflectDelay: 0.15, reflectMult: ab.damage * 0.6 }) },
  { id: 9, kind: 'sword', ability: 'boomerang', why: '이미 돌아온다', calc: (ab) => ({ backMult: 1 + 0.3 * ab.damage, reachMult: 1 + ab.rangeBonus / 100 }) },
  { id: 10, kind: 'beads', ability: 'boomerang', why: '퍼졌다 돌아오는 동작이 이미 있다', calc: (ab) => ({ backHit: true, backMult: ab.damage }) },
  { id: 11, kind: 'gourd', ability: 'boomerang', why: '장판', calc: (ab) => ({ poolDurationMult: 1 + 0.2 * ab.damage, poolDurationCap: 4.5 }) },
  { id: 12, kind: 'bell', ability: 'boomerang', why: '날아가는 구슬이 없다', calc: (ab) => ({ echoMult: ab.damage * 0.6 }) },
  { id: 13, kind: 'seal', ability: 'boomerang', why: '날아가는 구슬이 없다', calc: (ab) => ({ echoDelay: 0.3, echoMult: ab.damage * 0.5 }) },
  { id: 14, kind: 'fan', ability: 'homing', why: '깃이 많아 모두 사방 유도하면 부채꼴이 사라진다', calc: (ab) => ({ homingMin: 0.5 * ab.strength }) },
  { id: 15, kind: 'mirror', ability: 'homing', why: '광선은 휘지 않는다', calc: (ab, st) => ({ snapDeg: 20 * Math.max(st.H, ab.strength) + 15 }) },
  { id: 16, kind: 'beads', ability: 'homing', why: '날아가는 구슬이 없다', calc: (ab) => ({ orbitMult: 1 + 0.15 * ab.strength }) },
  { id: 17, kind: 'gourd', ability: 'homing', why: '—', calc: (ab, st) => ({ homingMin: Math.max(st.homing, ab.strength) }) },
  { id: 18, kind: 'bell', ability: 'homing', why: '방향이 없다', calc: (ab) => ({ ringMult: 1 + 0.15 * ab.strength, ringCap: 260 }) },
  { id: 19, kind: 'seal', ability: 'homing', why: '이미 표적을 고른다', calc: (ab) => ({ omni: true, senseMult: 1 + 0.3 * ab.strength }) },
  { id: 20, kind: 'beads', ability: 'orbit', why: '둘 다 몸 둘레를 돈다', calc: (ab) => ({ extraBeads: Math.floor(ab.count / 2), maxBeads: 10, block: true, contactFloor: ab.damage }) },
  { id: 21, kind: 'gourd', ability: 'zone', why: '둘 다 장판', calc: (ab) => ({ poolSlow: ab.slow, poolRadiusMult: 1.1 }) },
  { id: 21, kind: 'gourd', ability: 'vortex', why: '둘 다 장판', calc: (ab) => ({ poolPull: ab.pull * 0.6 }) },
  { id: 22, kind: 'seal', ability: 'explode', why: '둘 다 범위 피해', calc: (ab) => ({ slamRadiusAdd: ab.radius * 0.5 }) },
  // 학우선 × 대풍(깃마다 D × 0.5)은 겹침이 아니라 많이 맞는 무기의 감쇠다. 표에는 ⚙로 적혀 있지만 3-3의 번호는 없다.
  { id: null, kind: 'fan', ability: 'gust', why: '많이 맞는 무기의 감쇠', calc: null },
];

export const OVERLAP_IDS = Object.freeze([...new Set(OVERLAPS.map((o) => o.id).filter((id) => id !== null))]);

const CELLS = {};
for (const key of ABILITY_ORDER) {
  CELLS[key] = {};
  ROWS[key].forEach(([trigger, perEvent, mult = {}], col) => {
    CELLS[key][WEAPON_ORDER[col]] = { kind: WEAPON_ORDER[col], ability: key, trigger, perEvent, overlap: false, overlapId: null, mult: Object.freeze(mult), calc: null };
  });
}
for (const o of OVERLAPS) {
  const cell = CELLS[o.ability][o.kind];
  cell.overlap = true;
  cell.overlapId = o.id;
  cell.calc = o.calc;
  cell.why = o.why;
}
for (const key of ABILITY_ORDER) for (const kind of WEAPON_ORDER) Object.freeze(CELLS[key][kind]);

// 표의 한 칸. 모르는 무기는 여의주로 읽는다(저장 호환과 같은 규칙).
export function adapt(kind, abilityKey) {
  const row = CELLS[abilityKey];
  if (!row) return null;
  return row[kind] ?? row.yeouiju;
}

const NO_MODS = Object.freeze({});

// 칸의 고정 보정(mult)과 겹침 보정(calc)을 합친 숫자 모음. 능력이 없으면 빈 모음.
export function modsFor(kind, abilityKey, ab, stats) {
  const cell = ab ? adapt(kind, abilityKey) : null;
  if (!cell) return NO_MODS;
  const out = { ...cell.mult };
  if (cell.calc) Object.assign(out, cell.calc(ab, stats));
  return out;
}

// 능력이 있으면 그 단위의 발동 횟수 상한(한 사건당). 상태이상·상시처럼 상한이 없는 칸은 Infinity.
export const perEventOf = (kind, abilityKey) => adapt(kind, abilityKey)?.perEvent ?? INF;

// 능력 키 → 능력 표 값이 있는지(시험용): ABILITIES에 없는 키는 표에도 없다.
export const knownAbility = (key) => Object.hasOwn(ABILITIES, key) && Object.hasOwn(CELLS, key);
