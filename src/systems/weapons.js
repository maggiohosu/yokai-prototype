// 무기(여의주 + 보패 7종)의 수치·이름·해금·저장 정규화. 설계: docs/design-weapons.md 2-2·5-1·7절. Phaser·DOM 의존 없음.
// 모든 무기가 TREASURE.levels 한 표(방향 수 W, 방향당 발사 K, 속도 배율 S, 파워 배율, 유도 H)를 읽고 무기마다 자기 모양의 수로 바꿔 쓴다.
// 물건 한 개 = { kind, level, paid? }. kind가 없거나 모르는 값이면 여의주로 읽는다(옛 저장 호환).

import { CONFIG } from '../config.js';
import { FORMS, FORM_BY_ID } from '../data/forms.js';
import { DEFAULT_WEAPON, WEAPON_BY_ID } from '../data/weapons.js';
import { TREASURE } from './tuning-upgrade.js';

const MAX_LEVEL = TREASURE.success.length;

export const isWeaponKind = (kind) => typeof kind === 'string' && Object.hasOwn(WEAPON_BY_ID, kind);
export const kindOf = (item) => (isWeaponKind(item?.kind) ? item.kind : DEFAULT_WEAPON);
export const weaponOf = (itemOrKind) => WEAPON_BY_ID[typeof itemOrKind === 'string' ? (isWeaponKind(itemOrKind) ? itemOrKind : DEFAULT_WEAPON) : kindOf(itemOrKind)];

const validLevel = (level) => Number.isInteger(level) && level >= 0 && level <= MAX_LEVEL;

// 개수 규칙('ceilW2' = ceil(W/2), 'ceilW3' = ceil(W/3)). 데이터의 표시와 같은 말이다.
function ceilRule(rule, ways) {
  if (rule === 'ceilW2') return Math.ceil(ways / 2);
  if (rule === 'ceilW3') return Math.ceil(ways / 3);
  throw new RangeError('알 수 없는 개수 규칙: ' + rule);
}
const ramp = ([base, perLevel, max], level) => Math.min(max, base + perLevel * level);

