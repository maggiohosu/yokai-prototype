import { CONFIG } from '../config.js';
import { DEFAULT_WEAPON, WEAPON_BY_ID, WEAPONS } from '../data/weapons.js';
import { TREASURE } from './tuning-upgrade.js';
import { hasPaid, sellPrice } from './treasure.js';
import { kindOf } from './weapons.js';

// 대요괴 처치 보상: 보패 1개(사용자 지시 2026-11-23 '대요괴를 물리치면 보패가 랜덤으로 나오게 해', 계획서 '변경 이력 19').
// Phaser·DOM 의존이 없는 순수 규칙이다. 진행 상태(progress)를 직접 고치고 결과를 돌려준다. 저장은 호출자가 한다.
// 보패 = 여의주(기준 무기)를 뺀 상점 무기 7종. 요괴 기본 드롭(session.js)은 그대로 여의주뿐이고, 이 보상은 대요괴 전용 예외다.
//
// 추첨 순서(위에서부터 처음 맞는 것):
//   1) 아직 안 가진 보패(장착 칸·보관함에 없는 종류)가 있으면 그중 하나를 같은 확률로 뽑아 +0으로 준다. 같은 종류는 두 번 주지 않는다.
//      장착 칸이 비어 있으면 장착, 아니면 보관함에 넣는다. 보관함이 가득 차면 +0 여의주(드롭품) 한 개를 표 판매가로 요력으로 바꿔 자리를 만든다. 그것도 없으면 2)로 간다.
//   2) 모두 가졌거나 자리가 없으면, 가진 보패 중 최대 레벨이 아닌 것 하나를 같은 확률로 뽑아 +1 강화한다.
//   3) 그것도 없으면(가진 보패가 없거나 전부 최대 레벨) 이 대요괴의 보너스 요력 × yoryeokMult만큼 요력을 준다.
const MAX_LEVEL = TREASURE.success.length;
const cfg = () => CONFIG.herald.reward;

export const BOPAE = WEAPONS.filter((w) => w.id !== DEFAULT_WEAPON).map((w) => w.id);

const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const pick = (list, rng) => list[Math.min(list.length - 1, Math.floor(clamp01(rng()) * list.length))];
const isItem = (item) => !!item && typeof item === 'object' && Number.isInteger(item.level) && item.level >= 0 && item.level <= MAX_LEVEL;

// 지금 가진 물건 전부: 장착한 것 + 보관함. 장착한 것이 앞이다.
export function heldItems(progress) {
  return [progress?.treasure, ...(progress?.inventory ?? [])].filter(isItem);
}

// 지금 가진 보패 종류(여의주는 뺀다).
export function heldBopaeKinds(progress) {
  return new Set(heldItems(progress).map(kindOf).filter((k) => k !== DEFAULT_WEAPON));
}

// 아직 안 가진 보패 종류(상점 진열 순서).
export function missingBopae(progress) {
  const held = heldBopaeKinds(progress);
  return BOPAE.filter((kind) => !held.has(kind));
}

// 보관함에 둔 +0 여의주 드롭품(상점에서 안 샀고 강화 안 한 것). 팔아도 잃는 게 표 판매가 한 푼뿐이라 자리가 모자랄 때만 치운다.
const isSpare = (item) => isItem(item) && kindOf(item) === DEFAULT_WEAPON && item.level === 0 && !hasPaid(item);

// 새 보패를 놓는다. 성공하면 { placed: 'equipped' | 'inventory', soldYoryeok }, 자리가 없으면 null.
function place(progress, item) {
  progress.inventory ??= [];
  if (!progress.treasure) {
    progress.treasure = item;
    return { placed: 'equipped', soldYoryeok: 0 };
  }
  if (progress.inventory.length < TREASURE.inventorySlots) {
    progress.inventory.push(item);
    return { placed: 'inventory', soldYoryeok: 0 };
  }
  const spare = progress.inventory.findIndex(isSpare);
  if (spare < 0) return null;
  const soldYoryeok = sellPrice(progress.inventory[spare]);
  progress.inventory.splice(spare, 1);
  progress.yoryeok += soldYoryeok;
  progress.inventory.push(item);
  return { placed: 'inventory', soldYoryeok };
}

// 보상 한 번. bonusYoryeok는 이 대요괴의 보너스 요력(herald.heraldBonusYoryeok), rng는 0 이상 1 미만 난수.
// 반환(공통 yoryeok = 이번 호출로 progress.yoryeok에 더해진 양):
//   { type: 'new', kind, name, placed: 'equipped' | 'inventory', soldYoryeok, yoryeok }
//   { type: 'enhance', kind, name, from, to, full, yoryeok: 0 }   full = 새 보패를 놓을 자리가 없어서 강화로 바뀐 경우
//   { type: 'yoryeok', amount, full, yoryeok }
export function grantHeraldBopae(progress, { bonusYoryeok = 0, rng = Math.random } = {}) {
  const missing = missingBopae(progress);
  let full = false;
  if (missing.length) {
    const kind = pick(missing, rng);
    const placed = place(progress, { kind, level: 0 });
    if (placed) return { type: 'new', kind, name: WEAPON_BY_ID[kind].name, ...placed, yoryeok: placed.soldYoryeok };
    full = true;
  }
  const upgradable = heldItems(progress).filter((item) => kindOf(item) !== DEFAULT_WEAPON && item.level < MAX_LEVEL);
  if (upgradable.length) {
    const item = pick(upgradable, rng);
    const from = item.level;
    item.level = from + 1;
    const kind = kindOf(item);
    return { type: 'enhance', kind, name: WEAPON_BY_ID[kind].name, from, to: item.level, full, yoryeok: 0 };
  }
  const amount = Math.round(Math.max(0, Number.isFinite(bonusYoryeok) ? bonusYoryeok : 0) * Math.max(0, cfg().yoryeokMult));
  progress.yoryeok += amount;
  return { type: 'yoryeok', amount, full, yoryeok: amount };
}

// 위쪽 안내 줄에 붙이는 짧은 문구(화면을 가리지 않게 한 줄). 새 보패는 '보패 획득: 팔괘경'이다.
export function heraldRewardText(result) {
  switch (result?.type) {
    case 'new':
      return '보패 획득: ' + result.name + (result.soldYoryeok > 0 ? ' (+0 여의주 1개를 팔아 자리를 만들었어요)' : '');
    case 'enhance':
      return (result.full ? '보관함이 가득 차 강화로 바꿨어요 · ' : '보패 강화: ') + result.name + ' +' + result.from + ' → +' + result.to;
    case 'yoryeok':
      return (result.full ? '보관함이 가득 차 ' : '') + '보패 대신 요력 +' + result.amount;
    default:
      return '';
  }
}
