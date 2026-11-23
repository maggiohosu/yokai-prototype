import { CONFIG } from '../config.js';
import { FORMS } from '../data/forms.js';
import { pickIntent, intentDirection } from './enemyAI.js';
import { canBeSpecial, rollSpecial, specialRule } from './enemyFire.js';
import { drawCreature } from '../art/creature.js';
import { Actor } from './actor.js';
import { between, clamp } from './world.js';
import { initStatus, isAlly, isDisabled, nowOf, slowFactor } from './status.js';
import { canEnemyBodyUp, enemySizeCap } from '../systems/growthCap.js';
import { rivalSizeCap, sizeSpeedMultiplier } from '../systems/balance.js';
import { evolutionCost, rollGrade } from '../systems/evolution.js';
import { bodyCostAt, newDiet, nextProgress, pickEvolution, preyInfoOf, preyValue } from '../systems/rules.js';

// 방위·단계의 형태 중 무작위(방위에 형태가 없으면 단계만 맞춘다). 1단계도 그 방위의 1단계 형태 2종 중 하나다.
export function formFor(dir, stage, rng = Math.random) {
  const ofStage = FORMS.filter((form) => form.stage === stage);
  const pool = ofStage.filter((form) => form.dir === dir);
  const list = pool.length ? pool : ofStage;
  return list[Math.floor(rng() * list.length)];
}

// 단계를 안 넘기면 예전처럼 크기로 정한다.
const stageFromSize = (size) => (size < CONFIG.enemy.stage3Size ? 2 : 3);

