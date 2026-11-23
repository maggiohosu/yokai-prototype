import { FORMS } from '../data/forms.js';
import { createProgress } from '../systems/progress.js';
import { worldFor } from '../systems/worldScale.js';
import { CONFIG } from '../config.js';
import { buildGrid } from './enemyAI.js';
import { cameraView } from './camera.js';
import { spawnSize, spawnStage } from './world.js';

const WARMUP = 60;
const FRAMES = 180;

export function populationScenario(params) {
  const stage = Number(params.get('stage'));
  return {
    stage: [1, 3, 5].includes(stage) ? stage : 5,
    weapon: params.get('w') === 'mirror' ? 'mirror' : 'yeouiju',
    seed: Number(params.get('seed') ?? 731) >>> 0,
  };
}

// 기존 규칙이 기본 인자로 읽는 난수까지 고정한다. 동기식 시험 단계가 끝나면 즉시 복원한다.
export function withSeed(seed, run) {
  const previous = Math.random;
  Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  try { return run(); } finally { Math.random = previous; }
}

function summary(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    avg: values.reduce((a, b) => a + b, 0) / values.length,
    p95: sorted[Math.ceil(values.length * 0.95) - 1],
    max: sorted.at(-1),
  };
}

export class PopulationStress {
  constructor(params) {
    Object.assign(this, populationScenario(params));
    this.population = worldFor(this.stage).population;
    const form = this.stage === 1 ? null : FORMS.find(f => f.stage === this.stage && f.entry);
    this.progress = Object.assign(createProgress(), {
      stage: this.stage, formId: form?.id ?? 'mimul', treasure: { kind: this.weapon, level: 15 },
    });
    this.angle = 0;
    this.allyMeals = 0;
    this.frame = 0;
    this.intervals = [];
    this.sim = [];
    this.spawns = [];
    this.draw = [];
    this.submissions = [];
    this.popMin = Infinity;
    this.done = false;
  }

  attach(scene) {
    this.initialCount = scene.enemies.length;
    this.initialStages = Array.from({ length: 5 }, (_, i) => scene.enemies.filter(e => e.stage === i + 1).length);
    const events = scene.game.events;
    const pre = () => { this.renderStart = performance.now(); };
    const post = () => {
      if (this.frame <= WARMUP || this.done) return;
      const submit = performance.now() - this.renderStart;
      this.submissions.push(submit);
      this.draw.push(this.prepareMs + submit);
      this.spawns.push(this.fillMs + this.refillMs);
      this.sim.push(this.simMs + this.fillMs + this.refillMs);
      if (this.sim.length !== FRAMES) return;
      this.done = true;
      const report = {
        done: true, stage: this.stage, weapon: this.weapon, seed: this.seed, population: this.population,
        worldSize: CONFIG.world.size, initialCount: this.initialCount, initialStages: this.initialStages, minSimStartCount: this.popMin,
        frames: FRAMES, warmup: WARMUP, fires: scene.combat.wc.fires - this.startFires,
        hits: scene.combat.wc.hits - this.startHits, steps: scene.simSteps,
        intervalMs: summary(this.intervals), simMs: summary(this.sim), spawnMs: summary(this.spawns),
        drawMs: summary(this.draw), submitMs: summary(this.submissions),
      };
      window.__stressReport = report;
      console.log('STRESS_REPORT ' + JSON.stringify(report));
      unbind();
    };
    const unbind = () => { events.off('prerender', pre); events.off('postrender', post); };
    events.on('prerender', pre);
    events.on('postrender', post);
    scene.events.once('shutdown', unbind);
    window.__stressReport = { done: false };
  }

  update(scene, delta) {
    if (this.done) return;
    const start = performance.now();
    this.frame++;
    if (this.frame > WARMUP) this.intervals.push(start - this.last);
    this.last = start;
    if (this.frame === WARMUP + 1) {
      this.startFires = scene.combat.wc.fires;
      this.startHits = scene.combat.wc.hits;
    }
    withSeed((this.seed + Math.imul(this.frame, 2654435761)) >>> 0, () => {
      // 매 프레임 같은 수로 시뮬레이션을 시작한다. 먹힌 적은 일반 생성의 간격·크기·단계 규칙을 거쳐 다시 놓는다.
      const fillStart = performance.now();
      const missing = this.population - scene.enemies.length;
      const grid = missing > 0 ? (scene.placementGrid = buildGrid(scene.enemies, CONFIG.render.enemyCell, scene.placementGrid)) : null;
      const view = cameraView(scene.cameras.main, scene.cameraBounds);
      for (let i = 0; i < missing; i++) {
        const stage = spawnStage(this.stage);
        const size = spawnSize(scene.player.size, this.stage, 'normal', stage);
        if (!scene.spawn(size, { stage, view, grid })) break;
      }
      this.fillMs = performance.now() - fillStart;
      if (this.frame > WARMUP) this.popMin = Math.min(this.popMin, scene.enemies.length);
      scene.fireRequested = true;
      scene.tick(delta);
    });
  }
}
