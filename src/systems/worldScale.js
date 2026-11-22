import { CONFIG } from '../config.js';

// 단계마다 맵이 커진다(사용자 지시 2026-11-23: "단계마다 맵을 크게"). 월드 크기·적 수를 단계별 배율(CONFIG.balance.map)로 정한다.
// Phaser·DOM 의존이 없다. CONFIG.world를 직접 고쳐서(월드를 읽는 모든 코드는 호출할 때마다 읽는다) 크기와 적 수가 한곳에서 바뀐다.
// 바닥 그림(drawWorld)과 카메라 경계는 PlayScene이 다시 만든다.
let base = null; // 처음 부를 때의 원래 월드(4000, 적 72마리)

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function baseWorld() {
  base ??= { size: CONFIG.world.size, population: CONFIG.world.population };
  return base;
}

// 단계(1~5)의 월드 배율. 1단계 1.
export function stageWorldScale(stage) {
  const { stageScale } = CONFIG.balance.map;
  const maxStage = CONFIG.balance.pace.maxStage;
  return stageScale[clamp(Math.round(Number(stage)) || 1, 1, maxStage)];
}

// 그 단계의 월드 크기와 적 수. 적 수는 배율^populationExp에 비례한다(면적에 비례하면 너무 많아 선형에 가깝게 늘린다).
export function worldFor(stage) {
  const { size, population } = baseWorld();
  const scale = stageWorldScale(stage);
  return {
    scale,
    size: Math.round(size * scale),
    population: Math.round(population * scale ** CONFIG.balance.map.populationExp),
  };
}

// CONFIG.world를 그 단계의 값으로 바꾸고 새 값을 돌려준다. 같은 단계로 여러 번 불러도 같다.
export function applyWorldScale(stage) {
  const next = worldFor(stage);
  CONFIG.world.size = next.size;
  CONFIG.world.population = next.population;
  return next;
}
