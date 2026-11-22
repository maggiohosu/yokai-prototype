// 여의주 능력(설계 4절)의 순수 계산. Phaser·씬에 의존하지 않는다.
// 능력 = 지금 형태의 줄기(stem) → stems.js의 ability. 능력 단계 = 지금 형태의 stage(1~5). mimul(줄기 없음)은 능력이 없다.
import { STEM_BY_ID } from '../data/stems.js';
import { ABILITIES, ABILITY_LEVEL, ABILITY_RESIST } from './tuning-abilities.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const clampStage = (stage) => clamp(Math.trunc(Number(stage)) || 1, 1, 5);
export const clampLevel = (level) => clamp(Math.trunc(Number(level)) || 0, 0, ABILITY_LEVEL.maxLevel);

// 연속 수치 배율: lv(L) = 1 + 0.04 × L (+15에서 ×1.6)
export function lv(level) {
  return 1 + ABILITY_LEVEL.perLevel * clampLevel(level);
}

// 정수 수치 증가분: floor(L / every). 기본 every = 5(+5·+10·+15에서 +1).
export function lvInt(level, every = ABILITY_LEVEL.intEvery) {
  return Math.floor(clampLevel(level) / every);
}

// 상위 단계 적 저항: r(Δ) = 0.5^max(0, Δ), Δ = 적 단계 − 내 단계.
export function resist(delta) {
  return ABILITY_RESIST.base ** Math.max(0, delta);
}

export function abilityIdOfForm(form) {
  const stem = form?.stem ? STEM_BY_ID[form.stem] : null;
  return stem && ABILITIES[stem.ability] ? stem.ability : null;
}

export function abilityOf(form) {
  const id = abilityIdOfForm(form);
  return id ? ABILITIES[id] : null;
}

export function abilityName(form) {
  return abilityOf(form)?.name ?? '';
}

// 진화 카드·진화 화면에 형태 이름 밑에 붙이는 한 줄. 능력이 없으면 ''.
export function abilityLabel(form) {
  const name = abilityName(form);
  return name ? '능력: ' + name : '';
}

// 능력 id·단계·여의주 강화 레벨로 정한 실제 수치(상한 적용 뒤). 저항은 곱하지 않았다(걸 때 resisted로).
// 반환: { id, stage, level, ...수치, raw: 단계 칸 값(강화 전) }. 모르는 id면 null.
export function abilityValues(id, stage, level) {
  const def = ABILITIES[id];
  if (!def) return null;
  const s = clampStage(stage), l = clampLevel(level);
  const out = { id, stage: s, level: l, raw: {} };
  for (const [key, list] of Object.entries(def)) {
    if (!Array.isArray(list)) continue;
    const base = list[s - 1];
    out.raw[key] = base;
    let v = base;
    switch (def.scale?.[key]) {
      case 'lv': v = base * lv(l); break;
      case 'int': v = base + lvInt(l); break;
      case 'int10': v = base + lvInt(l, 10); break;
      case 'div': v = base / lv(l); break;
      default: break;
    }
    const cap = def.cap?.[key];
    if (cap != null) v = Math.min(v, cap);
    const floor = def.floor?.[key];
    if (floor != null) v = Math.max(v, floor);
    out[key] = v;
  }
  return out;
}

// 지금 형태·여의주 강화 레벨의 능력 수치. 능력이 없으면 null. (form.stage가 곧 능력 단계)
export function abilityRuntime(form, level, stage = form?.stage) {
  const id = abilityIdOfForm(form);
  return id ? abilityValues(id, stage, level) : null;
}

// 저항을 곱한 값. kind(ABILITIES[id].resist[key])가 'time'이면 지속(최소 minSec 미만이면 0),
// 'size'면 크기(r이 minRatio 미만이면 0). 저항이 없는 수치는 그대로. 0이면 "걸지 않는다".
export function resisted(id, key, value, delta) {
  const kind = ABILITIES[id]?.resist?.[key];
  if (!kind) return value;
  const r = resist(delta);
  if (kind === 'time') {
    const v = value * r;
    return v < ABILITY_RESIST.minSec - 1e-9 ? 0 : v;
  }
  return r < ABILITY_RESIST.minRatio - 1e-9 ? 0 : value * r;
}

// 화면 시간(초) → 시뮬레이션 시간. 눈에 보이는 지속이 템포·속도 곡선과 상관없이 같게 하려는 것이다.
export function screenToSim(seconds, tempo, pace = 1) {
  return seconds * tempo * pace;
}
