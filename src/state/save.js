import { SAVE } from '../systems/tuning-evolution.js';
import { createProgress } from '../systems/progress.js';
import { ENHANCE, TREASURE } from '../systems/tuning-upgrade.js';
import { FORMS } from '../data/forms.js';
import { normalizeItem } from '../systems/weapons.js';
import { normalizeDevolve } from '../systems/enhance.js';
import { normalizePendingProtect } from '../systems/protect.js';
import { DIFFICULTY, hasLives, livesFor, normalizeDifficulty } from '../systems/difficulty.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// 앞으로 형태 id를 바꿔야 할 때 { 옛id: 새id }를 여기에 적는다(normalizeProgress가 형태 검사 전에 바꾼다). 지금은 비어 있다.
export const FORM_ID_ALIASES = {};

// 연속 강화 방침 { degrade: 'A'|'B', protect: 'use'|'skip' }. 둘 다 올바를 때만 읽는다.
export function normalizeAutoPolicy(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  if (raw.degrade !== 'A' && raw.degrade !== 'B') return undefined;
  if (raw.protect !== 'use' && raw.protect !== 'skip') return undefined;
  return { degrade: raw.degrade, protect: raw.protect };
}

// 알 수 없는 값·잘못된 타입은 기본값으로 대체
export function normalizeProgress(raw, forms = FORMS) {
  const base = createProgress();
  if (!raw || typeof raw !== 'object') return base;
  for (const k of ['yoryeok', 'alignment', 'protect', 'shards', 'pity']) {
    if (isNum(raw[k])) base[k] = raw[k];
  }
  const formId = Object.hasOwn(FORM_ID_ALIASES, raw.formId) ? FORM_ID_ALIASES[raw.formId] : raw.formId;
  const form = forms.find((f) => f.id === formId && f.stage === raw.stage);
  if (form) {
    base.formId = form.id;
    base.stage = form.stage;
  }
  if (typeof raw.grade === 'string') base.grade = raw.grade;
  for (const k of Object.keys(base.diet)) if (isNum(raw.diet?.[k])) base.diet[k] = raw.diet[k];
  // 이전 저장본의 '대표 효과'(signature) 레벨은 같은 레벨의 '생명력'(vitality)으로 옮기고 signature는 버린다.
  const rawEnh = raw.enh && typeof raw.enh === 'object' ? { ...raw.enh } : {};
  if (!isNum(rawEnh.vitality) && isNum(rawEnh.signature)) rawEnh.vitality = rawEnh.signature;
  // 강화 레벨은 0~ENHANCE.outcomes.length(20)의 정수로 읽는다. 최고 레벨이 10에서 20으로 늘어도(변경 이력 22) 옛 저장본(0~10)은 그대로 유효하고 SAVE.version은 그대로다.
  // 범위를 벗어나거나 소수인 값은 가장 가까운 정수로 보정한다(예전에는 거르지 않아 enhanceCost가 RangeError를 냈다).
  for (const k of Object.keys(base.enh)) if (isNum(rawEnh[k])) base.enh[k] = Math.max(0, Math.min(ENHANCE.outcomes.length, Math.trunc(rawEnh[k])));
  // 장착 칸·보관함의 물건은 { kind, level, paid? }로 읽는다(docs/design-weapons.md 7절): kind가 없으면 여의주, 레벨이 0~15 정수가 아니면 버리고,
  // 보관함은 TREASURE.inventorySlots(5칸)을 넘으면 앞에서부터 남긴다. SAVE.version은 그대로다(필드 추가는 '없으면 기본값'으로 읽는다).
  base.treasure = normalizeItem(raw.treasure);
  if (Array.isArray(raw.inventory)) {
    base.inventory = raw.inventory.map(normalizeItem).filter(Boolean).slice(0, TREASURE.inventorySlots);
  }
  if (Array.isArray(raw.discovered)) {
    base.discovered = raw.discovered.filter((x) => typeof x === 'string').map((x) => (Object.hasOwn(FORM_ID_ALIASES, x) ? FORM_ID_ALIASES[x] : x));
  }
  const pending = raw.pendingDegrade === 'signature' ? 'vitality' : raw.pendingDegrade;
  if (ENHANCE.stats.includes(pending)) base.pendingDegrade = pending;
  // 보호권 선택 대기(변경 이력 23): 굴림이 끝나고 선택만 남은 상태. 강화 레벨·장착 보물과 맞지 않으면 버린다. 퇴화 선택(pendingDegrade)과 함께 있을 수 없어 보호권 쪽이 앞선다.
  const protectPending = normalizePendingProtect(raw.pendingProtect, base);
  if (protectPending) {
    base.pendingProtect = protectPending;
    delete base.pendingDegrade;
  }
  // 역진화 예약: true(한 단계) 또는 2 이상의 정수(연속 강화가 쌓은 단계 수, 내릴 수 있는 만큼까지).
  const devolve = normalizeDevolve(raw.pendingDevolve, base.stage);
  if (devolve !== undefined) base.pendingDevolve = devolve;
  // 연속 강화에서 마지막으로 고른 방침(다음에 창을 열 때 먼저 골라 둔다). 알 수 없는 값은 버린다.
  const auto = normalizeAutoPolicy(raw.autoEnhance);
  if (auto) base.autoEnhance = auto;
  // 기존 저장은 노말이고 하드의 목숨은 0~10 정수다.
  base.difficulty = normalizeDifficulty(raw.difficulty);
  if (hasLives(base.difficulty)) {
    base.lives = Number.isInteger(raw.lives) ? Math.max(0, Math.min(DIFFICULTY.hardLives, raw.lives)) : DIFFICULTY.hardLives;
  }
  return base;
}

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// ---- 저장 슬롯 3칸 ----
// 슬롯 n의 저장 키는 slotKey(n), 지금 고른 슬롯 번호는 CURRENT_SLOT_KEY에 적는다.
// 예전 단일 저장본(SAVE.key)은 처음 읽을 때 1번 슬롯으로 옮긴다(migrateLegacySave).
export const SLOT_COUNT = 3;
export const slotKey = (slot) => `${SAVE.key}-slot-${slot}`;
export const CURRENT_SLOT_KEY = `${SAVE.key}-current-slot`;
export const MIGRATED_KEY = `${SAVE.key}-migrated`;

