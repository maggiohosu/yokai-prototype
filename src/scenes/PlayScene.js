import { CONFIG, REGIONS } from '../config.js';
import { FORMS, FORM_BY_ID } from '../data/forms.js';
import { drawCreature } from '../art/creature.js';
import { between, colorPicker, drawWorld, regionAt, spawnPoint, spawnSize, spawnStage } from '../game/world.js';
import { canEat, eatPair, reversalPair } from '../systems/rules.js';
import { afterPause, cheapestCost, createRunLevel, shouldPause } from '../systems/levelup.js';
import { drawStageMark } from '../art/marks.js';
import { Player } from '../game/player.js';
import { Enemy } from '../game/enemy.js';
import { Joystick } from '../game/joystick.js';
import { followPlayer, worldToClient } from '../game/camera.js';
import { Hud } from '../game/hud.js';
import { Combat } from '../game/combat.js';
import { FireButton } from '../game/fireButton.js';
import { loadProgress, saveProgress } from '../state/save.js';
import { attachSession, mealYoryeok, playerStats } from '../game/session.js';
import { buildGrid, findMeals } from '../game/enemyAI.js';
import { EnemyFire, drawSpecialMark, isFatal } from '../game/enemyFire.js';
import { Fx } from '../game/fx.js';
import { HubView } from '../ui/HubView.js';
import { EvolveView } from '../ui/EvolveView.js';
import { LevelUpView } from '../ui/LevelUpView.js';

