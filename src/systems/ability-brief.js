// 능력 안내 창(src/ui/AbilityInfoView.js)에 보여 줄 데이터를 만드는 순수 함수. Phaser·DOM에 의존하지 않는다.
// abilityBrief(formId, progress) → 이름·단계·방위·줄기, 여의주 능력 이름·설명, 지금 단계와 장착 무기 레벨 기준 실제 수치, 사용 방법,
// 상위 단계 적 저항 한 줄, 부스터 보정, (보패를 꼈다면) 그 무기와의 조합 한 줄. 모르는 형태면 null.
// - 능력 단계 = 보는 형태의 stage, 강화 레벨 = 장착 무기(progress.treasure)의 레벨(전투와 같다: 없거나 이상하면 0).
// - 능력 수치는 abilities.js의 abilityValues가 정한 값(상한 적용 뒤)이고, 여기서는 글자로만 바꾼다.
// - locked: true(도감의 미발견 형태)면 이름·한자·줄기·능력을 '???'로 가리고 수치·사용 방법·조합은 비운다.
import { CONFIG, REGIONS } from '../config.js';
import { FORM_BY_ID } from '../data/forms.js';
import { STEM_BY_ID, stemBoostMult } from '../data/stems.js';
import { WEAPON_BY_ID } from '../data/weapons.js';
import { ABILITY_GUIDES, WEAPON_COMBOS } from '../data/ability-guides.js';
import { boosterMult } from '../game/booster.js';
import { abilityIdOfForm, abilityValues, resisted } from './abilities.js';
import { gradeMultiplier } from './evolution.js';
import { ABILITIES } from './tuning-abilities.js';
import { TREASURE } from './tuning-upgrade.js';
import { itemTitle, kindOf, weaponStats, withSubject } from './weapons.js';

export const NO_ABILITY_TEXT = '능력 없음 — 진화하면 줄기 능력이 생긴다';
export const LOCKED_NAME = '???';
export const LOCKED_NOTE = '아직 만나지 못한 요괴예요. 이 모습으로 진화해 보면 능력이 열려요.';

const BRANCH_NAME = { yo: '요', seon: '선' };
const MAX_LEVEL = TREASURE.success.length;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// 소수점 아래 d자리까지 보이고 끝의 0은 지운다(1.50 → '1.5', 2.00 → '2').
const trim = (n, d = 0) => String(Number(Number(n).toFixed(d)));

// 장착 무기: 칸이 비었거나 레벨이 이상하면 기본 여의주 +0(전투가 쓰는 규칙과 같다).
export function equippedWeapon(progress) {
  const item = progress?.treasure && typeof progress.treasure === 'object' ? progress.treasure : null;
  const kind = kindOf(item);
  const level = Number.isInteger(item?.level) && item.level >= 0 && item.level <= MAX_LEVEL ? item.level : 0;
  const equipped = !!item && Number.isInteger(item.level) && item.level >= 0 && item.level <= MAX_LEVEL;
  const name = WEAPON_BY_ID[kind].name;
  return { kind, name, level, equipped, label: equipped ? itemTitle({ kind, level }) : name + ' +0 (기본)' };
}

// 수치 하나를 글자로(표시 규칙은 data/ability-guides.js 머리말).
export function formatStat(spec, value) {
  if (!Number.isFinite(value)) return '-';
  if (spec.zeroText && value === 0) return spec.zeroText;
  switch (spec.unit) {
    case 'sec': return trim(value, 1) + '초';
    case 'count': return trim(value, 0) + (spec.suffix ?? '');
    case 'pct': return trim(value * 100, 0) + '%';
    case 'pctRaw': return '+' + trim(value, 0) + '%';
    case 'mult': return '×' + trim(value, 2);
    default: return trim(value, 0); // dist, num
  }
}

// 상위 단계 적 저항 한 줄. 저항이 없는 능력은 '단계와 상관없이 같다'고 적는다.
function resistLine(id, values, guide) {
  const def = ABILITIES[id];
  const key = Object.keys(def.resist ?? {})[0];
  if (!key) return { kind: 'none', steps: [], text: '상위 단계 적: 적의 단계와 상관없이 효과가 같다.' };
  const spec = guide.stats.find((s) => s.key === key);
  const steps = [];
  for (let delta = 1; delta <= 4; delta++) {
    const value = resisted(id, key, values[key], delta);
    if (value === 0) {
      steps.push({ delta, text: '걸리지 않음', blocked: true });
      break;
    }
    steps.push({ delta, text: formatStat(spec, value), blocked: false });
  }
  const chips = steps.map((s) => s.delta + '단계 위 ' + s.text).join(' · ');
  const text = '상위 단계 적: 적이 나보다 한 단계 높을 때마다 ' + withSubject(spec.label) + ' 절반으로 줄어든다 (' + chips + ').'
    + (guide.resistNote ? ' ' + guide.resistNote : '');
  return { kind: def.resist[key], key, label: spec.label, steps, text };
}

