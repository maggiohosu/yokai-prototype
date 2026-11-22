// 크기와 거리는 월드 단위, 속도는 초당 월드 단위다. size는 충돌 원의 반지름이다.
export const CONFIG = {
  // 게임 템포 배율(사용자 지시 2026-11-22: 3배). 이동·적 AI·발사체·쿨타임·보충에 곱한다.
  tempo: 3.9, // 사용자 지시: 3 → 3.9(1.3배, 2026-11-23)
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
  // 사용자 지시(2026-11-23): 플레이어와 적이 예전의 1/3 크기에서 시작한다. 크기에 묶인 값들도 함께 1/3(카메라는 camera.refSize 28 기준이라 화면에서도 1/3로 보인다).
  player: { startSize: 28 / 3, speed: 262 }, // 사용자 지시: 218 → 262(1.2배, 2026-11-23)
  enemy: {
    // 생성 시점 플레이어 반지름의 배수. 후반에도 맵에 들어갈 수 있는 크기로 제한한다.
    sizes: [
      { weight: 0.67, min: 0.5, max: 0.86 },
      { weight: 0.13, min: 0.92, max: 1.08 },
      { weight: 0.2, min: 1.15, max: 1.75 },
    ],
    // 플레이어가 startSize~earlyUntilSize일 때 earlyWeights(작은/비슷/큰 적)에서 sizes의 weight로 선형 전환한다.
    // 플레이어 단계별 적 단계(1~5) 생성 가중치. 1단계 적은 그 방위의 1단계 형태 2종 중 하나(formFor(dir, 1)).
    // 2단계 행은 그대로이고, 3단계 행에 4단계 적 8%를 넣어 다음 목표를 미리 보여 준다(설계 5절). 1단계 행은 아래 사용자 지시가 우선한다.
    stageWeights: {
      1: [1, 0, 0, 0, 0], // 사용자 지시: 플레이어가 1단계일 때는 적도 모두 1단계로 나온다(스스로 먹고 진화)
      2: [0.35, 0.45, 0.2, 0, 0],
      3: [0.22, 0.38, 0.32, 0.08, 0],
      4: [0.1, 0.25, 0.35, 0.25, 0.05],
      5: [0.05, 0.15, 0.3, 0.3, 0.2],
    },
    // 적이 스스로 진화할 수 있는 단계는 min(pace.maxStage, 플레이어 단계 + selfEvolveLead)까지다(5단계 용이 2단계 판에 생기지 않게).
    selfEvolveLead: 1,
    evolveJitter: [0.9, 1.1], // 적이 진화할 때 levelUp.evolveResetSize에 곱하는 범위
    earlyUntilSize: 70 / 3,
    earlyWeights: [0.35, 0.15, 0.5],
    stage3Size: 31 / 3,
    maxSpawnSize: 140,
    detect: 290,
    fleeSpeed: 130,
    chaseSpeed: 108,
    // 초반 적 이동 속도 배율(플레이어 진화 단계별, 사용자 지시 2026-11-23: 초반 70%). 없는 단계는 1.
    earlySpeedMult: { 1: 0.7, 2: 0.85 },
    // 적 몸집 상한(src/systems/growthCap.js). 크기 ≤ min(maxSize, max(minCap, 플레이어 크기 × maxSizeVsPlayer)), 몸집 강화는 maxBodyLevel번까지.
    growthCap: { maxSizeVsPlayer: 2.5, minCap: 70 / 3, maxSize: 200, maxBodyLevel: 3 },
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
    damageRatio: 0.12, minDamage: 2 / 3, maxOrbs: 24, deathSize: 14 / 3,
    leadAim: 0.6, trailLength: 0.16, orbColor: 0xc2185b, coreColor: 0xffb3dd, trailColor: 0x7b1fa2,
    ringColor: 0xe0245e, ringDashes: 14, ringSpin: 1.4, ringPad: 1.28, ringWidth: 3,
  },
  // stageOverride: 하위 단계가 상위 단계를 먹으려면 이 배수 이상 커야 한다(사용자 결정: 하위도 아주 크면 이김).
  // 단계 차 Δ가 클수록 더 커야 한다(사용자 결정 2026-11-23): 필요 배수 = stageOverride + stageOverrideStep × (Δ - 1)
  // = 단계 차 1·2·3·4에 2·3·4·5배. 상위 단계는 하위가 그 배수 이상 크지 않으면 크기와 상관없이 하위를 먹는다. 같은 단계는 ratio.
  eating: { ratio: 1.1, areaGain: 0.32, stageOverride: 2, stageOverrideStep: 1 },
  // 먹이 점수(=요력): base × (크기/sizeRef)^sizeExp × 단계 배율 × 등급 배율 × (보물 처치 배율) × (특수 적 배율)
  // 크고 높은 단계 하나가 작고 낮은 단계 여러 개보다 낫도록 크기 지수 > 1, 단계 배율은 3단계까지 4배씩,
  // 4·5단계는 보물 경제가 무너지지 않게 ×3, ×2.7로 늦춘다(사용자 결정 2026-11-23: ×48 / ×128).
  score: { base: 10, sizeRef: 20 / 3, sizeExp: 1.6, stageMult: { 1: 1, 2: 4, 3: 16, 4: 48, 5: 128 }, treasureMult: 1.5 },
  // 판 안 성장: 요력이 다음 선택지 비용에 닿으면 잠깐 멈추고 [진화]/[몸집 강화]/[능력 강화] 중 고른다.
  levelUp: {
    bodyBaseCost: 30, bodyCostGrowth: 1.6, bodyMult: 1.2, // 몸집 강화: 확정, 크기 ×bodyMult, 판마다 초기화
    minGapRatio: 0.35, // 다음 멈춤까지 '이번 판에서 번 요력' 간격 = 가장 싼 카드 비용 × 이 값(아래 상·하한으로 자른다)
    pauseGapMin: 25, // 멈춤 사이에 번 요력의 하한: 잔액이 아무리 많아도 이보다 자주 멈추지 않는다
    pauseGapMax: 400, // 상한: 잔액이 아무리 많아도 이만큼만 벌면 판 안 선택이 열린다
    pauseCooldownSec: 5, // 실제 시간 기준 최소 간격
    evolveResetSize: 28 / 3, // 진화하면 크기를 이 값으로(=시작 크기)
    // 빠른 성장 선택(카드 3장): 탭 한 번에 즉시 적용
    quickCardCount: 3,
    quickEnhanceCostMult: 1.5, // 능력 +1 카드 비용 = 이 값 × 본체 강화 비용(실패·퇴화 없이 확정이라 더 비싸다)
    quickIgnoreMs: 150, // 카드가 열린 직후 이 시간 동안은 탭을 무시한다(실수 방지)
    evolveMaxStage: 5, // 판 안 진화 카드는 이 단계 미만일 때만 나온다(5단계가 마지막: pace.maxStage와 같다)
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
    defeatSize: 4 / 3,
    reversalFleeSeconds: 1.2,
    reversalNoticeMs: 800,
  },
  // 본체 강화 1레벨당 배율(크기 성장). 이동 속도는 아래 pace 곡선, 생명력은 vitality 섹션, 여의주 위력은 보물 강화 레벨이 맡는다.
  progression: { growthPerLevel: 0.08 },
  // 생명력(사용자 결정 2026-11-23): 나를 먹을 수 있는 적과 겹쳐 있는 동안 게이지(초, 시뮬레이션 시간)가 줄고,
  // 그동안은 먹히지 않는다. 0이 된 순간에도 겹쳐 있으면 먹힌다. 닿지 않으면 regenDelaySec 뒤부터 회복한다.
  vitality: {
    baseSec: 0.6, perLevelSec: 0.25, // 최대치 = baseSec + perLevelSec × 생명력 레벨(+10이면 3.1초)
    regenFullSec: 4, // 빈 상태에서 가득 차기까지(최대치와 상관없이)
    regenDelaySec: 0.5, // 닿은 직후 회복하지 않는 시간
    hitDrainSec: 0.5, // 특수 적 구슬 한 방이 깎는 게이지. 모자란 비율만큼만 크기를 줄인다
    arcColor: 0x48765e, warnColor: 0xd6453d, arcWidth: 4, arcPad: 7, flashHz: 6, // 원호 게이지(두께·간격은 화면 픽셀)
  },
  // 성장에 따른 속도 곡선(사용자 결정 2026-11-23). 배율 f = minMult + (maxMult - minMult)
  //   × (0.5 × (단계-1)/(maxStage-1) + 0.5 × 이동 속도 강화 레벨/maxSpeedLevel).
  // f는 게임 템포(tempo × f)와 플레이어 이동 속도(player.speed × f)에 모두 곱한다.
  pace: { minMult: 1 / 3, maxMult: 1.5, maxStage: 5, maxSpeedLevel: 10 },
  // 부스터(플레이어 전용, src/game/booster.js; 사용자 결정 2026-11-23). 누르는 동안 플레이어 이동 속도(속도 곡선 적용 후)에만 배율을 곱한다. 적·발사체는 그대로.
  // 배율 = baseMult × 줄기 보정 + 이동 속도 강화 레벨 × perSpeedLevel. 줄기 보정 = form.stem → src/data/stems.js의 boostMult → 1.0(줄기 없는 mimul).
  // 게이지(maxSec)·회복·지연은 화면 시간(초)으로 계산하고(템포·속도 곡선과 무관), 0이 되면 가속이 끝나 minRestartSec 이상 찰 때까지 다시 켜지지 않는다.
  // 뗀 직후 regenDelaySec는 회복하지 않고, 그 뒤 빈 상태에서 가득 차기까지 regenFullSec. 누르고 있는 동안은 회복하지 않는다.
  booster: {
    maxSec: 2, minRestartSec: 0.4, regenFullSec: 5, regenDelaySec: 0.5,
    baseMult: 1.3, perSpeedLevel: 0.02,
    // 가속 중 연출(실제 시간 기준, Fx.burst 재사용): 플레이어 뒤쪽으로 옅은 먼지를 흘린다.
    trail: { color: 0xe7cb8a, interval: 0.045, count: 2, power: 0.5, back: 0.9, startCount: 6 }, // color = :root의 --gold
  },
  // 등급은 겉모습을 빛·테두리 색으로만 표현한다(F는 테두리 없음)
  gradeGlow: { 'S+': 0xff6fd8, S: 0xffc53d, A: 0xa46bff, B: 0x4a9dff, C: 0x63b863, D: 0x9aa0a6, E: 0xa0785a, F: null },
  // 모션 그래픽. 끄기: 숨쉬기 breathAmount=0, 먹기 팝 punchScale=1, 번쩍임 flashSeconds=0, 흔들림 shakeIntensity=0, 기울기 maxTilt=0
  motion: {
    breathRate: 3.2, breathAmount: 0.035, maxTilt: 9, tiltPerSpeed: 0.045,
    punchScale: 1.16, punchDecay: 1.4, flashSeconds: 0.09, textSeconds: 0.75,
    shakeMs: 150, shakeIntensity: 0.004, maxParticles: 160,
  },
  camera: { baseZoom: 1.18, minZoom: 0.43, exponent: 0.55, smoothRate: 16, portraitWidth: 585, refSize: 28 }, // refSize: 줌 기준 크기(시작 크기를 줄여도 화면 배율은 그대로)
  // 좌하단 고정 스틱: 패드 중심에서 손가락까지 거리(px)가 deadZonePx 이하면 0, 패드 반지름 또는 fullSpeedPx 중 작은 값 이상이면 1. responseMs: 방향 반응 시간상수.
  input: { joystickRadius: 51, deadZonePx: 14, fullSpeedPx: 90, responseMs: 20 },
  render: {
    targetFps: 60,
    maxDelta: 0.05,
    maxStep: 1 / 60, // 템포를 곱한 뒤 한 계산 단계의 최대 시간(초)
    maxPixelRatio: 2,
    textureSize: 320,
    artUnits: 160,
    // 단계별 원화 캔버스(단위당 2px: 320/400/480). 몸 반지름 42 단위와 판정은 그대로 두고 캔버스만 키운다(설계 6-2의 1). T2가 쓴다.
    artUnitsByStage: { 1: 160, 2: 160, 3: 160, 4: 200, 5: 240 },
    textureBudgetMB: 24, // 크리처 텍스처 예산(MB). 넘으면 화면의 스프라이트가 쓰지 않는 것부터 오래된 순서로 지운다(설계 6-2의 3)
    stageMarkLift: { 1: 1.7, 2: 1.7, 3: 1.7, 4: 2.1, 5: 2.5 }, // drawStageMark의 size × 배수(관·광륜과 겹치지 않게)
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