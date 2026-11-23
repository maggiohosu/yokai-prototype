// 보패 발사 규칙(설계 docs/design-weapons.md 2-3): 학우선 깃·팔괘경 광선·도목검 칼·염주 알·단호로 물방울과 웅덩이·삼청령 고리·옥인 인장.
// 여의주 구슬은 combat.js가 그대로 쏜다. 이 파일의 함수는 모두 Combat 인스턴스(c)를 첫 인자로 받아 그 배열·사건 처리를 쓴다(Phaser 의존 없음).
// - 모든 피해는 c.onWeaponHit → applyTreasureDamage 한 곳을 지난다(역전·처치가 사건당 한 번씩).
// - 능력(퍼지는 효과)은 무기마다 '발동 단위'가 달라서 이 파일이 단위(줄·고리·웅덩이 생성·인장·염주 1초 …)를 정해 c.spreadAt을 부른다.
// - 무기 시간 값(쿨타임·웅덩이 지속·고리 퍼짐·인장 지연·염주 재타격)은 시뮬레이션 초다(설계 D8). 능력 시간 값만 화면 초(simSeconds).
// - 프레임마다 배열·객체를 새로 만들지 않는다: 조회 결과는 c.scratchC, 그리기용 모양은 c.shotView 하나를 재사용한다.

import { CONFIG } from '../config.js';
import { canEat, stageOf } from '../systems/rules.js';
import { ABILITY_RULES } from '../systems/tuning-abilities.js';
import { resisted } from '../systems/abilities.js';
import { drawWeaponShot } from '../art/weapons.js';
import { applySlow, isShielded, simSeconds } from './status.js';

const tuning = CONFIG.combat;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const FALLBACK_SIZE = 20; // 옥인이 표적 없이 앞쪽 지점에 떨어질 때 가정하는 표적 크기

// 균형 보정(설계 2-4 '못 맞추면 한 번 피해 계수만 고친다'): 허수아비 시험(tests/weapon-balance.test.mjs)의 세 조건을 지키도록
// 설계 2-2의 한 번 피해 계수에 무기별로 곱한다. 명중 피해·염주 접촉·퍼짐·웅덩이 초당 피해에 같이 걸리고, 능력 기준 피해 B와 개수·쿨타임·사거리에는 걸리지 않는다.
// 데이터 파일(data/weapons.js)의 계수는 W1 표 그대로다. 계수를 옮기면 이 표를 1로 되돌린다.
export const BALANCE = {
  yeouiju: { hit: 1 },
  fan: { hit: 1.18 }, // +10에서 가까운 큰 적·뭉친 무리의 주력 비율 1.2를 넘기려면 올려야 한다(1.11 이상)
  mirror: { hit: 0.8 }, // 일렬 시험이 4.0을 넘어서(×4.09) 내린다
  sword: { hit: 0.55 }, // 뭉친 무리가 5.56배라 내린다(두 길 모두 모든 적을 꿰뚫는다)
  beads: { hit: 1 },
  gourd: { hit: 1.4, pool: 0.2 }, // 물방울과 웅덩이 계수를 따로 둔다. 겹친 웅덩이도 각각 피해를 준다.
  bell: { hit: 0.85 }, // +10 뭉친 무리 3.86배
  seal: { hit: 0.45 }, // 위협이 없을 때 같은 전방 지점에 떨어지는 인장을 포함한다.
};

// 선분 (ax,ay)-(bx,by)와 점 (px,py)의 최단 거리 제곱
function segDist2(ax, ay, bx, by, px, py) {
  const vx = bx - ax, vy = by - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2)) : 0;
  const dx = ax + vx * t - px, dy = ay + vy * t - py;
  return dx * dx + dy * dy;
}

// 명중 사건 맥락을 채워 돌려준다(c.hitCtx 하나를 재사용).
function ctxOf(c, enemy, kind, weapon, amount, base, dx, dy, durMul = 1, pushMult = 1, eventId = 0) {
  const x = c.hitCtx;
  x.x = enemy.x;
  x.y = enemy.y;
  x.primary = true;
  x.kind = kind;
  x.weapon = weapon;
  x.amount = amount;
  x.base = base;
  x.dirX = dx;
  x.dirY = dy;
  x.durMul = durMul;
  x.pushMult = pushMult;
  x.eventId = eventId;
  x.silent = false;
  return x;
}