// 부스터 배율 = baseMult × 줄기 보정 + 이동 속도 강화 레벨 × perSpeedLevel(booster.js와 같은 식).
function boostLine(form, progress) {
  const mult = boosterMult(progress, form);
  const stemMult = Number.isFinite(form.boostMult) ? form.boostMult : stemBoostMult(form.stem);
  const speedLevel = clamp(Number(progress?.enh?.speed) || 0, 0, CONFIG.pace.maxSpeedLevel);
  const tone = stemMult > 1 ? '평균보다 빠른 줄기' : stemMult < 1 ? '평균보다 느린 줄기' : '평균 줄기';
  return {
    mult, stemMult, speedLevel, tone,
    text: '부스터 ×' + trim(mult, 2) + ' — 줄기 보정 ×' + trim(stemMult, 2) + '(' + tone + ')'
      + (speedLevel ? ', 이동 속도 강화 Lv ' + speedLevel : ''),
  };
}

export function abilityBrief(formId, progress, { locked = false } = {}) {
  const form = FORM_BY_ID[formId];
  if (!form) return null;
  const region = REGIONS[form.dir];
  const stem = form.stem ? STEM_BY_ID[form.stem] : null;
  const weapon = equippedWeapon(progress);
  const brief = {
    formId: form.id,
    locked: !!locked,
    name: locked ? LOCKED_NAME : form.name,
    hanja: locked ? '' : form.hanja ?? '',
    stage: form.stage,
    stageText: form.stage + '단계',
    dir: form.dir,
    dirName: region?.name ?? '정해지지 않음',
    branchName: form.stage >= 3 ? BRANCH_NAME[form.branch] ?? '' : '',
    stemId: stem?.id ?? null,
    stemName: locked ? LOCKED_NAME : stem?.name ?? '줄기 없음',
    weapon,
    hasAbility: false,
    ability: null,
    basis: '',
    baseDamage: null,
    stats: [],
    usage: [],
    resist: null,
    boost: null,
    combo: null,
    note: '',
  };
  const id = abilityIdOfForm(form);
  if (locked) {
    brief.hasAbility = !!id;
    brief.ability = id ? { id, code: ABILITIES[id].id, name: LOCKED_NAME, hanja: '', summary: LOCKED_NAME } : null;
    brief.note = LOCKED_NOTE;
    return brief;
  }
  brief.boost = boostLine(form, progress);
  if (!id) {
    brief.note = NO_ABILITY_TEXT;
    return brief;
  }
  const def = ABILITIES[id];
  const guide = ABILITY_GUIDES[id];
  const values = abilityValues(id, form.stage, weapon.level);
  brief.hasAbility = true;
  brief.ability = { id, code: def.id, name: def.name, hanja: def.hanja, summary: guide.summary };
  brief.basis = form.stage + '단계 · ' + weapon.label + ' 기준';

  // 기준 피해 = 능력 기준 피해 B(무기 abilityBase × 구슬 1발 피해) × 등급 배율. 비율 칸(damage: true)은 여기에 곱한 실제 값도 적는다.
  const grade = gradeMultiplier(progress?.grade) ?? 1;
  const base = weaponStats({ kind: weapon.kind, level: weapon.level }).B * grade;
  brief.baseDamage = {
    value: base,
    label: weapon.kind === 'yeouiju' ? '구슬 한 발 피해(등급 반영)' : '능력 기준 피해(무기·등급 반영)',
    text: trim(base, 2),
  };
  brief.stats = guide.stats.map((spec) => {
    const value = values[spec.key];
    const text = formatStat(spec, value);
    const baseText = formatStat(spec, values.raw[spec.key]);
    return {
      key: spec.key, label: spec.label, value, text,
      baseText: baseText !== text ? baseText : null, // 무기 강화로 달라졌을 때만 '기본 ○○'을 곁들인다
      damageText: spec.damage ? '피해 약 ' + trim(value * base, 2) : null,
    };
  });
  brief.usage = [...guide.use];
  brief.resist = resistLine(id, values, guide);
  const combo = weapon.kind !== 'yeouiju' ? WEAPON_COMBOS[id]?.[weapon.kind] : null;
  if (combo) brief.combo = { weaponName: weapon.name, text: combo };
  return brief;
}
