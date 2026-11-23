import { CONFIG } from '../config.js';
import { vitalityMax } from './vitality.js';
import { effectiveLevel } from './enhance-curve.js';

export function vitalityUpgradeText(level, maxed) {
  const current = Number(vitalityMax(level).toFixed(1));
  if (maxed) return '굶을 때 쓸 생명력 ' + current + '초';
  const next = Number(vitalityMax(level + 1).toFixed(1));
  return '굶을 때 쓸 생명력 ' + current + '초 → ' + next + '초';
}

// 정비 화면 능력 카드의 '지금 → 다음 레벨' 한 줄. +10 이후는 레벨당 효과가 절반이라(effectiveLevel) 숫자가 천천히 오르는 것을 그대로 보여 준다.
//   growth: 먹을 때 자라는 양 +N% (레벨당 growthPerLevel × 효과 레벨), speed: 이동 속도 +N%(balance.pace.speedPerLevel × 효과 레벨), vitality: 생명력 초(vitalityUpgradeText).
export function statUpgradeText(stat, level, maxed) {
  if (stat === 'vitality') return vitalityUpgradeText(level, maxed);
  const growth = stat === 'growth';
  const perLevel = growth ? CONFIG.progression.growthPerLevel : CONFIG.balance.pace.speedPerLevel;
  const percent = (at) => Math.round(perLevel * effectiveLevel(at) * 1000) / 10;
  const label = growth ? '먹을 때 자라는 양 +' : '이동 속도 +';
  return maxed ? label + percent(level) + '%' : label + percent(level) + '% → +' + percent(level + 1) + '%';
}

// 본체 강화 확률표. 단위는 %다. 배열의 인덱스는 시도 전 현재 레벨이다(인덱스 n = +(n+1)로 올리는 시도, 길이 20 = 최고 레벨 +20).
// 사용자 지시(2026-11-24): 5단계(+5로 올리는 시도)는 성공 50·대성공 20·실패 20·퇴화 10, 20단계는 성공 4·대성공 1·실패 55·퇴화 40으로 두고 사이는 단계별로 조정한다.
// 네 값은 서로 배타적인 전체 확률이라 합이 100이다. 성공 = +1, 대성공 = +greatLevels(2), 실패 = 그대로, 퇴화 = 보호권을 쓰지 않으면 A(−1레벨) 또는 B(역진화).
// 만든 규칙(docs/plan.md 변경 이력 23): +5와 +20은 위 고정점 그대로, +6~+19는 네 값을 두 고정점 사이에서 선형 보간해 소수 첫째 자리로 반올림하고 합 100은 실패 칸에서 맞췄다.
// +1~+4는 퇴화 0·대성공 20(+5와 같다)·실패 5·10·15·20(+5의 20으로 5씩 이어짐)·성공은 나머지다. 그래서 표 전체에서 성공·대성공은 내려가기만 하고 실패·퇴화는 올라가기만 한다.
// 이 표가 2026-11-23의 '퇴화 확률 2배'와 같은 날의 '퇴화 확률 1/2' 지시를 대체한다(보물 깨짐 확률은 그대로, TREASURE.breakOnFailure).
// 천장(pity): 실패·퇴화마다 다음 시도의 '총 성공 확률'(성공 + 대성공)에 +pityStep%p를 얹고 성공하면 0으로 돌린다(어느 레벨이든 시도 20번 안에 성공이 보장된다).
// 얹은 만큼 늘어난 성공 확률은 표에서 정해진 대성공 몫(대성공 ÷ 총 성공)으로 나뉘고, 줄어든 실패는 표의 퇴화 몫(퇴화 ÷ (실패 + 퇴화))으로 나뉜다. 천장이 0이면 표의 값 그대로다.
export const ENHANCE = {
  stats: ['growth', 'speed', 'vitality'],
  outcomes: [
    { success: 75, great: 20, fail: 5, degrade: 0 },
    { success: 70, great: 20, fail: 10, degrade: 0 },
    { success: 65, great: 20, fail: 15, degrade: 0 },
    { success: 60, great: 20, fail: 20, degrade: 0 },
    { success: 50, great: 20, fail: 20, degrade: 10 }, // 고정점: 5단계
    { success: 46.9, great: 18.7, fail: 22.4, degrade: 12 },
    { success: 43.9, great: 17.5, fail: 24.6, degrade: 14 },
    { success: 40.8, great: 16.2, fail: 27, degrade: 16 },
    { success: 37.7, great: 14.9, fail: 29.4, degrade: 18 },
    { success: 34.7, great: 13.7, fail: 31.6, degrade: 20 },
    { success: 31.6, great: 12.4, fail: 34, degrade: 22 },
    { success: 28.5, great: 11.1, fail: 36.4, degrade: 24 },
    { success: 25.5, great: 9.9, fail: 38.6, degrade: 26 },
    { success: 22.4, great: 8.6, fail: 41, degrade: 28 },
    { success: 19.3, great: 7.3, fail: 43.4, degrade: 30 },
    { success: 16.3, great: 6.1, fail: 45.6, degrade: 32 },
    { success: 13.2, great: 4.8, fail: 48, degrade: 34 },
    { success: 10.1, great: 3.5, fail: 50.4, degrade: 36 },
    { success: 7.1, great: 2.3, fail: 52.6, degrade: 38 },
    { success: 4, great: 1, fail: 55, degrade: 40 }, // 고정점: 20단계
  ],
  greatLevels: 2,
  pityStep: 5,
  baseCost: 20, // 첫 레벨(+0 → +1) 비용. 이후 곡선은 CONFIG.enhanceCost(1~5레벨 1.6배씩, 5레벨 이후 2배씩)다(enhance.enhanceCost)
  // 연속 강화는 한 번 누를 때 이 횟수만큼 멈추지 않고 이어서 시도한다(사용자 지시 2026-11-24, 변경 이력 23). 옛 autoLimit(200)은 이 값이 대신한다.
  autoBatch: 20,
  singleAttemptGrades: ['S', 'S+'],
};

