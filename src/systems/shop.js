import { CONFIG } from '../config.js';
import { sellPrice, addToInventory } from './treasure.js';
import { TREASURE } from './tuning-upgrade.js';

// 상점 수치는 CONFIG.shop에 있다(구매가 배율, 파는 레벨 범위).
// 구매가 = 같은 레벨 판매가 × priceMult(반올림). priceMult가 1을 넘으므로 사서 바로 팔면 언제나 손해다.
// 사서 강화해 파는 이익은 본전 상한으로 막는다: 산 여의주에는 paid(= 구매가)가 붙고, 강화할 때마다 강화비가 더해지며,
// 판매가는 min(표 판매가, paid)다(treasure.js saleValue). 드롭 여의주는 paid가 없어 표 판매가 그대로 받는다.
const cfg = () => CONFIG.shop;

export const shopLevels = () => Array.from({ length: cfg().maxLevel - cfg().minLevel + 1 }, (_, i) => cfg().minLevel + i);

const sellable = (level) => Number.isInteger(level) && level >= cfg().minLevel && level <= cfg().maxLevel && level <= TREASURE.success.length;

export function buyPrice(level) {
  if (!sellable(level)) throw new RangeError('상점에서 팔지 않는 여의주 레벨입니다.');
  return Math.round(sellPrice(level) * cfg().priceMult);
}

// 살 수 있는지와 이유. reason: 'level'(팔지 않는 레벨) | 'full'(보관함 가득) | 'funds'(요력 부족), 살 수 있으면 null
export function buyBlocker(state, level) {
  if (!sellable(level)) return 'level';
  if (state.inventory.length >= TREASURE.inventorySlots) return 'full';
  if (!(state.yoryeok >= buyPrice(level))) return 'funds';
  return null;
}

export const blockerText = {
  level: '이 레벨은 팔지 않아요',
  full: '보관함이 가득 찼어요',
  funds: '요력이 모자라요',
};

// [{ level, price }] 상점 진열 순서(낮은 레벨부터)
export function shopCatalog() {
  return shopLevels().map((level) => ({ level, price: buyPrice(level) }));
}

// 요력을 내고 보관함에 { level, paid: 구매가 }를 넣는다. 성공하면 { ok: true, level, price }, 아니면 { ok: false, reason }.
// 한 번의 호출 안에서 검사와 변경이 끝난다(요력만 빠지고 여의주가 안 들어오는 일이 없다).
export function buy(state, level) {
  const reason = buyBlocker(state, level);
  if (reason) return { ok: false, reason };
  const price = buyPrice(level);
  if (!addToInventory(state, { level, paid: price })) return { ok: false, reason: 'full' };
  state.yoryeok -= price;
  return { ok: true, level, price };
}
