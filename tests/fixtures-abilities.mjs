// 능력 시험용 가짜 월드. Phaser 없이 Combat·EnemyFire·적 상태를 돌린다.
import { EventEmitter } from 'node:events';
import { CONFIG } from '../src/config.js';
import { FORM_BY_ID } from '../src/data/forms.js';
import { Combat } from '../src/game/combat.js';
import { buildGrid } from '../src/game/enemyAI.js';
import { initStatus } from '../src/game/status.js';

// 능력 시험용 적: 위치·크기·단계만 있는 평범한 객체. Enemy와 같은 이름의 메서드(setSize·destroy·fleeFrom·push)만 흉내 낸다.
export function fakeEnemy(x, y, size, extra = {}) {
  const enemy = initStatus({
    x, y, size, stage: 1, dir: 'east', grade: 'C', reversed: false, special: false, formId: 'hwalsa',
    sprite: { active: true },
    setSize(value) { this.size = value; this.sizeSets = (this.sizeSets ?? 0) + 1; },
    destroy() { this.sprite.active = false; },
    fleeFrom() { this.reversed = true; },
    push(dx, dy) { this.x += dx; this.y += dy; },
  });
  return Object.assign(enemy, extra); // 상태 필드를 먼저 채운 뒤 시험이 원하는 값으로 덮는다
}

export function fakePlayer(formId, extra = {}) {
  return {
    x: 1000, y: 1000, size: 28, stage: FORM_BY_ID[formId]?.stage ?? 1, eaten: 0, maxSize: 28, sprite: { active: true },
    setSize(value) { this.size = value; },
    ...extra,
  };
}

// formId의 줄기 능력으로 여의주 레벨 level의 Combat을 만든다. enemies는 호출한 쪽이 계속 고칠 수 있다.
export function makeWorld({ formId = 'mimul', level = 0, enemies = [], player = fakePlayer(formId), pace = 1, grade = 'C' } = {}) {
  const log = { eat: [], reversal: 0, flashes: 0, bursts: 0 };
  const events = new EventEmitter();
  events.on('eat', (meal) => log.eat.push(meal));
  const graphics = { clear: () => graphics, setDepth: () => graphics };
  const scene = {
    player, enemies, simTime: 0, pace, events,
    add: { graphics: () => graphics },
    fireButton: { showReversal: () => { log.reversal++; } },
    fx: { flash() { log.flashes++; }, burst() { log.bursts++; }, reversal() {} },
  };
  const progress = { formId, stage: player.stage, grade, treasure: { level } };
  const combat = new Combat(scene, progress);
  const world = {
    scene, combat, log, player, enemies, progress,
    // n단계를 h초(시뮬레이션)씩 돌린다. fire가 true면 첫 단계에서 한 번 쏜다. 기본 방향은 +x.
    step(n = 1, h = 1 / 60, { fire = false, direction = { x: 1, y: 0 } } = {}) {
      for (let i = 0; i < n; i++) {
        scene.simTime += h;
        const grid = buildGrid(enemies, CONFIG.hunt.detect);
        combat.step(direction, h, fire && i === 0, grid);
      }
    },
    shoot(n = 1, h = 1 / 60) {
      world.combat.cooldown = 0;
      world.step(n, h, { fire: true });
    },
  };
  return world;
}

// 구슬 한 발 피해(등급 C, 여의주 레벨 level): 시험의 기준값.
export function shotDamage(world) {
  return world.combat.power();
}
