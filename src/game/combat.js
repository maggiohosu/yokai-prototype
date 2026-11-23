import { CONFIG } from '../config.js';
import { sfx } from '../audio/sfx.js';
import { FORM_BY_ID } from '../data/forms.js';
import { STEM_BY_ID } from '../data/stems.js';
import { drawOrb } from '../art/orbs.js';
import { drawWeaponShot } from '../art/weapons.js';
import { gradeMultiplier } from '../systems/evolution.js';
import { TREASURE } from '../systems/tuning-upgrade.js';
import { canEat, stageOf } from '../systems/rules.js';
import { ABILITIES, ABILITY_IDS, ABILITY_RULES } from '../systems/tuning-abilities.js';
import { abilityRuntime, resisted } from '../systems/abilities.js';
import { kindOf, weaponStats } from '../systems/weapons.js';
import { adapt, modsFor } from '../systems/weapon-abilities.js';
import { queryGrid } from './enemyAI.js';
import {
  applyBurn, applyMark, applySlow, burnDamage, createRateGate, isShielded, nowOf, outwardPush, simSeconds,
  takeRate, tryCharm, tryFear, tryFreeze, tryKnock,
} from './status.js';
import {
  BALANCE, drawWeapons, fireWeapon, makeGourdPool, stepBeads, stepEchoes, stepPools, stepSeals, stepWaves,
} from './weaponFire.js';

const tuning = CONFIG.combat;
const TAU = Math.PI * 2;
const MAIN = 0, SPLIT = 1; // 구슬 종류: 여의주가 쏜 구슬 / 분화 갈래
const OUT = 0, BACK = 1; // 회선: 가는 길 / 오는 길

// (x,y)에서 (hx,hy) 방향 부채꼴 안의 '나를 먹을 수 있는'(단계 규칙) 가장 가까운 적.
// 이미 역전된 적(나보다 작아져 도망 중)은 더 이상 위협이 아니므로 표적에서 뺀다.
export function aimTarget(x, y, player, enemies, hx, hy) {
  const cone = Math.cos(tuning.aimHalfAngleDeg * Math.PI / 180);
  let nearest = null;
  let best = tuning.range ** 2;
  for (const enemy of enemies) {
    if (!enemy.sprite.active || enemy.reversed || !canEat(enemy, player)) continue;
    const dx = enemy.x - x, dy = enemy.y - y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq > best || dx * hx + dy * hy < Math.sqrt(distanceSq) * cone) continue;
    nearest = enemy;
    best = distanceSq;
  }
  return nearest;
}

// 후보 목록에서 반경 radius 안·cosCone(-1이면 사방)보다 방향이 가까운 위협 중 가장 가까운 적.
// 위협 = 나를 먹을 수 있고(단계 규칙), 역전되지 않았고, 아군(유예 포함)이 아닌 적.
function pickThreat(list, x, y, player, radius, hx, hy, cosCone, now) {
  let nearest = null;
  let best = radius * radius;
  for (let i = 0; i < list.length; i++) {
    const enemy = list[i];
    // 싼 검사(거리·방향)를 먼저 하고, 더 가까운 후보일 때만 비싼 규칙 검사(canEat)를 한다.
    const dx = enemy.x - x, dy = enemy.y - y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq > best || !enemy.sprite.active) continue;
    if (cosCone > -1 && dx * hx + dy * hy < Math.sqrt(distanceSq) * cosCone) continue;
    if (enemy.reversed || isShielded(enemy, now) || !canEat(enemy, player)) continue;
    nearest = enemy;
    best = distanceSq;
  }
  return nearest;
}

// 격자 조회판 aimTarget(설계 4-6): 전체 적 반복 대신 반경 안의 격자 칸만 본다.
export function aimTargetGrid(grid, x, y, player, radius, hx, hy, cosCone, now, out) {
  return pickThreat(queryGrid(grid, x, y, radius, out), x, y, player, radius, hx, hy, cosCone, now);
}

// 요력 기준 크기: 보물에 깎이기 전 가장 컸던 크기(진화하면 enemy.js가 초기화).
export function rewardSizeOf(enemy) {
  return Math.max(enemy.rewardSize ?? 0, enemy.size);
}

function segDist2(ax, ay, bx, by, px, py) {
  const vx = bx - ax, vy = by - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2)) : 0;
  const dx = ax + vx * t - px, dy = ay + vy * t - py;
  return dx * dx + dy * dy;
}

function makePool(count, fields) {
  return Array.from({ length: count }, () => ({ ...fields }));
}

// 그리기에서 프레임마다 배열을 새로 만들지 않도록 모듈에 둔 상수
const CLOUD_LOBES = [[0, 0.1, 0.62], [-0.45, 0.2, 0.5], [0.45, 0.2, 0.5]];
const BOLT_PASSES = [[3, 0x4c8db8], [1, 0xd2efc8]];
const FREEZE_PASSES = [[4, 0x2f3b57], [2, 0xe4eaee]];
const BURN_SIDES = [-0.35, 0.35];

const BOLT_FIELDS = { until: 0, life: 1, x1: 0, y1: 0, x2: 0, y2: 0, j1: 0, j2: 0 };
const RING_FIELDS = { until: 0, life: 1, x: 0, y: 0, r: 0 };
const BEAM_FIELDS = { until: 0, life: 1, x1: 0, y1: 0, x2: 0, y2: 0, width: 0, echo: false };
const IMPACT_FIELDS = { until: 0, life: 1, x: 0, y: 0, r: 0 };
const ORB_WEAPONS = new Set(['yeouiju', 'fan', 'sword', 'gourd']); // 날아가는 것(구슬 배열)을 쏘는 무기
const WEAPON_COUNTERS = ['fires', 'beamHits', 'contactHits', 'burstHits', 'ringHits', 'slamHits', 'slams', 'pools', 'poolEnters', 'dropHits', 'shotHits', 'hits'];

