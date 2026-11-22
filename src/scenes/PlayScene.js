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

export class PlayScene extends Phaser.Scene {
  constructor() {
    super('Play');
  }
  create() {
    for (const form of FORMS) drawCreature(this, form.id);
    drawWorld(this);
    this.player = new Player(this);
    this.enemies = [];
    this.nextColor = colorPicker();
    this.ended = false;
    this.refillTime = 0;
    this.hudTime = 0;
    this.joystick = new Joystick(document.getElementById('arena'));
    this.follow = followPlayer(this, this.player);
    this.hud = new Hud();
    const avatar = document.getElementById('avatar');
    if (!avatar.hasAttribute('src'))
      avatar.src = this.textures.get(drawCreature(this, 'mimul')).getSourceImage().toDataURL();
    this.makePlayerMarker();
    this.seedEnemies();
    this.hud.update(this.player, this.cameras.main.worldView);
    this.events.once('shutdown', () => this.joystick.destroy());
    document.getElementById('loading').hidden = true;
  }
  makePlayerMarker() {
    this.marker = this.add.graphics().setDepth(1);
    this.marker.lineStyle(2.5, 0x68854f, 0.75).strokeEllipse(0, 0, 100, 42);
    this.nameTag = this.add
      .text(0, 0, '나 · 미물', {
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
      const pair = eatingPair(this.player, enemy);
      if (!pair) continue;
      const [hunter, prey] = pair;
      hunter.eat(prey);
      if (prey === this.player) {
        this.ended = true;
        this.joystick.destroy();
        this.hud.end(this.player, FORM_BY_ID[hunter.formId], () => this.scene.restart());
        return;
      }
      prey.destroy();
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
    this.player.step(this.joystick.direction(), dt);
    for (const enemy of this.enemies) enemy.step(this.player, dt);
    this.resolveMeals();
    if (this.ended) return;
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
