import { YORYEOK, ALIGNMENT } from './tuning-evolution.js';

const DIRS = ['east', 'west', 'south', 'north'];

export function createProgress() {
  return {
    yoryeok: 0,
    diet: { east: 0, west: 0, south: 0, north: 0 },
    alignment: 0,
    formId: 'mimul',
    stage: 1,
    grade: 'C',
    enh: { growth: 0, speed: 0, vitality: 0 },
    protect: 0,
    shards: 0,
    treasure: null,
    inventory: [],
    pity: 0,
    discovered: [],
    difficulty: 'normal', // 'easy' | 'normal' | 'hard' (새로 시작 때 정해지고 바뀌지 않는다)
    lives: null, // 하드만 남은 목숨(처음 10). 다른 난이도는 null
    runActive: false, // 하드: 판이 진행 중이면 true. 정상 종료 없이 저장이 남으면 다음에 열 때 목숨 1개를 쓴 것으로 센다
  };
}

const clampAlign = (v) => Math.max(ALIGNMENT.min, Math.min(ALIGNMENT.max, v));

export function yoryeokFor(preySize, killedByTreasure = false) {
  return Math.round(preySize * YORYEOK.perSize * (killedByTreasure ? YORYEOK.treasureMult : 1));
}

// p를 직접 고치고 p를 반환. 요력은 더하지 않는다(yoryeokFor로 호출 측이 처리).
export function recordEat(p, { dir, preySize, myOriginalSizeAtEngage, killedByTreasure = false }) {
  if (DIRS.includes(dir)) p.diet[dir] += preySize;
  const wasBigger = myOriginalSizeAtEngage != null && preySize > myOriginalSizeAtEngage;
  const base = killedByTreasure ? ALIGNMENT.treasureKill : -ALIGNMENT.directEat;
  p.alignment = clampAlign(p.alignment + base * (wasBigger ? ALIGNMENT.biggerMult : 1));
  return p;
}

export function recordTreasureSuccess(p) {
  p.alignment = clampAlign(p.alignment + ALIGNMENT.treasureSuccess);
  return p;
}
