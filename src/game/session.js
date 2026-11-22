// 판 안 기록(요력·식성·성향·보물 드롭)과 강화·등급의 능력치 반영을 한곳에서 연결한다.
import { CONFIG } from '../config.js';
import { recordEat } from '../systems/progress.js';
import { preyValue } from '../systems/rules.js';
import { addToInventory, dropChance } from '../systems/treasure.js';
import { gradeMultiplier } from '../systems/evolution.js';
import { vitalityMax } from '../systems/vitality.js';
import { saveProgress } from '../state/save.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 성장에 따른 속도 배율 f(사용자 결정 2026-11-23). 진화 단계가 증가분의 절반, 이동 속도 강화 레벨이 나머지 절반이다.
//   f = minMult + (maxMult - minMult) × (0.5 × (단계-1)/(maxStage-1) + 0.5 × 속도 레벨/maxSpeedLevel)
// 게임 템포(CONFIG.tempo × f)와 플레이어 이동 속도(CONFIG.player.speed × f)에 모두 곱한다.
export function paceMultiplier(progress) {
  const { minMult, maxMult, maxStage, maxSpeedLevel } = CONFIG.pace;
  const stage = clamp(Number(progress?.stage) || 1, 1, maxStage);
  const level = clamp(Number(progress?.enh?.speed) || 0, 0, maxSpeedLevel);
  const stageShare = maxStage > 1 ? (stage - 1) / (maxStage - 1) : 0;
  const levelShare = maxSpeedLevel > 0 ? level / maxSpeedLevel : 0;
  return minMult + (maxMult - minMult) * (0.5 * stageShare + 0.5 * levelShare);
}

export function playerStats(progress) {
  const p = CONFIG.progression;
  const enh = progress.enh ?? {};
  return {
    pace: paceMultiplier(progress),
    speed: CONFIG.player.speed * paceMultiplier(progress),
    areaGain: CONFIG.eating.areaGain * (1 + p.growthPerLevel * (enh.growth ?? 0)),
    // 생명력 최대치(초). 여의주 위력은 보물 강화 레벨과 등급 배율로만 정해진다(combat.js).
    vitalityMax: vitalityMax(enh.vitality ?? 0),
    gradeMult: gradeMultiplier(progress.grade) ?? 1,
  };
}

// 이번 먹이로 얻는 요력 = rules.preyValue(크기^지수 × 단계 × 등급 × 보물 처치 × 특수 적 배율). 화폐는 요력 하나.
export function mealYoryeok(meal) {
  return preyValue({ size: meal.preySize, stage: meal.stage, grade: meal.grade, special: meal.special, killedByTreasure: meal.killedByTreasure });
}

export function attachSession(scene, progress, rng = Math.random, save = saveProgress) {
  const run = { yoryeok: 0, drops: 0 };
  const onEat = (meal) => {
    recordEat(progress, meal);
    const gain = mealYoryeok(meal);
    progress.yoryeok += gain;
    run.yoryeok += gain;
    if (rng() < dropChance({ killedByTreasure: meal.killedByTreasure })) {
      const treasure = { level: 0 };
      let got = false;
      if (!progress.treasure) { progress.treasure = treasure; got = true; }
      else got = addToInventory(progress, treasure);
      if (got) { run.drops++; scene.events.emit('treasureDrop', run.drops); }
    }
    save(progress);
  };
  const onRunEnd = () => save(progress);
  scene.events.on('eat', onEat);
  scene.events.once('runEnd', onRunEnd);
  scene.events.once('shutdown', () => {
    scene.events.off('eat', onEat);
    scene.events.off('runEnd', onRunEnd);
  });
  return run;
}
