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
const DIRS = ['east', 'west', 'south', 'north'];
const EPS = 1e-9;

// 식성 1위 방위. fallback이 동률 후보면 fallback을 우선한다. 식성이 모두 0이고 fallback도 없으면 null.
export function topDietDir(diet, fallback = null) {
  let best = DIRS.includes(fallback) ? fallback : null;
  let bestValue = best ? diet[best] ?? 0 : 0;
  for (const dir of DIRS) {
    const value = diet[dir] ?? 0;
    if (value > bestValue) {
      best = dir;
      bestValue = value;
    }
  }
  return best;
}

// 점수 = dir × 식성 비율 + branch × 성향 일치(3단계 이상 후보일 때) + stem × (지금 줄기인가). 설계 3-2.
function scoreForm(p, cur, form, useBranch) {
  const total = p.diet.east + p.diet.west + p.diet.south + p.diet.north;
  let s = 0;
  if (total > 0 && p.diet[form.dir] != null) s += SCORE.dir * (p.diet[form.dir] / total);
  if (useBranch && form.branch !== 'none') {
    const mag = Math.abs(p.alignment) / ALIGNMENT.max;
    const match = (form.branch === 'yo' && p.alignment < 0) || (form.branch === 'seon' && p.alignment > 0);
    if (p.alignment !== 0) s += SCORE.branch * (match ? mag : -mag);
  }
  if (cur?.stem && form.stem === cur.stem) s += SCORE.stem;
  return s;
}

// 점수 내림차순. 동점은 같은 줄기 → 입구 → forms 배열 순서다(무작위로 깨지 않는다).
function rank(p, cur, list, forms, useBranch) {
  return list
    .map((form) => ({
      form,
      k: scoreForm(p, cur, form, useBranch),
      same: cur?.stem && form.stem === cur.stem ? 1 : 0,
      entry: form.entry ? 1 : 0,
      index: forms.indexOf(form),
    }))
    .sort((a, b) => (Math.abs(b.k - a.k) > EPS ? b.k - a.k : 0) || b.same - a.same || b.entry - a.entry || a.index - b.index)
    .map((x) => x.form);
}

// 선택지: [{unknown:false, form}, {unknown:false, form}, {unknown:true, exclude}]. 다음 단계가 없으면 [].
// 후보 C = 지금 형태의 next(없으면 다음 단계 전부) + (식성 1위 방위가 지금 방위와 다르면) 그 방위 4개 줄기의 다음 단계 입구.
// ① = C의 1위, ② = ①이 지금 줄기가 아니면 C 안의 지금 줄기 1위(줄기 유지), 지금 줄기면 C 안의 다른 줄기 1위.
// 그래서 ①과 ②는 줄기가 항상 달라 3택은 늘 "능력을 바꿀지"를 묻는다. 지금 줄기가 없는 mimul은 ①과 다른 줄기 1위가 ②다.
// ③ 미지 = 다음 단계 전체에서 ①·②를 뺀 나머지 중 균등 무작위(exclude에 ①②의 id를 싣는다. 실제 뽑기는 evolve가 한다).
// ④~ 종족 자유 선택(사용자 지시 2026-11-23: 각 종족으로 더 자유롭게 변환): ①②에 없는 방위(청룡·백호·주작·현무)마다 식성과 무관하게
// 그 방위의 입구 형태 중 점수 1위를 뒤에 더한다(species: true). 그래서 어느 종족으로든 바로 갈아탈 수 있다. ①②③의 순서와 내용은 그대로다.
// rng는 호환용이다. 동점을 무작위로 깨지 않으므로 rng가 달라도 ①②는 같다.
export function buildChoices(p, forms, { rng = Math.random } = {}) {
  const nextStage = p.stage + 1;
  const pool = forms.filter((f) => f.stage === nextStage);
  if (pool.length === 0) return [];
  const cur = forms.find((f) => f.id === p.formId);
  const useBranch = p.stage >= 2;
  const regular = pool.filter((f) => f.from && f.from.includes(p.formId));
  const candidates = new Set(regular.length ? regular : pool);
  const top = topDietDir(p.diet, cur?.dir);
  if (top && top !== cur?.dir) for (const f of pool) if (f.dir === top && f.entry) candidates.add(f);
  const ranked = rank(p, cur, [...candidates], forms, useBranch);
  const first = ranked[0];
  const keep = cur?.stem && first.stem !== cur.stem;
  let second = keep
    ? ranked.find((f) => f.stem === cur.stem)
    : ranked.find((f) => f.stem != null && f.stem !== first.stem);
  second ??= ranked.find((f) => f !== first);
  second ??= rank(p, cur, pool.filter((f) => f !== first), forms, useBranch)[0];
  const choices = [{ unknown: false, form: first }];
  if (second) choices.push({ unknown: false, form: second });
  choices.push({ unknown: true, exclude: choices.map((c) => c.form.id) });
  const covered = new Set(choices.filter((c) => !c.unknown).map((c) => c.form.dir));
  for (const dir of DIRS) {
    if (covered.has(dir)) continue;
    const ofDir = pool.filter((f) => f.dir === dir);
    const entries = ofDir.filter((f) => f.entry);
    const pick = rank(p, cur, entries.length ? entries : ofDir, forms, useBranch)[0];
    if (pick) choices.push({ unknown: false, form: pick, species: true });
  }
  return choices;
}