export class Combat {
  constructor(scene, progress) {
    this.scene = scene;
    this.progress = progress;
    this.heading = { x: 1, y: 0 };
    this.engagements = new WeakMap();
    this.orbs = [];
    this.target = null;
    this.cooldown = 0;
    this.cooldownMax = tuning.cooldown; // 지금 무기의 쿨타임(발사 버튼 게이지가 cooldown ÷ cooldownMax로 그린다)
    this.graphics = scene.add.graphics().setDepth(4);
    this.statusGfx = scene.add.graphics().setDepth(4.2);
    this.ab = null; // 지금 형태·장착 무기 레벨의 능력 수치(abilities.abilityRuntime). 능력이 없으면 null
    this.abForm = undefined;
    this.abLevel = -1;
    this.abKind = null;
    this.cell = null; // 능력 × 지금 무기의 표 칸(weapon-abilities.adapt). 능력이 없으면 null
    this.mods = {}; // 그 칸의 수치 보정(weapon-abilities.modsFor)
    this.equippedItem = null;
    this.weaponKind = null; // 장착 무기 종류. 바뀌면 남은 발사물을 지운다(refreshWeapon)
    this.statsLevel = -1;
    this.statsCache = null;
    // 보패 상태(weaponFire.js). 모두 상한이 있다(설계 6절).
    this.beads = []; // 염주 알 ≤ 10
    this.beadAngle = 0;
    this.burst = { id: 0, t: -1, zoneDone: false }; // 염주 퍼짐: t = 시작 뒤 흐른 시뮬레이션 초(-1이면 쉬는 중)
    this.pools = []; // 단호로 웅덩이 ≤ 6
    this.waves = []; // 삼청령 고리 ≤ 6
    this.seals = []; // 옥인 인장 ≤ 6
    this.echoes = []; // 팔괘경 반사 광선(대기 중)
    this.beams = makePool(8, BEAM_FIELDS); // 팔괘경 광선 그림 기록(화면에 남는 광선 ≤ 8)
    this.impacts = makePool(8, IMPACT_FIELDS); // 옥인이 떨어진 자리 그림 기록
    this.beamIdx = 0;
    this.impactIdx = 0;
    this.poolSeq = 0;
    this.waveSeq = 0;
    this.beamSeq = 0;
    this.beamFound = [];
    this.beamAlong = [];
    this.sealPick = [];
    this.sealDist = [];
    this.scratchC = []; // 무기 충돌 후보(능력 효과 후보 scratchB와 겹치지 않게 따로 둔다)
    this.shotSeq = 0;
    this.hitCtx = { x: 0, y: 0, primary: true, silent: false, kind: 'shot', weapon: 'yeouiju', amount: 0, base: 0, dirX: 1, dirY: 0, durMul: 1, pushMult: 1, eventId: 0 };
    this.anchor = { x: 0, y: 0, enemy: null, ex: 0, ey: 0, es: 0, vx: 1, vy: 0, base: 0, speed: tuning.orbSpeed, style: null, tier: 1 };
    this.snap = { x: 0, y: 0, size: 0, dx: 1, dy: 0 };
    this.shot = { dmg: 0, base: 0, grade: 1, scale: 1, style: null, tier: 1 }; // refreshShot이 매 단계 채우는 지금 무기의 피해·모양
    this.shotView = { effect: '', x: 0, y: 0, vx: 1, vy: 0, r: 0, x2: null, y2: null, halfWidth: 0, height: 0 }; // drawWeaponShot에 넘기는 재사용 객체
    this.pushDir = { x: 1, y: 0 };
    this.wc = Object.fromEntries(WEAPON_COUNTERS.map((key) => [key, 0])); // 무기 사건 횟수(시험·스트레스 확인용)
    this.counters = Object.fromEntries(ABILITY_IDS.map((id) => [id, 0])); // 능력이 실제로 발동한 횟수(시험·스트레스 확인용)
    this.grid = null;
    this.clouds = [];
    this.vortices = [];
    this.pearls = [];
    this.pearlAngle = 0;
    this.bolts = makePool(24, BOLT_FIELDS);
    this.rings = makePool(24, RING_FIELDS);
    this.boltIdx = 0;
    this.ringIdx = 0;
    this.scratchA = []; // 구슬 충돌 후보
    this.scratchB = []; // 능력 효과 후보
    this.chainHit = [];
    this.charmReadyAt = 0;
    this.vortexReadyAt = 0;
    this.drainBank = -1;
    this.chainGate = createRateGate(ABILITY_RULES.chain.eventsPerSec);
    this.explodeGate = createRateGate(ABILITY_RULES.explode.eventsPerSec);
    this.hitSfxGate = createRateGate(1); // 명중음은 0.07 시뮬레이션 초에 한 번만(같은 프레임 중복 방지)
    this.entry = 0;
    // EnemyFire.step가 부르는 방패: 호신주 진주가 적 구슬을 막는다.
    this.shield = { block: (ox, oy, nx, ny, r) => this.blockEnemyOrb(ox, oy, nx, ny, r) };
  }

  now() {
    return nowOf(this.scene);
  }

  engage(enemy) {
    if (!this.engagements.has(enemy)) {
      this.engagements.set(enemy, {
        preySize: rewardSizeOf(enemy),
        myOriginalSizeAtEngage: this.scene.player.size,
      });
    }
    return this.engagements.get(enemy);
  }

  // 보물로 깎여 작아졌어도 요력은 깎이기 전 가장 컸던 크기로 준다(사용자 결정 2026-11-23).
  meal(enemy, killedByTreasure) {
    const engaged = this.engage(enemy);
    return { dir: enemy.dir, ...engaged, preySize: Math.max(engaged.preySize, rewardSizeOf(enemy)), killedByTreasure, special: !!enemy.special, stage: enemy.stage ?? 1, grade: enemy.grade };
  }

  // 매혹한 요괴(ally)가 먹은 먹이의 식사 기록. 요력은 플레이어에게 가고(session.onEat), 식성·성향·드롭은 기록하지 않는다(설계 4-4).
  allyMeal(prey, ally) {
    return { ...this.meal(prey, false), byAlly: true, x: ally.x, y: ally.y };
  }

  treasureLevel() {
    const level = this.progress.treasure?.level;
    return Number.isInteger(level) && level >= 0 && level <= TREASURE.success.length ? level : 0;
  }

  // 장착한 무기의 종류. 장착이 비었거나 모르는 종류면 여의주(맨손은 +0 여의주 구슬, 설계 D12).
  currentKind() {
    return kindOf(this.progress.treasure);
  }

  // 장착 무기의 수치(systems/weapons.weaponStats). 종류·레벨이 바뀔 때만 다시 계산한다.
  stats() {
    const level = this.treasureLevel();
    const kind = this.currentKind();
    if (level !== this.statsLevel || kind !== this.statsCache?.kind) {
      this.statsLevel = level;
      this.statsCache = weaponStats({ kind, level });
    }
    return this.statsCache;
  }

  // 구슬 1발 피해: 보물 레벨 × 등급 배율. 능력의 피해 값은 무기마다 abilityBase를 곱한 B(stats.B × 등급)에서 나온다(등급은 능력 피해에만 곱한다).
  power(stats = this.stats()) {
    return stats.P * (gradeMultiplier(this.progress.grade) ?? 1);
  }

  // 장착 무기 종류가 바뀌면(판 중 [정비]에서 교체) 그 무기의 남은 구슬·광선·웅덩이·고리·인장·알을 지운다. 걸린 상태이상·구름 등 능력 효과는 끝까지 간다.
  refreshWeapon() {
    const kind = this.currentKind();
    const item = this.progress.treasure;
    if (item === this.equippedItem && kind === this.weaponKind) return;
    this.equippedItem = item;
    this.weaponKind = kind;
    this.clearWeaponState();
    this.cooldown = Math.min(this.cooldown, this.stats().cooldown);
  }

  clearWeaponState() {
    this.orbs.length = 0;
    this.beads.length = 0;
    this.burst.t = -1;
    this.pools.length = 0;
    this.waves.length = 0;
    this.seals.length = 0;
    this.echoes.length = 0;
    for (const b of this.beams) b.until = 0;
    for (const i of this.impacts) i.until = 0;
    this.graphics.clear();
  }

  // 형태·장착 무기 종류·무기 레벨이 바뀌면 능력 수치와 무기 칸 보정을 다시 계산한다(걸린 매혹·구름 등은 만들 때의 값으로 끝까지 간다).
  refreshAbility() {
    const form = FORM_BY_ID[this.progress?.formId];
    const level = this.treasureLevel();
    const kind = this.currentKind();
    if (form === this.abForm && level === this.abLevel && kind === this.abKind) return;
    this.abForm = form;
    this.abLevel = level;
    this.abKind = kind;
    this.ab = abilityRuntime(form, level);
    const stats = this.stats();
    this.cell = this.ab ? adapt(kind, this.ab.id) : null;
    this.mods = modsFor(kind, this.ab?.id, this.ab, stats);
    // 염주 × 호신주는 진주를 따로 만들지 않는다(알이 진주 몫까지 한다, 설계 3-3 #20).
    const wanted = this.ab?.id === 'orbit' && kind !== 'beads' ? this.ab.count : 0;
    while (this.pearls.length > wanted) this.pearls.pop();
    while (this.pearls.length < wanted) this.pearls.push({ x: 0, y: 0, vx: 0, vy: 1, regenAt: 0 });
    if (this.ab?.id !== 'drain') this.drainBank = -1;
  }

  myStage() {
    return stageOf(this.scene.player);
  }

  // 날아가는 것의 유도 세기: 무기 자체 유도(레벨 +8부터)와 학익 추적 능력 중 큰 쪽. 학우선은 능력도 절반(3-3 #14).
  homingFor(stats) {
    const ab = this.ab;
    if (ab?.id !== 'homing') return stats.homing;
    if (stats.kind === 'fan') return Math.max(stats.homing, this.mods.homingMin ?? 0);
    return Math.max(stats.homing, ab.strength);
  }

  // 발사 1회의 퍼지는 효과 몫(학우선 깃들이 같이 쓴다): 이 칸이 '발사당 n회'일 때만 n.
  newVolley() {
    const trigger = this.cell?.trigger;
    return { left: trigger === 'volley' || trigger === 'volleyCenter' ? this.cell.perEvent : 0 };
  }

  makeOrb(x, y, vx, vy, speed, homing, k, reach, weapon) {
    return {
      eventId: ++this.shotSeq, x, y, vx, vy, speed, homing, damage: k.dmg, base: k.base, rangeLeft: reach, reach, weapon,
      kind: MAIN, phase: OUT, mul: 1, pierceLeft: 0, keep: 1, ghost: false,
      hits: null, skip: null, target: null, hadTarget: false, omni: false, turn: 1, retarget: 0, look: 0,
      style: k.style, tier: k.tier, vol: null, center: false, spent: 0,
    };
  }

