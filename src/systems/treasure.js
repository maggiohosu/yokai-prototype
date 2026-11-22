import { TREASURE } from './tuning-upgrade.js';

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

export function sellPrice(level) {
  checkLevel(level);
  return priceAt(TREASURE.prices, level);
}

// 강화 비용은 판매가와 따로 정한다(costPrices × upgradeCostRatio).
export function upgradeCost(level) {
  checkLevel(level);
  return level === maxLevel ? Infinity : Math.round(priceAt(TREASURE.costPrices ?? TREASURE.prices, level + 1) * TREASURE.upgradeCostRatio);
}

// 상점에서 산 여의주에는 paid(산 값 + 강화에 쓴 요력)가 붙는다. 상점품 본전 상한(docs/design-weapons.md 4-4):
// 판매가 = min(표 판매가, paid). paid가 없는 드롭 여의주는 표 판매가 그대로라 '강화해서 팔기'가 이익이다.
export const hasPaid = (treasure) => Number.isFinite(treasure?.paid) && treasure.paid >= 0;

export function saleValue(treasure) {
  const table = sellPrice(treasure.level);
  return hasPaid(treasure) ? Math.min(table, treasure.paid) : table;
}

// 호출자가 비용을 지불한다. break면 소유 슬롯에서 여의주를 제거하고 shards를 적립한다.
// 상점품(paid)이면 시도할 때마다(성공·실패 모두) 그 강화비를 paid에 더한다.
export function tryUpgrade(treasure, { rng = Math.random } = {}) {
  const from = treasure.level;
  checkLevel(from);
  if (from === maxLevel) throw new RangeError('이미 최고 강화 레벨입니다.');
  if (hasPaid(treasure)) treasure.paid += upgradeCost(from);
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

export function treasureStats(level) {
  checkLevel(level);
  const [ways, perWay, speedMult, powerMult, homing] = TREASURE.levels[level];
  return {
    damage: TREASURE.damageBase * powerMult,
    ways, perWay, speedMult, homing,
    shots: ways * perWay,
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