// 물건 하나의 수치. 반환 공통 키:
//   kind, level, H(레벨 표의 유도 값), P(구슬 1발 피해: damageBase × 파워 배율, 등급 배율은 combat이 따로 곱한다), ways·perWay·speedMult(TREASURE.levels 그대로),
//   cooldown(시뮬레이션 초), reach(월드 단위), speed(날아가는 속도), homing(0~1), abilityBase·B(능력 기준 피해 B = abilityBase × P),
//   count(그 무기의 핵심 개수: 구슬·깃·광선·칼·알·인장·물방울·고리 수), hitDamage(명중 한 번 피해, 등급 배율 전).
// 거기에 무기별 키가 붙는다(아래 switch).
export function weaponStats(item) {
  const level = item?.level;
  if (!validLevel(level)) throw new RangeError('무기 강화 레벨이 범위를 벗어났습니다.');
  const kind = kindOf(item);
  const w = WEAPON_BY_ID[kind];
  const [ways, perWay, speedMult, powerMult, homing] = TREASURE.levels[level];
  const P = TREASURE.damageBase * powerMult;
  const stats = {
    kind, level, ways, perWay, speedMult, P,
    cooldown: CONFIG.combat.cooldown * w.cdMult,
    reach: w.reach,
    speed: w.speed * speedMult,
    homing: homing * w.homingMult, // 날아가며 휘는 정도. 안 휘는 무기(팔괘경·염주·옥인·삼청령)는 0
    H: homing, // TREASURE.levels의 유도 값 그대로(팔괘경 조준 보정·능력 수치 보정이 읽는다)
    abilityBase: w.abilityBase,
    B: w.abilityBase * P,
    count: 0,
    hitDamage: w.hit * P,
  };
  switch (kind) {
    case 'yeouiju':
      stats.count = ways * perWay;
      stats.shots = stats.count;
      break;
    case 'fan':
      stats.count = w.perK * perWay;
      stats.spreadDeg = Math.min(w.spread.max, w.spread.base + w.spread.perWay * (ways - 1));
      break;
    case 'mirror':
      stats.count = ceilRule(w.beams, ways);
      stats.hitDamage = w.hit * perWay * P;
      stats.halfWidth = w.halfWidth.base + w.halfWidth.perK * perWay;
      stats.aimSnapDeg = w.aimSnapDeg * homing; // +8부터(유도 0.3 이상) 조준 보정
      break;
    case 'sword':
      stats.count = ceilRule(w.blades, ways);
      stats.hitDamage = w.hit * perWay * P; // 가는 길·오는 길 각 1회
      stats.fanDeg = w.fanDeg;
      break;
    case 'beads':
      stats.count = Math.min(w.count.max, w.count.plusW + ways);
      stats.contactDamage = w.contactHit * perWay * P;
      stats.burstDamage = w.burstHit * perWay * P;
      stats.hitDamage = stats.contactDamage;
      Object.assign(stats, { orbitSizeMult: w.orbit.sizeMult, orbitPad: w.orbit.pad, burstMult: w.orbit.burstMult, rehitSec: w.rehitSec,
        spinRadPerSec: w.spinRadPerSec, burstOutSec: w.burstOutSec, burstBackSec: w.burstBackSec });
      break;
    case 'gourd':
      stats.count = ceilRule(w.drops, ways);
      stats.hitDamage = w.hit * perWay * P;
      stats.dropSpreadDeg = w.dropSpreadDeg;
      stats.poolDps = w.pool.dpsK * perWay * P;
      stats.poolRadius = ramp(w.pool.radius, level);
      stats.poolDuration = ramp(w.pool.duration, level);
      stats.poolMax = w.pool.max;
      break;
    case 'bell':
      stats.count = ceilRule(w.rings, ways);
      stats.hitDamage = w.hit * perWay * P;
      stats.ringMaxRadius = ramp(w.ring.radius, level);
      stats.reach = stats.ringMaxRadius;
      stats.spreadSec = w.ring.spreadSec;
      stats.gapSec = w.ring.gapSec;
      stats.ringMax = w.ring.max;
      break;
    case 'seal':
      stats.count = ceilRule(w.seals, ways);
      stats.hitDamage = w.hit * perWay * P;
      stats.slamPad = w.slam.pad + w.slam.perLevel * level; // 낙하 반경 = 표적 크기 + slamPad
      Object.assign(stats, { delaySec: w.slam.delaySec, sense: w.slam.sense, coneDeg: w.slam.coneDeg, fallback: w.slam.fallback, sealMax: w.slam.max });
      break;
    default:
      throw new RangeError('알 수 없는 무기: ' + kind);
  }
  return stats;
}

// '+12 천둥 학우선'. 칭호는 +10부터이고 모든 무기가 같은 단어를 쓴다.
export function itemTitle(item) {
  if (!validLevel(item?.level)) throw new RangeError('무기 강화 레벨이 범위를 벗어났습니다.');
  const { name } = WEAPON_BY_ID[kindOf(item)];
  const title = TREASURE.titles[item.level - TREASURE.titlesFrom];
  return title ? `+${item.level} ${title} ${name}` : `+${item.level} ${name}`;
}

// '학우선이', '여의주가'처럼 받침에 맞춰 주격 조사를 붙인다(한글이 아니면 '이(가)').
export function withSubject(word) {
  const code = String(word).charCodeAt(String(word).length - 1);
  if (code < 0xac00 || code > 0xd7a3) return word + '이(가)';
  return word + ((code - 0xac00) % 28 ? '이' : '가');
}