  // 지금 무기의 한 번 피해·능력 기준 피해·모양. 위력은 보물(무기) 강화 레벨(weaponStats)과 등급 배율로만 정한다(균형 보정 BALANCE는 한 번 피해에만).
  // dmg = 명중 한 번 피해, base = 능력 기준 피해 B, scale = 염주 접촉·웅덩이 초당 피해에 곱하는 등급 × 균형 보정.
  refreshShot(stats = this.stats()) {
    const k = this.shot;
    const grade = gradeMultiplier(this.progress.grade) ?? 1;
    const tune = BALANCE[stats.kind]?.hit ?? 1;
    k.grade = grade;
    k.scale = grade * tune;
    k.dmg = stats.hitDamage * k.scale;
    k.base = stats.B * grade;
    k.style = this.ab ? this.abForm.stem : null;
    k.tier = this.ab ? this.ab.stage : 1;
    return k;
  }

  fire(stats = this.stats()) {
    this.refreshWeapon();
    this.refreshAbility();
    const { player } = this.scene;
    const ab = this.ab;
    const k = this.refreshShot(stats);
    if (stats.kind === 'yeouiju') {
      const { ways, perWay } = stats;
      const base = Math.atan2(this.heading.y, this.heading.x);
      const homing = this.homingFor(stats);
      for (let w = 0; w < ways; w++) {
        const angle = base + w * 2 * Math.PI / ways;
        const vx = Math.cos(angle), vy = Math.sin(angle);
        for (let i = 0; i < perWay; i++) {
          if (this.orbs.length >= tuning.maxOrbs) break;
          const offset = (i - (perWay - 1) / 2) * tuning.shotSpacing;
          const orb = this.makeOrb(player.x - vy * offset, player.y + vx * offset, vx, vy, stats.speed, homing, k, stats.reach, 'yeouiju');
          if (ab) this.armOrb(orb, ab);
          this.orbs.push(orb);
        }
      }
      this.wc.fires++;
    } else {
      fireWeapon(this, stats, k);
    }
    sfx.play(stats.kind === 'yeouiju' ? 'orb-fire' : 'shot-' + stats.kind, { volume: 0.7 });
    this.cooldown = stats.cooldown;
    this.cooldownMax = stats.cooldown;
  }

  // 구슬 성질을 능력대로 건다. 무기마다 겹치는 성질이 달라 일부는 건너뛴다(설계 3-3): 관통은 여의주·학우선만, 회선은 여의주와 학우선의 가운데 깃만 돌아온다.
  armOrb(orb, ab) {
    const weapon = orb.weapon;
    switch (ab.id) {
      case 'homing':
        orb.omni = weapon !== 'fan'; // 학우선 깃은 앞쪽 부채꼴 탐지 그대로(3-3 #14)
        orb.turn = ab.turn;
        orb.retarget = ab.retarget;
        break;
      case 'pierce':
        if (weapon === 'yeouiju' || weapon === 'fan') {
          orb.pierceLeft = ab.extra;
          orb.keep = ab.keep;
          orb.hits = [];
        }
        break;
      case 'boomerang':
        if (this.canTurn(orb)) {
          orb.rangeLeft *= 1 + ab.rangeBonus / 100;
          orb.hits = [];
        }
        break;
      default:
        break;
    }
  }

  // 회선으로 되돌아올 수 있는 구슬: 여의주 구슬, 학우선은 가운데 깃 1장만(3-3 #7).
  canTurn(orb) {
    return orb.weapon === 'yeouiju' || (orb.weapon === 'fan' && orb.center);
  }

  // 모든 구슬·번개·폭발·화상·구름·진주·갈래·되돌이 피해가 지나는 한 곳: 파사인 증가, 요력 기준 크기 기록, 역전 판정, 쓰러뜨리기를 처리한다.
  // 반환: 깎아 낸 면적(크기²). silent는 지속 피해(화상·구름)용으로 번쩍임을 생략한다.
  applyTreasureDamage(enemy, amount, { silent = false } = {}) {
    if (!enemy.sprite.active) return 0;
    const { player } = this.scene;
    const now = this.now();
    if (enemy.markUntil > now) amount *= 1 + enemy.markAmp;
    this.engage(enemy);
    enemy.rewardSize = rewardSizeOf(enemy);
    const before = enemy.size;
    const remaining = before - amount;
    // 역전: 나를 먹을 수 있던 적이 깎여서 이제 내가 먹을 수 있게 됐다(단계 규칙 포함).
    const reversal = !enemy.reversed && canEat(enemy, player) && canEat(player, { size: remaining, stage: stageOf(enemy) }, { reversed: true });
    if (reversal) this.scene.fireButton?.showReversal();
    if (!silent) this.scene.fx?.flash(enemy);
    if (reversal) this.scene.fx?.reversal(enemy);
    if (remaining <= tuning.defeatSize) {
      const meal = this.meal(enemy, true);
      this.scene.fx?.burst(enemy.x, enemy.y, 0x9deed3, 16, Math.max(0.8, enemy.size / 25));
      enemy.destroy();
      this.scene.events.emit('eat', meal);
      return before * before;
    }
    enemy.setSize(remaining);
    if (reversal) enemy.fleeFrom(player);
    return before * before - remaining * remaining;
  }

  // 예전 호출 호환(구슬이 적을 맞힘).
  hit(enemy, damage) {
    return this.applyTreasureDamage(enemy, damage);
  }

  // 반경 r 안의 적 후보(격자가 있으면 격자 조회, 없으면 전체). 호출한 쪽이 거리를 다시 확인한다. 결과 배열은 다음 호출에서 재사용된다.
  near(x, y, r) {
    return this.grid ? queryGrid(this.grid, x, y, r, this.scratchB) : this.scene.enemies;
  }

  maxSize() {
    return this.grid ? this.grid.maxSize : 0;
  }

  // 무기 충돌 후보(near와 같지만 결과 배열이 다르다: 무기 처리 중 능력 효과가 near를 불러도 순회가 깨지지 않는다).
  nearW(x, y, r) {
    return this.grid ? queryGrid(this.grid, x, y, r, this.scratchC) : this.scene.enemies;
  }

  // (x,y)에서 (hx,hy) 방향 cosCone보다 가까운 방향 안, 반경 radius 안의 가장 가까운 위협(팔괘경 조준 보정).
  findTargetCone(x, y, hx, hy, radius, cosCone, now) {
    if (this.grid) return aimTargetGrid(this.grid, x, y, this.scene.player, radius, hx, hy, cosCone, now, this.scratchB);
    return pickThreat(this.scene.enemies, x, y, this.scene.player, radius, hx, hy, cosCone, now);
  }

  // 구슬이 한 프레임에 지나간 선분과 가장 먼저 닿는 충돌 원을 찾는다. 아군·이미 맞힌 적은 통과한다.
  firstHit(orb, travel, now) {
    const grid = this.grid;
    let list;
    if (grid) {
      list = queryGrid(grid, orb.x + orb.vx * travel * 0.5, orb.y + orb.vy * travel * 0.5, travel * 0.5 + tuning.orbRadius + grid.maxSize, this.scratchA);
    } else {
      list = this.scene.enemies;
    }
    let first = null;
    let nearest = travel;
    const hits = orb.hits;
    for (let i = 0; i < list.length; i++) {
      const enemy = list[i];
      if (!enemy.sprite.active || enemy === orb.skip || isShielded(enemy, now)) continue;
      if (hits !== null && hits.includes(enemy)) continue;
      const dx = enemy.x - orb.x, dy = enemy.y - orb.y;
      const along = dx * orb.vx + dy * orb.vy;
      const across = dx * orb.vy - dy * orb.vx;
      const chordSq = (enemy.size + tuning.orbRadius) ** 2 - across * across;
      if (chordSq < 0) continue;
      const halfChord = Math.sqrt(chordSq);
      if (along + halfChord < 0) continue;
      const entry = Math.max(0, along - halfChord);
      if (entry <= nearest) {
        nearest = entry;
        first = enemy;
      }
    }
    this.entry = nearest;
    return first;
  }

