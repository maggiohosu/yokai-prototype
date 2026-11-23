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

// 확률표 단위는 %. 배열의 인덱스는 시도 전 현재 레벨이다(길이 20 = 최고 레벨 +20).
export const ENHANCE = {
  stats: ['growth', 'speed', 'vitality'],
  // 사용자 지시(2026-11-24): 최고 레벨 10 → 20. +10 이후(인덱스 10~19)는 성공률 10% 바닥을 그대로 잇는다. 천장(pity: 실패·퇴화마다 +5%p, 성공하면 0)이 쌓여 어느 레벨이든 19번 안에 성공이 보장되고 평균은 레벨마다 4번 안팎이다.
  // 근거(모의 시험 표)는 docs/plan.md 변경 이력 22.
  success: [95, 90, 80, 70, 60, 50, 40, 30, 20, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
  // 사용자 지시(2026-11-23): 파괴 확률 2배. 본체는 파괴 대신 퇴화가 그 자리라 퇴화 확률을 2배(100 상한)로 해석한다. 옛 값 [0,0,0,0,30,30,40,40,50,50].
  // +10 이후는 100 상한의 연장이다. 퇴화 A(−1레벨)만 고르면 +12부터는 사실상 막히지만(시도 1만 회 이상), B(강화 유지하고 역진화)·보호권으로 레벨을 지키면 +20까지 약 60번이다.
  degradeOnFailure: [0, 0, 0, 0, 60, 60, 80, 80, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
  greatOnSuccess: 5, // 레벨과 상관없이 같다(레벨별로 나누지 않았다). 20번째 레벨 직전에서는 +1만 오른다(상한 20).
  greatLevels: 2,
  pityStep: 5,
  baseCost: 20, // 첫 레벨(+0 → +1) 비용. 이후 곡선은 CONFIG.enhanceCost(1~5레벨 1.6배씩, 5레벨 이후 2배씩)다(enhance.enhanceCost)
  autoLimit: 200,
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
