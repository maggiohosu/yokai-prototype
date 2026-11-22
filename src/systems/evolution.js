import {
  EVOLVE_COST, SCORE, GRADES, GRADE_BASE, GRADE_MULT, GRADE_SHIFT, ALIGNMENT,
} from './tuning-evolution.js';

export { GRADES };

export function evolutionCost(nextStage) {
  return EVOLVE_COST[nextStage] ?? Infinity;
}

export function canEvolve(p) {
  return p.yoryeok >= evolutionCost(p.stage + 1);
}

export function gradeMultiplier(grade) {
  return GRADE_MULT[grade];
}

// ---- 등급 ----
export function gradeOdds(enhSum) {
  const sum = Math.max(0, Math.min(GRADE_SHIFT.maxEnhSum, Math.floor(enhSum || 0)));
  const odds = { ...GRADE_BASE };
  let pool = sum * GRADE_SHIFT.perEnh;
  let taken = 0;
  for (const g of GRADE_SHIFT.takeOrder) {
    const t = Math.min(odds[g], pool - taken);
    odds[g] -= t;
    taken += t;
    if (taken >= pool) break;
  }
  const ratio = GRADE_SHIFT.giveRatio;
  const total = Object.values(ratio).reduce((a, b) => a + b, 0);
  for (const g of Object.keys(ratio)) odds[g] += (taken * ratio[g]) / total;
  return odds;
}

export function rollGrade(enhSum, { rng = Math.random } = {}) {
  const odds = gradeOdds(enhSum);
  let r = rng() * 100;
  for (const g of GRADES) {
    r -= odds[g];
    if (r < 0) return g;
  }
  return GRADES[GRADES.length - 1];
}

const enhSumOf = (p) => p.enh.growth + p.enh.speed + p.enh.vitality;

// ---- 선택지 ----
function scoreForm(p, form, useBranch) {
  const total = p.diet.east + p.diet.west + p.diet.south + p.diet.north;
  let s = 0;
  if (total > 0 && p.diet[form.dir] != null) s += SCORE.dir * (p.diet[form.dir] / total);
  if (useBranch && form.branch !== 'none') {
    const mag = Math.abs(p.alignment) / ALIGNMENT.max;
    const match = (form.branch === 'yo' && p.alignment < 0) || (form.branch === 'seon' && p.alignment > 0);
    if (p.alignment !== 0) s += SCORE.branch * (match ? mag : -mag);
  }
  return s;
}

function rank(p, list, useBranch, rng) {
  return list
    .map((form) => ({ form, k: scoreForm(p, form, useBranch) + rng() * 1e-9 }))
    .sort((a, b) => b.k - a.k)
    .map((x) => x.form);
}

// 선택지: [{unknown:false, form}, {unknown:false, form}, {unknown:true}]. 다음 단계가 없으면 [].
export function buildChoices(p, forms, { rng = Math.random } = {}) {
  const next = p.stage + 1;
  const pool = forms.filter((f) => f.stage === next);
  if (pool.length === 0) return [];
  const useBranch = p.stage >= 2;
  const regular = pool.filter((f) => f.from && f.from.includes(p.formId));
  const base = regular.length ? regular : pool;
  const ranked = rank(p, base, useBranch, rng);
  const choices = [{ unknown: false, form: ranked[0] }];
  let second = ranked[1];
  if (!second) {
    second = rank(p, pool.filter((f) => f !== ranked[0]), useBranch, rng)[0];
  }
  if (second) choices.push({ unknown: false, form: second });
  choices.push({ unknown: true });
  return choices;
}

// 비용을 차감한다. 요력 부족이면 throw.
export function evolve(p, choice, forms, { rng = Math.random } = {}) {
  const next = p.stage + 1;
  const cost = evolutionCost(next);
  if (p.yoryeok < cost) throw new Error('요력 부족');
  const pool = forms.filter((f) => f.stage === next);
  if (pool.length === 0) throw new Error('다음 단계 없음');
  const form = choice.unknown
    ? pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]
    : choice.form;
  p.yoryeok -= cost;
  const grade = rollGrade(enhSumOf(p), { rng });
  p.formId = form.id;
  p.stage = form.stage;
  p.grade = grade;
  p.diet = { east: 0, west: 0, south: 0, north: 0 };
  const firstDiscovery = !p.discovered.includes(form.id);
  if (firstDiscovery) {
    p.discovered.push(form.id);
    p.protect += 1;
  }
  return { form, grade, firstDiscovery };
}

// 역진화: 강화 유지, 단계 -1. 1단계면 null. 식성 초기화, 등급은 새로 굴림.
export function devolve(p, forms, { rng = Math.random } = {}) {
  if (p.stage <= 1) return null;
  const cur = forms.find((f) => f.id === p.formId);
  const prevStage = p.stage - 1;
  const prevs = forms.filter((f) => f.stage === prevStage);
  const target = (cur?.from && prevs.find((f) => cur.from.includes(f.id))) || prevs[0];
  if (!target) return null;
  p.formId = target.id;
  p.stage = prevStage;
  p.grade = rollGrade(enhSumOf(p), { rng });
  p.diet = { east: 0, west: 0, south: 0, north: 0 };
  return { form: target, grade: p.grade };
}
