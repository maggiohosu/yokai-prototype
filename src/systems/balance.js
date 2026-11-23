import { CONFIG } from '../config.js';
import { effectiveLevel } from './enhance-curve.js';

// 고레벨 밸런스(계획서 '변경 이력 4'). Phaser·DOM 의존이 없는 순수 규칙이며 모든 수치는 CONFIG.balance에 있다.
// 시간 인자(dtSim)는 시뮬레이션 시간이다(실제 시간 × 게임 템포).
const cfg = () => CONFIG.balance;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const finite = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback);

function stageOf(progress) {
  const { maxStage } = cfg().pace;
  return clamp(Math.round(finite(Number(progress?.stage), 1)) || 1, 1, maxStage);
}

function speedLevelOf(progress) {
  return clamp(finite(Number(progress?.enh?.speed), 0), 0, cfg().pace.maxSpeedLevel);
}

// ---- 속도 ----
// 게임 템포(CONFIG.tempo)에 곱하는 단계 곡선. 적·발사체·쿨타임 등 시뮬레이션 전체가 이 배율로 빨라진다.
export function tempoMultiplier(progress) {
  return cfg().pace.stageMult[stageOf(progress)];
}

// 플레이어 이동 속도(CONFIG.player.speed)에만 곱하는 배율 = baseMult × (1 + speedPerLevel × 효과 레벨). 템포·적에게는 영향이 없다.
// baseMult(0.5)는 초반이 너무 쉬워지지 않게 하는 기본값이고, 강화 레벨 효과는 그 위에 레벨당 +4%로 얹힌다. 효과 레벨(enhance-curve.effectiveLevel)은 +10까지 1레벨 1이고
// 그 위는 절반이라 +10이면 1.4배, +20이면 1.6배다(직선이면 1.8배).
export function playerSpeedMultiplier(progress) {
  const { baseMult, speedPerLevel } = cfg().pace;
  return baseMult * (1 + speedPerLevel * effectiveLevel(speedLevelOf(progress)));
}

// 플레이어가 화면에서 느끼는 속도 배율(템포 × 이동 속도). 5단계·+10 ≈ 1단계의 4.6배(baseMult는 약분된다).
export function playerFeelMultiplier(progress) {
  return tempoMultiplier(progress) * playerSpeedMultiplier(progress);
}

// 크기별 감속(사용자 지시 2026-11-23): 몸집이 클수록 느리다. 플레이어와 적이 각자의 크기로 이동 속도에 곱한다.
// (ref / max(ref, 크기))^exp, 최소 min. ref(시작 크기) 이하에서는 1.
export function sizeSpeedMultiplier(size) {
  const { ref, exp, min } = cfg().sizeSlow;
  const s = finite(size, 0);
  return Math.max(min, Math.pow(ref / Math.max(ref, s), exp));
}

// 진화 직후 이동 속도 기준 크기가 원래 크기로 돌아오는 속도: carry를 tauSec(시뮬레이션 초)마다 e분의 1씩 줄인다.
export function carryDecay(carry, dtSim) {
  const dt = Math.max(0, finite(dtSim, 0));
  const value = Math.max(0, finite(carry, 0));
  return value * Math.exp(-dt / cfg().evolveSlow.tauSec);
}

// 처음 시작 화면의 템포(1단계). 진화하는 순간과 새 판을 시작할 때 이 값에서 시작해 그 단계의 템포까지 올라간다(easePace).
export function startPace() {
  return cfg().pace.stageMult[1];
}

// 진화로 단계 템포(pace)가 바뀌면 곧바로 뛰지 않고 새 값으로 서서히 다가간다(시정수 evolveSlow.paceTauSec, 실제 초 dt).
export function easePace(pace, target, dt) {
  const p = finite(pace, target);
  const t = finite(target, p);
  const k = 1 - Math.exp(-Math.max(0, finite(dt, 0)) / cfg().evolveSlow.paceTauSec);
  const next = p + (t - p) * k;
  return Math.abs(t - next) < 1e-4 ? t : next;
}

// 진화할 때 이어 가는 크기(진화 직전 크기 × carry). 속도는 max(지금 크기, 이 값)로 정한다.
export function evolveCarrySize(sizeBefore) {
  return Math.max(0, finite(sizeBefore, 0)) * cfg().evolveSlow.carry;
}

