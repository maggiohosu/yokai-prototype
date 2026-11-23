import { CONFIG } from '../config.js';
import { TREASURE } from './tuning-upgrade.js';
import { costMultiplier } from './enhance-curve.js';
import { kindOf, weaponOf, weaponStats } from './weapons.js';

const maxLevel = TREASURE.success.length;

function validLevel(level) {
  return Number.isInteger(level) && level >= 0 && level <= maxLevel;
}

function checkLevel(level) {
  if (!validLevel(level)) throw new RangeError('여의주 강화 레벨이 범위를 벗어났습니다.');
}

// 기준점 표에서 레벨의 값을 기하 보간한다.
function priceAt(table, level) {
  const end = table.findIndex(([anchor]) => level <= anchor);
  const [endLevel, endPrice] = table[end];
  if (level === endLevel) return endPrice;
  const [startLevel, startPrice] = table[end - 1];
  const fraction = (level - startLevel) / (endLevel - startLevel);
  return Math.round(startPrice * (endPrice / startPrice) ** fraction);
}

// 표 판매가(본전 상한을 적용하기 전). 무기마다 priceMult를 곱한다(지금 모두 1.0, docs/design-weapons.md 4-1).
export function tablePrice(level, kind = 'yeouiju') {
  checkLevel(level);
  return Math.round(priceAt(TREASURE.prices, level) * weaponOf(kind).priceMult);
}

// 강화 비용은 판매가와 따로 정한다. 첫 레벨(+0 → +1) 비용 = costPrices의 +1 값 × upgradeCostRatio × 무기 priceMult이고,
// 이후는 CONFIG.enhanceCost.treasure 곡선이다: +5까지는 레벨마다 softGrowth배, 그 위로 레벨마다 hardGrowth배(지금 둘 다 2배: 사용자 결정 2026-11-23 변경 이력 18,
// 2026-11-24 변경 이력 22). 반올림은 한 번만 한다. 판매가·상점 구매가·본전 상한(paid)은 이 곡선과 따로 정의돼 있어 영향이 없다.
function costAt(level, kind) {
  checkLevel(level);
  if (level === maxLevel) return Infinity;
  const first = priceAt(TREASURE.costPrices ?? TREASURE.prices, 1) * TREASURE.upgradeCostRatio * weaponOf(kind).priceMult;
  return Math.round(first * costMultiplier(level, CONFIG.enhanceCost.treasure));
}

// 인자는 물건({ kind?, level, paid? }) 또는 레벨(옛 호출, 여의주로 본다).
//   sellPrice(item): 상점에서 산 물건(paid)이면 min(표 판매가, paid)(본전 상한). 드롭품(paid 없음)은 표 판매가.
//   sellPrice(level): 여의주의 표 판매가.
export function sellPrice(target) {
  if (typeof target === 'number') return tablePrice(target);
  const table = tablePrice(target?.level, kindOf(target));
  return hasPaid(target) ? Math.min(table, target.paid) : table;
}

// upgradeCost(item)은 그 무기의 강화비, upgradeCost(level)은 여의주의 강화비. 최고 레벨은 Infinity.
export function upgradeCost(target) {
  return typeof target === 'number' ? costAt(target, 'yeouiju') : costAt(target?.level, kindOf(target));
}

// 다음 강화의 결과별 확률(%). 성공 / 깨짐(실패 중 깨질 몫) / 실패(유지). 세 값의 합은 100. 모든 무기가 같은 표를 쓴다(결정 D3).
export function upgradeOdds(level) {
  checkLevel(level);
  if (level === maxLevel) throw new RangeError('이미 최고 강화 레벨입니다.');
  const success = TREASURE.success[level];
  const broken = (100 - success) * TREASURE.breakOnFailure[level] / 100;
  return { success, fail: 100 - success - broken, break: broken };
}

// 레벨별 확률·비용 표(정비 화면의 '확률표', 여의주). 한 행 = 현재 레벨에서 다음 레벨로 올리는 한 번(+0 → +1 … +14 → +15). 모든 무기가 같은 표를 쓴다.
// success + fail + break = 100(upgradeOdds와 같은 식).
export function treasureTable(kind = 'yeouiju') {
  return TREASURE.success.map((_, level) => ({ level, to: level + 1, cost: costAt(level, kind), ...upgradeOdds(level) }));
}

