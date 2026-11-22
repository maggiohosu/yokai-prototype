import { CONFIG } from '../config.js';

// 적의 몸집 상한(사용자 보고 2026-11-23: 화면을 다 채우는 적이 생겨 대항할 수 없음).
// 원인: 3단계 적은 더 진화할 수 없어 요력이 전부 몸집 강화(×1.2)로 가고, 큰 먹이일수록 요력이 크기^1.6로 늘어
// 강화 비용(1.6^n)보다 빨리 쌓였다. 상한이 없어 지수적으로 커졌다(10마리 먹으면 약 12배).
// 해결: 적의 크기는 플레이어 크기의 maxSizeVsPlayer배와 절대 상한 maxSize 중 작은 값을 넘지 않고,
// 판 안 몸집 강화는 maxBodyLevel번까지만 한다.
export function enemySizeCap(playerSize, cfg = CONFIG.enemy.growthCap) {
  const relative = Math.max(cfg.minCap, (playerSize || 0) * cfg.maxSizeVsPlayer);
  return Math.min(cfg.maxSize, relative);
}

export function canEnemyBodyUp(bodyLevel, cfg = CONFIG.enemy.growthCap) {
  return (bodyLevel ?? 0) < cfg.maxBodyLevel;
}
