import { CONFIG } from '../config.js';
import { WEAPONS } from '../data/weapons.js';
import { tablePrice, addToInventory } from './treasure.js';
import { TREASURE } from './tuning-upgrade.js';
import { isUnlocked, isWeaponKind, weaponOf } from './weapons.js';

// 상점 수치는 CONFIG.shop에 있다(구매가 배율, 파는 레벨 범위). 상점은 무기 8종(여의주 + 보패 7종)을 모두 같은 가격표로 판다(docs/design-weapons.md 4-2·5절).
// 구매가 = 같은 레벨 판매가 × priceMult(반올림). priceMult가 1을 넘으므로 사서 바로 팔면 언제나 손해다.
// 사서 강화해 파는 이익은 본전 상한으로 막는다: 산 물건에는 paid(= 구매가)가 붙고, 강화할 때마다 강화비가 더해지며,
// 판매가는 min(표 판매가, paid)다(treasure.js sellPrice). 드롭 여의주는 paid가 없어 표 판매가 그대로 받는다.
// 인자는 (kind, level)이다. 옛 호출 (level)은 여의주로 본다.
const cfg = () => CONFIG.shop;

export const shopLevels = () => Array.from({ length: cfg().maxLevel - cfg().minLevel + 1 }, (_, i) => cfg().minLevel + i);

const sellable = (level) => Number.isInteger(level) && level >= cfg().minLevel && level <= cfg().maxLevel && level <= TREASURE.success.length;
const split = (a, b) => (typeof a === 'number' ? ['yeouiju', a] : [a, b]);

export function buyPrice(a, b) {
  const [kind, level] = split(a, b);
  if (!sellable(level)) throw new RangeError('상점에서 팔지 않는 보물 레벨입니다.');
  if (!isWeaponKind(kind)) throw new RangeError('상점에서 팔지 않는 보물입니다.');
  return Math.round(tablePrice(level, kind) * cfg().priceMult);
}

// 살 수 있는지와 이유. reason: 'level'(팔지 않는 레벨) | 'kind'(없는 보물) | 'locked'(아직 해금 전)
// | 'full'(보관함 가득) | 'funds'(요력 부족), 살 수 있으면 null. 이유는 이 순서로 먼저 맞는 것 하나만 알린다.
export function buyBlocker(state, a, b) {
  const [kind, level] = split(a, b);
  if (!sellable(level)) return 'level';
  if (!isWeaponKind(kind)) return 'kind';
  if (!isUnlocked(state, kind)) return 'locked';
  if (state.inventory.length >= TREASURE.inventorySlots) return 'full';
  if (!(state.yoryeok >= buyPrice(kind, level))) return 'funds';
  return null;
}

export const blockerText = {
  level: '이 레벨은 팔지 않아요',
  kind: '팔지 않는 보물이에요',
  locked: '아직 열리지 않았어요',
  full: '보관함이 가득 찼어요',
  funds: '요력이 모자라요',
};

// 잠긴 카드에 붙이는 말: '2단계에 닿으면 열려요'
export const lockedText = (kind) => weaponOf(kind).unlockStage + '단계에 닿으면 열려요';

// 상점 진열 순서(해금 단계 순, 같은 단계는 설계 5-1 표 순서)로 카드 8장.
// [{ kind, name, hanja, line, strong, weak, unlockStage, locked, levels: [{ level, price }] }]  levels는 낮은 레벨부터.
export function shopCatalog(progress) {
  return [...WEAPONS].sort((x, y) => x.order - y.order).map((w) => ({
    kind: w.id, name: w.name, hanja: w.hanja, line: w.line, strong: w.strong, weak: w.weak,
    unlockStage: w.unlockStage,
    locked: !isUnlocked(progress, w.id),
    levels: shopLevels().map((level) => ({ level, price: buyPrice(w.id, level) })),
  }));
}

// 요력을 내고 보관함에 { kind, level, paid: 구매가 }를 넣는다. 성공하면 { ok: true, kind, level, price }, 아니면 { ok: false, reason }.
// 한 번의 호출 안에서 검사와 변경이 끝난다(요력만 빠지고 물건이 안 들어오는 일이 없다).
export function buy(state, a, b) {
  const [kind, level] = split(a, b);
  const reason = buyBlocker(state, kind, level);
  if (reason) return { ok: false, reason };
  const price = buyPrice(kind, level);
  if (!addToInventory(state, { kind, level, paid: price })) return { ok: false, reason: 'full' };
  state.yoryeok -= price;
  return { ok: true, kind, level, price };
}
