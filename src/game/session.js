// 판 안 기록(요력·식성·성향·보물 드롭)과 강화·등급의 능력치 반영을 한곳에서 연결한다.
import { CONFIG } from '../config.js';
import { recordEat } from '../systems/progress.js';
import { preyValue } from '../systems/rules.js';
import { addToInventory, dropChance } from '../systems/treasure.js';
import { gradeMultiplier } from '../systems/evolution.js';
import { vitalityMax } from '../systems/vitality.js';
import { playerSpeedMultiplier, tempoMultiplier } from '../systems/balance.js';
import { saveProgress } from '../state/save.js';

// 속도(사용자 결정 2026-11-23, 계획서 '변경 이력 4'): 진화 단계 곡선은 게임 템포에만(pace = tempoMultiplier → sim = dt × CONFIG.tempo × pace),
// 이동 속도 강화는 플레이어 속도에만(speed = player.speed × playerSpeedMultiplier) 곱한다. 예전처럼 둘 다에 같은 f를 곱하지 않는다.
export function playerStats(progress) {
  const p = CONFIG.progression;
  const enh = progress.enh ?? {};
  return {
    pace: tempoMultiplier(progress),
    speed: CONFIG.player.speed * playerSpeedMultiplier(progress) * (progress.difficulty === 'easy' ? CONFIG.difficulty.easy.playerSpeedMult : 1),
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
  const run = { yoryeok: 0, drops: 0, allyYoryeok: 0 };
  const onEat = (meal) => {
    const gain = mealYoryeok(meal);
    if (meal.byAlly) {
      // 매혹한 요괴가 먹은 먹이: 요력만 내 것이 된다. 식성·성향·보물 드롭은 "내가 먹은 것"이 아니므로 기록하지 않는다(설계 4-4).
      progress.yoryeok += gain;
      run.yoryeok += gain;
      run.allyYoryeok += gain;
      save(progress);
      return;
    }
    recordEat(progress, meal);
    progress.yoryeok += gain;
    run.yoryeok += gain;
    if (rng() < dropChance({ killedByTreasure: meal.killedByTreasure })) {
      const treasure = { kind: 'yeouiju', level: 0 }; // 요괴가 떨어뜨리는 보물은 여의주뿐(docs/design-weapons.md D2)
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