// 보물 강화 표. 무기 8종(여의주 + 보패 7종)이 모두 이 표 하나를 같이 읽는다(docs/design-weapons.md D3·D10):
// 성공률·깨짐·파편·판매가·강화비·레벨별 [방향 수, 방향당 발사, 속도 배율, 파워 배율, 유도]를 무기마다 따로 두지 않는다.
// 무기마다 달라지는 것은 data/weapons.js의 쏘는 방식·한 번 피해·쿨타임·사거리와 priceMult(판매가·강화비 배율, 지금 모두 1.0)뿐이고,
// 그 값을 레벨 표와 합치는 계산은 systems/weapons.js의 weaponStats가 한다.
export const TREASURE = {
  success: [90, 85, 80, 75, 70, 60, 55, 50, 45, 40, 30, 25, 20, 15, 10],
  // 사용자 지시(2026-11-23): 파괴 확률 2배(100 상한). 옛 값 [0,0,0,0,0,10,12.5,15,17.5,20,30,35,40,45,50].
  breakOnFailure: [0, 0, 0, 0, 0, 20, 25, 30, 35, 40, 60, 70, 80, 90, 100],
  // 인접한 기준점 사이의 판매가는 기하 보간한다. 사용자 결정(2026-11-23): 고레벨일수록 판매가를 크게(팔아서 버는 맛).
  prices: [[0, 5], [5, 300], [10, 5000], [15, 100000]],
  // 강화 비용: 첫 레벨(+0 → +1) 비용만 예전 가격 곡선 × upgradeCostRatio에서 읽고(costPrices의 +1 값 × 0.2), 이후는 CONFIG.enhanceCost.treasure 곡선이다
  // (+5까지 레벨마다 softGrowth배, 그 위로 hardGrowth배: 사용자 지시 2026-11-24, 변경 이력 22. 지금 둘 다 2배라 변경 이력 18의 '레벨마다 2배' 그대로다). 판매가(prices)·상점 구매가는 그대로다.
  costPrices: [[0, 5], [5, 100], [10, 1000], [15, 10000]],
  upgradeCostRatio: 0.2,
  shardsPerLevel: 1,
  shardsPerProtect: 10,
  inventorySlots: 5,
  drop: { normal: 0.08, treasureKill: 0.20 }, // rng()와 직접 비교하는 비율
  damageBase: 1, // 적 크기가 1/3이 되어 피해도 1/3(사용자 지시 2026-11-23)
  // 레벨별 [방향 수, 방향당 발사, 속도 배율, 파워 배율, 유도]. 인덱스 = 레벨(0~15).
  levels: [
    [1, 1, 1.00, 1.00, 0],
    [1, 1, 1.08, 1.15, 0],
    [1, 2, 1.12, 1.25, 0],
    [2, 2, 1.16, 1.35, 0],
    [2, 2, 1.20, 1.50, 0],
    [3, 2, 1.25, 1.65, 0],
    [4, 2, 1.30, 1.80, 0],
    [4, 3, 1.35, 2.00, 0],
    [4, 3, 1.40, 2.20, 0.3],
    [6, 3, 1.45, 2.40, 0.4],
    [6, 3, 1.50, 2.70, 0.5],
    [8, 3, 1.55, 3.00, 0.6],
    [8, 3, 1.60, 3.30, 0.7],
    [8, 4, 1.65, 3.70, 0.8],
    [8, 4, 1.70, 4.10, 0.9],
    [8, 5, 1.80, 4.60, 1.0],
  ],
  chargeBase: 1,
  chargePerLevel: 0.25,
  titlesFrom: 10,
  titles: ['바람', '번개', '천둥', '폭풍', '하늘', '용왕'],
};
