import { CONFIG, REGIONS } from '../config.js';
import { FORMS, FORM_BY_ID } from '../data/forms.js';
import { drawCreature } from '../art/creature.js';
import { between, colorPicker, drawWorld, regionAt, spawnPoint, spawnSize, spawnStage } from '../game/world.js';
import { canEat, eatPair, reversalPair } from '../systems/rules.js';
import { afterPause, applyQuickCard, createRunLevel, pauseGauge, pickQuickCards, shouldPause } from '../systems/levelup.js';
import { drawStageMark } from '../art/marks.js';
import { Player } from '../game/player.js';
import { Enemy } from '../game/enemy.js';
import { Joystick } from '../game/joystick.js';
import { followPlayer } from '../game/camera.js';
import { Hud } from '../game/hud.js';
import { Combat } from '../game/combat.js';
import { FireButton } from '../game/fireButton.js';
import { loadProgress, saveProgress } from '../state/save.js';
import { attachSession, mealYoryeok, playerStats } from '../game/session.js';
import { buildGrid, findMeals } from '../game/enemyAI.js';
import { EnemyFire, drawSpecialMark, isFatal } from '../game/enemyFire.js';
import { Fx } from '../game/fx.js';
import { absorbHit, createVitality, stepVitality, vitalityVisible } from '../systems/vitality.js';
import { HubView } from '../ui/HubView.js';
import { EvolveView } from '../ui/EvolveView.js';
import { QuickPick } from '../ui/QuickPick.js';
import { QUICK_STAT_NAMES } from '../systems/levelup.js';

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
    // ?debug=lv: 저장하지 않는 시험 판. 게임은 그대로 돌고 요력만 지급해 빠른 성장 선택을 열어 본다.
    const sandbox = preview || debug === 'lv';
    const progress = data.progress ?? this.registry.get('progress') ?? loadProgress();
    this.progress = sandbox ? structuredClone(progress) : progress;
    this.saveProgress = sandbox ? () => true : saveProgress;
    if (!sandbox) this.registry.set('progress', this.progress);
    this.playerStats = playerStats(this.progress);
    this.pace = this.playerStats.pace;
    this.player = new Player(this, this.progress.formId, this.playerStats);
    this.player.stage = this.progress.stage;
    this.player.grade = this.progress.grade;
    this.level = createRunLevel(this.progress);
    this.quickPick = null;
    this.vitality = createVitality(this.playerStats.vitalityMax);
    this.threatened = false;
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
    this.joystick = new Joystick(document);
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
    this.events.once('shutdown', () => this.quickPick?.close());
    document.getElementById('loading').hidden = true;
    // 확인용: ?debug=hub / ?debug=evolve (저장하지 않는 시험용 요력 지급), ?debug=lv는 판 중에 요력을 지급한다.
    if (debug === 'lv' && !data.progress) {
      setTimeout(() => { this.progress.yoryeok += 400; this.progress.diet.south += 40; }, 400);
    } else if (debug && !data.progress) {
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
  // 빠른 성장 선택: 요력이 기준에 닿으면 게임을 멈추고 화면 가운데 카드 3장을 띄운다. 카드 하나 = 결과 하나.
  // 탭하면 즉시 적용하고 바로 재개한다(확인 창·결과 창 없음). 살 수 있는 카드가 없으면 멈추지 않는다.
  openQuickPick() {
    const cards = pickQuickCards(this.progress, this.level, FORMS);
    if (!cards.length) {
      afterPause(this.progress, this.level, performance.now() / 1000);
      return;
    }
    this.paused = true;
    this.joystick?.suspend();
    this.quickPick = QuickPick(cards, {
      yoryeok: this.progress.yoryeok,
      getFormImage: (id) => this.formImage(id),
      onPick: (card) => this.pickCard(card),
    });
  }
  pickCard(card) {
    this.quickPick = null;
    try {
      const result = applyQuickCard(this.progress, this.level, card, FORMS);
      if (result) {
        this.saveProgress(this.progress);
        this.showQuickResult(result);
      }
    } finally {
      afterPause(this.progress, this.level, performance.now() / 1000);
      this.fireRequested = false;
      this.paused = false;
      this.joystick?.resume();
    }
  }
  // 결과는 게임 화면에 떠오르는 글자로 짧게만 보여준다.
  showQuickResult(result) {
    const p = this.player;
    if (result.kind === 'evolve') {
      this.applyForm();
      this.recalcPace();
      this.fx.floatText(p.x, p.y - p.size * 2.1, '진화! ' + result.form.name + ' · ' + result.grade + '등급', '#ffd45c');
      if (result.firstDiscovery) this.fx.floatText(p.x, p.y - p.size * 2.9, '첫 발견! 보호권 +1', '#c4f7e6');
    } else if (result.kind === 'body') {
      p.setSize(p.size * result.mult);
      p.maxSize = Math.max(p.maxSize, p.size);
      this.fx.burst(p.x, p.y, 0xffe27a, 18, 1.2);
      this.fx.floatText(p.x, p.y - p.size * 2.1, '몸집 ×' + result.mult, '#ffe27a');
    } else {
      this.recalcPace();
      this.fx.burst(p.x, p.y, 0xc4f7e6, 12, 1);
      this.fx.floatText(p.x, p.y - p.size * 2.1, QUICK_STAT_NAMES[result.stat] + ' +1 (Lv ' + result.to + ')', '#c4f7e6');
    }
  }
  // 진화·능력 강화 뒤에 다시 계산하는 한 곳: 능력치와 속도 곡선(템포 × f, 이동 속도 × f), 생명력 최대치.
  recalcPace() {
    this.playerStats = playerStats(this.progress);
    this.pace = this.playerStats.pace;
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
      // 생명력 게이지가 먼저 막고, 모자란 비율만큼만 크기가 줄어든다.
      const { damageRatio } = absorbHit(this.vitality);
      this.player.setSize(Math.max(1, this.player.size - hit.damage * damageRatio));
      this.fx.flash(this.player);
      this.fx.burst(hit.x, hit.y, 0xd0508f, 6, 0.6);
      if (isFatal(this.player.size)) {
        this.endRun({ name: '특수 요괴', message: '특수 요괴의 구슬에 맞아 쓰러졌습니다.' });
        return;
      }
    }
  }
  resolveMeals(grid, dt) {
    // 72마리면 최대 2,556쌍. 제곱거리로 검사하고 먹힌 개체는 즉시 제외한다.
    let threat = null; // 이번 단계에 나를 먹을 수 있는 적과 겹친 첫 적
    for (const enemy of this.enemies) {
      if (!enemy.sprite.active) continue;
      // 보물로 역전한 상대는 크기가 조금만 작아져도 바로 먹을 수 있다.
      const pair = reversalPair(this.player, enemy) ?? eatPair(this.player, enemy);
      if (!pair) continue;
      const [hunter, prey] = pair;
      if (prey === this.player) {
        threat ??= hunter;
        continue;
      }
      const meal = this.combat.meal(prey, false);
      this.fx.eatPop(hunter, prey);
      hunter.eat(prey);
      prey.destroy();
      this.events.emit('eat', meal);
    }
    // 겹쳐 있는 동안은 생명력 게이지가 줄고, 게이지가 바닥나야 먹힌다.
    const { eaten } = stepVitality(this.vitality, { touching: !!threat, dt, max: this.playerStats.vitalityMax });
    this.threatened = !!threat;
    if (threat && eaten) {
      this.fx.burst(this.player.x, this.player.y, 0xfffbe6, 18, 1.2);
      threat.eat(this.player);
      this.endRun(FORM_BY_ID[threat.formId]);
      return;
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
  // 생명력 원호: 가득 차 있으면 숨기고, 닿아 있는 동안은 경고색으로 깜박인다. 두께·간격은 화면 픽셀이라 줌으로 나눈다.
  drawVitality(g) {
    const max = this.playerStats.vitalityMax;
    if (!vitalityVisible(this.vitality, max)) return;
    const v = CONFIG.vitality;
    const zoom = this.cameras.main.zoom;
    const { x, y, size } = this.player;
    const r = size * 0.75 + v.arcPad / zoom;
    const frac = Math.max(0, this.vitality.value / max);
    const warn = this.threatened;
    const flash = warn && Math.floor(this.time.now / 1000 * v.flashHz * 2) % 2 === 0;
    g.lineStyle(v.arcWidth / zoom, warn ? v.warnColor : v.arcColor, flash ? 0.5 : 0.95);
    g.beginPath();
    g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac, false);
    g.strokePath();
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
      this.resolveMeals(grid, h);
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
      this.openQuickPick();
      if (this.paused) return;
    }
    const direction = this.joystick.direction();
    const sim = dt * CONFIG.tempo * this.pace;
    this.simulate(sim, direction);
    if (this.ended) return;
    for (const enemy of this.enemies) this.fx.animateActor(enemy, dt, enemy.vx, enemy.vy);
    const sp = this.playerStats.speed;
    this.fx.animateActor(this.player, dt, direction.x * sp, direction.y * sp);
    this.fx.update(dt, this.player, this.progress.grade);
    this.combat.draw();
    const fg = this.fireGfx.clear();
    this.enemyFire.draw(fg);
    this.drawVitality(fg);
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
      const gauge = pauseGauge(this.progress, this.level);
      this.hud.setGauge(gauge.current, gauge.target, '다음 성장까지');
    }
  }
}