// ---- 해금(설계 5-1): 지금까지 닿은 최고 단계 = 발견한 형태의 최고 단계. 저장 필드는 없다. ----
// 처음 시작은 1단계. 지금 단계(progress.stage)도 바닥으로 둔다(발견 목록이 없던 옛 저장·시험 진행을 위해, 정상 저장에서는 늘 발견 목록 안이다).
export function unlockedStage(progress, forms = FORMS) {
  const byId = forms === FORMS ? FORM_BY_ID : Object.fromEntries(forms.map((f) => [f.id, f]));
  let stage = Number.isInteger(progress?.stage) && progress.stage > 1 ? progress.stage : 1;
  for (const id of progress?.discovered ?? []) {
    const s = byId[id]?.stage;
    if (Number.isInteger(s) && s > stage) stage = s;
  }
  return stage;
}

export function isUnlocked(progress, kind, forms = FORMS) {
  return isWeaponKind(kind) && WEAPON_BY_ID[kind].unlockStage <= unlockedStage(progress, forms);
}

// ---- 저장 정규화(설계 7절): 장착 칸·보관함의 물건 하나를 읽는다. 버릴 물건이면 null. ----
// kind가 없거나 모르는 값 → 여의주(레벨은 유지, 물건을 잃지 않는다). 레벨이 0~15 정수가 아니면 버린다. paid는 0 이상 유한수가 아니면 지운다(드롭품 취급).
// 그 밖의 필드는 그대로 둔다.
export function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!validLevel(raw.level)) return null;
  const item = { ...raw, kind: isWeaponKind(raw.kind) ? raw.kind : DEFAULT_WEAPON };
  if ('paid' in item && !(typeof item.paid === 'number' && Number.isFinite(item.paid) && item.paid >= 0)) delete item.paid;
  return item;
}

// ---- 화면용 핵심 수(설계 5-2 '다음 레벨 미리보기') ----
// [[라벨, 글자], ...]. 같은 무기의 두 레벨을 비교할 때 라벨 순서가 같다.
const times = (v) => '×' + v.toFixed(2);
export function previewRows(item) {
  const s = weaponStats(item);
  const dmg = (v) => times(v / TREASURE.damageBase);
  const homing = (v) => (v > 0 ? '있음' : '없음');
  switch (s.kind) {
    case 'yeouiju':
      return [['발사 방향', String(s.ways)], ['방향당 구슬', s.perWay + '개'], ['속도', times(s.speedMult)], ['파워', dmg(s.P)], ['유도', homing(s.homing)]];
    case 'fan':
      return [['바람 깃', s.count + '장'], ['부채 각도', s.spreadDeg + '°'], ['속도', times(s.speedMult)], ['깃 한 장 피해', dmg(s.hitDamage)], ['유도', homing(s.homing)]];
    case 'mirror':
      return [['광선', s.count + '줄'], ['광선 폭', String(s.halfWidth * 2)], ['줄 위 적마다 피해', dmg(s.hitDamage)], ['조준 보정', s.aimSnapDeg > 0 ? '±' + Math.round(s.aimSnapDeg) + '°' : '없음']];
    case 'sword':
      return [['칼', s.count + '자루'], ['속도', times(s.speedMult)], ['길마다 피해', dmg(s.hitDamage)], ['유도', homing(s.homing)]];
    case 'beads':
      return [['알', s.count + '개'], ['접촉 피해', dmg(s.contactDamage)], ['퍼짐 피해', dmg(s.burstDamage)]];
    case 'gourd':
      return [['물방울', s.count + '개'], ['물방울 피해', dmg(s.hitDamage)], ['웅덩이 반경', String(s.poolRadius)], ['웅덩이 지속', s.poolDuration.toFixed(1) + '초'], ['웅덩이 초당 피해', dmg(s.poolDps)]];
    case 'bell':
      return [['고리', s.count + '개'], ['고리 반경', String(s.ringMaxRadius)], ['한 번 피해', dmg(s.hitDamage)]];
    case 'seal':
      return [['인장', s.count + '개'], ['낙하 피해', dmg(s.hitDamage)], ['낙하 반경 가산', '+' + s.slamPad.toFixed(1)]];
    default:
      return [];
  }
}
