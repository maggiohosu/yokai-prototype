import { SAVE } from '../systems/tuning-evolution.js';
import { createProgress } from '../systems/progress.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// 알 수 없는 값·잘못된 타입은 기본값으로 대체
export function normalizeProgress(raw) {
  const base = createProgress();
  if (!raw || typeof raw !== 'object') return base;
  for (const k of ['yoryeok', 'alignment', 'stage', 'protect', 'shards', 'pity']) {
    if (isNum(raw[k])) base[k] = raw[k];
  }
  if (typeof raw.formId === 'string') base.formId = raw.formId;
  if (typeof raw.grade === 'string') base.grade = raw.grade;
  for (const k of Object.keys(base.diet)) if (isNum(raw.diet?.[k])) base.diet[k] = raw.diet[k];
  for (const k of Object.keys(base.enh)) if (isNum(raw.enh?.[k])) base.enh[k] = raw.enh[k];
  if (raw.treasure && typeof raw.treasure === 'object') base.treasure = raw.treasure;
  if (Array.isArray(raw.inventory)) base.inventory = raw.inventory.filter((x) => x && typeof x === 'object');
  if (Array.isArray(raw.discovered)) base.discovered = raw.discovered.filter((x) => typeof x === 'string');
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