// 단계가 오를 때마다 카메라가 한 칸 더 물러서는 배율(config balance.view.stageZoom). 1단계 1, 5단계 0.41.
export function stageZoomMultiplier(stage) {
  const { stageZoom } = cfg().view;
  const { maxStage } = cfg().pace;
  return stageZoom[clamp(Math.round(finite(Number(stage), 1)) || 1, 1, maxStage)];
}

// ---- 크기 ----
// 면적 성장 둔화 계수: refSize 이하는 1, 그 위로는 (refSize / 크기)^exp.
export function growthDamping(size) {
  const { refSize, exp } = cfg().growth;
  return Math.pow(refSize / Math.max(refSize, finite(size, 0)), exp);
}

// 먹이를 먹은 뒤의 새 크기. 예전 식 sqrt(size² + areaGain × preySize²)에 둔화 계수를 곱해 큰 몸일수록 덜 자란다.
export function growthGain(size, preySize, areaGain) {
  const gain = Math.max(0, finite(areaGain, 0)) * growthDamping(size) * Math.max(0, finite(preySize, 0)) ** 2;
  return Math.sqrt(size ** 2 + gain);
}

// 크기 유지비: start 이상이면 초당 rate × (크기 - start)만큼 줄인 새 크기. start 아래로는 내려가지 않는다.
export function upkeep(size, dtSim) {
  const { start, rate } = cfg().upkeep;
  const dt = finite(dtSim, 0);
  if (!(size > start) || dt <= 0) return size;
  return Math.max(start, size - rate * (size - start) * dt);
}

// ---- 맞수 대요괴 ----
// state = { timer, alive }. alive는 호출자가 매번 '지금 살아 있는 맞수 수'로 갱신한다.
export function createRivalState() {
  return { timer: 0, alive: 0 };
}

// 맞수의 몸집 상한: 플레이어 × capVsPlayer(절대 상한은 일반 적과 같다). Enemy.capSize가 rival이면 이 값을 쓴다.
export function rivalSizeCap(playerSize) {
  return Math.min(CONFIG.enemy.growthCap.maxSize, finite(playerSize, 0) * cfg().rival.capVsPlayer);
}

// 맞수 생성 지시: 플레이어 단계가 minStage 이상일 때 interval(실제 초)마다, 살아 있는 맞수가 maxAlive 미만이면
// { stage, size, rival: true } 하나를 돌려준다. dtSim은 시뮬레이션 시간이고, 실제 초로 바꿔(÷ CONFIG.tempo × 플레이어 단계의 stageMult) 센다.
// 자리가 가득 차 있는 동안은 타이머가 0으로 묶여, 자리가 나면 interval 뒤에 보충한다(맞수 사이 간격은 항상 interval 이상).
// 생성 지시를 받고도 못 놓았으면 rivalRetry로 다음 호출에 다시 받는다. state.timer는 실제 초다.
export function rivalPlan(playerStage, playerSize, state, dtSim, rng = Math.random) {
  const r = cfg().rival;
  if (!(playerStage >= r.minStage) || !(playerSize > 0)) {
    state.timer = 0;
    return null;
  }
  if (state.alive >= r.maxAlive) {
    state.timer = 0;
    return null;
  }
  state.timer += Math.max(0, finite(dtSim, 0)) / (CONFIG.tempo * tempoMultiplier({ stage: playerStage }));
  if (state.timer < r.interval) return null;
  state.timer = 0;
  const size = Math.min(rivalSizeCap(playerSize), playerSize * (r.sizeMin + clamp(rng(), 0, 1) * (r.sizeMax - r.sizeMin)));
  return { stage: Math.min(Math.round(playerStage), cfg().pace.maxStage), size, rival: true };
}

// 지시를 받았지만 자리를 못 찾아 놓지 못했을 때: 다음 호출에서 바로 다시 지시를 받는다.
export function rivalRetry(state) {
  state.timer = cfg().rival.interval;
}

// ---- 승천 ----
// 5단계에서 크기가 targetSize 이상이면 { reward }(요력), 아니면 null.
export function ascension(progress, playerSize) {
  const a = cfg().ascension;
  if (stageOf(progress) < a.stage || !(playerSize >= a.targetSize)) return null;
  return { reward: Math.round(a.baseReward + a.rewardPerSize * playerSize) };
}
