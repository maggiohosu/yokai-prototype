import { CONFIG } from '../config.js';
import { ENHANCE } from './tuning-upgrade.js';
import { enhanceCost, getEnhanceOdds } from './enhance.js';
import { evolutionCost } from './evolution.js';

// 판 안 성장 규칙. Phaser·DOM에 의존하지 않는다. 화폐는 요력 하나뿐이다.
// run은 한 판 동안만 유지되는 상태다: { bodyLevel, nextPauseAt, lastPauseSec }.
const MAX_STAGE = 3;

// 몸집 강화 n번째(0부터)의 요력 비용.
export function bodyCost(n) {
  const { bodyBaseCost, bodyCostGrowth } = CONFIG.levelUp;
  return Math.round(bodyBaseCost * bodyCostGrowth ** n);
}

export function createRunLevel() {
  return { bodyLevel: 0, nextPauseAt: null, lastPauseSec: -Infinity };
}

// 선택지 3종. 능력 강화는 세 능력치를 한 카드에 묶는다.
// 비용이 Infinity이면 고를 수 없다(최고 단계·최고 레벨).
export function pauseOptions(progress, run) {
  return [
    {
      kind: 'evolve',
      cost: evolutionCost(progress.stage + 1),
      available: progress.stage < MAX_STAGE,
    },
    { kind: 'body', cost: bodyCost(run.bodyLevel), mult: CONFIG.levelUp.bodyMult },
    {
      kind: 'ability',
      stats: ENHANCE.stats.map((stat) => {
        const level = progress.enh[stat];
        return { stat, level, cost: enhanceCost(level), odds: getEnhanceOdds(progress, stat) };
      }),
    },
  ];
}

// 지금 고를 수 있는 선택지 중 가장 싼 비용. 몸집 강화는 항상 유한하므로 Infinity가 되지 않는다.
export function cheapestCost(progress, run) {
  let min = Infinity;
  for (const option of pauseOptions(progress, run)) {
    if (option.kind === 'ability') {
      for (const s of option.stats) min = Math.min(min, s.cost);
    } else if (option.kind !== 'evolve' || option.available) {
      min = Math.min(min, option.cost);
    }
  }
  return min;
}

// 요력이 다음 멈춤 기준에 닿았고 실제 시간 간격도 지났으면 true. 기준이 없으면 여기서 정한다.
export function shouldPause(progress, run, nowSec) {
  if (run.nextPauseAt == null) {
    // 이월된 요력이 이미 넉넉하면 판 시작 즉시 멈추지 않고, 그 잔액을 기준점으로 삼는다.
    const cheapest = cheapestCost(progress, run);
    run.nextPauseAt = progress.yoryeok >= cheapest ? nextThreshold(progress.yoryeok, cheapest) : cheapest;
  }
  return progress.yoryeok >= run.nextPauseAt
    && nowSec - run.lastPauseSec >= CONFIG.levelUp.pauseCooldownSec;
}

// 멈춤이 끝난 뒤(선택 후)에 호출한다. 같은 요력으로 연달아 멈추지 않도록 다음 기준을 올린다.
export function afterPause(progress, run, nowSec) {
  const cheapest = cheapestCost(progress, run);
  run.lastPauseSec = nowSec;
  run.nextPauseAt = nextThreshold(progress.yoryeok, cheapest);
}

// 다음 멈춤 기준. 간격을 잔액에 비례시켜, 요력을 모아 두는 중에도 먹이 하나마다 멈추지 않게 한다.
function nextThreshold(yoryeok, cheapest) {
  return Math.max(cheapest, yoryeok + Math.max(cheapest, yoryeok) * CONFIG.levelUp.minGapRatio);
}

// 몸집 강화는 확정이다. 요력이 부족하면 아무것도 바꾸지 않고 null.
export function applyBody(progress, run) {
  const cost = bodyCost(run.bodyLevel);
  if (progress.yoryeok < cost) return null;
  progress.yoryeok -= cost;
  run.bodyLevel += 1;
  return { cost, mult: CONFIG.levelUp.bodyMult };
}
