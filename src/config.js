// 크기와 거리는 월드 단위, 속도는 초당 월드 단위다. size는 충돌 원의 반지름이다.
export const CONFIG = {
  difficulty: {
    default: 'normal', ids: ['easy', 'normal', 'hard'],
    names: { easy: '이지', normal: '노말', hard: '하드' },
    notes: {
      easy: '작거나 낮은 단계의 적이 자주 나와요. 이동 속도 2배, 자동 발사로 플레이해요. 부스터는 없어요.',
      normal: '기본 출현 확률로 플레이해요.',
      hard: '높은 단계의 적이 자주 나와요. 같은 단계에서는 큰 적이 많아요.',
    },
    mult: 1.4, hardLives: 10,
    easy: { playerSpeedMult: 2, booster: false, autoFire: true },
  },
  // 글꼴(사용자 지시 2026-11-23): 모든 글자를 프리텐다드로. 눈누 694번(SIL OFL 1.1, 상업적 사용·수정·재배포 가능) 가변 웹폰트를 src/style.css의 @font-face로 불러온다.
  // 프리텐다드에는 한자가 없어서 北東南西·終 같은 한자는 뒤의 시스템 글꼴로 나온다. Phaser 글자는 이 목록을 쓴다(CSS는 style.css의 --font).
  font: { family: "'PretendardVariable', 'Pretendard', 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', system-ui, sans-serif", load: "600 16px 'PretendardVariable'", loadText: '요괴 키우기 0123456789 北東南西終', timeoutMs: 3000 },
  // 게임 템포 배율(사용자 지시 2026-11-22: 3배). 이동·적 AI·발사체·쿨타임·보충에 곱한다.
  tempo: 3.9, // 사용자 지시: 3 → 3.9(1.3배, 2026-11-23)
  world: {
    size: 4000,
    population: 72,
    populationMult: 3, // 단계별 기본 인구를 반올림한 뒤 곱한다. 72·115·160·216·284 → 216·345·480·648·852.
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
    refillInterval: 0.5 / 1.5, // 사용자 지시(2026-11-23): 적 리젠 1.5배 빠르게
    get refillBatch() { return 4 * this.populationMult; },
  },
  // 사용자 지시(2026-11-23): 플레이어와 적이 예전의 1/3 크기에서 시작한다. 크기에 묶인 값들도 함께 1/3(카메라는 camera.refSize 28 기준이라 화면에서도 1/3로 보인다).
  player: { startSize: 28 / 3, speed: 131 }, // 사용자 지시: 218 → 262(1.2배) → 131(나·적 기본 속도 0.5배, 2026-11-23)
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
      // 3단계 이후는 사용자 지시(2026-11-23: 적이 너무 약하다)로 높였다. 평균 적 단계 3단계 2.26 → 3.35, 4단계 2.9 → 3.78, 5단계 3.45 → 4.21.
      // 보충·시작 적은 플레이어보다 최대 2단계 위까지 나온다(의도한 결정: 3단계 판에도 5단계 적). selfEvolveLead는 적이 '스스로 진화'하는 한계일 뿐이다. 단계 차가 2면 내가 3배 이상 커야 먹을 수 있어 순수 위협이다.
      3: [0.05, 0.15, 0.35, 0.3, 0.15],
      4: [0.02, 0.08, 0.25, 0.4, 0.25],
      5: [0, 0.04, 0.16, 0.35, 0.45],
    },
    // 판을 처음 시작할 때의 적 단계 가중치. 플레이어가 1·2단계면 예전처럼 모두 1단계(스스로 먹고 진화)이고, 3단계부터는 처음부터 높은 단계가 나온다
    // (사용자 지시 2026-11-23: 3단계 이후 적이 너무 약하다). 보충표(stageWeights)보다 조금 낮게 잡아 시작 직후에 바로 먹히지 않게 했다. 평균 3단계 3.15, 4단계 3.57, 5단계 4.03.
    startStageWeights: {
      3: [0.05, 0.2, 0.4, 0.25, 0.1],
      4: [0.03, 0.12, 0.3, 0.35, 0.2],
      5: [0.01, 0.06, 0.2, 0.35, 0.38],
    },
    // 3단계 이후에는 적을 시작 장소 근처에 모아 만나는 적이 많아 보이게 한다(사용자 지시 2026-11-23: 적이 너무 적다 → 시작 장소 근처에 배치).
    // 판을 시작할 때 initialNeighbors를 뺀 적의 share 비율을 플레이어(= 시작 장소) 둘레 startRing(월드 단위 반지름 범위)에 놓고, 나머지는 월드 전체에 퍼진다.
    // 보충되는 적(과 맞수)도 플레이어 둘레 refillRing의 화면 밖에서 나온다. 1·2단계는 예전처럼 월드 전체에서 보충된다.
    // preyInner: 시작 때 내가 먹을 수 있는 적(위협이 아닌 적)은 시작 화면 안쪽(반지름 preyInner)부터 놓는다(위협은 safeStart 밖).
    // refillPad: 보충 고리는 화면 바깥에서 시작한다(안쪽 반지름 = max(refillRing[0], 화면 대각선 / 2 + refillPad)), 큰 화면에서도 고리가 화면에 가려지지 않는다.
    // evolveCull: 판 안 진화로 3단계 이상이 될 때 플레이어보다 낮은 단계의 멀리 있는(refillRing[0] 밖) 적을 이 비율만큼 지운다(보충이 stageWeights대로 더 강한 적을 채운다).
    nearSpawn: { fromStage: 3, share: 0.75, startRing: [260, 1500], preyInner: 120, refillRing: [450, 1600], refillPad: 250, evolveCull: 0.85 },
    // 3단계 이후 적 크기 분포(작은/비슷한/큰 적 가중치, sizes의 weight 대신 쓴다). 5단계가 최고 단계라 적이 더 높은 단계가 될 수 없으므로
    // 나보다 큰 적(= 나를 먹을 수 있는 같은 단계 적)의 비율을 0.2 → 0.4로 올린다(사용자 지시 2026-11-23: 3단계 이후 적이 너무 약하다). 시작 직후는 earlyWeights가 먼저 적용된다.
    hardSizeWeights: [0.45, 0.15, 0.4],
    // 적이 스스로 진화할 수 있는 단계는 min(pace.maxStage, 플레이어 단계 + selfEvolveLead)까지다(5단계 용이 2단계 판에 생기지 않게).
    selfEvolveLead: 1,
    evolveJitter: [0.9, 1.1], // 적이 진화할 때 levelUp.evolveResetSize에 곱하는 범위
    earlyUntilSize: 70 / 3,
    earlyWeights: [0.35, 0.15, 0.5],
    stage3Size: 31 / 3,
    maxSpawnSize: 140 / 3, // 시작 크기 1/3(커밋 25c7d7f) 때 환산이 빠져 있던 값을 balance 1단계에서 140 → 140/3으로 맞췄다(docs/balance-v4.md 4절). 되돌리려면 140.
    detect: 290,
    fleeSpeed: 65, // 사용자 지시: 적 기본 속도 0.5배(130 → 65)
    chaseSpeed: 54, // 0.5배(108 → 54)
    // 초반 적 이동 속도 배율(플레이어 진화 단계별, 사용자 지시 2026-11-23: 초반 70%). 없는 단계는 1.
    earlySpeedMult: { 1: 0.7, 2: 0.85 },
    // 적 몸집 상한(src/systems/growthCap.js). 크기 ≤ min(maxSize, max(minCap, 플레이어 크기 × maxSizeVsPlayer)), 몸집 강화는 maxBodyLevel번까지.
    growthCap: { maxSizeVsPlayer: 2.5, minCap: 70 / 3, maxSize: 200, maxBodyLevel: 3 },
    wanderSpeed: 19.5, // 0.5배(39 → 19.5)
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
  // 본체 강화 1레벨당 배율(크기 성장). 이동 속도는 아래 balance.pace, 생명력은 vitality 섹션, 여의주 위력은 보물 강화 레벨이 맡는다.
  progression: { growthPerLevel: 0.08 },
  // 생명력(사용자 결정 2026-11-23): 나를 먹을 수 있는 적과 겹쳐 있는 동안 게이지(초, 시뮬레이션 시간)가 줄고,
  // 그동안은 먹히지 않는다. 0이 된 순간에도 겹쳐 있으면 먹힌다. 닿지 않으면 regenDelaySec 뒤부터 회복한다.
  vitality: {
    // 사용자 지시(2026-11-23): 처음 기본 생명력은 약 10ms만 닿아도 먹힐 만큼(1단계 템포 1.3 기준 시뮬레이션 0.013초 ≈ 실제 10ms). 강화하면 레벨당 0.25초씩 는다.
    baseSec: 0.013, perLevelSec: 0.25, // 최대치 = baseSec + perLevelSec × 생명력 레벨(+10이면 약 2.5초)
    regenFullSec: 4, // 빈 상태에서 가득 차기까지(최대치와 상관없이)
    regenDelaySec: 0.5, // 닿은 직후 회복하지 않는 시간
    hitDrainSec: 0.5, // 특수 적 구슬 한 방이 깎는 게이지. 모자란 비율만큼만 크기를 줄인다
    arcColor: 0x48765e, warnColor: 0xd6453d, arcWidth: 4, arcPad: 7, flashHz: 6, // 원호 게이지(두께·간격은 화면 픽셀)
  },
  // 진화 단계(1~5)와 이동 속도 강화 레벨(0~10)의 상한. 속도 곡선은 아래 balance.pace가 맡는다(예전 f 곡선 minMult·maxMult는 없앴다).
  pace: { maxStage: 5, maxSpeedLevel: 10 },
  // 고레벨 밸런스(사용자 결정 2026-11-23, 계획서 '변경 이력 4', 순수 규칙은 src/systems/balance.js).
  // 시간 단위 '초': 크기 유지비(upkeep.rate)는 시뮬레이션 시간(실제 시간 × tempo × stageMult[단계]), 맞수 간격(rival.interval)은 실제 시간이다.
  // 값은 초안이며 docs/balance-v4.md에 근거·표가 있다.
  balance: {
    // 속도: stageMult는 게임 템포(tempo × stageMult)에만, 플레이어 이동 속도에는 baseMult × (1 + speedPerLevel × 이동 속도 강화 레벨)만 곱한다.
    // baseMult는 초반이 너무 쉬워지지 않게 하면서 L0 플레이어가 도망치는 먹이(도망 130)보다 느리지 않게 하는 기본값(조정자 결정 2026-11-23: 0.45 → 0.5):
    // 1단계 플레이어 ≈ 170(예전 113의 1.5배, 1단계 추격 적의 약 1.73배). 5단계·+10 / 1단계 체감은 baseMult가 약분되어 1.1 × 1.4 / (1/3) ≈ 4.6배다.
    pace: { stageMult: { 1: 1 / 3, 2: 0.6, 3: 0.85, 4: 1.0, 5: 1.1 }, baseMult: 0.5, speedPerLevel: 0.04, maxStage: 5, maxSpeedLevel: 10 },
    // 아래 크기 값(refSize·start·targetSize·rewardPerSize)은 플레이어·적이 예전의 1/3 크기에서 시작하도록 바뀐 뒤(커밋 25c7d7f)의 값이다(예전 수치 ÷ 3).
    // 성장 둔화: 먹을 때 면적 증가에 (refSize / max(refSize, 크기))^exp를 곱한다. refSize 이하에서는 예전 식 그대로다.
    growth: { refSize: 150 / 3, exp: 0.5 },
    // 크기 유지비: start 이상이면 초당 rate × (크기 - start)만큼 줄고, start 아래로는 내려가지 않는다(균형점에서 멈춤).
    upkeep: { start: 250 / 3, rate: 0.02 },
    // 크기별 감속(사용자 지시 2026-11-23: 크기가 클수록 이동 속도가 느려진다). 플레이어·적 모두 자기 크기로 곱한다:
    //   배율 = (ref / max(ref, 크기))^exp, 최소 min. ref는 시작 크기(진화 직후 크기)라 그 아래에서는 1이다. 크기 150이면 약 0.43배.
    sizeSlow: { ref: 28 / 3, exp: 0.3, min: 0.25 },
    // 진화·종족(단계) 변경(사용자 지시 2026-11-23): 진화한 뒤의 실제 화면과 나·적의 크기는 처음 시작 화면과 같다(stageZoom 모두 1: 시작 크기의 화면 배율은 어느 단계든 같다).
    // 대신 '내가 진화해서 커졌지만 맵도 함께 커져서 똑같이 보인다'는 착시를 진화하는 순간의 연출로 준다:
    //   ① 맵이 실제로 커진다(balance.map: 월드·적 수).
    //   ② 진화하는 순간 카메라가 직전 배율 × evolveZoom까지 물러서고(맵이 사방으로 늘어나 내가 작아 보인다) evolveHoldSec 동안 머문 뒤,
    //      시작 화면 배율로 부드럽게 돌아온다(evolveExpandSec 동안 expandSmoothRate로 천천히). 그 사이 내가 있는 곳에서 바깥으로 맵이 번지는 고리(pulse)가 퍼진다.
    //   stageZoom을 1이 아닌 값으로 두면 그 단계부터 시작 화면이 달라진다(시야가 월드보다 넓어지지 않는 선까지만 물러선다: camera.zoomFor).
    view: { stageZoom: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }, evolveZoom: 0.69, evolveHoldSec: 0.9, evolveExpandSec: 3, expandSmoothRate: 2.5, pulse: { sec: 1.4, reach: 1500 } },
    // 진화 직후 속도(사용자 지시 2026-11-23: 속도도 처음 시작처럼 느리게 보이되, 나도 적도 함께): 진화하는 순간과 새 판을 시작할 때 게임 템포(stageMult)가
    // 처음 시작 값(1단계, 1/3)으로 돌아가고 paceTauSec(실제 초)의 시정수로 그 단계의 템포까지 서서히 올라간다. 템포는 적·발사체 모두에 곱해지므로 나와 적이 함께 느려졌다가 함께 빨라진다
    // (나는 실제로 빨라지고 적도 빨라지지만 서로 같이 빨라져서 화면에서는 느려 보인다). 진화한 뒤의 화면과 크기는 처음 시작 화면과 같다(view.stageZoom 모두 1).
    // carry/tauSec은 '나만' 진화 직전 크기 기준으로 느리게 시작하는 옛 규칙이다. 적이 같이 느려지지 않아 지금은 끈다(carry 0).
    evolveSlow: { carry: 0, tauSec: 45, paceTauSec: 40 },
    // 월드 한 변은 기본 크기 × 단계 배율, 적 수는 round(기본 인구 × 단계 배율^populationExp) × populationMult.
    // 판을 그 단계로 열 때 적용하고, 판 안 진화에서는 옛 월드가 새 월드 한가운데에 놓이게 옮기고 새 땅을 보충으로 채운다.
    // 4000 → 6000 → 8000 → 10400 → 13200. 적 수는 위 populationExp로 정한다(면적이 아니라 배율에 가깝게 늘려 CPU 부담을 줄인다).
    map: { stageScale: { 1: 1, 2: 1.5, 3: 2, 4: 2.6, 5: 3.3 }, populationExp: 1.15 }, // 기본 인구 72·115·160·216·284, 배율 3에서 216·345·480·648·852.
    // 맞수 대요괴: 플레이어가 minStage 이상일 때 interval(**실제 초**, 조정자 결정 2026-11-23)마다 동시에 maxAlive마리 안에서 1마리 생성(같은 단계, 크기 = 플레이어 × sizeMin~sizeMax).
    // 시뮬레이션 시간 dtSim은 tempo × stageMult[플레이어 단계]로 나눠 실제 초로 바꿔 센다.
    // 맞수의 몸집 상한은 플레이어 × capVsPlayer(절대 상한은 enemy.growthCap.maxSize). 이름표는 label.
    rival: { minStage: 4, interval: 25, maxAlive: 2, sizeMin: 0.8, sizeMax: 1.3, capVsPlayer: 1.3, label: '맞수' },
    // 승천: 5단계에서 크기가 targetSize에 닿으면 판 승리. 보상 요력 = baseReward + rewardPerSize × 크기(150에서 390,000 ≈ 5단계 크기 100 적 4마리). title은 결과 창 제목.
    ascension: { stage: 5, targetSize: 150, baseReward: 300000, rewardPerSize: 600, title: '승천' },
  },
  // 예고된 대요괴(사용자 결정 2026-11-23, 계획서 '변경 이력 5', 순수 규칙은 src/systems/herald.js). 모든 단계에서 판 중 intervalSec(**실제 초**, 판을 멈춘 동안은 세지 않는다)마다 한 마리씩 나온다.
  // 맞수(balance.rival, 4·5단계)와는 따로 센다. HUD가 등장까지 남은 시간을 보여 주고, 남은 시간이 warnSec 이하가 되면 짧은 안내(noticeSec초)를 띄운다. 나타나면 나와 같은 단계(1단계 판에서도 같은 단계),
  // 크기 = 내 크기 × sizeMin~sizeMax, 이름표 label(자가 진화·특수 적 없음: 맞수와 같은 규칙). 동시에 maxAlive마리까지, 살아 있는 동안은 다음 대요괴를 세지 않는다.
  // 잡으면(내가 먹거나 여의주로 쓰러뜨림) 보상: 요력 = 그 먹이의 기본 요력 × bonusMult를 더(= 기본의 1 + bonusMult배), 여의주 드롭 확률은 dropChance로 올린다.
  // 드롭은 확정이 아니다: 기본 드롭 굴림(treasure.dropChance)이 실패했을 때만 한 번 더 굴려 총 확률이 dropChance가 되게 한다. 끄려면 enabled: false.
  herald: { enabled: true, intervalSec: 45, warnSec: 8, noticeSec: 3, maxAlive: 1, sizeMin: 1.1, sizeMax: 1.4, label: '대요괴', bonusMult: 3, dropChance: 0.5 },
  // 공명 연쇄(사용자 결정 2026-11-23, 순수 규칙은 src/systems/resonance.js). 내가 먹은 요괴의 방위(동·서·남·북)가 이어지면 보너스 요력이 터진다.
  //   rule: 'streak' = 규칙 A(같은 방위 streak.length마리 연속), 'cycle' = 규칙 B(연달아 4마리가 동·서·남·북을 한 번씩), 'both' = 둘 다(기본), 'off' = 끔. 한 줄로 바꿔 비교한다.
  //   보너스 요력 = 연쇄에 든 먹이들의 요력 합 × bonus(규칙별). 터지면 연쇄를 처음부터 다시 센다. 연쇄는 마지막으로 먹은 뒤 windowSec(**판을 진행한 실제 초**)가 지나면 끊긴다(Infinity면 안 끊김).
  resonance: { rule: 'both', windowSec: 8, streak: { length: 3, bonus: 0.3 }, cycle: { bonus: 0.5 }, flashSec: 0.9 },
  // 빠른 성장 카드의 [다시 뽑기]: 한 판에 perRun번(0이면 버튼을 숨긴다). 요력은 들지 않고, 같은 조건(같은 잔액·같은 규칙)으로 카드를 새로 뽑는다.
  reroll: { perRun: 1 },
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
  // 상점(src/systems/shop.js; 사용자 결정 2026-11-23). 여의주 +minLevel~+maxLevel을 요력으로 산다.
  // 구매가 = 같은 레벨 판매가 × priceMult(반올림). 1보다 커서 사서 바로 팔면 손해다.
  // 사서 강화해 파는 이익은 본전 상한으로 막는다(조정자 결정 2026-11-23, docs/design-weapons.md 4-4):
  // 산 여의주에는 paid(구매가 + 강화에 쓴 요력)가 붙고 판매가는 min(표 판매가, paid)다. 드롭 여의주는 표 판매가 그대로다.
  shop: { priceMult: 2.5, minLevel: 0, maxLevel: 5 },
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
    get maxSteps() {
      const pace = CONFIG.balance.pace;
      return Math.ceil(this.maxDelta * CONFIG.tempo * pace.stageMult[pace.maxStage] / this.maxStep);
    },
    enemyCell: 128,
    farThinkSteps: 4, // 화면 밖·감지 거리 두 배 밖에서 조향을 나눠 갱신하는 주기
    refillPerFrame: 3,
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
