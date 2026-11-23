// 강화 20단계·비용 곡선(사용자 지시 2026-11-24, docs/plan.md 변경 이력 22).
// 본체 능력(성장·속도·생명력)은 +20까지, 비용은 1~5레벨 1.6배씩·5레벨 이후 2배씩. 보물 강화(+15)는 레벨 수는 그대로고 비용 곡선만 같은 모양(지금은 둘 다 2배)이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { createProgress } from '../src/systems/progress.js';
import { ENHANCE, TREASURE, statUpgradeText } from '../src/systems/tuning-upgrade.js';
import { ABILITY_LEVEL } from '../src/systems/tuning-abilities.js';
import { applyDegradeChoice, enhanceCost, enhanceTable, getEnhanceOdds, tryEnhance } from '../src/systems/enhance.js';
import { costMultiplier, effectiveLevel } from '../src/systems/enhance-curve.js';
import { quickEnhanceCost } from '../src/systems/levelup.js';
import { sellPrice, tablePrice, treasureTable, tryUpgrade, upgradeCost, upgradeOdds } from '../src/systems/treasure.js';
import { buy, buyPrice, shopLevels } from '../src/systems/shop.js';
import { WEAPON_IDS } from '../src/data/weapons.js';
import { playerSpeedMultiplier } from '../src/systems/balance.js';
import { boosterMult } from '../src/game/booster.js';
import { playerStats } from '../src/game/session.js';
import { vitalityMax } from '../src/systems/vitality.js';
import { SAVE } from '../src/systems/tuning-evolution.js';
import { loadProgress, normalizeProgress, saveProgress } from '../src/state/save.js';
import { LevelTable } from '../src/ui/OddsTable.js';

const near = (actual, expected, eps = 1e-9) => assert.ok(Math.abs(actual - expected) <= eps, actual + ' !≈ ' + expected);
const MAX = ENHANCE.outcomes.length;

