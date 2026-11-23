// 진화·성향·등급·저장 수치. 나중에 src/config.js로 합칠 것.
// 4·5단계 비용은 사용자 결정(2026-11-23): 2,000 / 8,000.
// 다음 단계(키)로 진화하는 데 드는 기본 요력. 적이 스스로 진화할 때는 이 값 그대로다(rules.nextProgress, 적 진화 속도를 안 바꾼다).
export const EVOLVE_COST = { 2: 100, 3: 400, 4: 2000, 5: 8000 };
// 플레이어의 '늦은 진화' 비용 배율(사용자 지시 2026-11-24, 변경 이력 21): 진화하기 전 단계가 fromStage 이상이면(4→5, 그 뒤 단계가 있다면 그것도) 비용이 costMult배다.
// 1→2·2→3·3→4는 그대로다. 8,000 → 16,000.
export const LATE_EVOLVE = { fromStage: 4, costMult: 2 };
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

// 선택지 점수 가중치. stem은 지금 줄기를 지키는 형태에 주는 가산점(설계 3-2).
export const SCORE = { dir: 1, branch: 0.5, stem: 0.35 };

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
