import { CONFIG } from '../config.js';

// 공명 연쇄(계획서 '변경 이력 5', 근거 docs/research/slotbound.md 6절 R1). Phaser·DOM 의존이 없는 순수 규칙이며 수치는 모두 CONFIG.resonance에 있다.
// 내가 먹은 요괴의 방위(east·west·south·north)가 이어지면 보너스 요력이 터진다. 판정은 먹는 순간 확정이라 확률이 없다.
//   규칙 A 'streak': 같은 방위 streak.length마리 연속.
//   규칙 B 'cycle':  연달아 4마리가 동·서·남·북을 한 번씩(순서는 상관없다).
//   rule 'both'(기본)는 둘 다, 'off'는 끔. 두 규칙은 같은 먹기에서 동시에 터질 수 없다(마지막 3마리가 같은 방위면 마지막 4마리는 서로 다를 수 없다).
// 시간 인자(now)는 판을 진행한 실제 초다(판을 멈춘 동안 늘지 않는 시계). 마지막으로 먹은 뒤 windowSec가 지나면 연쇄가 끊긴다.
const cfg = () => CONFIG.resonance;

export const RESONANCE_DIRS = ['east', 'west', 'south', 'north'];
const RULES = ['streak', 'cycle', 'both', 'off'];

const finite = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback);

// 설정값을 정리한 규칙 이름. 모르는 값은 기본값('both')으로 본다.
export function resonanceRule() {
  const rule = cfg().rule;
  return RULES.includes(rule) ? rule : 'both';
}

const useStreak = (rule) => rule === 'streak' || rule === 'both';
const useCycle = (rule) => rule === 'cycle' || rule === 'both';
const streakLength = () => Math.max(2, Math.floor(finite(cfg().streak.length, 3)));
const CYCLE_LENGTH = RESONANCE_DIRS.length;

// state = { recent: [{ dir, gain, t }] } — 연쇄에 든 최근 먹이(오래된 것부터). 한 번 터지면 비운다.
export function createResonanceState() {
  return { recent: [] };
}

function expired(state, now) {
  const last = state.recent.at(-1);
  return !!last && now - last.t > cfg().windowSec;
}

function trailing(list, accept) {
  const out = [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (!accept(list[i], out)) break;
    out.unshift(list[i]);
  }
  return out;
}

// 끝에서부터 같은 방위가 이어진 먹이들
const sameRun = (list) => trailing(list, (entry, run) => !run.length || entry.dir === run[0].dir);
// 끝에서부터 방위가 서로 다른 먹이들(같은 방위가 나오면 거기서 끊긴다)
const distinctRun = (list) => trailing(list, (entry, run) => !run.some((other) => other.dir === entry.dir));

// 먹이 하나를 기록한다. { dir, gain }: dir = 먹은 요괴의 방위, gain = 그 먹이로 받은 요력.
// 터지면 { rule: 'streak'|'cycle', dir, dirs, count, base, bonus }를 돌려주고 연쇄를 비운다(bonus = 연쇄에 든 먹이 요력의 합 × 규칙별 bonus, 정수). 아니면 null.
// 방위가 네 곳이 아닌 먹이(없음 등)는 세지 않고 연쇄도 끊지 않는다.
export function recordMeal(state, { dir, gain = 0 }, now) {
  const rule = resonanceRule();
  if (rule === 'off' || !RESONANCE_DIRS.includes(dir)) return null;
  if (expired(state, now)) state.recent.length = 0;
  state.recent.push({ dir, gain: Math.max(0, finite(gain, 0)), t: finite(now, 0) });
  const keep = Math.max(streakLength(), CYCLE_LENGTH);
  if (state.recent.length > keep) state.recent.splice(0, state.recent.length - keep);

  let hit = null;
  if (useStreak(rule)) {
    const run = sameRun(state.recent);
    if (run.length >= streakLength()) hit = { rule: 'streak', entries: run.slice(-streakLength()), bonus: cfg().streak.bonus };
  }
  if (!hit && useCycle(rule)) {
    const run = distinctRun(state.recent);
    if (run.length >= CYCLE_LENGTH) hit = { rule: 'cycle', entries: run.slice(-CYCLE_LENGTH), bonus: cfg().cycle.bonus };
  }
  if (!hit) return null;
  state.recent.length = 0;
  const base = hit.entries.reduce((sum, entry) => sum + entry.gain, 0);
  return {
    rule: hit.rule,
    dir: hit.rule === 'streak' ? hit.entries[0].dir : null,
    dirs: hit.entries.map((entry) => entry.dir),
    count: hit.entries.length,
    base,
    bonus: Math.round(base * Math.max(0, finite(hit.bonus, 0))),
  };
}

// HUD 표시용. 끊긴 연쇄(windowSec 경과)는 비어 있는 것으로 돌려준다.
//   { rule, streak: { dir|null, count, length }, cycle: { dirs: [방위...], length }, remainSec }
//   streak.count = 끝에서부터 이어진 같은 방위 수, cycle.dirs = 끝에서부터 서로 다른 방위들(최대 3칸: 4칸이 차는 순간 터진다).
// 규칙에서 꺼진 쪽은 비운다.
export function resonanceView(state, now) {
  const rule = resonanceRule();
  const empty = expired(state, now) || !state.recent.length;
  const list = empty ? [] : state.recent;
  const run = useStreak(rule) ? sameRun(list) : [];
  const cycle = useCycle(rule) ? distinctRun(list) : [];
  const last = list.at(-1);
  return {
    rule,
    streak: { dir: run[0]?.dir ?? null, count: run.length, length: streakLength() },
    cycle: { dirs: cycle.map((entry) => entry.dir), length: CYCLE_LENGTH },
    remainSec: last ? Math.max(0, cfg().windowSec - (finite(now, 0) - last.t)) : 0,
  };
}