  // 표적 찾기: 능력 학익 추적이면 사방(360°), 아니면 앞쪽 부채꼴. 격자 조회로 반경 안의 위협만 본다.
  findTarget(x, y, hx, hy, radius, omni, now) {
    const cone = omni ? -1 : Math.cos(tuning.aimHalfAngleDeg * Math.PI / 180);
    if (this.grid) return aimTargetGrid(this.grid, x, y, this.scene.player, radius, hx, hy, cone, now, this.scratchB);
    return pickThreat(this.scene.enemies, x, y, this.scene.player, radius, hx, hy, cone, now);
  }

  validTarget(enemy, now) {
    return enemy.sprite.active && !enemy.reversed && !isShielded(enemy, now) && canEat(enemy, this.scene.player);
  }

  // 유도: 표적 찾기는 구슬마다 2단계에 한 번만 한다(찾은 표적은 그동안 유지, 표적이 죽거나 규칙에서 벗어나면 바로 다시 찾는다).
  steer(orb, dt, now) {
    if (orb.look > 0 && (orb.target === null || this.validTarget(orb.target, now))) {
      orb.look--;
    } else {
      orb.look = 2;
      if (orb.omni) {
        if (orb.target && !this.validTarget(orb.target, now)) orb.target = null;
        if (!orb.target) {
          orb.target = this.findTarget(orb.x, orb.y, orb.vx, orb.vy, orb.hadTarget ? orb.retarget : orb.reach, true, now);
          if (orb.target && !orb.hadTarget) this.counters.homing++;
          if (orb.target) orb.hadTarget = true;
        }
      } else {
        orb.target = this.findTarget(orb.x, orb.y, orb.vx, orb.vy, orb.reach, false, now);
        if (orb.target && !orb.hadTarget && this.ab?.id === 'homing') {
          orb.hadTarget = true;
          this.counters.homing++;
        }
      }
    }
    const target = orb.target;
    if (!target) return;
    const dx = target.x - orb.x, dy = target.y - orb.y;
    const cross = orb.vx * dy - orb.vy * dx;
    const dot = orb.vx * dx + orb.vy * dy;
    const want = Math.atan2(cross, dot);
    const limit = orb.homing * tuning.homingTurnRate * orb.turn * dt;
    const turn = Math.max(-limit, Math.min(limit, want));
    const cos = Math.cos(turn), sin = Math.sin(turn);
    const vx = orb.vx * cos - orb.vy * sin;
    orb.vy = orb.vx * sin + orb.vy * cos;
    orb.vx = vx;
  }

  // ---- 구슬(여의주·학우선 깃·도목검 칼·단호로 물방울)이 적을 맞혔을 때. 반환: 구슬이 사라지는가 ----
  // 피해·상태이상은 onWeaponHit(모든 무기가 같은 한 곳), 구슬이 사라지는 규칙은 무기·능력별로 여기서 정한다.
  onOrbHit(orb, enemy, now) {
    const ab = this.ab;
    const weapon = orb.weapon ?? 'yeouiju';
    const ix = orb.x + orb.vx * this.entry, iy = orb.y + orb.vy * this.entry;
    const ex = enemy.x, ey = enemy.y, es = enemy.size;
    let amount = orb.damage * orb.mul;
    if (weapon === 'sword' && orb.phase === BACK && this.mods.backMult) amount *= this.mods.backMult; // 도목검 × 회선: 오는 길 피해 증가(3-3 #9)
    if (orb.kind === SPLIT) {
      this.applyTreasureDamage(enemy, amount);
      return true;
    }
    const ctx = this.hitCtx;
    ctx.kind = weapon === 'gourd' ? 'drop' : 'shot';
    ctx.weapon = weapon;
    ctx.amount = amount;
    ctx.base = orb.base;
    ctx.dirX = orb.vx;
    ctx.dirY = orb.vy;
    ctx.durMul = 1;
    ctx.pushMult = this.mods.pushMult ?? 1;
    ctx.eventId = orb.eventId;
    ctx.x = ix;
    ctx.y = iy;
    ctx.primary = true;
    ctx.silent = false;
    this.onWeaponHit(ctx, enemy, now);
    if (weapon === 'gourd') {
      makeGourdPool(this, ix, iy, enemy, orb.vx, orb.vy, now);
      return true;
    }
    if (weapon === 'sword') {
      orb.hits.push(enemy);
      if (ab) this.orbSpread(orb, enemy, ex, ey, es, ix, iy, now);
      return false;
    }
    if (!ab) return true;
    this.orbSpread(orb, enemy, ex, ey, es, ix, iy, now);
    switch (ab.id) {
      case 'pierce':
        if (orb.pierceLeft > 0) {
          orb.pierceLeft--;
          orb.mul *= orb.keep;
          orb.hits.push(enemy);
          this.counters.pierce++;
          return false;
        }
        return true;
      case 'boomerang':
        if (!this.canTurn(orb)) return true;
        if (orb.phase === OUT) {
          this.turnBack(orb, ab, enemy);
          return false;
        }
        orb.hits.push(enemy);
        if (--orb.pierceLeft <= 0) orb.ghost = true;
        return false;
      default:
        return true;
    }
  }

  // 명중 사건 하나(모든 무기·모든 능력의 한 곳, 설계 3-1): 피해를 주고, 맞은 적마다 거는 능력(상태이상·흡정·대풍)을 처리한다.
  // ctx = { kind: 'shot'|'beam'|'contact'|'burst'|'drop'|'ring'|'slam'|'poolEnter', weapon, amount, base(능력 기준 피해 B), dirX, dirY, durMul, pushMult, eventId }.
  // poolEnter는 피해 없이 상태이상만 건다(웅덩이 지속 피해는 명중 사건이 아니다). 퍼지는 효과(뇌쇄·분화·선무·폭염·와류)는 무기마다 단위가 달라 호출한 쪽이 spreadAt으로 건다.
  // 반환: 깎아 낸 면적.
  onWeaponHit(ctx, enemy, now = this.now()) {
    const ab = this.ab;
    const ex = enemy.x, ey = enemy.y;
    let removed = 0;
    if (ctx.amount > 0) {
      if (takeRate(this.hitSfxGate, now, simSeconds(0.07, this.scene))) sfx.play('orb-hit', { volume: 0.6 });
      removed = this.applyTreasureDamage(enemy, ctx.amount, ctx.silent ? { silent: true } : undefined);
      this.wc.hits++;
      if (ctx.kind === 'shot') this.wc.shotHits++;
      else if (ctx.kind === 'drop') this.wc.dropHits++;
    }
    if (!ab) return removed;
    const alive = enemy.sprite.active;
    const delta = Math.max(0, stageOf(enemy) - this.myStage());
    const dm = ctx.durMul;
    switch (ab.id) {
      case 'charm':
        if (alive) this.tryCharmEnemy(enemy, ab, delta, now, dm);
        break;
      case 'mark':
        if (alive) this.markEnemy(enemy, ab, delta, now, dm);
        break;
      case 'fear':
        if (alive) {
          const dur = resisted('fear', 'duration', ab.duration * dm, delta);
          if (dur > 0 && tryFear(enemy, now, simSeconds(dur, this.scene), simSeconds(ABILITY_RULES.fear.immuneSec, this.scene))) this.counters.fear++;
        }
        break;
      case 'burn':
        if (alive) this.burnEnemy(enemy, ctx.base, ab, delta, now, dm);
        break;
      case 'freeze':
        if (alive) {
          const dur = resisted('freeze', 'duration', ab.duration * dm, delta);
          if (dur > 0 && tryFreeze(enemy, now, simSeconds(dur, this.scene), simSeconds(ABILITY_RULES.freeze.immuneSec, this.scene))) this.counters.freeze++;
        }
        break;
      case 'drain':
        if (ctx.amount > 0) this.drain(removed, ab);
        break;
      case 'gust':
        if (ctx.kind !== 'poolEnter') this.gustFrom(ctx, enemy, ex, ey, ab, now);
        break;
      default:
        break;
    }
    return removed;
  }