function seeded(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('최고 레벨: 본체 능력은 20, 속도 상한 설정도 20, 보물은 그대로 15', () => {
  assert.equal(MAX, 20);
  assert.equal(ENHANCE.outcomes.length, MAX);
  assert.equal(CONFIG.pace.maxSpeedLevel, MAX);
  assert.equal(CONFIG.balance.pace.maxSpeedLevel, MAX);
  assert.equal(TREASURE.success.length, 15);
  assert.equal(TREASURE.breakOnFailure.length, 15);
  // 종족 능력 수치(abilities.js)는 보물 강화 레벨을 읽는다. 보물이 +15까지라 상한도 15다.
  assert.equal(ABILITY_LEVEL.maxLevel, 15);
});

test('비용 곡선 설정: 1~5레벨 1.6배씩, 5레벨 이후 2배씩. 보물은 +5까지도 이후도 2배', () => {
  assert.deepEqual({ ...CONFIG.enhanceCost, treasure: undefined }, { softGrowth: 1.6, hardFrom: 5, hardGrowth: 2, treasure: undefined });
  assert.deepEqual(CONFIG.enhanceCost.treasure, { softGrowth: 2, hardFrom: 5, hardGrowth: 2 });
  assert.equal(CONFIG.enhanceCostGrowth, 2); // 판 안 몸집 강화·적의 몸집 강화가 쓴다
});

test('costMultiplier: 레벨 0은 1배, hardFrom까지 soft^레벨, 그 위는 hard가 레벨마다 곱해진다', () => {
  const curve = { softGrowth: 1.5, hardFrom: 3, hardGrowth: 4 };
  near(costMultiplier(0, curve), 1);
  near(costMultiplier(1, curve), 1.5);
  near(costMultiplier(3, curve), 3.375);
  near(costMultiplier(4, curve), 3.375 * 4);
  near(costMultiplier(6, curve), 3.375 * 64);
  for (let level = 1; level <= 30; level++) {
    const ratio = costMultiplier(level) / costMultiplier(level - 1);
    near(ratio, level <= CONFIG.enhanceCost.hardFrom ? CONFIG.enhanceCost.softGrowth : CONFIG.enhanceCost.hardGrowth, 1e-9);
  }
});

test('본체 강화 비용 +0 → +20: 1~5레벨은 1.6배씩, 5레벨 이후는 레벨마다 2배(반올림 한 번)', () => {
  const costs = Array.from({ length: MAX }, (_, level) => enhanceCost(level));
  assert.deepEqual(costs, [
    20, 32, 51, 82, 131, 210,
    419, 839, 1678, 3355, 6711, 13422, 26844, 53687, 107374, 214748, 429497, 858993, 1717987, 3435974,
  ]);
  assert.equal(enhanceCost(MAX), Infinity);
  assert.throws(() => enhanceCost(MAX + 1), RangeError);
  // 5레벨 이후 한 레벨 올릴 때 비용은 정확히 두 배다(반올림 오차 1 이내).
  for (let level = 6; level < MAX; level++) assert.ok(Math.abs(costs[level] - 2 * costs[level - 1]) <= 1, level + '');
  // 5레벨까지는 완만하다: 예전 2배 곡선(20 × 2^레벨)보다 싸다.
  for (let level = 1; level <= 5; level++) assert.ok(costs[level] < 20 * 2 ** level, level + '');
  assert.equal(costs[5], Math.round(20 * 1.6 ** 5)); // 예전 1.6배 곡선의 +5 값 210 그대로
});

test('판 안 능력 +1 카드 비용은 본체 강화 비용 × quickEnhanceCostMult로 같은 곡선을 따른다', () => {
  for (let level = 0; level < MAX; level++) {
    assert.equal(quickEnhanceCost(level), Math.round(enhanceCost(level) * CONFIG.levelUp.quickEnhanceCostMult), level + '');
  }
  assert.equal(quickEnhanceCost(MAX), Infinity);
});

test('보물 강화 비용(여의주·보패 8종 공통): +5까지 지금 그대로, +5 이후 레벨마다 2배', () => {
  const costs = Array.from({ length: 15 }, (_, level) => upgradeCost(level));
  assert.deepEqual(costs, [2, 4, 7, 14, 29, 58, 115, 230, 461, 922, 1843, 3686, 7373, 14746, 29491]);
  assert.equal(upgradeCost(15), Infinity);
  for (let level = 6; level < 15; level++) assert.ok(Math.abs(costs[level] - 2 * costs[level - 1]) <= 1, level + '');
  for (const kind of WEAPON_IDS) {
    for (let level = 0; level < 15; level++) assert.equal(upgradeCost({ kind, level }), costs[level], kind + ' +' + level);
  }
});

test('보물 비용 곡선은 treasure.hardGrowth 한 값으로 +5 이후만 가파르게 바꿀 수 있다(설정을 되돌려 시험)', () => {
  const t = CONFIG.enhanceCost.treasure;
  const saved = t.hardGrowth;
  try {
    t.hardGrowth = 4;
    assert.equal(upgradeCost(5), 58); // +5 시도까지는 그대로
    assert.equal(upgradeCost(4), 29);
    assert.equal(upgradeCost(6), Math.round(1.8 * 32 * 4)); // 첫 비용 1.8(= 가격 9 × 0.2) × 2^5 × 4
    assert.ok(upgradeCost(14) > 15_000_000 && upgradeCost(14) < 15_200_000, upgradeCost(14) + '');
  } finally {
    t.hardGrowth = saved;
  }
  assert.equal(upgradeCost(14), 29491);
});

test('보물 판매가·본전 상한은 강화 비용 곡선과 무관하다: 상점품은 어떤 경로로도 이득이 없다', () => {
  assert.deepEqual([0, 5, 10, 15].map((level) => tablePrice(level)), [5, 300, 5000, 100000]);
  for (const kind of WEAPON_IDS) {
    for (const from of shopLevels()) {
      const p = createProgress();
      p.yoryeok = 1e9;
      const bought = buy(p, kind, from);
      if (!bought.ok) continue; // 해금 전 보물
      const item = p.inventory[0];
      const spent = buyPrice(kind, from);
      assert.equal(item.paid, spent);
      // 끝까지(성공만 하는 가장 비싼 경로) 강화한 뒤 팔아도 min(표 판매가, paid) ≤ paid라 이득이 없다.
      let invested = spent;
      while (item.level < TREASURE.success.length) {
        const cost = upgradeCost(item);
        invested += cost;
        tryUpgrade(item, { rng: () => 0 });
        assert.equal(item.paid, invested, kind + ' +' + item.level);
        assert.ok(sellPrice(item) <= item.paid, kind + ' +' + item.level);
      }
    }
  }
  // 드롭 여의주(paid 없음)는 예전처럼 표 판매가라 '강화해서 팔기'가 이익이다: 누적 강화비 < 판매가.
  let cumulative = 0;
  for (let level = 0; level < 15; level++) cumulative += upgradeCost(level);
  assert.equal(cumulative, 58981);
  assert.ok(cumulative < tablePrice(15), cumulative + ' ≥ ' + tablePrice(15));
});

// 확률표(사용자 지시 2026-11-24, 변경 이력 23): 5단계(+5로 올리는 시도) = 성공 50·대성공 20·실패 20·퇴화 10, 20단계 = 성공 4·대성공 1·실패 55·퇴화 40.
// 그 사이는 선형 보간(소수 첫째 자리 반올림, 합 100은 실패 칸에서 맞춤), +1~+4는 퇴화 0·대성공 20·실패 5씩 늘려 +5의 20에 닿는다.
test('확률표: 20칸, 고정점 두 줄이 정확하고 모든 줄의 합은 100이다', () => {
  const rows = enhanceTable();
  assert.equal(rows.length, MAX);
  assert.deepEqual(ENHANCE.outcomes[4], { success: 50, great: 20, fail: 20, degrade: 10 }); // 5단계
  assert.deepEqual(ENHANCE.outcomes[19], { success: 4, great: 1, fail: 55, degrade: 40 }); // 20단계
  rows.forEach((r, level) => {
    assert.equal(r.level, level);
    assert.equal(r.to, level + 1);
    assert.equal(r.cost, enhanceCost(level));
    near(r.success + r.great + r.fail + r.degrade, 100, 1e-9);
    assert.deepEqual({ success: r.success, great: r.great, fail: r.fail, degrade: r.degrade }, ENHANCE.outcomes[level]);
    const p = createProgress();
    p.enh.growth = level;
    assert.deepEqual(getEnhanceOdds(p, 'growth'), ENHANCE.outcomes[level], '표시 확률 = 표 (천장 0) +' + (level + 1));
    for (const value of Object.values(ENHANCE.outcomes[level])) assert.ok(value >= 0 && value <= 100);
  });
  assert.equal(ENHANCE.greatLevels, 2, '대성공은 지금처럼 +2');
  assert.equal(ENHANCE.pityStep, 5);
});

test('확률표: 성공·대성공은 내려가기만 하고 실패·퇴화는 올라가기만 한다(+1~+20 전체)', () => {
  const rows = ENHANCE.outcomes;
  for (let level = 1; level < MAX; level++) {
    assert.ok(rows[level].success <= rows[level - 1].success, '성공 +' + (level + 1));
    assert.ok(rows[level].great <= rows[level - 1].great, '대성공 +' + (level + 1));
    assert.ok(rows[level].fail >= rows[level - 1].fail, '실패 +' + (level + 1));
    assert.ok(rows[level].degrade >= rows[level - 1].degrade, '퇴화 +' + (level + 1));
  }
  // +6~+19는 두 고정점 사이에서 단계마다 일정하게 움직인다(소수 첫째 자리 반올림 오차 0.1 이내).
  for (let level = 5; level < MAX; level++) {
    const t = (level - 4) / 15;
    for (const key of ['success', 'great', 'degrade']) {
      const line = rows[4][key] + (rows[19][key] - rows[4][key]) * t;
      assert.ok(Math.abs(rows[level][key] - line) <= 0.05 + 1e-9, key + ' +' + (level + 1) + ' ' + rows[level][key] + ' vs ' + line);
    }
    // 합 100은 실패 칸이 맞춘다(선형값과 0.15 이내).
    const failLine = rows[4].fail + (rows[19].fail - rows[4].fail) * t;
    assert.ok(Math.abs(rows[level].fail - failLine) <= 0.15 + 1e-9, 'fail +' + (level + 1));
  }
  // +1~+4: 퇴화 0, 대성공 20(+5와 같다), 실패는 5·10·15·20.
  for (let level = 0; level < 4; level++) {
    assert.equal(rows[level].degrade, 0);
    assert.equal(rows[level].great, 20);
    assert.equal(rows[level].fail, 5 * (level + 1));
  }
});

test('천장(pity): 얹은 %p는 총 성공(성공+대성공)에 더해지고, 대성공 몫과 퇴화 몫은 표대로 나뉜다', () => {
  const p = createProgress();
  p.enh.growth = 4; // +5 시도: 총 성공 70(대성공 몫 2/7), 실패 30 중 퇴화 몫 1/3
  p.pity = 10;
  const odds = getEnhanceOdds(p, 'growth');
  near(odds.success + odds.great, 80);
  near(odds.great, 80 * 20 / 70);
  near(odds.fail + odds.degrade, 20);
  near(odds.degrade, 20 / 3);
  near(odds.success + odds.great + odds.fail + odds.degrade, 100);
  p.pity = 100; // 100 상한
  assert.deepEqual(getEnhanceOdds(p, 'growth').fail, 0);
  assert.deepEqual(getEnhanceOdds(p, 'growth').degrade, 0);
});

test('천장(pity): 어느 레벨에서든 실패가 쌓이면 성공률이 100%에 닿아 막히지 않는다(최대 20번)', () => {
  for (let level = 0; level < MAX; level++) {
    const p = createProgress();
    p.enh.speed = level;
    p.protect = 1e9;
    let attempts = 0;
    while (p.enh.speed === level) {
      tryEnhance(p, 'speed', { rng: () => 0.999999, protect: 'use' }); // 항상 실패 쪽 굴림
      assert.ok(++attempts <= 20, '+' + level + ' 천장이 안 쌓인다');
    }
    const total = ENHANCE.outcomes[level].success + ENHANCE.outcomes[level].great;
    assert.equal(attempts, Math.ceil((100 - total) / ENHANCE.pityStep) + 1, '+' + level);
  }
});

test('+19 → +20 시도: 대성공이어도 최고 레벨 20을 넘지 않는다', () => {
  const p = createProgress();
  p.enh.growth = 19;
  const queue = [0, 0];
  const result = tryEnhance(p, 'growth', { rng: () => queue.shift() });
  assert.deepEqual([result.result, result.from, result.to], ['great', 19, 20]);
  assert.equal(p.enh.growth, 20);
});

test('퇴화 선택(A: −1레벨)은 +20 가까이에서도 같다', () => {
  const p = createProgress();
  p.enh.vitality = 15;
  const queue = [0.999999, 0.1];
  const result = tryEnhance(p, 'vitality', { rng: () => queue.shift() });
  assert.equal(result.result, 'degrade');
  assert.deepEqual(applyDegradeChoice(p, 'A', 'vitality'), { ok: true });
  assert.equal(p.enh.vitality, 14);
});

test('모의 시험(시드 고정): 레벨을 지키면(B 선택·보호권) +20까지 평균 약 38번, A만 골라도 +20까지 닿는다(평균 약 119번)', () => {
  // 레벨을 지키는 정책: 퇴화가 나와도 레벨을 잃지 않는다(보호권 자동 사용). 처음부터 +20까지 시도 횟수와 쓴 요력. 정확한 기대값(마르코프 풀이)은 38번·약 2,590만.
  const guard = { attempts: 0, yoryeok: 0, protects: 0 };
  const runs = 300;
  for (let i = 0; i < runs; i++) {
    const p = createProgress();
    p.protect = 1e9;
    const rng = seeded(i + 11);
    while (p.enh.growth < MAX) {
      guard.yoryeok += enhanceCost(p.enh.growth);
      guard.attempts++;
      if (tryEnhance(p, 'growth', { rng, protect: 'use' }).protectedUsed) guard.protects++;
    }
  }
  const meanAttempts = guard.attempts / runs;
  assert.ok(meanAttempts > 32 && meanAttempts < 44, '레벨을 지키는 평균 시도 ' + meanAttempts);
  const meanYoryeok = guard.yoryeok / runs;
  // 실패 없이 한 번에 오르는 비용(합 6,872,054)의 3~5배(기대 약 3.8배).
  assert.ok(meanYoryeok > 3 * 6_872_054 && meanYoryeok < 5 * 6_872_054, '평균 요력 ' + meanYoryeok);
  assert.ok(guard.protects / runs > 6 && guard.protects / runs < 12, '보호권 평균 ' + guard.protects / runs);

  // A만 고르는 정책(퇴화하면 한 레벨 내려감, 보호권 없음): 퇴화 확률이 낮아져 +20까지 닿는다(기대 약 119번). 보호권·B로 지키는 것보다 3배쯤 든다.
  let attempts = 0, worst = 0;
  const trials = 100;
  for (let i = 0; i < trials; i++) {
    const p = createProgress();
    const rng = seeded(1000 + i);
    let n = 0;
    while (p.enh.speed < MAX && n < 50_000) {
      n++;
      const r = tryEnhance(p, 'speed', { rng });
      if (r.needsChoice) applyDegradeChoice(p, 'A', 'speed');
    }
    assert.equal(p.enh.speed, MAX, '시드 ' + i + '는 ' + n + '번 안에 +20에 닿지 못했다');
    attempts += n;
    worst = Math.max(worst, n);
  }
  assert.ok(attempts / trials > 80 && attempts / trials < 170, 'A만 평균 ' + attempts / trials);
  assert.ok(worst < 2000, '가장 오래 걸린 판 ' + worst);
});

test('보물 확률표: 15칸, 성공 + 실패 + 깨짐 = 100, 성공률은 그 무기의 것(여의주 × 배율), 비용은 upgradeCost와 같다(무기 8종)', () => {
  for (const kind of WEAPON_IDS) {
    const rows = treasureTable(kind);
    assert.equal(rows.length, 15);
    rows.forEach((r, level) => {
      near(r.success + r.fail + r.break, 100, 1e-9);
      assert.deepEqual({ success: r.success, fail: r.fail, break: r.break }, upgradeOdds(level, kind));
      assert.equal(r.cost, upgradeCost({ kind, level }));
      assert.equal(r.to, level + 1);
    });
  }
});

test('효과 레벨: +10까지 1레벨 1, 그 위는 절반(+20 = 15), 이상한 입력은 0', () => {
  assert.deepEqual({ kneeAt: CONFIG.progression.kneeAt, kneeSlope: CONFIG.progression.kneeSlope }, { kneeAt: 10, kneeSlope: 0.5 });
  for (let level = 0; level <= 10; level++) near(effectiveLevel(level), level);
  near(effectiveLevel(11), 10.5);
  near(effectiveLevel(15), 12.5);
  near(effectiveLevel(20), 15);
  for (const bad of [-5, NaN, undefined, null, Infinity - Infinity]) assert.equal(effectiveLevel(bad), 0);
});

test('레벨별 효과: +10은 예전 최고와 같고 +20은 성장 ×2.2·속도 ×1.6·생명력 13초(직선이면 ×2.6·×1.8·16초)', () => {
  const at = (stat, level) => {
    const p = createProgress();
    p.enh[stat] = level;
    return p;
  };
  const base = CONFIG.eating.areaGain;
  near(playerStats(at('growth', 0)).areaGain, base);
  near(playerStats(at('growth', 10)).areaGain, base * 1.8);
  near(playerStats(at('growth', 20)).areaGain, base * 2.2);
  near(vitalityMax(0), 4);
  near(vitalityMax(10), 10);
  near(vitalityMax(20), 13);
  near(playerStats(at('vitality', 20)).vitalityMax, 13);
  near(playerSpeedMultiplier(at('speed', 10)) / CONFIG.balance.pace.baseMult, 1.4);
  near(playerSpeedMultiplier(at('speed', 20)) / CONFIG.balance.pace.baseMult, 1.6);
  near(boosterMult(at('speed', 10), { id: 'mimul' }), 1.5);
  near(boosterMult(at('speed', 20), { id: 'mimul' }), 1.6);
  // 레벨이 오를수록 효과는 항상 커지고(감소 없음), +10 이후 한 레벨의 증가폭은 그 전의 절반이다.
  for (let level = 1; level <= 20; level++) {
    const gain = playerStats(at('growth', level)).areaGain - playerStats(at('growth', level - 1)).areaGain;
    near(gain, base * CONFIG.progression.growthPerLevel * (level <= 10 ? 1 : 0.5));
  }
});

test('능력 카드 문구: 지금 → 다음 레벨 효과, +10 이후는 증가폭이 절반이다', () => {
  assert.equal(statUpgradeText('growth', 0, false), '먹을 때 자라는 양 +0% → +8%');
  assert.equal(statUpgradeText('growth', 9, false), '먹을 때 자라는 양 +72% → +80%');
  assert.equal(statUpgradeText('growth', 10, false), '먹을 때 자라는 양 +80% → +84%');
  assert.equal(statUpgradeText('growth', 20, true), '먹을 때 자라는 양 +120%');
  assert.equal(statUpgradeText('speed', 0, false), '이동 속도 +0% → +4%');
  assert.equal(statUpgradeText('speed', 10, false), '이동 속도 +40% → +42%');
  assert.equal(statUpgradeText('speed', 20, true), '이동 속도 +60%');
  assert.equal(statUpgradeText('vitality', 9, false), '굶을 때 쓸 생명력 9.4초 → 10초');
  assert.equal(statUpgradeText('vitality', 10, false), '굶을 때 쓸 생명력 10초 → 10.3초');
  assert.equal(statUpgradeText('vitality', 20, true), '굶을 때 쓸 생명력 13초');
});

test('저장: 강화 레벨은 0~20 정수로 읽고(옛 저장 0~10은 그대로), SAVE.version·키는 바뀌지 않는다', () => {
  assert.equal(SAVE.version, 1);
  assert.equal(SAVE.key, 'yokai-proto-v1');
  assert.deepEqual(normalizeProgress({ enh: { growth: 10, speed: 3, vitality: 0 } }).enh, { growth: 10, speed: 3, vitality: 0 });
  assert.deepEqual(normalizeProgress({ enh: { growth: 20, speed: 15, vitality: 11 } }).enh, { growth: 20, speed: 15, vitality: 11 });
  assert.deepEqual(normalizeProgress({ enh: { growth: 99, speed: -4, vitality: 7.9 } }).enh, { growth: 20, speed: 0, vitality: 7 });
  assert.deepEqual(normalizeProgress({ enh: { growth: 'x', speed: null } }).enh, { growth: 0, speed: 0, vitality: 0 });
  // 보정한 값으로 비용을 구해도 RangeError가 나지 않는다.
  const loaded = normalizeProgress({ enh: { growth: 999, speed: 21, vitality: 1e9 } });
  for (const stat of ENHANCE.stats) assert.equal(enhanceCost(loaded.enh[stat]), Infinity);

  const m = new Map();
  const storage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) };
  const p = createProgress();
  p.enh = { growth: 20, speed: 14, vitality: 11 };
  assert.equal(saveProgress(p, storage), true);
  assert.deepEqual(loadProgress(storage).enh, { growth: 20, speed: 14, vitality: 11 });
  assert.equal(JSON.parse([...m.values()].find((v) => v.startsWith('{"version"'))).version, 1);
});

test('LevelTable: 머리 한 줄 + 데이터 줄, 첫 칸은 th, current 줄은 표시한다', () => {
  const made = [];
  const create = (tag) => {
    const node = { tag, children: [], dataset: {}, attrs: {}, className: '', textContent: '' };
    node.append = (...kids) => { node.children.push(...kids); };
    node.setAttribute = (k, v) => { node.attrs[k] = v; };
    made.push(node);
    return node;
  };
  const before = globalThis.document;
  globalThis.document = { createElement: create };
  try {
    const table = LevelTable('제목', ['단계', '성공'], [['+1', '95'], ['+2', '90']], 1);
    assert.equal(table.tag, 'table');
    assert.equal(table.attrs['aria-label'], '제목');
    const [thead, tbody] = table.children;
    assert.equal(thead.children[0].children.map((c) => c.textContent).join(), '단계,성공');
    assert.equal(tbody.children.length, 2);
    assert.deepEqual(tbody.children[0].children.map((c) => c.tag), ['th', 'td']);
    assert.equal(tbody.children[1].dataset.current, 'true');
    assert.equal(tbody.children[0].dataset.current, undefined);
  } finally {
    if (before === undefined) delete globalThis.document;
    else globalThis.document = before;
  }
});