export const isValidSlot = (slot) => Number.isInteger(slot) && slot >= 1 && slot <= SLOT_COUNT;

// 예전 단일 저장본을 1번 슬롯으로 한 번만 옮긴다. 원문 그대로 복사하고(손상본도 그대로),
// 1번 슬롯이 이미 있으면 덮어쓰지 않는다. 옮긴 표시를 남겨 두므로 슬롯을 지워도 옛 저장본이 되살아나지 않는다.
export function migrateLegacySave(storage = defaultStorage()) {
  if (!storage) return false;
  try {
    if (storage.getItem(MIGRATED_KEY) != null) return false;
    const legacy = storage.getItem(SAVE.key);
    let moved = false;
    if (legacy != null && storage.getItem(slotKey(1)) == null) {
      storage.setItem(slotKey(1), legacy);
      storage.removeItem(SAVE.key);
      moved = true;
    }
    storage.setItem(MIGRATED_KEY, '1');
    return moved;
  } catch {
    return false;
  }
}

// 기억해 둔 슬롯 번호. 없거나 이상하면 1번.
export function getCurrentSlot(storage = defaultStorage()) {
  if (!storage) return 1;
  try {
    const slot = Number(storage.getItem(CURRENT_SLOT_KEY));
    return isValidSlot(slot) ? slot : 1;
  } catch {
    return 1;
  }
}

export function setCurrentSlot(slot, storage = defaultStorage()) {
  if (!storage || !isValidSlot(slot)) return false;
  try {
    storage.setItem(CURRENT_SLOT_KEY, String(slot));
    return true;
  } catch {
    return false;
  }
}

