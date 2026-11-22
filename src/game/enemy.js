import { CONFIG } from '../config.js';
import { FORMS, FORM_BY_ID } from '../data/forms.js';
import { pickIntent, intentDirection } from './enemyAI.js';
import { rollSpecial } from './enemyFire.js';
import { drawCreature } from '../art/creature.js';
import { Actor } from './actor.js';
import { between } from './world.js';
import { evolutionCost, rollGrade } from '../systems/evolution.js';
import { bodyCostAt, newDiet, nextProgress, pickEvolution, preyInfoOf, preyValue } from '../systems/rules.js';

// 2·3단계 형태: 해당 방위·단계의 형태 중 무작위(방위에 형태가 없으면 단계만 맞춘다).
function formFor(dir, stage, rng = Math.random) {
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
    const form = stage === 1 ? FORM_BY_ID.mimul : formFor(dir, stage);
    super(scene, pos.x, pos.y, size, form.id, stage === 1 ? { dir } : undefined);
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
    this.reversed = false;
    this.yoryeok += preyValue(preyInfoOf(prey));
    if (prey.dir in this.diet) this.diet[prey.dir] += prey.size;
    return this.autoProgress(rng);
  }
  // 한 번에 한 가지만 한다(진화 우선). 남은 요력은 다음 먹기에서 이어서 쓴다.
  autoProgress(rng = Math.random) {
    const action = nextProgress(this);
    if (action === 'evolve') {
      const form = pickEvolution(this, FORMS, rng);
      if (!form) return null;
      this.evolveTo(form, rng);
    } else if (action === 'body') {
      this.yoryeok -= bodyCostAt(this.bodyLevel);
      this.bodyLevel++;
      this.reversed = false;
      this.setSize(this.size * CONFIG.levelUp.bodyMult);
    }
    return action;
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
    const early = ai.earlySpeedMult?.[player.stage ?? 1] ?? 1; // 초반에는 적이 느리다
    if (this.size >= player.size) this.reversed = false;
    const intent = grid ? pickIntent(this, player, grid, CONFIG.hunt, dt) : null;
    const dir = intentDirection(this, intent);
    let vx, vy;
    if (dir) {
      const speed = (intent.mode === 'flee' ? ai.fleeSpeed : ai.chaseSpeed) * early;
      vx = dir.x * speed;
      vy = dir.y * speed;
      this.wanderTime = 0;
    } else {
      this.wanderTime -= dt;
      if (this.wanderTime <= 0) {
        this.wanderAngle = Math.random() * Math.PI * 2;
        this.wanderTime = between(ai.wanderInterval);
      }
      vx = Math.cos(this.wanderAngle) * ai.wanderSpeed * early;
      vy = Math.sin(this.wanderAngle) * ai.wanderSpeed * early;
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
