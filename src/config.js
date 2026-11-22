// 크기와 거리는 월드 단위, 속도는 초당 월드 단위다. size는 충돌 원의 반지름이다.
export const CONFIG = {
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
  eating: { ratio: 1.1, areaGain: 0.32 },
  combat: {
    aimHalfAngleDeg: 35,
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
  camera: { baseZoom: 1.18, minZoom: 0.43, exponent: 0.55, smoothRate: 4, portraitWidth: 585 },
  input: { joystickRadius: 51, deadZone: 0.07 },
  render: {
    targetFps: 60,
    maxDelta: 0.05,
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
