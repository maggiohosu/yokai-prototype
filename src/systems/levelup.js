import { CONFIG } from '../config.js';
import { ENHANCE } from './tuning-upgrade.js';
import { enhanceCost, getEnhanceOdds } from './enhance.js';
import { buildChoices, evolutionCost, evolve } from './evolution.js';

// 판 안 성장 규칙. Phaser·DOM에 의존하지 않는다. 화폐는 요력 하나뿐이다.
// run은 한 판 동안만 유지되는 상태다:
//   bodyLevel   몸집 강화 횟수(이번 판만)
//   baseYoryeok 판 시작 때 들고 있던 잔액. '이번 판에서 번 요력'의 기준점
//   spent       이번 판에서 카드·강화에 쓴 요력(쓴 만큼 잔액이 줄어도 번 요력은 줄지 않는다)
//   nextPauseAt 다음 멈춤 기준. '이번 판에서 번 요력' 단위
//   pauseFromEarned 이번 구간이 시작된 시점의 번 요력(게이지 계산용)
//   lastPauseSec 마지막 멈춤의 실제 시각(초)
//   rerollsLeft 카드 [다시 뽑기]를 쓸 수 있는 남은 횟수. 처음 쓸 때 채워진다(없으면 CONFIG.reroll.perRun이고, 판마다 새 run이라 판마다 다시 생긴다)
const LU = () => CONFIG.levelUp;

// 몸집 강화 n번째(0부터)의 요력 비용.
export function bodyCost(n) {
  const { bodyBaseCost, bodyCostGrowth } = CONFIG.levelUp;
  return Math.round(bodyBaseCost * bodyCostGrowth ** n);
}

// progress를 넘기면 판 시작 잔액을 기록하고 첫 멈춤 기준도 바로 정한다(번 요력 0에서 시작).
export function createRunLevel(progress = null) {
  const run = {
    bodyLevel: 0,
    baseYoryeok: progress?.yoryeok ?? 0,
    spent: 0,
    nextPauseAt: null,
    pauseFromEarned: 0,
    lastPauseSec: -Infinity,
  };
  if (progress) run.nextPauseAt = pauseGap(cheapestCost(progress, run));
  return run;
}

// 옛 호출(인자 없는 createRunLevel)이나 직접 만든 run도 안전하게 쓰도록 빠진 필드를 채운다.
function ensureRun(progress, run) {
  run.baseYoryeok ??= progress.yoryeok;
  run.spent ??= 0;
  run.pauseFromEarned ??= 0;
  run.lastPauseSec ??= -Infinity;
  run.bodyLevel ??= 0;
}

// 이번 판에서 번 요력 = 지금 잔액 - 시작 잔액 + 쓴 요력.
export function earnedThisRun(progress, run) {
  ensureRun(progress, run);
  return progress.yoryeok - run.baseYoryeok + run.spent;
}

// 카드·강화로 요력을 쓴다. 잔액이 모자라면 false.
function pay(progress, run, cost) {
  if (!(progress.yoryeok >= cost)) return false;
  ensureRun(progress, run);
  progress.yoryeok -= cost;
  run.spent += cost;
  return true;
}

// ---- 진화 후보(EvolveView와 같은 규칙) ----
// 도감은 다음 형태(next), 규칙 모듈(evolution.js)은 이전 형태(from)로 같은 진화 경로를 표현한다.
const catalogCache = new WeakMap();
export function evolutionCatalog(forms) {
  let catalog = catalogCache.get(forms);
  if (!catalog) {
    catalog = forms.map((form) => form.from ? form : {
      ...form,
      from: forms.filter((parent) => parent.next?.includes(form.id)).map((parent) => parent.id),
    });
    catalogCache.set(forms, catalog);
  }
  return catalog;
}

// ---- 빠른 성장 카드 ----
export const QUICK_STAT_NAMES = { growth: '크기 성장', speed: '이동 속도', vitality: '생명력' };

