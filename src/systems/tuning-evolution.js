// 진화·성향·등급·저장 수치. 나중에 src/config.js로 합칠 것.
export const EVOLVE_COST = { 2: 100, 3: 400 };
export const YORYEOK = { perSize: 1, treasureMult: 1.5 };

// 성향(-100 요기 ~ +100 선기) 변화량
export const ALIGNMENT = {
  min: -100,
  max: 100,
  directEat: 2, // 직접 먹으면 요기 쪽(-)으로 이만큼
  treasureKill: 3, // 보물로 깎아 쓰러뜨리면 선기 쪽(+)
  biggerMult: 3, // 원래 나보다 컸던 요괴면 배수
  treasureSuccess: 5, // 보물 강화 성공 시 선기(+)
};

// 선택지 점수 가중치
export const SCORE = { dir: 1, branch: 0.5 };

export const GRADES = ['S+', 'S', 'A', 'B', 'C', 'D', 'E', 'F'];
export const GRADE_BASE = { 'S+': 1, S: 4, A: 10, B: 20, C: 25, D: 20, E: 12, F: 8 };
export const GRADE_MULT = { 'S+': 2.0, S: 1.6, A: 1.3, B: 1.1, C: 1.0, D: 0.85, E: 0.7, F: 0.5 };
export const GRADE_SHIFT = {
  maxEnhSum: 30,
  perEnh: 0.5, // 강화 합계 1당 F·E·D에서 빼는 %p
  takeOrder: ['F', 'E', 'D'],
  giveRatio: { 'S+': 1, S: 2, A: 3, B: 4 },
};

export const SAVE = { key: 'yokai-proto-v1', version: 1 };
