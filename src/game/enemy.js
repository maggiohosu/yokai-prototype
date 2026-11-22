import { CONFIG } from '../config.js';
import { FORMS } from '../data/forms.js';
import { pickIntent, intentDirection } from './enemyAI.js';
import { rollSpecial } from './enemyFire.js';
import { drawCreature } from '../art/creature.js';
import { Actor } from './actor.js';
import { between, clamp } from './world.js';
import { initStatus, isAlly, isDisabled, nowOf, slowFactor } from './status.js';
import { canEnemyBodyUp, enemySizeCap } from '../systems/growthCap.js';
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
    this.vx = 0;
    this.vy = 0;
    this.reversed = false;
    this.special = rollSpecial(size, this.stage);
    initStatus(this); // 상태이상 필드(빙결·위협·작열·파사인·둔화·밀림·매혹)를 숫자로 고정해 둔다
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
    const cap = enemySizeCap(this.scene?.player?.size);
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
    this.special = rollSpecial(this.size, this.stage, rng);
  }
  // 플레이어와 다른 적을 함께 보고: 나를 먹을 수 있는 상대에게서 도망, 내가 먹을 수 있는 상대를 추격, 아니면 배회.
  step(player, dt, grid) {
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
    const slow = slowFactor(this, now); // 선무 구름 안에서는 느려진다
    if (this.size >= player.size) this.reversed = false;
    const intent = grid ? pickIntent(this, player, grid, CONFIG.hunt, dt, now) : null;
    const dir = intentDirection(this, intent);
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
    const blend = 1 - Math.exp(-ai.turnRate * dt);
    this.vx += (vx - this.vx) * blend;
    this.vy += (vy - this.vy) * blend;
    this.move(this.vx * dt, this.vy * dt);
  }
}