// 능력 +1 카드 한 줄 설명. 수치는 설정값에서 읽는다.
export function quickStatNote(stat) {
  const percent = (value) => Math.round(value * 1000) / 10;
  if (stat === 'growth') return '먹을 때 ' + percent(CONFIG.progression.growthPerLevel) + '% 더 자람';
  if (stat === 'speed') return '더 빨라짐(진화와 함께 속도 곡선이 올라감)';
  if (stat === 'vitality') return '굶어도 몸집이 줄기까지 ' + CONFIG.vitality.perLevelSec + '초 더';
  return '';
}
const KIND_ORDER = { evolve: 0, body: 1, ability: 2 };

// 능력 +1 카드 비용. 최고 레벨이면 Infinity.
export function quickEnhanceCost(level) {
  const base = enhanceCost(level);
  return Number.isFinite(base) ? Math.round(base * LU().quickEnhanceCostMult) : Infinity;
}

// 지금 요력으로 살 수 있는지와 상관없이 만들 수 있는 모든 카드. 비용이 Infinity인 카드는 없다.
//   { kind:'evolve', id, cost, choice, form|null, unknown }
//   { kind:'body', id, cost, mult }
//   { kind:'ability', id, cost, stat, level }
export function allQuickCards(progress, run, forms, { rng = Math.random } = {}) {
  const cards = [];
  if (progress.stage < LU().evolveMaxStage) {
    const cost = evolutionCost(progress.stage + 1);
    if (Number.isFinite(cost)) {
      for (const choice of buildChoices(progress, evolutionCatalog(forms), { rng })) {
        cards.push({
          kind: 'evolve', id: 'evolve:' + (choice.unknown ? '?' : choice.form.id), cost,
          choice, form: choice.unknown ? null : choice.form, unknown: !!choice.unknown,
        });
      }
    }
  }
  cards.push({ kind: 'body', id: 'body', cost: bodyCost(run.bodyLevel ?? 0), mult: LU().bodyMult });
  for (const stat of ENHANCE.stats) {
    const level = progress.enh[stat];
    const cost = quickEnhanceCost(level);
    if (Number.isFinite(cost)) cards.push({ kind: 'ability', id: 'ability:' + stat, cost, stat, level });
  }
  return cards;
}