// 퍼지는 효과의 자리(c.anchor 하나를 재사용): (x,y) 효과 자리, enemy·ex·ey·es 맞은 적과 그 때의 자리·크기, (vx,vy) 진행 방향.
function anchorOf(c, x, y, enemy, ex, ey, es, vx, vy, base, speed = tuning.orbSpeed) {
  const a = c.anchor;
  a.x = x;
  a.y = y;
  a.enemy = enemy;
  a.ex = ex;
  a.ey = ey;
  a.es = es;
  a.vx = vx;
  a.vy = vy;
  a.base = base;
  a.speed = speed;
  a.style = c.shot.style;
  a.tier = c.shot.tier;
  return a;
}

// ---------------------------------------------------------------------------------------------------------------------------
// 발사: 쿨타임이 되어 버튼을 눌렀을 때 한 번. k = { dmg(명중 한 번 피해, 등급·균형 보정 포함), base(능력 기준 피해 B, 등급 포함), scale(등급 × 균형 보정), style, tier }
// ---------------------------------------------------------------------------------------------------------------------------

export function fireWeapon(c, st, k) {
  switch (st.kind) {
    case 'fan': fireFan(c, st, k); break;
    case 'mirror': fireMirror(c, st, k); break;
    case 'sword': fireSword(c, st, k); break;
    case 'beads': fireBeads(c, st, k); break;
    case 'gourd': fireGourd(c, st, k); break;
    case 'bell': fireBell(c, st, k); break;
    case 'seal': fireSeal(c, st); break;
    default: break;
  }
  c.wc.fires++;
}

// 스트레스 모드와 Node 벤치마크의 같은 시작 상태. 실제 발사물로 각 무기의 동시 상한을 한 번 채운다.
export function seedWeaponStress(c) {
  const st = c.stats();
  c.refreshWeapon();
  c.refreshAbility();
  c.refreshShot(st);
  const { player } = c.scene;
  const now = c.now();
  c.fire(st);
  if (st.kind === 'mirror') c.fire(st);
  if (st.kind === 'bell' || st.kind === 'seal') c.fire(st);
  if (st.kind === 'beads') stepBeads(c, st, now, 0);
  if (st.kind === 'gourd') {
    for (let i = 0; i < st.poolMax; i++) {
      const a = i * TAU / st.poolMax;
      makeGourdPool(c, player.x + Math.cos(a) * 130, player.y + Math.sin(a) * 130, null, 1, 0, now);
    }
  }
  const batch = { count: 8, range: 240, damage: 0.4 };
  const src = { ...c.shot, vx: 1, vy: 0, speed: tuning.orbSpeed };
  for (let i = 0; c.orbs.length < tuning.maxOrbs; i++) {
    const a = i * 2.4;
    src.vx = Math.cos(a);
    src.vy = Math.sin(a);
    c.splitFrom(src, null, player.x + src.vx * 90, player.y + src.vy * 90, batch);
  }
}

// 학우선: 깃 3K장을 앞쪽 부채꼴에 고르게. 부채 각도는 레벨(방향 수 W)에 따라 50° → 120°.
function fireFan(c, st, k) {
  const { player } = c.scene;
  const n = st.count;
  const base = Math.atan2(c.heading.y, c.heading.x);
  const gap = n > 1 ? (st.spreadDeg * DEG) / (n - 1) : 0;
  const homing = c.homingFor(st);
  const vol = c.newVolley();
  const mid = Math.floor((n - 1) / 2);
  for (let i = 0; i < n; i++) {
    if (c.orbs.length >= tuning.maxOrbs) break;
    const a = base + (i - (n - 1) / 2) * gap;
    const orb = c.makeOrb(player.x, player.y, Math.cos(a), Math.sin(a), st.speed, homing, k, st.reach, 'fan');
    orb.vol = vol;
    orb.center = i === mid;
    if (c.ab) c.armOrb(orb, c.ab);
    c.orbs.push(orb);
  }
}

// 도목검: 칼 ceil(W/2)자루를 앞쪽 12° 간격으로. 가는 길·오는 길 모두 관통(같은 적 한 번).
function fireSword(c, st, k) {
  const { player } = c.scene;
  const m = c.mods;
  const n = st.count;
  const base = Math.atan2(c.heading.y, c.heading.x);
  const reach = st.reach * (m.reachMult ?? 1);
  const homing = c.homingFor(st);
  for (let i = 0; i < n; i++) {
    if (c.orbs.length >= tuning.maxOrbs) break;
    const a = base + (i - (n - 1) / 2) * st.fanDeg * DEG;
    const orb = c.makeOrb(player.x, player.y, Math.cos(a), Math.sin(a), st.speed, homing, k, reach, 'sword');
    orb.damage *= m.damageMult ?? 1;
    orb.hits = [];
    if (c.ab) c.armOrb(orb, c.ab);
    c.orbs.push(orb);
  }
}