  // 구슬이 맞았을 때 퍼지는 효과(뇌쇄·분화·선무·폭염·와류)를 발동할지: 칸의 발동 단위(weapon-abilities)대로 몫을 센다.
  orbSpread(orb, enemy, ex, ey, es, ix, iy, now) {
    const id = this.ab.id;
    if (id !== 'chain' && id !== 'split' && id !== 'zone' && id !== 'explode' && id !== 'vortex') return;
    switch (this.cell.trigger) {
      case 'hit':
        break;
      case 'volley':
        if (!orb.vol || orb.vol.left <= 0) return;
        orb.vol.left--;
        break;
      case 'volleyCenter':
        if (!orb.center || !orb.vol || orb.vol.left <= 0) return;
        orb.vol.left--;
        break;
      case 'pathFirst': {
        const bit = 1 << orb.phase;
        if (orb.spent & bit) return;
        orb.spent |= bit;
        break;
      }
      default:
        return; // turnPoint(칼이 돌아서는 지점)·poolBorn(웅덩이가 생길 때)·poolField(웅덩이가 겸함)는 맞은 순간에 발동하지 않는다
    }
    this.spreadAt(this.anchorOfOrb(orb, enemy, ex, ey, es, ix, iy), now);
  }

  anchorOfOrb(orb, enemy, ex, ey, es, ix, iy) {
    const a = this.anchor;
    a.x = ix;
    a.y = iy;
    a.enemy = enemy;
    a.ex = ex;
    a.ey = ey;
    a.es = es;
    a.vx = orb.vx;
    a.vy = orb.vy;
    a.base = orb.base;
    a.speed = orb.speed;
    a.style = orb.style;
    a.tier = orb.tier;
    return a;
  }

  // 퍼지는 효과 한 번(자리 = a). 능력 수치와 무기 칸 보정(this.mods: 튐 +1, 갈래 +1·사거리 ×0.7, 반경 ×0.8~1.2)을 적용한다.
  spreadAt(a, now) {
    const ab = this.ab;
    const m = this.mods;
    switch (ab?.id) {
      case 'chain':
        this.chainFrom(a.enemy, a.ex, a.ey, a.es, a.base, ab, now, m.hops ?? 0);
        break;
      case 'split':
        this.splitFrom(a, a.enemy, a.x, a.y, ab, m.countBonus ?? 0, m.rangeMult ?? 1);
        break;
      case 'zone':
        this.addCloud(a.x, a.y, a.base, ab, now, m.radiusMult ?? 1);
        break;
      case 'explode':
        this.explodeAt(a.x, a.y, a.enemy, a.base, ab, now);
        break;
      case 'vortex':
        this.addVortex(a.x, a.y, ab, now);
        break;
      default:
        break;
    }
  }

  // 사거리 끝에 닿았을 때. 반환: 구슬이 사라지는가
  onOrbEnd(orb, now) {
    const ab = this.ab;
    const weapon = orb.weapon ?? 'yeouiju';
    if (orb.kind !== MAIN) return true;
    if (weapon === 'gourd') {
      makeGourdPool(this, orb.x, orb.y, null, orb.vx, orb.vy, now);
      return true;
    }
    if (weapon === 'sword') {
      if (orb.phase !== OUT) return true;
      // 칼은 사거리 끝에서 돌아선다. 선무·와류는 '칼이 돌아서는 지점 1개'(3-1).
      if (ab && this.cell.trigger === 'turnPoint') this.spreadAt(this.anchorOfOrb(orb, null, orb.x, orb.y, 0, orb.x, orb.y), now);
      this.swordTurn(orb);
      return false;
    }
    if (!ab) return true;
    if (ab.id === 'zone') {
      // 여의주: 사거리 끝에서도 구름이 남는다. 학우선: 가운데 깃이 아직 몫이 남았을 때만.
      if (weapon === 'fan') {
        if (orb.center && orb.vol && orb.vol.left > 0) {
          orb.vol.left--;
          this.addCloud(orb.x, orb.y, orb.base, ab, now, this.mods.radiusMult ?? 1);
        }
      } else {
        this.addCloud(orb.x, orb.y, orb.base, ab, now, this.mods.radiusMult ?? 1);
      }
    } else if (ab.id === 'boomerang' && orb.phase === OUT && this.canTurn(orb)) {
      this.turnBack(orb, ab, null);
      return false;
    }
    return true;
  }

  // 도목검: 가는 길 끝에서 돌아서 플레이어를 향해 온다. 오는 길도 같은 적을 한 번씩 꿰뚫는다(hits를 비운다).
  swordTurn(orb) {
    orb.phase = BACK;
    orb.skip = null;
    orb.hits.length = 0;
    orb.mul = 1;
    orb.ghost = false;
    orb.rangeLeft = orb.reach * ABILITY_RULES.boomerang.returnRangeMult;
  }

