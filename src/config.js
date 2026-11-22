// 크기와 거리는 월드 단위, 속도는 초당 월드 단위다. size는 충돌 원의 반지름이다.
export const CONFIG = {
  // 게임 템포 배율(사용자 지시 2026-11-22: 3배). 이동·적 AI·발사체·쿨타임·보충에 곱한다.
  tempo: 3,
  world: {
    size: 4000,
    population: 72,
    regionShare: { east: 0.72, west: 0.72, south: 0.72, north: 0.72 },
    grid: 64,
    patternTile: 512,
    landscapeSeed: 731,
    boundaryWidth: 8,
    initialNeighbors: 12,
    innerRing: [110, 370],
    outerRing: [460, 650],
    safeStart: 420,
    spawnGap: 22,
    offscreenMargin: 85,
    spawnAttempts: 90,
    refillInterval: 0.5,
    refillBatch: 4,
  },
  player: { startSize: 28, speed: 218 },
  enemy: {
    // 생성 시점 플레이어 반지름의 배수. 후반에도 맵에 들어갈 수 있는 크기로 제한한다.
    sizes: [
      { weight: 0.67, min: 0.5, max: 0.86 },
      { weight: 0.13, min: 0.92, max: 1.08 },
      { weight: 0.2, min: 1.15, max: 1.75 },
    ],
    // 플레이어가 startSize~earlyUntilSize일 때 earlyWeights(작은/비슷/큰 적)에서 sizes의 weight로 선형 전환한다.
    // 플레이어 단계별 적 단계(1·2·3) 생성 가중치. 1단계 적은 방위 색 미물.
    stageWeights: { 1: [0.55, 0.38, 0.07], 2: [0.35, 0.45, 0.2], 3: [0.25, 0.4, 0.35] },
    evolveJitter: [0.9, 1.1], // 적이 진화할 때 levelUp.evolveResetSize에 곱하는 범위
    earlyUntilSize: 70,
    earlyWeights: [0.35, 0.15, 0.5],
    stage3Size: 31,
    maxSpawnSize: 140,
    detect: 290,
    fleeSpeed: 130,
    chaseSpeed: 108,
    wanderSpeed: 39,
    turnRate: 4,
    wanderInterval: [1.25, 3.4],
    wallMargin: 64,
  },
  // 적끼리 사냥(src/game/enemyAI.js). 속도 관련 값은 템포 1배 기준.
  hunt: { detect: 320, playerBias: 0.8, retargetSeconds: 0.35 },
  // 특수 적(3단계 일부)의 구슬(src/game/enemyFire.js). 속도·쿨타임은 템포 1배 기준.
  special: {
    rewardMult: 8, // 특수 적 처치 시 요력 배율(요력 대박)
    chance: 0.3, range: 380, cooldown: 2.2, orbSpeed: 260, orbRadius: 7,
    damageRatio: 0.12, minDamage: 2, maxOrbs: 24, deathSize: 14,
    leadAim: 0.6, trailLength: 0.16, orbColor: 0xc2185b, coreColor: 0xffb3dd, trailColor: 0x7b1fa2,
    ringColor: 0xe0245e, ringDashes: 14, ringSpin: 1.4, ringPad: 1.28, ringWidth: 3,
  },
  // stageOverride: 하위 단계가 상위 단계를 먹으려면 이 배수 이상 커야 한다(사용자 결정: 하위도 아주 크면 이김).
  // 상위 단계는 하위가 stageOverride배 이상 크지 않으면 크기와 상관없이 하위를 먹는다. 같은 단계는 ratio.
  eating: { ratio: 1.1, areaGain: 0.32, stageOverride: 2 },
  // 먹이 점수(=요력): base × (크기/sizeRef)^sizeExp × 단계 배율 × 등급 배율 × (보물 처치 배율) × (특수 적 배율)
  // 크고 높은 단계 하나가 작고 낮은 단계 여러 개보다 낫도록 크기 지수 > 1, 단계 배율은 4배씩.
  score: { base: 10, sizeRef: 20, sizeExp: 1.6, stageMult: { 1: 1, 2: 4, 3: 16 }, treasureMult: 1.5 },
  // 판 안 성장: 요력이 다음 선택지 비용에 닿으면 잠깐 멈추고 [진화]/[몸집 강화]/[능력 강화] 중 고른다.
  levelUp: {
    bodyBaseCost: 30, bodyCostGrowth: 1.6, bodyMult: 1.2, // 몸집 강화: 확정, 크기 ×bodyMult, 판마다 초기화
    minGapRatio: 0.35, // 멈춘 뒤 다음 멈춤까지 최소 요력 증가(가장 싼 비용의 비율)
    pauseCooldownSec: 5, // 실제 시간 기준 최소 간격
    evolveResetSize: 28, // 진화하면 크기를 이 값으로(=시작 크기)
  },
  combat: {
    aimHalfAngleDeg: 35,
    homingTurnRate: 4, // 유도 1.0일 때 초당 최대 회전(라디안)
    maxOrbs: 120,
    range: 360,
    cooldown: 0.55,
    orbSpeed: 520,
    orbRadius: 5,
    shotSpacing: 12,
    defeatSize: 4,
    reversalFleeSeconds: 1.2,
    reversalNoticeMs: 800,
  },
  // 본체 강화 1레벨당 배율(이동 속도·크기 성장·대표 효과=보물 공격력)
  progression: { speedPerLevel: 0.06, growthPerLevel: 0.08, signaturePerLevel: 0.1 },
  // 등급은 겉모습을 빛·테두리 색으로만 표현한다(F는 테두리 없음)
  gradeGlow: { 'S+': 0xff6fd8, S: 0xffc53d, A: 0xa46bff, B: 0x4a9dff, C: 0x63b863, D: 0x9aa0a6, E: 0xa0785a, F: null },
  // 모션 그래픽. 끄기: 숨쉬기 breathAmount=0, 먹기 팝 punchScale=1, 번쩍임 flashSeconds=0, 흔들림 shakeIntensity=0, 기울기 maxTilt=0
  motion: {
    breathRate: 3.2, breathAmount: 0.035, maxTilt: 9, tiltPerSpeed: 0.045,
    punchScale: 1.16, punchDecay: 1.4, flashSeconds: 0.09, textSeconds: 0.75,
    shakeMs: 150, shakeIntensity: 0.004, maxParticles: 160,
  },
  camera: { baseZoom: 1.18, minZoom: 0.43, exponent: 0.55, smoothRate: 16, portraitWidth: 585 },
  // 화면 아무 곳 터치 → 캐릭터에서 손가락 방향 이동. 거리(px)가 deadZonePx 이하면 0, fullSpeedPx 이상이면 1. responseMs: 방향 반응 시간상수.
  input: { joystickRadius: 51, deadZonePx: 14, fullSpeedPx: 90, responseMs: 20 },
  render: {
    targetFps: 60,
    maxDelta: 0.05,
    maxStep: 1 / 60, // 템포를 곱한 뒤 한 계산 단계의 최대 시간(초)
    maxPixelRatio: 2,
    textureSize: 320,
    artUnits: 160,
    bodyRadius: 42,
    hudInterval: 0.1,
    mapPixels: 220,
  },
};

export const REGIONS = {
  east: { name: '동녘', color: '청', land: '청연 들판', floor: 0xd9ead8, ink: '#377865', tint: '#ceeadc' },
  west: { name: '서녘', color: '백', land: '백로 언덕', floor: 0xece8d2, ink: '#796643', tint: '#eee6d0' },
  south: { name: '남녘', color: '적', land: '적화 골짜기', floor: 0xf1dfca, ink: '#a65142', tint: '#f4d8ca' },
  north: { name: '북녘', color: '흑', land: '현무 산기슭', floor: 0xd9e4dd, ink: '#4b6475', tint: '#d9e1e6' },
};