// 단호로: 물방울 ceil(W/3)개를 ±15° 간격으로 던진다. 닿거나 사거리 끝에서 웅덩이가 된다(makePool).
function fireGourd(c, st, k) {
  const { player } = c.scene;
  const n = st.count;
  const base = Math.atan2(c.heading.y, c.heading.x);
  const homing = c.homingFor(st);
  for (let i = 0; i < n; i++) {
    if (c.orbs.length >= tuning.maxOrbs) break;
    const a = base + (i - (n - 1) / 2) * st.dropSpreadDeg * DEG;
    const orb = c.makeOrb(player.x, player.y, Math.cos(a), Math.sin(a), st.speed, homing, k, st.reach, 'gourd');
    if (c.ab) c.armOrb(orb, c.ab);
    c.orbs.push(orb);
  }
}

// 팔괘경: 줄마다 선분 안의 적을 즉시 모두 친다(구슬 객체 없음).
function fireMirror(c, st, k) {
  const { player } = c.scene;
  const m = c.mods;
  const now = c.now();
  const n = st.count;
  let a0 = Math.atan2(c.heading.y, c.heading.x);
  const snap = m.snapDeg ?? st.aimSnapDeg; // +8부터(학익 추적이면 처음부터) 앞쪽 ±각도 안의 가장 가까운 위협 쪽으로 첫 줄을 돌린다
  if (snap > 0) {
    const target = c.findTargetCone(player.x, player.y, c.heading.x, c.heading.y, st.reach, Math.cos(snap * DEG), now);
    if (target) a0 = Math.atan2(target.y - player.y, target.x - player.x);
  }
  const halfWidth = st.halfWidth + (m.halfWidthAdd ?? 0);
  const dmg = k.dmg * (m.damageMult ?? 1);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i * TAU) / n;
    beamLine(c, st, player.x, player.y, Math.cos(a), Math.sin(a), halfWidth, dmg, k.base, false, now);
    if (m.reflectMult && c.echoes.length < 8) {
      c.echoes.push({ at: now + m.reflectDelay, x: player.x, y: player.y, dx: Math.cos(a), dy: Math.sin(a), halfWidth, dmg: dmg * m.reflectMult, base: k.base });
    }
  }
}

// 한 줄: 선분(x1,y1 → +방향 × 사거리)과 거리 ≤ 적 크기 + 반폭인 적을 가까운 순으로 모두 친다. echo면 반사(퍼지는 효과 없음).
function beamLine(c, st, x1, y1, dx, dy, halfWidth, dmg, base, echo, now) {
  const m = c.mods;
  const len = st.reach;
  const x2 = x1 + dx * len, y2 = y1 + dy * len;
  const list = c.nearW(x1 + dx * len * 0.5, y1 + dy * len * 0.5, len * 0.5 + halfWidth + c.maxSize());
  const found = c.beamFound, along = c.beamAlong;
  found.length = 0;
  along.length = 0;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e.sprite.active || isShielded(e, now)) continue;
    const reach = e.size + halfWidth;
    if (segDist2(x1, y1, x2, y2, e.x, e.y) > reach * reach) continue;
    const t = (e.x - x1) * dx + (e.y - y1) * dy;
    let p = found.length;
    found.push(e);
    along.push(t);
    while (p > 0 && along[p - 1] > t) {
      along[p] = along[p - 1];
      found[p] = found[p - 1];
      p--;
    }
    along[p] = t;
    found[p] = e;
  }
  const beam = c.beams[c.beamIdx = (c.beamIdx + 1) % c.beams.length];
  beam.x1 = x1;
  beam.y1 = y1;
  beam.x2 = x2;
  beam.y2 = y2;
  beam.width = halfWidth * 2;
  beam.life = simSeconds(0.12, c.scene);
  beam.until = now + beam.life;
  beam.echo = echo;
  const id = ++c.beamSeq;
  let lastX = 0, lastY = 0, lastS = 0, last = null;
  const count = found.length;
  for (let i = 0; i < count; i++) {
    const e = found[i];
    lastX = e.x;
    lastY = e.y;
    lastS = e.size;
    last = e;
    const ctx = ctxOf(c, e, 'beam', 'mirror', dmg, base, dx, dy, 1, m.pushMult ?? 1, id);
    ctx.silent = i >= 3;
    c.onWeaponHit(ctx, e, now);
    c.wc.beamHits++;
  }
  if (count > 0 && !echo && c.cell?.trigger === 'beamEnd') {
    c.spreadAt(anchorOf(c, lastX, lastY, last, lastX, lastY, lastS, dx, dy, base), now);
  }
}

