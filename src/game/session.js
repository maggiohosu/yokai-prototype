// 판 안 기록(요력·식성·성향·보물 드롭)과 강화·등급의 능력치 반영을 한곳에서 연결한다.
import { CONFIG } from '../config.js';
import { recordEat, yoryeokFor } from '../systems/progress.js';
import { addToInventory, dropChance } from '../systems/treasure.js';
import { gradeMultiplier } from '../systems/evolution.js';
import { saveProgress } from '../state/save.js';

export function playerStats(progress) {
  const p = CONFIG.progression;
  const enh = progress.enh ?? {};
  return {
    speed: CONFIG.player.speed * (1 + p.speedPerLevel * (enh.speed ?? 0)),
    areaGain: CONFIG.eating.areaGain * (1 + p.growthPerLevel * (enh.growth ?? 0)),
    // 대표 효과: 보물 공격력에 곱한다. 등급 배율은 combat.js가 따로 곱한다.
    signature: 1 + p.signaturePerLevel * (enh.signature ?? 0),
    gradeMult: gradeMultiplier(progress.grade) ?? 1,
  };
}

export function attachSession(scene, progress, rng = Math.random, save = saveProgress) {
  const run = { yoryeok: 0, drops: 0 };
  const onEat = (meal) => {
    recordEat(progress, meal);
    const gain = yoryeokFor(meal.preySize, meal.killedByTreasure);
    progress.yoryeok += gain;
    run.yoryeok += gain;
    if (rng() < dropChance({ killedByTreasure: meal.killedByTreasure })) {
      const treasure = { level: 0 };
      if (!progress.treasure) { progress.treasure = treasure; run.drops++; }
      else if (addToInventory(progress, treasure)) run.drops++;
      if (run.drops) scene.events.emit('treasureDrop', run.drops);
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