  // ---- 능력 A01 뇌쇄 ----
  // src가 null이면 (sx,sy) 자리에서 시작한다(웅덩이가 생길 때). extraHops는 무기 칸의 '튐 +1'(팔괘경·옥인)이고 능력 표 상한(6)을 넘지 않는다.
  chainFrom(src, sx, sy, ss, base, ab, now, extraHops = 0) {
    if (!takeRate(this.chainGate, now, simSeconds(1, this.scene))) return;
    const done = this.chainHit;
    done.length = 0;
    if (src) done.push(src);
    let fx = sx, fy = sy, fs = ss, damage = base;
    const reach = ab.range + ss + this.maxSize();
    const hops = extraHops > 0 ? Math.min(ab.hops + extraHops, ABILITIES.chain.cap.hops) : ab.hops;
    for (let k = 1; k <= hops; k++) {
      let best = null, bestGap = ab.range;
      const list = this.near(fx, fy, reach);
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e.sprite.active || isShielded(e, now) || done.includes(e)) continue;
        const gap = Math.hypot(e.x - fx, e.y - fy) - e.size - fs;
        if (gap <= bestGap) {
          best = e;
          bestGap = gap;
        }
      }
      if (!best) break;
      damage *= ab.falloff;
      const bx = best.x, by = best.y, bs = best.size;
      this.addBolt(fx, fy, bx, by, now);
      this.applyTreasureDamage(best, damage);
      done.push(best);
      fx = bx;
      fy = by;
      fs = bs;
      this.counters.chain++;
    }
  }

  // ---- 능력 A02 매혹(설계 4-4) ----
  allyCount(now) {
    let count = 0;
    for (const e of this.scene.enemies) if (e.sprite.active && e.charmUntil > now) count++;
    return count;
  }

  tryCharmEnemy(enemy, ab, delta, now, durMul = 1) {
    if (now < this.charmReadyAt || this.allyCount(now) >= ab.allies) return false;
    const dur = resisted('charm', 'duration', ab.duration * durMul, delta);
    if (dur <= 0) return false;
    const r = ABILITY_RULES.charm;
    if (!tryCharm(enemy, now, simSeconds(dur, this.scene), simSeconds(r.graceSec, this.scene), simSeconds(r.immuneSec, this.scene))) return false;
    this.charmReadyAt = now + simSeconds(ab.cooldown, this.scene);
    this.counters.charm++;
    this.scene.fx?.burst(enemy.x, enemy.y, 0x85cfb7, 10, 0.9);
    return true;
  }

  // ---- 능력 A06 파사인 ----
  markEnemy(enemy, ab, delta, now, durMul = 1) {
    const dur = resisted('mark', 'duration', ab.duration * durMul, delta);
    if (dur <= 0) return;
    applyMark(enemy, now, simSeconds(dur, this.scene), ab.amp / 100, ab.stage >= ABILITY_RULES.mark.lureMinStage);
    this.counters.mark++;
  }

  // ---- 능력 A07 회선: 방금 맞힌 적(from)은 구슬이 그 몸 밖으로 나갈 때까지 통과한다(돌아서자마자 같은 적을 또 치지 않게) ----
  turnBack(orb, ab, from) {
    orb.skip = from;
    orb.phase = BACK;
    // 다른 능력일 때 쏜 구슬(진화로 줄기가 바뀐 직후)은 hits가 없을 수 있다.
    if (orb.hits === null) orb.hits = [];
    else orb.hits.length = 0;
    orb.ghost = false;
    orb.pierceLeft = ab.pierce;
    orb.mul = ab.damage;
    orb.rangeLeft = (orb.reach ?? tuning.range) * ABILITY_RULES.boomerang.returnRangeMult;
    this.counters.boomerang++;
  }

  // ---- 능력 A09 작열: 초당 피해 = 총량 × 구슬 피해 ÷ 기본 지속(표의 T). 저항으로 지속이 줄면 받는 총량도 준다 ----
  burnEnemy(enemy, shot, ab, delta, now, durMul = 1) {
    const dur = resisted('burn', 'duration', ab.duration * durMul, delta);
    if (dur <= 0) return;
    const dpsScreen = (ab.total * shot) / ab.raw.duration;
    const sim = simSeconds(1, this.scene);
    applyBurn(enemy, now, simSeconds(dur, this.scene), dpsScreen / sim);
    this.counters.burn++;
  }

  // ---- 능력 A10 분화 ----
  // src = 맞은 구슬 또는 퍼지는 효과의 자리(anchor): vx·vy(진행 방향), base(능력 기준 피해 B), speed, style, tier를 읽는다.
  // countBonus는 무기 칸의 '갈래 +1'(옥인), rangeMult는 '갈래 사거리 ×0.7'(단호로).
  splitFrom(src, enemy, ix, iy, ab, countBonus = 0, rangeMult = 1) {
    const count = countBonus > 0 ? Math.min(ab.count + countBonus, ABILITIES.split.cap.count) : ab.count;
    const room = tuning.maxOrbs - this.orbs.length;
    const n = Math.min(count, room);
    if (n <= 0) return;
    const a0 = Math.atan2(src.vy, src.vx) + Math.PI / count;
    const range = ab.range * rangeMult;
    for (let k = 0; k < n; k++) {
      const angle = a0 + (k * TAU) / count;
      this.orbs.push({
        x: ix, y: iy, vx: Math.cos(angle), vy: Math.sin(angle),
        speed: src.speed * ABILITY_RULES.split.speedMult, homing: 0, damage: src.base * ab.damage, base: src.base * ab.damage, rangeLeft: range, reach: range, weapon: 'yeouiju',
        kind: SPLIT, phase: OUT, mul: 1, pierceLeft: 0, keep: 1, ghost: false,
        hits: null, skip: enemy, target: null, hadTarget: false, omni: false, turn: 1, retarget: 0, look: 0,
        style: src.style, tier: src.tier, vol: null, center: false, spent: 0,
      });
    }
    this.counters.split++;
  }

  // ---- 능력 A11 선무 ----
  addCloud(x, y, shot, ab, now, radiusMult = 1) {
    if (this.clouds.length >= ab.clouds) this.clouds.shift();
    this.clouds.push({
      x, y, r: ab.radius * radiusMult, born: now, until: now + simSeconds(ab.duration, this.scene),
      slow: ab.slow, dps: ab.dps, shot,
    });
    this.counters.zone++;
  }

  // ---- 능력 A12 폭염 ----
  explodeAt(x, y, except, base, ab, now) {
    if (!takeRate(this.explodeGate, now, simSeconds(1, this.scene))) return;
    const list = this.near(x, y, ab.radius + this.maxSize());
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e === except || !e.sprite.active || isShielded(e, now)) continue;
      if (Math.hypot(e.x - x, e.y - y) > ab.radius + e.size) continue;
      this.applyTreasureDamage(e, base * ab.damage);
    }
    const ring = this.rings[this.ringIdx = (this.ringIdx + 1) % this.rings.length];
    ring.x = x;
    ring.y = y;
    ring.r = ab.radius;
    ring.life = simSeconds(0.15, this.scene);
    ring.until = now + ring.life;
    this.counters.explode++;
  }

  // ---- 능력 A14 흡정: 깎은 면적의 q만큼 내 면적이 는다. 성장은 내 면적의 4%/화면 초가 상한 ----
  drain(removed, ab) {
    const player = this.scene.player;
    const area = player.size * player.size;
    const cap = area * ABILITY_RULES.drain.growthPerSec;
    if (this.drainBank < 0) this.drainBank = cap;
    const gain = Math.min(removed * ab.rate, this.drainBank);
    if (gain <= 0) return;
    this.drainBank -= gain;
    player.setSize(Math.sqrt(area + gain));
    player.maxSize = Math.max(player.maxSize ?? 0, player.size);
    this.counters.drain++;
  }

  // ---- 능력 A15 와류 ----
  addVortex(x, y, ab, now) {
    if (now < this.vortexReadyAt) return;
    this.vortexReadyAt = now + simSeconds(ABILITY_RULES.vortex.gateSec, this.scene);
    if (this.vortices.length >= ab.count) this.vortices.shift();
    this.vortices.push({ x, y, r: ab.radius, pull: ab.pull, born: now, until: now + simSeconds(ab.duration, this.scene) });
    this.counters.vortex++;
  }

  // ---- 능력 A16 대풍 ----
  // ctx = 명중 사건(onWeaponHit): dirX·dirY는 밀 방향, pushMult는 무기별 밀기 배율(학우선 ×0.5, 팔괘경 ×0.7, 삼청령 ×0.6, 옥인 나머지 ×0.5).
  gustFrom(ctx, enemy, ex, ey, ab, now) {
    const mult = ctx.pushMult;
    const pushed = this.pushEnemy(enemy, ctx.dirX, ctx.dirY, ab.distance * mult, 'gust', now);
    if (ab.areaRadius > 0) {
      const list = this.near(ex, ey, ab.areaRadius + this.maxSize());
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e === enemy || !e.sprite.active || isShielded(e, now)) continue;
        if (Math.hypot(e.x - ex, e.y - ey) > ab.areaRadius + e.size) continue;
        this.pushEnemy(e, ctx.dirX, ctx.dirY, ab.distance * ABILITY_RULES.gust.areaMult * mult, 'gust', now);
      }
    }
    return pushed;
  }

  // 밀기 방향이 플레이어 쪽을 향하면(되돌아오는 칼·안쪽 메아리 등) 플레이어 → 적 방향으로 바꾼다(설계 3-1 '대풍 방향').
  pushEnemy(enemy, dx, dy, distance, id, now) {
    const delta = Math.max(0, stageOf(enemy) - this.myStage());
    const d = resisted(id, 'distance', distance, delta);
    if (d <= 0) return false;
    const r = ABILITY_RULES.gust;
    const pushSim = simSeconds(r.pushSec, this.scene);
    const { player } = this.scene;
    const dir = outwardPush(dx, dy, enemy.x, enemy.y, player.x, player.y, this.pushDir);
    if (!tryKnock(enemy, now, (dir.x * d) / pushSim, (dir.y * d) / pushSim, pushSim, simSeconds(r.stunSec, this.scene), simSeconds(r.rehitSec, this.scene))) return false;
    this.counters.gust++;
    return true;
  }

  // 적에게 직접 밀림을 준다(와류·대풍). 가짜 적(시험)에도 동작하게 push가 없으면 위치를 직접 바꾼다.
  shove(e, dx, dy) {
    if (typeof e.push === 'function') e.push(dx, dy);
    else {
      e.x += dx;
      e.y += dy;
    }
  }

  // ---- 호신주 진주: 내 몸 둘레를 돌며 닿는 적을 치고 적 구슬을 막는다 ----
  stepPearls(now, h) {
    const ab = this.ab;
    if (!ab || ab.id !== 'orbit' || !this.pearls.length) return;
    const { player } = this.scene;
    const r = ABILITY_RULES.orbit;
    const sim = simSeconds(1, this.scene);
    this.pearlAngle = (this.pearlAngle + (r.spinRadPerSec * h) / sim) % TAU;
    const orbitR = player.size * r.radiusMult + r.radiusPad;
    const pr = tuning.orbRadius * r.pearlRadiusMult;
    const count = this.pearls.length;
    const damage = this.shot.base * ab.damage;
    for (let i = 0; i < count; i++) {
      const p = this.pearls[i];
      const a = this.pearlAngle + (i * TAU) / count;
      p.x = player.x + Math.cos(a) * orbitR;
      p.y = player.y + Math.sin(a) * orbitR;
      p.vx = -Math.sin(a);
      p.vy = Math.cos(a);
      if (p.regenAt > now) continue;
      const list = this.near(p.x, p.y, pr + this.maxSize());
      for (let j = 0; j < list.length; j++) {
        const e = list[j];
        if (!e.sprite.active || isShielded(e, now) || now < e.orbitGateUntil) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) > pr + e.size) continue;
        e.orbitGateUntil = now + simSeconds(r.rehitSec, this.scene);
        this.applyTreasureDamage(e, damage);
        this.counters.orbit++;
      }
    }
  }

  // 적 구슬 한 개(한 단계에 ox,oy → nx,ny로 움직임)가 진주에 막히면 true. 막은 진주는 재생될 때까지 사라진다.
  blockEnemyOrb(ox, oy, nx, ny, radius) {
    const ab = this.ab;
    if (!ab || ab.id !== 'orbit') return false;
    const now = this.now();
    const reach = radius + tuning.orbRadius * ABILITY_RULES.orbit.pearlRadiusMult;
    const guards = this.mods.block ? this.beads : this.pearls; // 염주 × 호신주: 알이 적 구슬을 막는다(막은 알은 진주 재생 시간 동안 사라진다)
    for (const p of guards) {
      if (p.regenAt > now || segDist2(ox, oy, nx, ny, p.x, p.y) >= reach * reach) continue;
      p.regenAt = now + simSeconds(ab.regen, this.scene);
      this.counters.orbit++;
      return true;
    }
    return false;
  }

  // ---- 구름·소용돌이·화상: 단계마다 한 번씩 ----
  stepFields(now, h) {
    const sim = simSeconds(1, this.scene);
    const myStage = this.myStage();
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      if (c.until <= now) {
        this.clouds.splice(i, 1);
        continue;
      }
      const list = this.near(c.x, c.y, c.r + this.maxSize());
      for (let j = 0; j < list.length; j++) {
        const e = list[j];
        if (!e.sprite.active || isShielded(e, now)) continue;
        if (Math.hypot(e.x - c.x, e.y - c.y) > c.r + e.size) continue;
        const slow = resisted('zone', 'slow', c.slow, Math.max(0, stageOf(e) - myStage));
        if (slow > 0) applySlow(e, now, h * 2.5, 1 - Math.min(slow, 0.95));
        this.applyTreasureDamage(e, (c.dps * c.shot * h) / sim, { silent: true });
      }
    }
    for (let i = this.vortices.length - 1; i >= 0; i--) {
      const v = this.vortices[i];
      if (v.until <= now) {
        this.vortices.splice(i, 1);
        continue;
      }
      const list = this.near(v.x, v.y, v.r);
      for (let j = 0; j < list.length; j++) {
        const e = list[j];
        if (!e.sprite.active || isShielded(e, now)) continue;
        const dx = v.x - e.x, dy = v.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d > v.r || d < 1) continue;
        const pull = resisted('vortex', 'pull', v.pull, Math.max(0, stageOf(e) - myStage));
        if (pull <= 0) continue;
        const move = Math.min(pull * h, d);
        this.shove(e, (dx / d) * move, (dy / d) * move);
      }
    }
  }

  stepBurn(now, h) {
    for (const e of this.scene.enemies) {
      if (e.burnUntil > now && e.sprite.active && !isShielded(e, now)) {
        this.applyTreasureDamage(e, burnDamage(e, now, h), { silent: true });
      }
    }
  }

  step(direction, dt, fireRequested, grid = null) {
    const { player } = this.scene;
    const now = this.now();
    this.grid = grid;
    const magnitude = Math.hypot(direction.x, direction.y);
    if (magnitude) {
      this.heading.x = direction.x / magnitude;
      this.heading.y = direction.y / magnitude;
    }
    this.refreshWeapon();
    this.refreshAbility();
    const stats = this.stats();
    this.cooldownMax = stats.cooldown;
    this.refreshShot(stats);
    // 표적 표시는 날아가며 휘는 무기(여의주·학우선·도목검·단호로)만. 학익 추적은 학우선을 뺀 날아가는 무기에서 사방 탐지다.
    const orbWeapon = ORB_WEAPONS.has(stats.kind);
    const omni = orbWeapon && stats.kind !== 'fan' && this.ab?.id === 'homing';
    this.target = orbWeapon && this.homingFor(stats) > 0 ? this.findTarget(player.x, player.y, this.heading.x, this.heading.y, stats.reach, omni, now) : null;
    if (this.target) this.engage(this.target);
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (fireRequested && this.cooldown === 0) this.fire(stats);
    if (this.drainBank >= 0 && this.ab?.id === 'drain') {
      const cap = player.size * player.size * ABILITY_RULES.drain.growthPerSec;
      this.drainBank = Math.min(cap, this.drainBank + (cap * dt) / simSeconds(1, this.scene));
    }

    const orbs = this.orbs;
    for (let i = orbs.length - 1; i >= 0; i--) {
      const orb = orbs[i];
      if (orb.phase === BACK) {
        const dx = player.x - orb.x, dy = player.y - orb.y;
        const d = Math.hypot(dx, dy);
        if (d <= player.size + tuning.orbRadius) {
          orbs.splice(i, 1);
          continue;
        }
        orb.vx = dx / d;
        orb.vy = dy / d;
        const skip = orb.skip;
        if (skip && (!skip.sprite.active || Math.hypot(skip.x - orb.x, skip.y - orb.y) > skip.size + tuning.orbRadius)) orb.skip = null;
      } else if (orb.homing > 0 && orb.kind === MAIN) {
        this.steer(orb, dt, now);
      }
      const travel = Math.min(orb.rangeLeft, orb.speed * dt);
      let remove = false;
      if (!orb.ghost) {
        // 꿰뚫는 구슬(관통·도목검 칼·회선)은 한 단계에 지나간 선분 안의 적을 가까운 순으로 모두 친다(같은 적은 hits로 한 번).
        const phase = orb.phase;
        let hit = this.firstHit(orb, travel, now);
        while (hit) {
          remove = this.onOrbHit(orb, hit, now);
          if (remove || orb.hits === null || orb.ghost || orb.phase !== phase) break;
          hit = this.firstHit(orb, travel, now);
        }
      }
      orb.rangeLeft -= travel;
      if (!remove) {
        orb.x += orb.vx * travel;
        orb.y += orb.vy * travel;
        if (orb.rangeLeft <= 0) remove = this.onOrbEnd(orb, now);
      }
      if (remove) orbs.splice(i, 1);
    }

    if (stats.kind === 'beads') stepBeads(this, stats, now, dt);
    if (this.pools.length) stepPools(this, now, dt);
    if (this.waves.length) stepWaves(this, now, dt);
    if (this.seals.length) stepSeals(this, now);
    if (this.echoes.length) stepEchoes(this, now);
    if (this.ab) {
      this.stepPearls(now, dt);
    }
    if (this.clouds.length || this.vortices.length) this.stepFields(now, dt);
    if (this.counters.burn > 0) this.stepBurn(now, dt);
  }

  // 진화(맵이 커지며 모두 옮겨질 때)·판 끝에 남은 효과(구슬·구름·와류·번개·고리)를 지운다. 절대 좌표라 옮겨진 뒤에는 엉뚱한 자리에서 작동하기 때문이다.
  clearEffects() {
    this.clearWeaponState();
    this.clouds.length = 0;
    this.vortices.length = 0;
    // 번개·고리는 until을 0으로 만료시킨다(그리기는 until <= now를 건너뛴다. life만 0으로 두면 (until - now) / life가 무한대가 되어 옛 자리에 그려진다).
    for (const b of this.bolts) b.until = 0;
    for (const ring of this.rings) ring.until = 0;
    this.graphics.clear();
    this.statusGfx.clear();
  }

  addBolt(x1, y1, x2, y2, now) {
    const b = this.bolts[this.boltIdx = (this.boltIdx + 1) % this.bolts.length];
    b.x1 = x1;
    b.y1 = y1;
    b.x2 = x2;
    b.y2 = y2;
    b.j1 = Math.random() * 2 - 1;
    b.j2 = Math.random() * 2 - 1;
    b.life = simSeconds(0.12, this.scene);
    b.until = now + b.life;
  }

  // ---- 그리기 ----
  draw() {
    const g = this.graphics.clear();
    const sg = this.statusGfx.clear();
    const now = this.now();
    const target = this.target;
    const omni = this.ab?.id === 'homing' && this.weaponKind !== 'fan';
    if (target?.sprite.active && canEat(target, this.scene.player)) {
      const radius = target.size + 5;
      g.lineStyle(4, 0x4e4835, 0.9).strokeCircle(target.x, target.y, radius);
      g.lineStyle(2, omni ? 0xfffdf1 : 0xffe693, 1).strokeCircle(target.x, target.y, radius);
      const tip = target.y - radius - 2;
      if (omni) this.drawFeather(g, target.x, tip);
      else g.fillStyle(0xffdf78).fillTriangle(target.x, tip, target.x - 5, tip - 7, target.x + 5, tip - 7);
    }
    const r = tuning.orbRadius;
    for (const orb of this.orbs) {
      if (orb.kind === SPLIT) {
        const { x, y, vx, vy } = orb;
        const st = STEM_BY_ID.S2.orbStyle;
        g.lineStyle(r * 0.8, st.tail, 0.65).lineBetween(x - vx * r * 2.4, y - vy * r * 2.4, x, y);
        g.fillStyle(st.sub).fillCircle(x, y, r * 0.8 + 1);
        g.fillStyle(st.main).fillCircle(x, y, r * 0.8);
      } else if (orb.weapon === 'yeouiju' || orb.weapon === undefined) {
        drawOrb(g, orb, orb.style, orb.tier);
      } else {
        drawWeaponShot(g, orb, orb.weapon, orb.style, orb.tier);
      }
    }
    drawWeapons(this, g, sg, now, this.ab ? this.abForm.stem : null, this.ab ? this.ab.stage : 1);
    this.drawPearls(g);
    this.drawFields(sg, now);
    this.drawStatus(sg, now);
  }

  // 표적 머리 위 작은 깃(학익 추적): 깃대 하나와 양쪽 가시
  drawFeather(g, x, y) {
    g.lineStyle(3, 0x439483, 1).lineBetween(x, y, x, y - 12);
    g.lineStyle(2, 0xfffdf1, 1);
    g.lineBetween(x, y - 3, x - 5, y - 8);
    g.lineBetween(x, y - 6, x + 5, y - 11);
    g.lineBetween(x, y - 9, x - 4, y - 13);
  }

  drawPearls(g) {
    const ab = this.ab;
    if (!ab || ab.id !== 'orbit') return;
    const now = this.now();
    for (const p of this.pearls) {
      if (p.regenAt > now) continue;
      drawOrb(g, p, 'E4', ab.stage);
    }
  }

  drawFields(g, now) {
    for (const c of this.clouds) {
      const k = Math.min(1, (c.until - now) / Math.max(1e-6, c.until - c.born));
      const a = Math.min(1, k * 2);
      const r = c.r;
      g.fillStyle(0xfffdf1, 0.32 * a);
      for (const [ox, oy, rr] of CLOUD_LOBES) g.fillCircle(c.x + ox * r, c.y + oy * r, rr * r);
      g.lineStyle(2.5, 0xc06558, 0.85 * a);
      for (const [ox, oy, rr] of CLOUD_LOBES) {
        g.beginPath();
        g.arc(c.x + ox * r, c.y + oy * r, rr * r, Math.PI * (ox < 0 ? 0.55 : ox > 0 ? 1.0 : 1.05), Math.PI * (ox < 0 ? 1.9 : ox > 0 ? 2.45 : 1.95), false);
        g.strokePath();
      }
    }
    for (const v of this.vortices) {
      const k = Math.min(1, (v.until - now) / Math.max(1e-6, v.until - v.born));
      const spin = (now * 6) % TAU;
      for (let i = 0; i < 3; i++) {
        const a0 = spin + (i * TAU) / 3;
        g.lineStyle(3, 0x536581, 0.85 * k);
        g.beginPath();
        g.arc(v.x, v.y, v.r * 0.8, a0, a0 + 1.5, false);
        g.strokePath();
        g.lineStyle(1.5, 0xe4eaee, 0.9 * k);
        g.beginPath();
        g.arc(v.x, v.y, v.r * 0.5, a0 + 0.4, a0 + 1.5, false);
        g.strokePath();
      }
    }
    for (const b of this.bolts) {
      if (b.until <= now) continue;
      const k = (b.until - now) / b.life;
      const dx = b.x2 - b.x1, dy = b.y2 - b.y1;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const amp = Math.min(14, len * 0.18);
      // 꺾임 3개: 1/4·1/2·3/4 지점을 번갈아 옆으로 민다(좌표를 배열에 담지 않고 바로 이어 그린다)
      const p1x = b.x1 + dx * 0.25 + nx * amp * b.j1, p1y = b.y1 + dy * 0.25 + ny * amp * b.j1;
      const p2x = b.x1 + dx * 0.5 - nx * amp * b.j2, p2y = b.y1 + dy * 0.5 - ny * amp * b.j2;
      const p3x = b.x1 + dx * 0.75 + nx * amp * b.j2, p3y = b.y1 + dy * 0.75 + ny * amp * b.j2;
      for (const [width, color] of BOLT_PASSES) {
        g.lineStyle(width, color, Math.min(1, k * 1.5));
        g.beginPath();
        g.moveTo(b.x1, b.y1);
        g.lineTo(p1x, p1y);
        g.lineTo(p2x, p2y);
        g.lineTo(p3x, p3y);
        g.lineTo(b.x2, b.y2);
        g.strokePath();
      }
    }
    for (const ring of this.rings) {
      if (ring.until <= now) continue;
      const k = (ring.until - now) / ring.life;
      g.lineStyle(3, 0xd9503f, k).strokeCircle(ring.x, ring.y, ring.r * (1.2 - 0.6 * k));
      g.lineStyle(2, 0xefbd6c, k).strokeCircle(ring.x, ring.y, ring.r * (0.9 - 0.45 * k));
    }
  }

  // 적 위의 상태 표시(평면 도형만): 빙결 육각, 위협 톱니, 작열 불꽃, 파사인 마름모, 매혹 고리·여우불
  drawStatus(g, now) {
    for (const e of this.scene.enemies) {
      if (!e.sprite.active) continue;
      const { x, y, size } = e;
      if (e.frozenUntil > now) {
        for (const [width, color] of FREEZE_PASSES) {
          g.lineStyle(width, color, 0.95);
          g.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (i * TAU) / 6 + Math.PI / 6;
            const px = x + Math.cos(a) * size * 1.12, py = y + Math.sin(a) * size * 1.12;
            if (i === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
          }
          g.closePath();
          g.strokePath();
        }
      }
      if (e.fearUntil > now) {
        g.lineStyle(3, 0xc45148, 0.95);
        for (let i = -1; i <= 1; i++) {
          const px = x + i * 9, py = y - size - 8;
          g.beginPath();
          g.moveTo(px - 3, py);
          g.lineTo(px, py - 8);
          g.lineTo(px + 3, py);
          g.strokePath();
        }
      }
      if (e.burnUntil > now) {
        for (const s of BURN_SIDES) {
          const px = x + s * size, py = y - size * 0.1;
          const w = Math.max(5, size * 0.16);
          g.fillStyle(0xd9503f).fillTriangle(px - w, py + w, px + w, py + w, px, py - w * 1.5);
          g.fillStyle(0xffd3a2).fillTriangle(px - w * 0.5, py + w, px + w * 0.5, py + w, px, py - w * 0.4);
        }
      }
      if (e.markUntil > now) {
        const py = y - size - 12;
        g.fillStyle(0xefbd6c);
        g.lineStyle(2, 0x4e4835, 1);
        g.beginPath();
        g.moveTo(x, py - 7);
        g.lineTo(x + 6, py);
        g.lineTo(x, py + 7);
        g.lineTo(x - 6, py);
        g.closePath();
        g.fillPath();
        g.strokePath();
      }
      if (e.charmUntil > now) {
        const k = Math.max(0, Math.min(1, (e.charmUntil - now) / Math.max(1e-6, e.charmDur)));
        const ry = y + size * 0.6;
        g.lineStyle(5, 0x2d6b5e, 0.9);
        g.beginPath();
        g.arc(x, ry, size * 0.9, -Math.PI / 2, -Math.PI / 2 + TAU * k, false);
        g.strokePath();
        g.lineStyle(3, 0x85cfb7, 1);
        g.beginPath();
        g.arc(x, ry, size * 0.9, -Math.PI / 2, -Math.PI / 2 + TAU * k, false);
        g.strokePath();
        const fy = y - size - 10;
        g.fillStyle(0x85cfb7).fillCircle(x, fy, 5);
        g.fillStyle(0xd2efc8).fillTriangle(x - 4, fy - 2, x + 4, fy - 2, x, fy - 12);
      }
    }
  }
}
