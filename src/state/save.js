import { SAVE } from '../systems/tuning-evolution.js';
import { createProgress } from '../systems/progress.js';
import { ENHANCE } from '../systems/tuning-upgrade.js';
import { FORMS } from '../data/forms.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// 앞으로 형태 id를 바꿔야 할 때 { 옛id: 새id }를 여기에 적는다(normalizeProgress가 형태 검사 전에 바꾼다). 지금은 비어 있다.
export const FORM_ID_ALIASES = {};

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
  for (const k of Object.keys(base.enh)) if (isNum(rawEnh[k])) base.enh[k] = rawEnh[k];
  if (raw.treasure && typeof raw.treasure === 'object') base.treasure = raw.treasure;
  if (Array.isArray(raw.inventory)) base.inventory = raw.inventory.filter((x) => x && typeof x === 'object');
  if (Array.isArray(raw.discovered)) {
    base.discovered = raw.discovered.filter((x) => typeof x === 'string').map((x) => (Object.hasOwn(FORM_ID_ALIASES, x) ? FORM_ID_ALIASES[x] : x));
  }
  const pending = raw.pendingDegrade === 'signature' ? 'vitality' : raw.pendingDegrade;
  if (ENHANCE.stats.includes(pending)) base.pendingDegrade = pending;
  if (raw.pendingDevolve === true && base.stage > 1) base.pendingDevolve = true;
  return base;
}

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function saveProgress(p, storage = defaultStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(SAVE.key, JSON.stringify({ version: SAVE.version, savedAt: Date.now(), progress: p }));
    return true;
  } catch {
    return false;
  }
}

// {progress, status}: status = 'ok' | 'new'(저장 없음) | 'corrupt'(손상·버전 불일치, 새로 시작)
export function loadProgressWithStatus(storage = defaultStorage()) {
  if (!storage) return { progress: createProgress(), status: 'new' };
  let text;
  try {
    text = storage.getItem(SAVE.key);
  } catch {
    return { progress: createProgress(), status: 'corrupt' };
  }
  if (text == null) return { progress: createProgress(), status: 'new' };
  try {
    const data = JSON.parse(text);
    if (!data || data.version !== SAVE.version || !data.progress || typeof data.progress !== 'object') {
      return { progress: createProgress(), status: 'corrupt' };
    }
    return { progress: normalizeProgress(data.progress), status: 'ok' };
  } catch {
    return { progress: createProgress(), status: 'corrupt' };
  }
}

export function loadProgress(storage = defaultStorage()) {
  return loadProgressWithStatus(storage).progress;
}

export function clearSave(storage = defaultStorage()) {
  try {
    storage?.removeItem(SAVE.key);
    return true;
  } catch {
    return false;
  }
}