function shuffle(list, rng) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// 살 수 있는 카드 중 무작위 count장. 가능하면 종류(진화·몸집·능력)가 겹치지 않게 하고,
// 종류가 모자랄 때만 같은 종류로 채운다. 화면에는 항상 진화 → 몸집 → 능력 순으로 놓는다.
// 살 수 있는 카드가 없으면 빈 배열이다.
// 진화를 살 수 있으면(사용자 지시 2026-11-23: 각 종족으로 더 자유롭게 변환) 진화 선택지를 모두 보여 준다: 줄기·방위마다 하나씩과 미지, 거기에
// 진화하지 않을 수 있게 몸집·능력 카드 한 장을 곁들인다(진화 선택지가 한 장씩만 보이던 예전 규칙을 바꿈).
export function pickQuickCards(progress, run, forms, { rng = Math.random, count = LU().quickCardCount } = {}) {
  const affordable = allQuickCards(progress, run, forms, { rng }).filter((card) => card.cost <= progress.yoryeok);
  const evolve = affordable.filter((card) => card.kind === 'evolve');
  if (evolve.length) {
    const seen = new Set();
    const shown = evolve.filter((card) => {
      const key = card.unknown ? '?' : card.form.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const others = affordable.filter((card) => card.kind !== 'evolve');
    const alt = others.length ? [shuffle(others, rng)[0]] : [];
    return [...shown, ...alt].sort(byKind);
  }
  const groups = new Map();
  for (const card of shuffle(affordable, rng)) {
    if (!groups.has(card.kind)) groups.set(card.kind, []);
    groups.get(card.kind).push(card);
  }
  const picked = [];
  for (const kind of shuffle([...groups.keys()], rng)) {
    if (picked.length >= count) break;
    picked.push(groups.get(kind).shift());
  }
  const rest = [...groups.values()].flat();
  for (const card of shuffle(rest, rng)) {
    if (picked.length >= count) break;
    picked.push(card);
  }
  return picked.sort(byKind);
}

function byKind(a, b) {
  return KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.id.localeCompare(b.id);
}

// ---- 다시 뽑기(계획서 '변경 이력 5', 근거 docs/research/slotbound.md 6절 R3) ----
// 한 판에 CONFIG.reroll.perRun번. 요력은 들지 않고, 같은 조건(같은 잔액·같은 규칙)으로 카드를 새로 뽑는다.
// 새 카드는 이 함수 안에서 모두 정해지고, 화면은 돌려받은 카드를 보여주기만 한다(원칙 5). 진화 카드의 등급·미지의 형태는 예전처럼 카드를 탭할 때 굴린다.
export function rerollsLeft(run) {
  const left = Number(run?.rerollsLeft ?? CONFIG.reroll.perRun);
  return Number.isFinite(left) ? Math.max(0, Math.floor(left)) : 0;
}

const cardSet = (cards) => cards.map((card) => card.id).sort().join('|');

// 남은 횟수가 없거나 뽑을 카드가 없으면 null. 아니면 { cards, left, changed }.
// previous(지금 화면의 카드)와 다른 구성이 나오도록 최대 maxTries번 다시 뽑는다. 그래도 같은 구성뿐이면(고를 수 있는 카드가 그것뿐) changed가 false이고 횟수는 쓰지 않는다.
export function rerollQuickCards(progress, run, forms, { rng = Math.random, previous = [], maxTries = 8 } = {}) {
  const before = rerollsLeft(run);
  if (before <= 0) return null;
  const same = cardSet(previous);
  let cards = [];
  let changed = false;
  for (let i = 0; i < Math.max(1, maxTries); i++) {
    cards = pickQuickCards(progress, run, forms, { rng });
    changed = cardSet(cards) !== same;
    if (!cards.length || changed) break;
  }
  if (!cards.length) return null;
  run.rerollsLeft = changed ? before - 1 : before;
  return { cards, left: run.rerollsLeft, changed };
}

// 카드를 적용한다. 요력이 모자라거나 더 올릴 수 없으면 아무것도 바꾸지 않고 null.
// 결과는 모두 이 안에서 정해진다(진화 등급 굴림 포함). 연출은 반환값을 보여주기만 한다.
//   evolve  → { kind, cost, form, grade, firstDiscovery }
//   body    → { kind, cost, mult }
//   ability → { kind, cost, stat, from, to }
export function applyQuickCard(progress, run, card, forms, { rng = Math.random } = {}) {
  if (card.kind === 'evolve') {
    const cost = evolutionCost(progress.stage + 1);
    if (progress.stage >= LU().evolveMaxStage || !(progress.yoryeok >= cost)) return null;
    ensureRun(progress, run);
    const result = evolve(progress, card.choice, evolutionCatalog(forms), { rng }); // 요력 차감도 evolve()가 한다
    run.spent += cost;
    return { kind: 'evolve', cost, form: result.form, grade: result.grade, firstDiscovery: result.firstDiscovery };
  }
  if (card.kind === 'body') {
    const applied = applyBody(progress, run);
    return applied && { kind: 'body', cost: applied.cost, mult: applied.mult };
  }
  if (card.kind === 'ability') {
    const from = progress.enh[card.stat];
    const cost = quickEnhanceCost(from);
    if (!Number.isFinite(cost) || !pay(progress, run, cost)) return null;
    progress.enh[card.stat] = from + 1;
    return { kind: 'ability', cost, stat: card.stat, from, to: from + 1 };
  }
  return null;
}

// ---- 옛 [성장할 때!] 창(LevelUpView)이 쓰는 선택지. 파일은 남겨 두지만 PlayScene은 더 열지 않는다. ----
// 마지막 단계는 새 카드와 같은 기준(pace.maxStage)이다.

// 선택지 3종. 능력 강화는 세 능력치를 한 카드에 묶는다.
// 비용이 Infinity이면 고를 수 없다(최고 단계·최고 레벨).
export function pauseOptions(progress, run) {
  return [
    {
      kind: 'evolve',
      cost: evolutionCost(progress.stage + 1),
      available: progress.stage < CONFIG.pace.maxStage,
    },
    { kind: 'body', cost: bodyCost(run.bodyLevel), mult: CONFIG.levelUp.bodyMult },
    {
      kind: 'ability',
      stats: ENHANCE.stats.map((stat) => {
        const level = progress.enh[stat];
        return { stat, level, cost: enhanceCost(level), odds: getEnhanceOdds(progress, stat) };
      }),
    },
  ];
}

// ---- 멈춤 기준 ----

// 지금 고를 수 있는 카드 중 가장 싼 비용. 몸집 강화는 항상 유한하므로 Infinity가 되지 않는다.
export function cheapestCost(progress, run) {
  let min = bodyCost(run.bodyLevel ?? 0);
  if (progress.stage < LU().evolveMaxStage) min = Math.min(min, evolutionCost(progress.stage + 1));
  for (const stat of ENHANCE.stats) min = Math.min(min, quickEnhanceCost(progress.enh[stat]));
  return min;
}

// 다음 멈춤까지 '이번 판에서 번 요력' 간격. 가장 싼 카드 값에 비례하되 상·하한으로 자른다.
// 잔액과는 관계없다: 5000을 들고 시작해도 상한만큼 벌면 열리고, 400을 모으는 중이어도 하한보다 자주 멈추지 않는다.
export function pauseGap(cheapest) {
  const { minGapRatio, pauseGapMin, pauseGapMax } = CONFIG.levelUp;
  return Math.min(pauseGapMax, Math.max(pauseGapMin, Math.round(cheapest * minGapRatio)));
}

// 멈춰야 하는가: 번 요력이 기준에 닿았고, 살 수 있는 카드가 있고, 실제 시간 간격도 지났을 때.
// 기준이 없으면(판 시작) 여기서 정한다. 살 수 있는 카드가 없으면 기준을 넘겨도 멈추지 않는다.
export function shouldPause(progress, run, nowSec) {
  const cheapest = cheapestCost(progress, run);
  const earned = earnedThisRun(progress, run);
  if (run.nextPauseAt == null) {
    run.pauseFromEarned = earned;
    run.nextPauseAt = earned + pauseGap(cheapest);
  }
  return earned >= run.nextPauseAt
    && progress.yoryeok >= cheapest
    && nowSec - run.lastPauseSec >= CONFIG.levelUp.pauseCooldownSec;
}

// 선택이 끝난 뒤에 호출한다. 같은 요력으로 연달아 멈추지 않도록 다음 기준을 번 요력 기준으로 올린다.
export function afterPause(progress, run, nowSec) {
  const earned = earnedThisRun(progress, run);
  run.lastPauseSec = nowSec;
  run.pauseFromEarned = earned;
  run.nextPauseAt = earned + pauseGap(cheapestCost(progress, run));
}

// HUD 게이지 { current, target }: 구간 안에서 번 요력의 비율과 잔액이 가장 싼 카드에 닿은 비율 중 작은 쪽을
// 한 구간의 간격(target)에 곱해 보여준다. 가득 차면 곧 멈춘다.
export function pauseGauge(progress, run) {
  const cheapest = cheapestCost(progress, run);
  const gap = pauseGap(cheapest);
  const earned = earnedThisRun(progress, run);
  const from = run.nextPauseAt == null ? earned : run.pauseFromEarned;
  const span = Math.max(1, (run.nextPauseAt ?? earned + gap) - from);
  const fraction = Math.max(0, Math.min(1, (earned - from) / span, progress.yoryeok / cheapest));
  return { current: Math.round(fraction * gap), target: gap };
}

// 몸집 강화는 확정이다. 요력이 부족하면 아무것도 바꾸지 않고 null.
export function applyBody(progress, run) {
  const cost = bodyCost(run.bodyLevel);
  if (!pay(progress, run, cost)) return null;
  run.bodyLevel += 1;
  return { cost, mult: CONFIG.levelUp.bodyMult };
}
