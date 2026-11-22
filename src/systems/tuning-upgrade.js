// 확률표 단위는 %. 배열의 인덱스는 시도 전 현재 레벨이다.
export const ENHANCE = {
  stats: ['growth', 'speed', 'signature'],
  success: [95, 90, 80, 70, 60, 50, 40, 30, 20, 10],
  degradeOnFailure: [0, 0, 0, 0, 30, 30, 40, 40, 50, 50],
  greatOnSuccess: 5,
  greatLevels: 2,
  pityStep: 5,
  baseCost: 20,
  costGrowth: 1.6,
  autoLimit: 200,
  singleAttemptGrades: ['S', 'S+'],
};

export const TREASURE = {
  success: [90, 85, 80, 75, 70, 60, 55, 50, 45, 40, 30, 25, 20, 15, 10],
  breakOnFailure: [0, 0, 0, 0, 0, 10, 12.5, 15, 17.5, 20, 30, 35, 40, 45, 50],
  // 인접한 기준점 사이의 판매가는 기하 보간한다.
  prices: [[0, 5], [5, 100], [10, 1000], [15, 10000]],
  upgradeCostRatio: 0.2,
  shardsPerLevel: 1,
  shardsPerProtect: 10,
  inventorySlots: 5,
  drop: { normal: 0.08, treasureKill: 0.20 }, // rng()와 직접 비교하는 비율
  damageBase: 3,
  damagePerLevel: 1,
  shotsBase: 1,
  levelsPerExtraShot: 5,
  chargeBase: 1,
  chargePerLevel: 0.25,
  titlesFrom: 10,
  titles: ['바람', '번개', '천둥', '폭풍', '하늘', '용왕'],
};