// 저장소에 실제로 쓸 수 있는지(사생활 보호 모드·용량 초과면 false). 시작 화면이 안내에 쓴다.
export function canSave(storage = defaultStorage()) {
  if (!storage) return false;
  const probe = `${SAVE.key}-probe`;
  try {
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

// 자동 저장은 slot을 안 주면 지금 슬롯에 쓴다.
export function saveProgress(p, storage = defaultStorage(), slot = getCurrentSlot(storage)) {
  if (!storage || !isValidSlot(slot)) return false;
  // 종료 이벤트와 다른 자동 저장도 같은 경로를 지난다. 소멸한 캐릭터를 다시 쓰지 않는다.
  if (hasLives(p?.difficulty) && p.lives === 0) return clearSave(storage, slot);
  migrateLegacySave(storage);
  try {
    const difficulty = normalizeDifficulty(p.difficulty);
    const progress = { ...p, difficulty, lives: hasLives(difficulty) ? p.lives : undefined };
    storage.setItem(slotKey(slot), JSON.stringify({ version: SAVE.version, savedAt: Date.now(), progress }));
    return true;
  } catch {
    return false;
  }
}

// 슬롯 한 칸을 읽어 { status, data? }로 돌려준다. status = 'ok' | 'empty'(저장 없음) | 'corrupt'(손상·버전 불일치)
function readSlot(storage, slot) {
  if (!storage || !isValidSlot(slot)) return { status: 'empty' };
  migrateLegacySave(storage);
  let text;
  try {
    text = storage.getItem(slotKey(slot));
  } catch {
    return { status: 'corrupt' };
  }
  if (text == null) return { status: 'empty' };
  try {
    const data = JSON.parse(text);
    if (!data || data.version !== SAVE.version || !data.progress || typeof data.progress !== 'object') {
      return { status: 'corrupt' };
    }
    if (hasLives(data.progress.difficulty) && Number.isInteger(data.progress.lives) && data.progress.lives <= 0) {
      clearSave(storage, slot);
      return { status: 'empty' };
    }
    return { status: 'ok', data };
  } catch {
    return { status: 'corrupt' };
  }
}

// {progress, status}: status = 'ok' | 'new'(저장 없음) | 'corrupt'(손상·버전 불일치, 새로 시작)
export function loadProgressWithStatus(storage = defaultStorage(), slot = getCurrentSlot(storage)) {
  const read = readSlot(storage, slot);
  if (read.status === 'ok') return { progress: normalizeProgress(read.data.progress), status: 'ok' };
  return { progress: createProgress(), status: read.status === 'empty' ? 'new' : 'corrupt' };
}

export function loadProgress(storage = defaultStorage(), slot = getCurrentSlot(storage)) {
  return loadProgressWithStatus(storage, slot).progress;
}

export function clearSave(storage = defaultStorage(), slot = getCurrentSlot(storage)) {
  if (!isValidSlot(slot)) return false;
  try {
    migrateLegacySave(storage);
    storage?.removeItem(slotKey(slot));
    return true;
  } catch {
    return false;
  }
}

// 시작 화면용 요약: { slot, status: 'empty'|'ok'|'corrupt', formId, formName, stage, grade, yoryeok, savedAt, difficulty, lives }
// 'ok'가 아니면 나머지 값은 null이다. 형태가 사라졌으면 미물 1단계로 보정된 값(normalizeProgress)을 보여 준다. lives는 하드만 숫자, 아니면 null.
export function summarizeSlot(slot, storage = defaultStorage(), forms = FORMS) {
  const read = readSlot(storage, slot);
  const blank = { slot, status: read.status, formId: null, formName: null, stage: null, grade: null, yoryeok: null, savedAt: null, difficulty: null, lives: null };
  if (read.status !== 'ok') return blank;
  const progress = normalizeProgress(read.data.progress, forms);
  const form = forms.find((f) => f.id === progress.formId);
  return {
    ...blank,
    formId: progress.formId,
    formName: form?.name ?? progress.formId,
    stage: progress.stage,
    grade: progress.grade,
    yoryeok: progress.yoryeok,
    savedAt: isNum(read.data.savedAt) ? read.data.savedAt : null,
    difficulty: progress.difficulty,
    lives: progress.lives,
  };
}

export function listSlots(storage = defaultStorage(), forms = FORMS) {
  return Array.from({ length: SLOT_COUNT }, (_, i) => summarizeSlot(i + 1, storage, forms));
}

// 슬롯을 처음 상태로 만들어 저장하고 지금 슬롯으로 기억한다([새로 시작]). 저장에 실패하면 false.
// difficulty를 안 주면 노말. 하드는 목숨 10개로 시작한다.
export function newSlotProgress(difficulty = DIFFICULTY.default) {
  const progress = createProgress();
  progress.difficulty = normalizeDifficulty(difficulty);
  progress.lives = livesFor(progress.difficulty);
  return progress;
}

export function startNewSlot(slot, storage = defaultStorage(), difficulty = DIFFICULTY.default) {
  if (!isValidSlot(slot)) return false;
  if (!saveProgress(newSlotProgress(difficulty), storage, slot)) return false;
  setCurrentSlot(slot, storage);
  return true;
}
