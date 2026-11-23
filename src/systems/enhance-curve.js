import { CONFIG } from '../config.js';

// 강화 비용 곡선과 레벨별 효과 곡선(사용자 지시 2026-11-24, 계획서 변경 이력 22). Phaser·DOM 의존이 없는 순수 계산이다.

// 비용 배율 = softGrowth^min(레벨, hardFrom) × hardGrowth^max(0, 레벨 - hardFrom).
// 레벨은 '시도 전 현재 레벨'이다(+0 → +1 시도가 레벨 0). hardFrom까지는 레벨마다 softGrowth배(완만),
// 그 위로는 레벨마다 hardGrowth배(가파름)다. 레벨 0의 배율은 1이라 곱하는 쪽의 '첫 레벨 비용'이 그대로 나온다.
export function costMultiplier(level, curve = CONFIG.enhanceCost) {
  const { softGrowth, hardFrom, hardGrowth } = curve;
  return softGrowth ** Math.min(level, hardFrom) * hardGrowth ** Math.max(0, level - hardFrom);
}

// 본체 능력(크기 성장·이동 속도·생명력)의 효과 레벨. kneeAt(10)까지는 1레벨 = 1, 그 위는 레벨마다 kneeSlope(0.5)만 센다.
// 레벨당 효과(성장 +8%·속도 +4%·생명력 +0.6초)에 이 값을 곱해 쓴다. 비용이 레벨마다 2배인데 효과까지 직선으로 늘면
// +20에서 성장 ×2.6·속도 ×1.8이 되어 과하므로, +10 이후는 효과를 절반으로 이어 간다(+20: 성장 ×2.2·속도 ×1.6·생명력 13초).
export function effectiveLevel(level) {
  const { kneeAt, kneeSlope } = CONFIG.progression;
  const l = Math.max(0, Number.isFinite(level) ? level : 0);
  return Math.min(l, kneeAt) + Math.max(0, l - kneeAt) * kneeSlope;
}