// 반사 광선(팔괘경 × 회선): 정해 둔 시각이 되면 같은 줄을 한 번 더 친다.
export function stepEchoes(c, now) {
  const st = c.stats();
  for (let i = c.echoes.length - 1; i >= 0; i--) {
    const e = c.echoes[i];
    if (now < e.at) continue;
    c.echoes.splice(i, 1);
    if (st.kind === 'mirror') beamLine(c, st, e.x, e.y, e.dx, e.dy, e.halfWidth, e.dmg, e.base, true, now);
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// 염주: 알이 늘 내 둘레를 돈다. 발사하면 0.25초에 걸쳐 바깥으로 퍼졌다 0.25초에 돌아온다.
// ---------------------------------------------------------------------------------------------------------------------------

function fireBeads(c, st) {
  const b = c.burst;
  if (b.t >= 0) return; // 퍼짐이 아직 끝나지 않았으면 새로 시작하지 않는다(쿨타임이 더 길어서 보통 일어나지 않는다)
  b.id++;
  b.t = 0;
  b.zoneDone = false;
}

export function beadTotal(c, st) {
  const m = c.mods;
  return m.extraBeads ? Math.min(m.maxBeads, st.count + m.extraBeads) : st.count;
}

export function stepBeads(c, st, now, h) {
  const { player } = c.scene;
  const m = c.mods;
  const cell = c.cell;
  const k = c.shot;
  const beads = c.beads;
  const want = beadTotal(c, st);
  while (beads.length > want) beads.pop();
  while (beads.length < want) beads.push({ x: 0, y: 0, vx: 0, vy: 1, regenAt: 0 });
  const sim = simSeconds(1, c.scene);
  c.beadAngle = (c.beadAngle + (st.spinRadPerSec * h) / sim) % TAU;
  const b = c.burst;
  let spread = 0, phase = 0; // phase: 0 없음, 1 나가는 중, 2 돌아오는 중
  if (b.t >= 0) {
    b.t += h;
    if (b.t >= st.burstOutSec + st.burstBackSec) b.t = -1;
    else if (b.t < st.burstOutSec) {
      spread = b.t / st.burstOutSec;
      phase = 1;
    } else {
      spread = 1 - (b.t - st.burstOutSec) / st.burstBackSec;
      phase = 2;
    }
  }
  const orbitR = (player.size * st.orbitSizeMult + st.orbitPad) * (m.orbitMult ?? 1);
  const R = orbitR * (1 + (st.burstMult - 1) * spread);
  const pr = tuning.orbRadius * ABILITY_RULES.orbit.pearlRadiusMult;
  const count = beads.length;
  const dmgMult = m.damageMult ?? 1;
  let contactDmg = st.contactDamage * k.scale * dmgMult;
  if (m.contactFloor) {
    const floor = k.base * m.contactFloor; // 염주 × 호신주: 접촉 피해 = max(염주 접촉, B × 진주 접촉 피해)
    if (floor > contactDmg) {
      contactDmg = floor;
    }
  }
  const burstDmg = st.burstDamage * k.scale * dmgMult;
  const gate = st.rehitSec;
  for (let i = 0; i < count; i++) {
    const bead = beads[i];
    const a = c.beadAngle + (i * TAU) / count;
    bead.x = player.x + Math.cos(a) * R;
    bead.y = player.y + Math.sin(a) * R;
    bead.vx = -Math.sin(a);
    bead.vy = Math.cos(a);
    if (bead.regenAt > now) continue;
    const list = c.nearW(bead.x, bead.y, pr + c.maxSize());
    for (let j = 0; j < list.length; j++) {
      const e = list[j];
      if (!e.sprite.active || isShielded(e, now)) continue;
      if (Math.hypot(e.x - bead.x, e.y - bead.y) > pr + e.size) continue;
      const ox = e.x - player.x, oy = e.y - player.y;
      const om = Math.hypot(ox, oy) || 1;
      if ((phase === 1 || (phase === 2 && !m.backHit)) && (e.beadBurstId ?? 0) < b.id * 2) {
        e.beadBurstId = b.id * 2;
        beadHit(c, 'burst', e, burstDmg, k.base, ox / om, oy / om, now, cell, b);
      } else if (phase === 2 && m.backHit && (e.beadBurstId ?? 0) < b.id * 2 + 1) {
        e.beadBurstId = b.id * 2 + 1;
        beadHit(c, 'burst', e, burstDmg * m.backMult, k.base, ox / om, oy / om, now, cell, b);
      }
      if (e.sprite.active && now >= (e.beadGateUntil ?? 0)) {
        e.beadGateUntil = now + gate;
        beadHit(c, 'contact', e, contactDmg, k.base, ox / om, oy / om, now, cell, b);
        if (m.block) c.counters.orbit++;
      }
    }
  }
}

function beadHit(c, kind, e, dmg, base, dx, dy, now, cell, burst) {
  const { player } = c.scene;
  const ex = e.x, ey = e.y, es = e.size;
  const ctx = ctxOf(c, e, kind, 'beads', dmg, base, dx, dy, 1, 1, burst.id);
  c.onWeaponHit(ctx, e, now);
  c.wc[kind === 'burst' ? 'burstHits' : 'contactHits']++;
  if (!c.ab) return;
  if (cell.trigger === 'enemySec') {
    if (now >= (e.beadFxUntil ?? 0)) {
      e.beadFxUntil = now + simSeconds(1, c.scene);
      c.spreadAt(anchorOf(c, ex, ey, e, ex, ey, es, dx, dy, base), now);
    }
  } else if (cell.trigger === 'burstAtMe' && kind === 'burst' && !burst.zoneDone) {
    burst.zoneDone = true;
    c.spreadAt(anchorOf(c, player.x, player.y, null, player.x, player.y, 0, dx, dy, base), now);
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// 단호로: 물방울이 닿거나 끝나는 자리에 웅덩이. 웅덩이 안의 적은 단계마다 초당 피해 × h를 받고, 처음 들어올 때(웅덩이당 4마리까지) 상태이상이 걸린다.
// ---------------------------------------------------------------------------------------------------------------------------

export function makeGourdPool(c, x, y, src, vx, vy, now) {
  const st = c.stats();
  const m = c.mods;
  const k = c.shot;
  if (c.pools.length >= st.poolMax) c.pools.shift();
  let r = st.poolRadius * (m.poolRadiusMult ?? 1);
  if (m.poolRadiusCap) r = Math.min(r, m.poolRadiusCap);
  let life = st.poolDuration * (m.poolDurationMult ?? 1);
  if (m.poolDurationCap) life = Math.min(life, m.poolDurationCap);
  c.pools.push({
    id: ++c.poolSeq, x, y, r, born: now, life, until: now + life,
    dps: st.poolDps * k.grade * BALANCE.gourd.pool, base: k.base, slow: m.poolSlow ?? 0, pull: m.poolPull ?? 0, seen: [],
  });
  c.wc.pools++;
  if (c.ab && c.cell?.trigger === 'poolBorn') {
    c.spreadAt(anchorOf(c, x, y, src, x, y, 0, vx, vy, k.base), now);
  }
}

export function stepPools(c, now, h) {
  const { pools } = c;
  const myStage = c.myStage();
  const ab = c.ab;
  for (let i = pools.length - 1; i >= 0; i--) {
    const p = pools[i];
    if (p.until <= now) {
      pools.splice(i, 1);
      continue;
    }
    const list = c.nearW(p.x, p.y, p.r + c.maxSize());
    for (let j = 0; j < list.length; j++) {
      const e = list[j];
      if (!e.sprite.active || isShielded(e, now)) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d > p.r + e.size) continue;
      if (p.seen.length < 4 && !p.seen.includes(e)) {
        p.seen.push(e);
        if (ab) c.onWeaponHit(ctxOf(c, e, 'poolEnter', 'gourd', 0, p.base, 0, 0, 1, 1, p.id), e, now);
        c.wc.poolEnters++;
      }
      const delta = Math.max(0, stageOf(e) - myStage);
      if (p.slow > 0) {
        const slow = resisted('zone', 'slow', p.slow, delta);
        if (slow > 0) {
          applySlow(e, now, h * 2.5, 1 - Math.min(slow, 0.95));
          c.counters.zone++;
        }
      }
      if (p.pull > 0 && d >= 1) {
        const pull = resisted('vortex', 'pull', p.pull, delta);
        if (pull > 0) {
          const move = Math.min(pull * h, d);
          c.shove(e, ((p.x - e.x) / d) * move, ((p.y - e.y) / d) * move);
          c.counters.vortex++;
        }
      }
      const removed = c.applyTreasureDamage(e, p.dps * h, { silent: true });
      if (ab?.id === 'drain') c.drain(removed, ab);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// 삼청령: 고리가 내 몸에서 0.3초에 최대 반경까지 퍼진다. 고리가 지나간 적마다 1회(고리당 중복 없음).
// ---------------------------------------------------------------------------------------------------------------------------

// 동시에 퍼지는 고리마다 비트 하나를 쓴다. 슬롯을 재사용할 때만 적의 해당 비트를 지운다.
function ringSlot(c) {
  let used = 0;
  for (const wave of c.waves) used |= wave.bit;
  let bit = 1;
  while (used & bit) bit <<= 1;
  for (const enemy of c.scene.enemies) enemy.ringHitId &= ~bit;
  return bit;
}

function fireBell(c, st, k) {
  const m = c.mods;
  let maxR = st.ringMaxRadius * (m.ringMult ?? 1);
  if (m.ringCap) maxR = Math.min(maxR, m.ringCap);
  const dmg = k.dmg * (m.damageMult ?? 1);
  for (let i = 0; i < st.count; i++) {
    if (c.waves.length >= st.ringMax) break;
    c.waves.push({
      id: ++c.waveSeq, bit: ringSlot(c), delay: i * st.gapSec, r: 0, maxR, dir: 1, speed: maxR / st.spreadSec, dmg, base: k.base, echo: false,
      n: 0, bigS: -1, bigX: 0, bigY: 0, bigEnemy: null,
    });
  }
}

export function stepWaves(c, now, h) {
  const { player } = c.scene;
  const m = c.mods;
  const cell = c.cell;
  for (let i = c.waves.length - 1; i >= 0; i--) {
    const w = c.waves[i];
    const elapsed = Math.max(0, h - w.delay);
    w.delay = Math.max(0, w.delay - h);
    if (!elapsed) continue;
    const prev = w.r;
    w.r = Math.max(0, Math.min(w.maxR, prev + w.dir * w.speed * elapsed));
    const inner = Math.min(prev, w.r), outer = Math.max(prev, w.r);
    const reach = outer + 8 + c.maxSize();
    const list = c.nearW(player.x, player.y, reach);
    for (let j = 0; j < list.length; j++) {
      const e = list[j];
      if (!e.sprite.active || isShielded(e, now) || (e.ringHitId & w.bit)) continue;
      const ox = e.x - player.x, oy = e.y - player.y;
      const d = Math.hypot(ox, oy);
      if (d < inner - e.size - 8 || d > outer + e.size + 8) continue;
      e.ringHitId |= w.bit;
      const ex = e.x, ey = e.y, es = e.size;
      const om = d || 1;
      const ctx = ctxOf(c, e, 'ring', 'bell', w.dmg, w.base, ox / om, oy / om, m.durMul ?? 1, m.pushMult ?? 1, w.id);
      ctx.silent = w.n >= 3;
      c.onWeaponHit(ctx, e, now);
      c.wc.ringHits++;
      w.n++;
      if (es > w.bigS) {
        w.bigS = es;
        w.bigX = ex;
        w.bigY = ey;
        w.bigEnemy = e;
      }
    }
    const done = w.dir > 0 ? w.r >= w.maxR : w.r <= 0;
    if (!done) continue;
    c.waves.splice(i, 1);
    if (w.echo) continue;
    if (c.ab && w.n > 0) {
      const bx = w.bigX - player.x, by = w.bigY - player.y;
      const bm = Math.hypot(bx, by) || 1;
      if (cell.trigger === 'ring') c.spreadAt(anchorOf(c, w.bigX, w.bigY, w.bigEnemy, w.bigX, w.bigY, w.bigS, bx / bm, by / bm, w.base), now);
      else if (cell.trigger === 'ringAtMe') c.spreadAt(anchorOf(c, player.x, player.y, null, player.x, player.y, 0, bx / bm, by / bm, w.base), now);
    }
    if (m.echoMult && c.waves.length < c.stats().ringMax) {
      c.waves.push({
        id: ++c.waveSeq, bit: ringSlot(c), delay: 0, r: w.maxR, maxR: w.maxR, dir: -1, speed: w.speed, dmg: w.dmg * m.echoMult, base: w.base, echo: true,
        n: 0, bigS: -1, bigX: 0, bigY: 0, bigEnemy: null,
      });
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// 옥인: 앞쪽 35° 안 가까운 위협 위에 그림자를 띄우고 0.35초 뒤 그 자리에 떨어진다(그림자 자리는 발사 순간에 고정).
// ---------------------------------------------------------------------------------------------------------------------------

// 위협 후보를 가까운 순으로 limit개까지 out에 모은다. 위협 = 나를 먹을 수 있고, 역전되지 않았고, 아군이 아닌 적.
function collectThreats(c, x, y, radius, hx, hy, cosCone, now, limit, out, dists) {
  out.length = 0;
  dists.length = 0;
  const { player } = c.scene;
  const list = c.nearW(x, y, radius);
  const r2 = radius * radius;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e.sprite.active) continue;
    const dx = e.x - x, dy = e.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    if (cosCone > -1 && dx * hx + dy * hy < Math.sqrt(d2) * cosCone) continue;
    if (e.reversed || isShielded(e, now) || !canEat(e, player)) continue;
    let p = out.length;
    if (p >= limit && d2 >= dists[p - 1]) continue;
    if (p >= limit) {
      out.pop();
      dists.pop();
      p--;
    }
    out.push(e);
    dists.push(d2);
    while (p > 0 && dists[p - 1] > d2) {
      dists[p] = dists[p - 1];
      out[p] = out[p - 1];
      p--;
    }
    dists[p] = d2;
    out[p] = e;
  }
  return out;
}

function fireSeal(c, st) {
  const { player } = c.scene;
  const m = c.mods;
  const now = c.now();
  const cone = m.omni ? -1 : Math.cos(st.coneDeg * DEG);
  const picks = collectThreats(c, player.x, player.y, st.sense * (m.senseMult ?? 1), c.heading.x, c.heading.y, cone, now, st.count, c.sealPick, c.sealDist);
  for (let i = 0; i < st.count; i++) {
    if (c.seals.length >= st.sealMax) break;
    let s;
    if (i < picks.length) {
      const e = picks[i];
      s = { x: e.x, y: e.y, size: e.size, primary: e, at: now + st.delaySec, mult: 1, echo: false };
    } else {
      s = { x: player.x + c.heading.x * st.fallback, y: player.y + c.heading.y * st.fallback, size: FALLBACK_SIZE, primary: null, at: now + st.delaySec, mult: 1, echo: false };
    }
    s.id = ++c.shotSeq;
    c.seals.push(s);
  }
}

export function stepSeals(c, now) {
  for (let i = c.seals.length - 1; i >= 0; i--) {
    const s = c.seals[i];
    if (now < s.at) continue;
    c.seals.splice(i, 1);
    slam(c, s, now);
  }
}

function sealRadius(c, s) {
  return (s.size + c.stats().slamPad + (c.mods.slamRadiusAdd ?? 0)) * (c.mods.slamRadiusMult ?? 1);
}

function slam(c, s, now) {
  const st = c.stats();
  const m = c.mods;
  const k = c.shot;
  const radius = sealRadius(c, s);
  const list = c.nearW(s.x, s.y, radius + c.maxSize());
  // 주 표적: 처음 고른 표적이 아직 반경 안이면 그 적, 아니면 반경 안에서 중심에 가장 가까운 적.
  let primary = null, best = Infinity;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!e.sprite.active || isShielded(e, now)) continue;
    const d = Math.hypot(e.x - s.x, e.y - s.y);
    if (d > radius + e.size) continue;
    if (e === s.primary) {
      primary = e;
      break;
    }
    if (d < best) {
      best = d;
      primary = e;
    }
  }
  const imp = c.impacts[c.impactIdx = (c.impactIdx + 1) % c.impacts.length];
  imp.x = s.x;
  imp.y = s.y;
  imp.r = radius;
  imp.life = simSeconds(0.18, c.scene);
  imp.until = now + imp.life;
  c.wc.slams++;
  if (!s.echo && m.echoMult && c.seals.length < st.sealMax) {
    c.seals.push({ ...s, id: ++c.shotSeq, at: now + m.echoDelay, mult: m.echoMult, echo: true });
  }
  if (!primary) return;
  const dmg = k.dmg * s.mult; // k.dmg = 인장 한 번 피해(hitDamage × 등급), echo는 mult로 줄인다
  const snap = c.snap;
  slamHit(c, s, primary, true, dmg, now, snap);
  const px = snap.x, py = snap.y, ps = snap.size, pdx = snap.dx, pdy = snap.dy;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e === primary || !e.sprite.active || isShielded(e, now)) continue;
    if (Math.hypot(e.x - s.x, e.y - s.y) > radius + e.size) continue;
    slamHit(c, s, e, false, dmg, now, snap);
  }
  if (!s.echo && c.cell?.trigger === 'slam') {
    const field = c.ab.id === 'zone' || c.ab.id === 'vortex';
    c.spreadAt(anchorOf(c, field ? s.x : px, field ? s.y : py, primary, px, py, ps, pdx, pdy, k.base), now);
  }
}

// 인장 한 번이 적 하나를 친다. 주 표적은 나 → 적 방향, 나머지는 낙하 중심 → 바깥 방향으로 민다. 맞기 전의 자리·크기·방향을 snap에 남긴다.
function slamHit(c, s, e, first, dmg, now, snap) {
  const { player } = c.scene;
  const m = c.mods;
  const ex = e.x, ey = e.y, es = e.size;
  let dx = first ? ex - player.x : ex - s.x, dy = first ? ey - player.y : ey - s.y;
  const dm = Math.hypot(dx, dy);
  if (dm > 0) {
    dx /= dm;
    dy /= dm;
  }
  snap.x = ex;
  snap.y = ey;
  snap.size = es;
  snap.dx = dx;
  snap.dy = dy;
  const durMul = first ? (m.durMul ?? 1) : (m.durMulSecondary ?? m.durMul ?? 1);
  const pushMult = first ? (m.pushMult ?? 1) : (m.pushMultSecondary ?? m.pushMult ?? 1);
  const ctx = ctxOf(c, e, 'slam', 'seal', dmg, c.shot.base, dx, dy, durMul, pushMult, s.id);
  ctx.primary = first;
  c.onWeaponHit(ctx, e, now);
  c.wc.slamHits++;
}

// ---------------------------------------------------------------------------------------------------------------------------
// 그리기: 무기 모양은 src/art/weapons.js의 drawWeaponShot이 그린다. 이 파일은 모양을 정하지 않고 위치·크기·남은 비율만 넘긴다.
// shot.effect: 'beam' 광선 | 'bead' 염주 알 | 'pool' 웅덩이 | 'ring' 소리 고리 | 'shadow' 옥인 그림자 | 'impact' 옥인이 떨어진 자리
// ---------------------------------------------------------------------------------------------------------------------------

function shotOf(c, effect, x, y, vx, vy, r) {
  const s = c.shotView;
  s.effect = effect;
  s.x = x;
  s.y = y;
  s.vx = vx;
  s.vy = vy;
  s.r = r;
  s.x2 = null;
  s.y2 = null;
  s.halfWidth = 0;
  s.height = 0;
  return s;
}

// g: 발사체(구슬·광선·고리·알), sg: 장판(웅덩이·그림자)을 그리는 Graphics.
export function drawWeapons(c, g, sg, now, style, tier) {
  const pr = tuning.orbRadius * ABILITY_RULES.orbit.pearlRadiusMult;
  for (const b of c.beams) {
    if (b.until <= now) continue;
    const len = Math.hypot(b.x2 - b.x1, b.y2 - b.y1) || 1;
    const s = shotOf(c, 'beam', b.x1, b.y1, (b.x2 - b.x1) / len, (b.y2 - b.y1) / len, len);
    s.x2 = b.x2;
    s.y2 = b.y2;
    s.halfWidth = b.width / 2;
    drawWeaponShot(g, s, 'mirror', style, tier);
  }
  for (const bead of c.beads) {
    if (bead.regenAt > now) continue;
    drawWeaponShot(g, shotOf(c, 'bead', bead.x, bead.y, bead.vx, bead.vy, pr), 'beads', style, tier);
  }
  for (const w of c.waves) {
    if (w.delay > 0) continue;
    const { player } = c.scene;
    drawWeaponShot(g, shotOf(c, 'ring', player.x, player.y, 1, 0, w.r), 'bell', style, tier);
  }
  for (const p of c.pools) {
    drawWeaponShot(sg, shotOf(c, 'pool', p.x, p.y, 1, 0, p.r), 'gourd', style, tier);
  }
  for (const s of c.seals) {
    const wait = Math.max(0, Math.min(1, (s.at - now) / Math.max(1e-6, c.stats().delaySec)));
    drawWeaponShot(sg, shotOf(c, 'shadow', s.x, s.y, 0, 1, sealRadius(c, s)), 'seal', style, tier);
    const stamp = shotOf(c, 'stamp', s.x, s.y, 0, 1, 0);
    stamp.height = 60 * wait;
    drawWeaponShot(g, stamp, 'seal', style, tier);
  }
  for (const imp of c.impacts) {
    if (imp.until <= now) continue;
    drawWeaponShot(g, shotOf(c, 'impact', imp.x, imp.y, 0, 1, imp.r), 'seal', style, tier);
  }
}