// 미지의 진화 후보: 다음 단계 전체에서 choice.exclude(①②)를 뺀 나머지. 다 빠지면 전체.
export function unknownPool(choice, forms, stage) {
  const pool = forms.filter((f) => f.stage === stage);
  const rest = choice?.exclude?.length ? pool.filter((f) => !choice.exclude.includes(f.id)) : pool;
  return rest.length ? rest : pool;
}

// 비용을 차감한다. 요력 부족이면 throw.
export function evolve(p, choice, forms, { rng = Math.random } = {}) {
  const next = p.stage + 1;
  const cost = evolutionCost(next);
  if (p.yoryeok < cost) throw new Error('요력 부족');
  const pool = forms.filter((f) => f.stage === next);
  if (pool.length === 0) throw new Error('다음 단계 없음');
  const list = choice.unknown ? unknownPool(choice, forms, next) : pool;
  const form = choice.unknown
    ? list[Math.min(list.length - 1, Math.floor(rng() * list.length))]
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
// 돌아갈 형태: 지금 형태의 부모(from) 중 ① 같은 줄기 ② 같은 방위 ③ mimul 순서(같은 조건이 여럿이면 forms 배열 순서).
// 2단계 → 1단계는 같은 줄기에 1단계 뿌리가 있으면 그 미물, 없으면 같은 방위 1단계 중 첫째, 그다음 mimul이다.
export function devolve(p, forms, { rng = Math.random } = {}) {
  if (p.stage <= 1) return null;
  const cur = forms.find((f) => f.id === p.formId);
  const prevStage = p.stage - 1;
  const prevs = forms.filter((f) => f.stage === prevStage);
  const parents = cur?.from ? prevs.filter((f) => cur.from.includes(f.id)) : [];
  const target = (cur?.stem && parents.find((f) => f.stem === cur.stem))
    || (cur?.dir && parents.find((f) => f.dir === cur.dir))
    || (prevStage === 1 && cur?.dir && prevs.find((f) => f.dir === cur.dir))
    || parents.find((f) => f.id === 'mimul')
    || parents[0]
    || prevs[0];
  if (!target) return null;
  p.formId = target.id;
  p.stage = prevStage;
  p.grade = rollGrade(enhSumOf(p), { rng });
  p.diet = { east: 0, west: 0, south: 0, north: 0 };
  return { form: target, grade: p.grade };
}
