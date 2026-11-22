import { CONFIG } from '../config.js';
import { FORMS, FORM_BY_ID } from '../data/forms.js';
import { drawCreature } from '../art/creature.js';
import { between, colorPicker, drawWorld, regionAt, spawnPoint, spawnSize } from '../game/world.js';
import { eatingPair } from '../game/actor.js';
import { Player } from '../game/player.js';
import { Enemy } from '../game/enemy.js';
import { Joystick } from '../game/joystick.js';
import { followPlayer } from '../game/camera.js';
import { Hud } from '../game/hud.js';
import { Combat } from '../game/combat.js';
import { FireButton } from '../game/fireButton.js';
import { loadProgress, saveProgress } from '../state/save.js';
import { attachSession, playerStats } from '../game/session.js';
import { HubView } from '../ui/HubView.js';
import { EvolveView } from '../ui/EvolveView.js';

export class PlayScene extends Phaser.Scene {
  constructor() {
    super('Play');
  }
  create(data = {}) {
    for (const form of FORMS) drawCreature(this, form.id);
    drawWorld(this);
    const debug = new URLSearchParams(location.search).get('debug');
    const sandbox = Boolean(debug) && !data.progress;
    this.sandbox = sandbox || Boolean(data.sandbox);
    this.progress = data.progress ?? this.registry.get('progress') ?? loadProgress();
    if (sandbox) this.progress = structuredClone(this.progress);
    this.registry.set('progress', this.progress);
    this.playerStats = playerStats(this.progress);
    this.player = new Player(this, this.progress.formId, this.playerStats);
    this.run = attachSession(this, this.progress, Math.random, this.sandbox ? () => false : saveProgress);
    this.enemies = [];
    this.nextColor = colorPicker();
    this.ended = false;
    this.refillTime = 0;
    this.hudTime = 0;
    const arena = document.getElementById('arena');
    this.joystick = new Joystick(arena);
    this.combat = new Combat(this, this.progress);
    this.fireRequested = false;
    this.fireButton = new FireButton(arena, () => {
      if (this.scene.isActive() && !this.ended) this.fireRequested = true;
    });
    this.follow = followPlayer(this, this.player);
    this.hud = new Hud();
    const avatar = document.getElementById('avatar');
    avatar.src = this.formImage(this.progress.formId);
    const form = FORM_BY_ID[this.progress.formId];
    const idBox = document.querySelector('.hud .identity');
    if (idBox) {
      idBox.querySelector('small').textContent = form.stage + '단계 · ' + this.progress.grade + '등급';
      idBox.querySelector('strong').textContent = form.name;
    }
    document.getElementById('result').hidden = true;
    this.makePlayerMarker();
    this.seedEnemies();
    this.hud.update(this.player, this.cameras.main.worldView);
    this.events.once('shutdown', this.releaseControls, this);
    document.getElementById('loading').hidden = true;
    // 확인용: ?debug=hub / ?debug=evolve (저장하지 않는 시험용 요력 지급)
    if (sandbox) {
      if (debug === 'evolve' || debug === 'hub') { this.progress.yoryeok += 5000; this.progress.diet.south += 40; this.progress.treasure ??= { level: 9 }; }
      setTimeout(() => (debug === 'evolve' ? EvolveView(this.progress, FORMS, { getFormImage: (id) => this.formImage(id), save: () => true, onDone: () => this.openHub() }) : this.openHub()), 300);
    }
  }
  formImage(formId) {
    return this.textures.get(drawCreature(this, formId)).getSourceImage().toDataURL();
  }
  openHub() {
    document.getElementById('result').hidden = true;
    const getFormImage = (formId) => this.formImage(formId);
    const save = this.sandbox ? () => true : (p) => saveProgress(p);
    const openEvolve = () => EvolveView(this.progress, FORMS, {
      getFormImage, save, onDone: () => this.openHub(),
    });
    HubView(this.progress, FORMS, {
      getFormImage, save,
      onPlay: () => this.scene.restart({ progress: this.progress, sandbox: this.sandbox }),
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
  spawn(size, options) {
    const pos = spawnPoint(this.player, this.enemies, size, options);
    if (!pos) return false;
    const dir = this.nextColor(regionAt(pos.x, pos.y));
    this.enemies.push(new Enemy(this, pos, size, dir));
    return true;
  }
  seedEnemies() {
    const { world, enemy } = CONFIG;
    for (let i = 0; i < world.population; i++) {
      let size = spawnSize(this.player.size),
        near;
      if (i < world.initialNeighbors) {
        near = size >= this.player.size * CONFIG.eating.ratio ? world.outerRing : world.innerRing;
        if (i === 0) {
          const small = enemy.sizes[0];
          size = this.player.size * between([small.min, small.max]);
          near = [world.innerRing[0], world.innerRing[0]];
        }
      }
      if (!this.spawn(size, { near, initial: true })) this.spawn(size, { initial: true });
    }
  }
  resolveMeals() {
    // 72마리면 최대 2,556쌍. 제곱거리로 검사하고 먹힌 개체는 즉시 제외한다.
    for (const enemy of this.enemies) {
      if (!enemy.sprite.active) continue;
      // 보물로 역전한 상대는 크기가 조금만 작아져도 바로 먹을 수 있다.
      const reversed = enemy.reversed && enemy.size < this.player.size;
      const pair = eatingPair(this.player, enemy, reversed ? 1 : CONFIG.eating.ratio);
      if (!pair) continue;
      const [hunter, prey] = pair;
      if (prey === this.player) {
        hunter.eat(prey);
        this.ended = true;
        this.releaseControls();
        this.combat.graphics.clear();
        this.hud.end(this.player, FORM_BY_ID[hunter.formId], () => this.openHub(), this.run);
        this.events.emit('runEnd', {
          eaten: this.player.eaten, maxSize: this.player.maxSize, killerFormId: hunter.formId,
        });
        return;
      }
      const meal = this.combat.meal(prey, false);
      hunter.eat(prey);
      prey.destroy();
      this.events.emit('eat', meal);
    }
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (!a.sprite.active) continue;
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        if (!b.sprite.active) continue;
        const pair = eatingPair(a, b);
        if (!pair) continue;
        pair[0].eat(pair[1]);
        pair[1].destroy();
        if (pair[1] === a) break;
      }
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (!this.enemies[i].sprite.active) this.enemies.splice(i, 1);
    }
  }
  update(_time, delta) {
    if (this.ended) return;
    const dt = Math.min(delta / 1000, CONFIG.render.maxDelta);
    const direction = this.joystick.direction();
    this.player.step(direction, dt);
    this.combat.step(direction, dt, this.fireRequested);
    this.fireRequested = false;
    for (const enemy of this.enemies) enemy.step(this.player, dt);
    this.resolveMeals();
    if (this.ended) return;
    this.combat.draw();
    this.fireButton.update(1 - this.combat.cooldown / CONFIG.combat.cooldown);
    this.follow(dt);
    const { x, y, size } = this.player;
    this.marker.setPosition(x, y + size * 0.64).setScale(size / 46);
    this.nameTag.setPosition(x, y + size * 1.18);
    this.refillTime -= dt;
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
    }
  }
}