// 강화 결과 문구에 붙이는 '이 결과가 나올 확률' 한 줄(사용자 결정 2026-11-23, 계획서 변경 이력 5).
// result는 tryUpgrade의 결과('success'|'fail'|'break'), odds는 강화 전에 구한 upgradeOdds(from). 소수 첫째 자리까지: '성공 확률 45%', '깨질 확률 5.6%'.
const CHANCE_LABEL = { success: '성공 확률', fail: '실패 확률', break: '깨질 확률' };
export function chanceText(result, odds) {
  if (!Object.hasOwn(CHANCE_LABEL, result) || !Number.isFinite(odds?.[result])) throw new RangeError('확률을 보여 줄 수 없는 결과입니다.');
  return CHANCE_LABEL[result] + ' ' + Math.round(odds[result] * 10) / 10 + '%';
}

// 상점에서 산 물건(여의주·보패)에는 paid(산 값 + 강화에 쓴 요력)가 붙는다. 상점품 본전 상한(docs/design-weapons.md 4-4):
// 판매가 = min(표 판매가, paid). paid가 없는 드롭 여의주는 표 판매가 그대로라 '강화해서 팔기'가 이익이다.
export function hasPaid(treasure) {
  return Number.isFinite(treasure?.paid) && treasure.paid >= 0;
}

// 물건 하나를 팔 때 받는 요력(sellPrice(item)과 같다). 화면 문구에서 읽기 좋은 이름으로 남겨 둔다.
export const saleValue = (treasure) => sellPrice(treasure);

// 호출자가 비용을 지불한다. break면 소유 슬롯에서 여의주를 제거하고 shards를 적립한다.
// 상점품(paid)이면 시도할 때마다(성공·실패 모두) 그 강화비를 paid에 더한다.
export function tryUpgrade(treasure, { rng = Math.random } = {}) {
  const from = treasure.level;
  checkLevel(from);
  if (from === maxLevel) throw new RangeError('이미 최고 강화 레벨입니다.');
  if (hasPaid(treasure)) treasure.paid += upgradeCost(treasure);
  if (rng() * 100 < TREASURE.success[from]) {
    treasure.level = from + 1;
    return { result: 'success', from, to: treasure.level, shards: 0 };
  }
  const risk = TREASURE.breakOnFailure[from];
  if (risk > 0 && rng() * 100 < risk) {
    treasure.level = null;
    return { result: 'break', from, to: null, shards: from * TREASURE.shardsPerLevel };
  }
  return { result: 'fail', from, to: from, shards: 0 };
}

// 교환 가능한 보호권을 모두 지급하고 그 수를 반환한다.
export function exchangeShards(state) {
  const count = Math.floor(state.shards / TREASURE.shardsPerProtect);
  state.shards -= count * TREASURE.shardsPerProtect;
  state.protect += count;
  return count;
}

// 여의주(기준 무기)의 수치. 옛 호출 호환용이고 계산은 weaponStats가 한다.
export function treasureStats(level) {
  checkLevel(level);
  const s = weaponStats({ kind: 'yeouiju', level });
  return {
    damage: s.P,
    ways: s.ways, perWay: s.perWay, speedMult: s.speedMult, homing: s.homing,
    shots: s.count,
    chargePower: TREASURE.chargeBase + level * TREASURE.chargePerLevel,
  };
}

export function treasureTitle(level) {
  checkLevel(level);
  const title = TREASURE.titles[level - TREASURE.titlesFrom];
  return title ? `+${level} ${title} 여의주` : `+${level} 여의주`;
}

export function dropChance({ killedByTreasure = false } = {}) {
  return killedByTreasure ? TREASURE.drop.treasureKill : TREASURE.drop.normal;
}

export function addToInventory(state, treasure) {
  if (!validLevel(treasure?.level) || state.inventory.length >= TREASURE.inventorySlots) return false;
  if (state.treasure === treasure || state.inventory.includes(treasure)) return false;
  state.inventory.push(treasure);
  return true;
}

function itemAt(state, index) {
  if (!Number.isInteger(index) || index < 0 || index >= state.inventory.length) return null;
  return state.inventory[index];
}

// 장착 중이면 선택한 보관함 칸과 맞바꾼다. 빈 장착 칸이면 보관함 한 칸이 비게 된다.
export function equip(state, index) {
  const next = itemAt(state, index);
  if (!validLevel(next?.level)) return false;
  if (state.treasure) state.inventory[index] = state.treasure;
  else state.inventory.splice(index, 1);
  state.treasure = next;
  return true;
}

// 보관함 인덱스 또는 'equipped'를 받아 판매 요력을 적립한다. 잘못된 슬롯이면 0.
export function sell(state, slot) {
  const treasure = slot === 'equipped' ? state.treasure : itemAt(state, slot);
  if (!validLevel(treasure?.level)) return 0;
  const price = saleValue(treasure);
  if (slot === 'equipped') state.treasure = null;
  else state.inventory.splice(slot, 1);
  state.yoryeok += price;
  return price;
}
