// 상황별 음악 분위기(calm / tense / boss) 판정 및 이력 현상(Hysteresis) 모듈.
// Phaser 의존성이 없는 순수 함수로 구성되어 테스트가 쉽고, 4초 여유 복귀 지연으로 음악 깜빡임을 방지합니다.

export const CALM_RELAX_DELAY_SEC = 4.0;
export const THREAT_DANGER_RADIUS = 350.0;

/**
 * 게임 입력 상태로부터 현재 순간의 원시 분위기(raw mood)를 순수 함수로 판정합니다.
 *
 * @param {Object} params
 * @param {boolean} params.heraldAlive - 대요괴(herald)가 필드에 살아 있는가
 * @param {'grace' | 'draining' | 'starving'} [params.hungerState='grace'] - 굶주림 상태
 * @param {boolean} params.recentHit - 최근(약 1.5초 이내) 특수 탄환 등 피해를 입었는가
 * @param {number} params.nearbyThreatCount - 시야/반경 내 나보다 큰 적의 수
 * @param {number} params.minThreatDist - 나보다 큰 적과의 최소 거리
 * @param {number} [params.dangerRadius=350] - 위험으로 간주할 최소 거리 한계
 * @returns {'calm' | 'tense' | 'boss'}
 */
export function evaluateMoodState({
  heraldAlive = false,
  hungerState = 'grace',
  recentHit = false,
  nearbyThreatCount = 0,
  minThreatDist = Infinity,
  dangerRadius = THREAT_DANGER_RADIUS,
} = {}) {
  // 1. 대요괴가 출현하여 생존 중이면 즉시 boss 분위기
  if (heraldAlive) {
    return 'boss';
  }

  const isVitalityLosing = hungerState === 'draining' || hungerState === 'starving';
  const hasNearbyLargeEnemy = nearbyThreatCount > 0 && minThreatDist <= dangerRadius;
  if (isVitalityLosing || recentHit || hasNearbyLargeEnemy) {
    return 'tense';
  }

  // 3. 위험이 전혀 없으면 calm
  return 'calm';
}

/**
 * 이력 현상(Hysteresis)을 관리하는 상태 추적기.
 * 긴급 상황(tense/boss) 진입은 즉시 반영되고, 여유 상황(calm)으로의 복귀는
 * 위험이 완전히 사라진 후 relaxDelaySec(기본 4초) 동안 지속되어야만 복귀합니다.
 */
export function createMoodTracker({
  relaxDelaySec = CALM_RELAX_DELAY_SEC,
  initialMood = 'calm',
} = {}) {
  let currentMood = initialMood;
  let dangerClearedAt = null; // 위험이 사라진 시점(초)

  return {
    get mood() {
      return currentMood;
    },
    get isRelaxing() {
      return dangerClearedAt !== null;
    },
    get dangerClearedAt() {
      return dangerClearedAt;
    },
    /**
     * 현재 시점의 rawMood와 현재 시각 nowSec를 받아 이력 현상이 적용된 최종 분위기를 반환합니다.
     * @param {'calm' | 'tense' | 'boss'} rawMood
     * @param {number} nowSec - 게임 시뮬레이션 시계 또는 실제 시간 (초 단위)
     * @returns {'calm' | 'tense' | 'boss'}
     */
    update(rawMood, nowSec) {
      // 보스 상태 진입은 즉시
      if (rawMood === 'boss') {
        currentMood = 'boss';
        dangerClearedAt = null;
        return currentMood;
      }

      // 긴급 상태 진입은 즉시
      if (rawMood === 'tense') {
        currentMood = 'tense';
        dangerClearedAt = null;
        return currentMood;
      }

      // rawMood가 'calm'인 경우
      if (currentMood === 'calm') {
        dangerClearedAt = null;
        return 'calm';
      }

      // 현재 tense 또는 boss 상태에서 위험이 해소된 경우 (rawMood === 'calm')
      if (dangerClearedAt === null) {
        dangerClearedAt = nowSec;
      }

      // 위험 해소 후 relaxDelaySec(4초) 경과 시에만 calm으로 복귀
      if (nowSec - dangerClearedAt >= relaxDelaySec) {
        currentMood = 'calm';
        dangerClearedAt = null;
      }

      return currentMood;
    },
    reset(mood = 'calm') {
      currentMood = mood;
      dangerClearedAt = null;
    },
  };
}