export class PlayScene extends Phaser.Scene {
  constructor() {
    super('Play');
  }
  create(data = {}) {
    for (const form of FORMS) drawCreature(this, form.id);
    for (const dir of Object.keys(REGIONS)) drawCreature(this, 'mimul', { dir });
    drawWorld(this);
    this.fx = new Fx(this);
    const debug = new URLSearchParams(location.search).get('debug');
    const preview = debug === 'hub' || debug === 'evolve';
    const progress = data.progress ?? this.registry.get('progress') ?? loadProgress();
    this.progress = preview ? structuredClone(progress) : progress;
    this.saveProgress = preview ? () => true : saveProgress;
    if (!preview) this.registry.set('progress', this.progress);
    this.playerStats = playerStats(this.progress);
    this.player = new Player(this, this.progress.formId, this.playerStats);
    this.player.stage = this.progress.stage;
    this.player.grade = this.progress.grade;
    this.level = createRunLevel();
    this.paused = false;
    this.preview = preview;
    this.run = attachSession(this, this.progress, Math.random, this.saveProgress);
    const onEatFx = (meal) => {
      const p = this.player;
      const gain = mealYoryeok(meal);
      if (meal.special) {
        this.fx.floatText(p.x, p.y - p.size * 1.4, '요력 대박! +' + gain, '#ffd45c');
        this.fx.burst(p.x, p.y, 0xffd45c, 26, 1.5);
      } else {
        this.fx.floatText(p.x, p.y - p.size * 1.25, '+' + gain + ' 요력', meal.killedByTreasure ? '#c4f7e6' : '#fff1b8');
      }
    };
    const onDropFx = () => {
      const p = this.player;
      this.fx.floatText(p.x, p.y - p.size * 1.8, '여의주 획득!', '#ffe27a');
      this.fx.burst(p.x, p.y, 0xffe27a, 14, 1);
    };
    this.events.on('eat', onEatFx);
    this.events.on('treasureDrop', onDropFx);
    this.events.once('shutdown', () => {
      this.events.off('eat', onEatFx);
      this.events.off('treasureDrop', onDropFx);
    });
    this.enemies = [];
    this.nextColor = colorPicker();
    this.ended = false;
    this.refillTime = 0;
    this.hudTime = 0;
    const arena = document.getElementById('arena');
    this.joystick = new Joystick(arena);
    this.combat = new Combat(this, this.progress);
    this.enemyFire = new EnemyFire(this);
    this.fireGfx = this.add.graphics().setDepth(4.5);
    this.events.once('shutdown', () => this.enemyFire?.destroy());
    this.fireRequested = false;
    this.fireButton = new FireButton(arena, () => {
      if (this.scene.isActive() && !this.ended) this.fireRequested = true;
    });
    this.follow = followPlayer(this, this.player);
    this.hud = new Hud();
    const avatar = document.getElementById('avatar');
    this.refreshIdentity();
    document.getElementById('result').hidden = true;
    this.makePlayerMarker();
    this.seedEnemies();
    this.hud.update(this.player, this.cameras.main.worldView);
    this.events.once('shutdown', this.releaseControls, this);
    document.getElementById('loading').hidden = true;
    // 확인용: ?debug=hub / ?debug=evolve (저장하지 않는 시험용 요력 지급)
    if (debug && !data.progress) {
      if (preview) { this.progress.yoryeok += 5000; this.progress.diet.south += 40; this.progress.treasure ??= { level: 9 }; }
      setTimeout(() => (debug === 'evolve' ? EvolveView(this.progress, FORMS, { getFormImage: (id) => this.formImage(id), save: this.saveProgress, onDone: () => this.openHub() }) : this.openHub()), 300);
    }
  }
  refreshIdentity() {
    document.getElementById('avatar').src = this.formImage(this.progress.formId);
    const form = FORM_BY_ID[this.progress.formId];
    const idBox = document.querySelector('.hud .identity');
    if (idBox) {
      idBox.querySelector('small').textContent = form.stage + '단계 · ' + this.progress.grade + '등급';
      idBox.querySelector('strong').textContent = form.name;
    }
  }
  // 판 안 성장: 요력이 가장 싼 선택지 비용에 닿으면 게임을 멈추고 3장 중 고른다. 시간은 실제 시간(씬이 멈추면 scene.time도 멈춤).
  openLevelUp() {
    this.paused = true;
    const getFormImage = (id) => this.formImage(id);
    const save = this.saveProgress;
    const done = () => {
      afterPause(this.progress, this.level, performance.now() / 1000);
      this.paused = false;
    };
    LevelUpView(this.progress, FORMS, this.level, {
      getFormImage, save,
      onBody: (mult) => {
        this.player.setSize(this.player.size * mult);
        this.player.maxSize = Math.max(this.player.maxSize, this.player.size);
        this.fx.burst(this.player.x, this.player.y, 0xffe27a, 18, 1.2);
      },
      onAbility: () => this.applyStats(),
      onEvolve: () => {
        const before = this.progress.formId;
        EvolveView(this.progress, FORMS, {
          getFormImage, save,
          onDone: () => {
            if (this.progress.formId !== before) this.applyForm();
            this.applyStats();
            done();
          },
        });
      },
      onResume: done,
    });
  }
  applyStats() {
    this.playerStats = playerStats(this.progress);
    Object.assign(this.player.stats, { speed: this.playerStats.speed, areaGain: this.playerStats.areaGain });
  }
  // 판 안 진화·역진화: 형태·단계·등급을 바꾸고 크기는 시작 크기로 되돌린다.
  applyForm() {
    const p = this.player;
    p.formId = this.progress.formId;
    p.stage = this.progress.stage;
    p.grade = this.progress.grade;
    p.sprite.setTexture(drawCreature(this, p.formId));
    p.setSize(CONFIG.levelUp.evolveResetSize);
    this.marker.destroy();
    this.nameTag.destroy();
    this.makePlayerMarker();
    this.refreshIdentity();
    this.fx.burst(p.x, p.y, 0xfff1b8, 30, 1.6);
  }
  formImage(formId) {
    return this.textures.get(drawCreature(this, formId)).getSourceImage().toDataURL();
  }
  openHub() {
    document.getElementById('result').hidden = true;
    const getFormImage = (formId) => this.formImage(formId);
    const save = this.saveProgress;
    const openEvolve = () => EvolveView(this.progress, FORMS, {
      getFormImage, save, onDone: () => this.openHub(),
    });
    HubView(this.progress, FORMS, {
      getFormImage, save,
      onPlay: () => this.scene.restart({ progress: this.progress }),
      onEvolve: () => openEvolve(),
    });
  }
  releaseControls() {
    this.joystick?.destroy();
    this.fireButton?.destroy();
    this.joystick = null;
    this.fireButton = null;
  }
  makePlayerMarker() {
    this.marker = this.add.graphics().setDepth(1);
    const glow = CONFIG.gradeGlow[this.progress.grade];
    if (glow != null) this.marker.fillStyle(glow, 0.28).fillEllipse(0, 0, 112, 50);
    this.marker.lineStyle(glow != null ? 4 : 2.5, glow ?? 0x68854f, glow != null ? 0.95 : 0.75).strokeEllipse(0, 0, 100, 42);
    this.nameTag = this.add
      .text(0, 0, '나 · ' + FORM_BY_ID[this.progress.formId].name, {
        fontFamily: 'system-ui, sans-serif',
        fontStyle: 'bold',
        fontSize: '11px',
        color: '#fff9df',
        backgroundColor: '#405549',
        padding: { x: 7, y: 3 },
        resolution: 2,
      })
      .setOrigin(0.5, 0)
      .setDepth(3);
  }
  spawn(size, options = {}) {
    const stage = options.stage ?? spawnStage(this.player.stage ?? 1);
    const pos = spawnPoint(this.player, this.enemies, size, { ...options, stage });
    if (!pos) return false;
    const dir = this.nextColor(regionAt(pos.x, pos.y));
    this.enemies.push(new Enemy(this, pos, size, dir, stage));
    return true;
  }
  seedEnemies() {
    const { world, enemy } = CONFIG;
    for (let i = 0; i < world.population; i++) {
      let size = spawnSize(this.player.size),
        near,
        stage = spawnStage(this.player.stage ?? 1);
      if (i < world.initialNeighbors) {
        near = canEat({ size, stage }, this.player) ? world.outerRing : world.innerRing;
        if (i === 0) {
          stage = 1; // 상위 단계 적은 작아도 플레이어를 먹으므로, 먹을 수 있는 첫 이웃은 1단계로 보장한다.
          const small = enemy.sizes[0];
          size = this.player.size * between([small.min, small.max]);
          near = [world.innerRing[0], world.innerRing[0]];
        }
      }
      if (!this.spawn(size, { near, initial: true, stage })) this.spawn(size, { initial: true, stage });
    }
  }
  endRun(killer) {
    this.ended = true;
    this.releaseControls();
    this.combat.graphics.clear();
    this.enemyFire.clear();
    this.fireGfx.clear();
    this.hud.end(this.player, killer, {
      onRestart: () => this.scene.restart({ progress: this.progress }),
      onHub: () => this.openHub(),
    }, this.run);
    this.events.emit('runEnd', {
      eaten: this.player.eaten, maxSize: this.player.maxSize, killerFormId: killer.id ?? null,
    });
  }
  // 특수 적 구슬에 맞으면 크기(=체력)가 줄고, 일정 크기 아래면 판 종료.
  applyEnemyHits(hits) {
    for (const hit of hits) {
      this.player.setSize(Math.max(1, this.player.size - hit.damage));
      this.fx.flash(this.player);
      this.fx.burst(hit.x, hit.y, 0xd0508f, 6, 0.6);
      if (isFatal(this.player.size)) {
        this.endRun({ name: '특수 요괴', message: '특수 요괴의 구슬에 맞아 쓰러졌습니다.' });
        return;
      }
    }
  }
  resolveMeals(grid) {
    // 72마리면 최대 2,556쌍. 제곱거리로 검사하고 먹힌 개체는 즉시 제외한다.
    for (const enemy of this.enemies) {
      if (!enemy.sprite.active) continue;
      // 보물로 역전한 상대는 크기가 조금만 작아져도 바로 먹을 수 있다.
      const pair = reversalPair(this.player, enemy) ?? eatPair(this.player, enemy);
      if (!pair) continue;
      const [hunter, prey] = pair;
      if (prey === this.player) {
        this.fx.burst(prey.x, prey.y, 0xfffbe6, 18, 1.2);
        hunter.eat(prey);
        this.endRun(FORM_BY_ID[hunter.formId]);
        return;
      }
      const meal = this.combat.meal(prey, false);
      this.fx.eatPop(hunter, prey);
      hunter.eat(prey);
      prey.destroy();
      this.events.emit('eat', meal);
    }
    // 적끼리: 공간 격자로 닿은 쌍만 찾아 큰 쪽이 작은 쪽을 먹는다.
    for (const [big, small] of findMeals(grid)) {
      if (!big.sprite.active || !small.sprite.active) continue;
      const grew = big.eat(small);
      small.destroy();
      if (grew === 'evolve') this.fx.burst(big.x, big.y, 0xfff1b8, 16, Math.max(0.8, big.size / 25));
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (!this.enemies[i].sprite.active) this.enemies.splice(i, 1);
    }
  }
  // 템포: 시뮬레이션(이동·AI·발사·쿨타임·보충)에만 CONFIG.tempo를 곱한다. 연출·카메라·HUD는 실제 시간.
  // 빨라진 물체가 서로 통과하지 않게 한 프레임을 maxStep 이하의 작은 단계로 나눠 계산한다.
  simulate(sim, direction) {
    const steps = Math.max(1, Math.ceil(sim / CONFIG.render.maxStep));
    const h = sim / steps;
    for (let i = 0; i < steps && !this.ended; i++) {
      const grid = buildGrid(this.enemies, CONFIG.hunt.detect);
      this.player.step(direction, h);
      this.combat.step(direction, h, i === 0 && this.fireRequested);
      for (const enemy of this.enemies) {
        enemy.step(this.player, h, grid);
        if (enemy.special && enemy.sprite.active) this.enemyFire.tryFire(enemy, this.player, h);
      }
      this.resolveMeals(grid);
      if (this.ended) break;
      this.applyEnemyHits(this.enemyFire.step(h, this.player));
    }
    this.fireRequested = false;
  }
  update(_time, delta) {
    const dt = Math.min(delta / 1000, CONFIG.render.maxDelta);
    if (this.ended) {
      this.fx.update(dt, null, this.progress.grade);
      return;
    }
    if (this.paused) return;
    if (!this.preview && shouldPause(this.progress, this.level, performance.now() / 1000)) {
      this.openLevelUp();
      return;
    }
    const direction = this.joystick.direction(worldToClient(this, this.player.x, this.player.y));
    const sim = dt * CONFIG.tempo;
    this.simulate(sim, direction);
    if (this.ended) return;
    for (const enemy of this.enemies) this.fx.animateActor(enemy, dt, enemy.vx, enemy.vy);
    const sp = this.playerStats.speed;
    this.fx.animateActor(this.player, dt, direction.x * sp, direction.y * sp);
    this.fx.update(dt, this.player, this.progress.grade);
    this.combat.draw();
    const fg = this.fireGfx.clear();
    this.enemyFire.draw(fg);
    const now = this.time.now / 1000;
    const myStage = this.player.stage ?? 1;
    for (const enemy of this.enemies) {
      if (!enemy.sprite.active) continue;
      if (enemy.special) drawSpecialMark(fg, enemy, now);
      drawStageMark(fg, enemy, myStage, now);
    }
    this.fireButton.update(1 - this.combat.cooldown / CONFIG.combat.cooldown);
    this.follow(dt);
    const { x, y, size } = this.player;
    this.marker.setPosition(x, y + size * 0.64).setScale(size / 46);
    this.nameTag.setPosition(x, y + size * 1.18);
    this.refillTime -= sim;
    const view = this.cameras.main.worldView;
    if (this.refillTime <= 0) {
      this.refillTime = CONFIG.world.refillInterval;
      const count = Math.min(CONFIG.world.refillBatch, CONFIG.world.population - this.enemies.length);
      for (let i = 0; i < count; i++) this.spawn(spawnSize(size), { view });
    }
    this.hudTime -= dt;
    if (this.hudTime <= 0) {
      this.hudTime = CONFIG.render.hudInterval;
      this.hud.update(this.player, view);
      this.hud.setGauge(this.progress.yoryeok, this.level.nextPauseAt ?? cheapestCost(this.progress, this.level), '다음 성장까지');
    }
  }
}