// 적도 플레이어와 같은 구조다: 먹어서 커지고, 요력이 쌓이면 스스로 진화·몸집 강화한다.
export class Enemy extends Actor {
  constructor(scene, pos, size, dir, stage = stageFromSize(size)) {
    const form = formFor(dir, stage);
    super(scene, pos.x, pos.y, size, form.id);
    this.dir = dir;
    this.stage = form.stage;
    this.grade = rollGrade(0);
    this.yoryeok = 0;
    this.diet = newDiet();
    this.bodyLevel = 0;
    this.wanderTime = 0;
    this.travelSteps = 0;
    this.travelX = 0;
    this.travelY = 0;
    this.steer = {};
    this.direction = null;
    this.aiIntent = null;
    this.aiTimer = 0;
    this.wanderAngle = 0;
    this.fireCd = undefined;
    this.speedSize = 0;
    this.sizeSpeed = 1;
    this.phase = undefined;
    this.flash = 0;
    this.punch = 1;
    this.rival = undefined;
    this.herald = undefined;
    this.rewardSize = undefined;
    this.thinkSlot = scene.nextThinkSlot ?? 0;
    scene.nextThinkSlot = (this.thinkSlot + 1) % CONFIG.render.farThinkSteps;
    this.vx = 0;
    this.vy = 0;
    this.reversed = false;
    this.rollOrbTrait();
    initStatus(this); // 상태이상 필드(빙결·위협·작열·파사인·둔화·밀림·매혹)를 숫자로 고정해 둔다
  }
  rollOrbTrait(rng = Math.random) {
    this.specialDraw = canBeSpecial(this.stage) ? rng() : 1;
    this.fireCd = undefined;
    this.refreshOrbRule();
  }
  // 플레이어가 진화해도 각 적의 추첨값을 유지하고, 남은 대기시간의 비율만 새 간격으로 옮긴다.
  refreshOrbRule() {
    const rule = specialRule(this.scene.player?.stage, this.scene.difficulty);
    const active = !this.rival && rollSpecial(this.size, this.stage, () => this.specialDraw, rule.chance);
    if (!active || !this.special) this.fireCd = undefined;
    else if (this.fireCd !== undefined) this.fireCd *= rule.cooldown / this.firePeriod;
    this.special = active;
    this.firePeriod = rule.cooldown;
  }
  // 맞수 대요괴(balance.rivalPlan): 플레이어와 같은 단계·비슷한 크기로 주기적으로 나오는 적. 몸집 상한은 플레이어 × capVsPlayer이고,
  // 같은 단계 규칙이 깨지지 않게 자가 진화·몸집 강화를 하지 않으며 구슬을 쏘는 특수 적도 되지 않는다. 이름표(label)는 PlayScene이 매 프레임 따라가게 한다.
  markRival() {
    this.rival = true;
    this.special = false;
    this.label = this.scene.add
      .text(0, 0, CONFIG.balance.rival.label, {
        fontFamily: CONFIG.font.family,
        fontStyle: 'bold',
        fontSize: '11px',
        color: '#fff9df',
        backgroundColor: '#7a3b2e',
        padding: { x: 7, y: 3 },
        resolution: 2,
      })
      .setOrigin(0.5, 0)
      .setDepth(3);
    this.followLabel();
  }
  followLabel() {
    if (!this.label) return;
    this.label.setPosition(this.x, this.y + this.size * 1.18).setScale(Math.max(1, this.size / 46));
  }
  destroy() {
    this.label?.destroy();
    this.label = null;
    super.destroy();
  }
  // 와류·대풍이 미는 이동. 방향 뒤집기 없이 위치만 바꾼다(월드 안으로 자른다).
  push(dx, dy) {
    const margin = Math.min(this.size, CONFIG.world.size / 2);
    this.sprite.x = clamp(this.x + dx, margin, CONFIG.world.size - margin);
    this.sprite.y = clamp(this.y + dy, margin, CONFIG.world.size - margin);
  }
  // 보물에 깎여 나보다 작아진 상위 요괴: 역전. 풀리는 때는 무언가를 먹거나 진화·몸집 강화를 하거나 플레이어보다 커질 때다.
  // 그 전까지는 플레이어를 쫓지 않고 도망한다(enemyAI.pickIntent), 먹기 규칙은 단계를 무시한다(rules.reversalPair).
  fleeFrom(player) {
    this.reversed = true;
    const dx = this.x - player.x, dy = this.y - player.y;
    const distance = Math.hypot(dx, dy);
    this.vx = distance ? CONFIG.enemy.fleeSpeed * dx / distance : CONFIG.enemy.fleeSpeed;
    this.vy = distance ? CONFIG.enemy.fleeSpeed * dy / distance : 0;
  }
  // 먹으면 면적이 늘고, 먹이 점수만큼 요력과 식성이 쌓인다. 진화·강화를 했으면 'evolve'|'body', 아니면 null.
  eat(prey, rng = Math.random) {
    super.eat(prey);
    this.capSize();
    this.reversed = false;
    // 매혹된 아군은 크기만 자란다. 요력은 PlayScene이 플레이어 요력으로 보내고, 식성·진화·몸집 강화는 하지 않는다(설계 4-4).
    if (isAlly(this, nowOf(this.scene))) return null;
    this.yoryeok += preyValue(preyInfoOf(prey));
    if (prey.dir in this.diet) this.diet[prey.dir] += prey.size;
    return this.autoProgress(rng);
  }
  // 한 번에 한 가지만 한다(진화 우선). 남은 요력은 다음 먹기에서 이어서 쓴다.
  // 자가 진화는 플레이어 단계 + enemy.selfEvolveLead까지만 한다(rules.nextProgress).
  autoProgress(rng = Math.random) {
    if (this.rival) return null; // 맞수는 플레이어와 같은 단계를 지킨다(진화·몸집 강화 없음)
    const action = nextProgress(this, this.scene.player?.stage);
    if (action === 'evolve') {
      const form = pickEvolution(this, FORMS, rng);
      if (!form) return null;
      this.evolveTo(form, rng);
    } else if (action === 'body') {
      if (!canEnemyBodyUp(this.bodyLevel)) return null; // 상한: 남은 요력은 진화용으로 모아 둔다
      this.yoryeok -= bodyCostAt(this.bodyLevel);
      this.bodyLevel++;
      this.reversed = false;
      this.setSize(this.size * CONFIG.levelUp.bodyMult);
      this.capSize();
    }
    return action;
  }
  // 화면을 다 채우는 적이 생기지 않게 플레이어 크기 기준 상한으로 자른다.
  capSize() {
    const playerSize = this.scene?.player?.size;
    const cap = this.rival && playerSize > 0 ? rivalSizeCap(playerSize) : enemySizeCap(playerSize);
    if (this.size > cap) this.setSize(cap);
  }
  evolveTo(form, rng = Math.random) {
    const [min, max] = CONFIG.enemy.evolveJitter;
    this.reversed = false;
    this.yoryeok -= evolutionCost(form.stage);
    this.formId = form.id;
    this.stage = form.stage;
    this.dir = form.dir;
    this.sprite.setTexture(drawCreature(this.scene, form.id));
    this.setSize(CONFIG.levelUp.evolveResetSize * (min + rng() * (max - min)));
    this.diet = newDiet();
    this.bodyLevel = 0;
    this.rewardSize = 0; // 새 형태는 새 크기 기준으로 요력을 준다
    this.grade = rollGrade(0, { rng });
    this.rollOrbTrait(rng);
  }
  // 플레이어와 다른 적을 함께 보고: 나를 먹을 수 있는 상대에게서 도망, 내가 먹을 수 있는 상대를 추격, 아니면 배회.
  stepDistant(player, h, grid, stepsLeft) {
    if (this.travelSteps > 0) {
      this.sprite.x += this.travelX;
      this.sprite.y += this.travelY;
      this.travelSteps--;
      return;
    }
    const count = Math.min(5, stepsLeft);
    const x = this.x, y = this.y;
    this.step(player, h * count, grid, true);
    this.travelX = (this.x - x) / count;
    this.travelY = (this.y - y) / count;
    this.travelSteps = count - 1;
    this.sprite.x = x + this.travelX;
    this.sprite.y = y + this.travelY;
  }
  step(player, dt, grid, think = true, blend = 1 - Math.exp(-CONFIG.enemy.turnRate * dt)) {
    const ai = CONFIG.enemy;
    const now = nowOf(this.scene);
    // 대풍에 밀리는 중: 의지와 상관없이 밀린다.
    if (this.knockUntil > now) this.push(this.knockVx * dt, this.knockVy * dt);
    // 빙결·경직: 이동·사냥·발사가 모두 멈춘다.
    if (isDisabled(this, now)) {
      this.vx = 0;
      this.vy = 0;
      return;
    }
    const early = ai.earlySpeedMult?.[player.stage ?? 1] ?? 1; // 초반에는 적이 느리다
    // 선무 구름 안에서는 느려지고, 크기가 클수록 느리다(balance.sizeSpeedMultiplier: 플레이어와 같은 규칙).
    if (this.speedSize !== this.size) {
      this.speedSize = this.size;
      this.sizeSpeed = sizeSpeedMultiplier(this.size);
    }
    const slow = slowFactor(this, now) * this.sizeSpeed;
    if (this.size >= player.size) this.reversed = false;
    let intent = this.aiIntent;
    if (think || !intent || intent.target?.sprite?.active === false || this.reversed ||
        this.charmUntil > now || this.fearUntil > now || this.charmGraceUntil > now || intent.forced) {
      intent = grid ? pickIntent(this, player, grid, CONFIG.hunt, dt, now) : null;
      this.direction = intentDirection(this, intent, this.steer);
    } else this.aiTimer -= dt;
    const dir = this.direction;
    let vx, vy;
    if (dir) {
      const speed = (intent.mode === 'flee' ? ai.fleeSpeed : ai.chaseSpeed) * early * slow;
      vx = dir.x * speed;
      vy = dir.y * speed;
      this.wanderTime = 0;
    } else {
      this.wanderTime -= dt;
      if (this.wanderTime <= 0) {
        this.wanderAngle = Math.random() * Math.PI * 2;
        this.wanderTime = between(ai.wanderInterval);
      }
      vx = Math.cos(this.wanderAngle) * ai.wanderSpeed * early * slow;
      vy = Math.sin(this.wanderAngle) * ai.wanderSpeed * early * slow;
      const edge = this.size + ai.wallMargin,
        end = CONFIG.world.size - edge;
      if (this.x < edge) vx = Math.abs(vx);
      if (this.x > end) vx = -Math.abs(vx);
      if (this.y < edge) vy = Math.abs(vy);
      if (this.y > end) vy = -Math.abs(vy);
    }
    this.vx += (vx - this.vx) * blend;
    this.vy += (vy - this.vy) * blend;
    this.move(this.vx * dt, this.vy * dt);
  }
}
