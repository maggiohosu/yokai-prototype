import { CONFIG, REGIONS } from '../config.js';
import { FORMS, FORM_BY_ID } from '../data/forms.js';
import { STEMS } from '../data/stems.js';
import { abilityLabel } from '../systems/abilities.js';
import { eatBlocked, isAlly, isShielded } from '../game/status.js';
import { drawCreature, getFormThumbnail } from '../art/creature.js';
import { between, clamp, colorPicker, drawWorld, nearSpawnPlan, refillRingFor, regionAt, shouldCullOnEvolve, spawnPoint, spawnSize, spawnStage, startStage } from '../game/world.js';
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
import { BoosterButton, boosterMult, createBooster, stepBoosterSim } from '../game/booster.js';
import { MaintButton } from '../game/maintButton.js';
import { finishMaintenance, snapshotForMaintenance } from '../systems/maintenance.js';
import { loadProgress, saveProgress } from '../state/save.js';
import { attachSession, mealYoryeok, playerStats } from '../game/session.js';
import { ascension, createRivalState, easePace, rivalPlan, rivalRetry, startPace, upkeep } from '../systems/balance.js';
import { applyWorldScale, growthTarget } from '../systems/worldScale.js';
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
    // 형태 171종을 부팅 때 모두 굽지 않는다(휴대폰 메모리). 필요할 때 drawCreature가 한 번 굽는다.
    for (const dir of Object.keys(REGIONS)) drawCreature(this, 'mimul', { dir });
    this.fx = new Fx(this);
    const debug = new URLSearchParams(location.search).get('debug');
    const preview = debug === 'hub' || debug === 'evolve';
    // ?debug=lv: 저장하지 않는 시험 판. 게임은 그대로 돌고 요력만 지급해 빠른 성장 선택을 열어 본다.
    // ?stress=abilities: 저장하지 않는 시험 판. 능력 16종을 차례로 한 번씩 발동시키고 프레임 시간을 잰다(setupStress).
    const stressMode = new URLSearchParams(location.search).get('stress');
    const sandbox = preview || debug === 'lv' || stressMode === 'abilities';
    const progress = data.progress ?? this.registry.get('progress') ?? loadProgress();
    this.progress = sandbox ? structuredClone(progress) : progress;
    this.saveProgress = sandbox ? () => true : saveProgress;
    if (!sandbox) this.registry.set('progress', this.progress);
    this.simTime = 0; // 시뮬레이션 시계(초). 상태이상 타이머가 이 시계로 돈다 — 판 안 카드로 멈춘 동안에는 서 있다.
    this.stress = stressMode === 'abilities' ? this.setupStress(new URLSearchParams(location.search)) : null;
    // 단계마다 맵이 커진다(balance.map): 판을 그 단계의 월드 크기·적 수로 열고 바닥을 그린다. 시험 판(?stress)은 1단계 월드로 고정한다.
    applyWorldScale(this.stress ? 1 : this.progress.stage);
    this.worldView = drawWorld(this);
    this.playerStats = playerStats(this.progress);
    // 단계 템포(this.paceTarget)로 곧바로 시작하지 않고 처음 시작 화면과 같은 느린 템포에서 서서히 올라간다(balance.startPace, easePace). 시험 판(?stress)은 곧바로.
    this.paceTarget = this.playerStats.pace;
    this.pace = this.stress ? this.paceTarget : startPace();
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
      if (meal.byAlly) {
        // 매혹한 요괴가 먹은 요력(요력만 내 것이 된다).
        if (this.stress) this.stress.allyMeals++;
        this.fx.floatText(meal.x, meal.y - 26, '+' + gain + ' 요력 (매혹)', '#85cfb7');
        return;
      }
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
    this.rivalState = createRivalState(); // 맞수 대요괴 타이머(실제 초)와 살아 있는 수(balance.rivalPlan)
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
    // 부스터: 게이지는 판마다 가득 시작한다(scene.restart마다 create가 다시 돈다).
    this.booster = createBooster();
    this.boostMult = boosterMult(this.progress, FORM_BY_ID[this.progress.formId]);
    this.boostHeld = false;
    this.boostSec = 0; // 이번 프레임에 실제로 가속한 시뮬레이션 시간
    this.boostFx = { active: false, clock: 0 };
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.boosterButton = new BoosterButton(arena);
    this.maintenance = null; // 정비 화면이 열려 있는 동안 { before }
    this.maintButton = new MaintButton(arena, () => this.openMaintenance());
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
    this.boosterButton?.suspend();
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
      this.boosterButton?.resume();
    }
  }
  // 결과는 게임 화면에 떠오르는 글자로 짧게만 보여준다.
  showQuickResult(result) {
    const p = this.player;
    if (result.kind === 'evolve') {
      this.applyForm();
      this.recalcPace();
      this.fx.floatText(p.x, p.y - p.size * 2.1, '진화! ' + result.form.name + ' · ' + result.grade + '등급', '#ffd45c');
      const ability = abilityLabel(result.form);
      if (ability) this.fx.floatText(p.x, p.y - p.size * 3.5, ability, '#85cfb7');
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
  // 진화·능력 강화 뒤에 다시 계산하는 한 곳: 능력치, 템포 곡선(pace = 단계별 tempoMultiplier)과 플레이어 이동 속도(baseMult × 강화 레벨), 생명력 최대치, 부스터 배율.
  recalcPace() {
    this.playerStats = playerStats(this.progress);
    this.paceTarget = this.playerStats.pace;
    if (this.stress || !(this.pace > 0)) this.pace = this.paceTarget; // 시험 판은 곧바로, 판 안 진화는 tick에서 서서히 따라간다
    this.boostMult = boosterMult(this.progress, FORM_BY_ID[this.progress.formId]);
    Object.assign(this.player.stats, { speed: this.playerStats.speed, areaGain: this.playerStats.areaGain });
  }
  // 판 안 진화·역진화: 형태·단계·등급을 바꾸고 크기는 시작 크기로 되돌린다.
  applyForm() {
    const p = this.player;
    const sizeBefore = p.size;
    p.formId = this.progress.formId;
    p.stage = this.progress.stage;
    p.grade = this.progress.grade;
    p.sprite.setTexture(drawCreature(this, p.formId));
    p.setSize(CONFIG.levelUp.evolveResetSize);
    // 진화는 '나와 적이 함께 자라서 맵이 더 커진' 것으로 보이게 한다: 맵이 실제로 커지고, 카메라는 확대되지 않고 물러서고, 속도도 직전 크기 기준으로 이어 간다.
    if (!this.stress) {
      this.growWorld();
      this.pace = startPace(); // 속도도 처음 시작처럼 느리게: 나와 적이 함께 느려졌다가 함께 빨라진다(recalcPace가 목표 템포를 새 단계로 바꾼다)
      this.follow?.expand?.();
      if (!this.reducedMotion) this.fx.worldPulse(p.x, p.y);
      p.carryOnEvolve?.(sizeBefore);
    }
    this.marker.destroy();
    this.nameTag.destroy();
    this.makePlayerMarker();
    this.refreshIdentity();
    this.fx.burst(p.x, p.y, 0xfff1b8, 30, 1.6);
  }
  // 진화로 단계가 오르면 맵이 커진다(balance.map). 옛 월드가 새 월드의 한가운데에 놓이도록 모두 옮기고(방위 경계와 방위반은 그대로 한가운데),
  // 바닥을 다시 그리고, 새 땅은 보충으로 채운다. 날아가던 구슬·장판은 지운다.
  growWorld() {
    const before = CONFIG.world.size;
    // 판 안에서는 맵을 줄이지 않는다(강화 유지 역진화 등): 적·플레이어가 경계 밖으로 밀리는 것을 막는다.
    if (!growthTarget(this.progress.stage, before)) return;
    const { size } = applyWorldScale(this.progress.stage);
    const shift = (size - before) / 2;
    for (const actor of [this.player, ...this.enemies]) {
      actor.sprite.x += shift;
      actor.sprite.y += shift;
    }
    // 3단계 이상으로 오르면 멀리 흩어진 낮은 단계 적을 evolveCull 비율만큼 지운다: 보충이 플레이어 둘레에서 stageWeights대로 더 강한 적을 채운다.
    const myStage = this.progress.stage;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (!shouldCullOnEvolve(this.enemies[i], this.player, myStage)) continue;
      this.enemies[i].destroy();
      this.enemies.splice(i, 1);
    }
    this.combat.clearEffects();
    this.enemyFire.clear();
    this.worldView?.destroy();
    this.worldView = drawWorld(this);
    this.follow?.rebound?.();
    this.refillTime = 0;
  }
  // 판 안 카드·진화 화면·HUD 초상화는 도감과 같은 128px 썸네일(formId → dataURL 캐시)을 쓴다.
  formImage(formId) {
    return getFormThumbnail(this, formId);
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
  // [정비] 버튼: 판을 멈추고(성장 카드와 같은 방식: 스틱·부스터 입력을 놓고 발사 요청을 비운다) 정비 화면을 판 중 모드로 연다.
  // 닫으면 같은 판이 이어진다(closeMaintenance). 판이 끝났거나 성장 카드가 열려 있으면 열지 않는다.
  openMaintenance() {
    if (this.ended || this.paused || this.maintenance) return;
    this.maintenance = { before: snapshotForMaintenance(this.progress) };
    this.paused = true;
    this.fireRequested = false;
    this.joystick?.suspend();
    this.boosterButton?.suspend();
    this.maintButton?.setDisabled(true);
    this.showMaintenanceHub();
  }
  // 진화 화면에서 돌아올 때도 이 화면으로 돌아온다.
  showMaintenanceHub() {
    const getFormImage = (formId) => this.formImage(formId);
    const save = this.saveProgress;
    HubView(this.progress, FORMS, {
      getFormImage, save, inRun: true,
      onPlay: () => this.closeMaintenance(),
      onEvolve: () => EvolveView(this.progress, FORMS, { getFormImage, save, onDone: () => this.showMaintenanceHub() }),
    });
  }
  closeMaintenance() {
    const { before } = this.maintenance;
    const { formChanged } = finishMaintenance(this.progress, this.level, before, performance.now() / 1000);
    // 진화·역진화를 했으면 판 안 진화와 같이 크기만 처음으로. 강화한 능력치·속도·생명력·부스터 배율은 항상 다시 계산한다.
    if (formChanged) this.applyForm();
    this.recalcPace();
    this.refreshIdentity();
    this.saveProgress(this.progress);
    this.maintenance = null;
    this.fireRequested = false;
    this.paused = false;
    this.joystick?.resume();
    this.boosterButton?.resume();
    this.maintButton?.setDisabled(false);
  }
  releaseControls() {
    this.joystick?.destroy();
    this.fireButton?.destroy();
    this.boosterButton?.destroy();
    this.maintButton?.destroy();
    this.joystick = null;
    this.fireButton = null;
    this.boosterButton = null;
    this.maintButton = null;
  }
  makePlayerMarker() {
    this.marker = this.add.graphics().setDepth(1);
    const glow = CONFIG.gradeGlow[this.progress.grade];
    if (glow != null) this.marker.fillStyle(glow, 0.28).fillEllipse(0, 0, 112, 50);
    this.marker.lineStyle(glow != null ? 4 : 2.5, glow ?? 0x68854f, glow != null ? 0.95 : 0.75).strokeEllipse(0, 0, 100, 42);
    this.nameTag = this.add
      .text(0, 0, '나 · ' + FORM_BY_ID[this.progress.formId].name, {
        fontFamily: CONFIG.font.family,
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
    const enemy = new Enemy(this, pos, size, dir, stage);
    if (options.rival) enemy.markRival(); // 맞수 대요괴: 이름표 '맞수', 진화 없음, 몸집 상한 플레이어 × 1.3
    this.enemies.push(enemy);
    return true;
  }
  seedEnemies() {
    const { world, enemy } = CONFIG;
    const playerStage = this.player.stage ?? 1;
    // 3단계 이후에는 적을 시작 장소 근처에 모으고(nearSpawn) 처음부터 높은 단계가 나온다(startStageWeights). 1·2단계는 예전처럼 모두 1단계에서 시작한다.
    const plan = nearSpawnPlan(playerStage, world.population);
    for (let i = 0; i < world.population; i++) {
      let size = spawnSize(this.player.size, playerStage),
        near,
        stage = startStage(playerStage);
      if (i < world.initialNeighbors) {
        near = canEat({ size, stage }, this.player) ? world.outerRing : world.innerRing;
        if (i === 0) {
          stage = 1; // 첫 한 마리는 늘 가까이 있는 작은 먹이(1단계)다
          const small = enemy.sizes[0];
          size = this.player.size * between([small.min, small.max]);
          near = [world.innerRing[0], world.innerRing[0]];
        }
      } else if (plan && i < world.initialNeighbors + plan.count) {
        // 위협이 아닌 적(내가 먹을 수 있음)은 시작 화면 안쪽부터, 위협은 안전 거리(safeStart) 밖의 시작 고리에 놓는다.
        near = canEat({ size, stage }, this.player) ? plan.startRing : plan.preyRing;
      }
      if (!this.spawn(size, { near, initial: true, stage })) this.spawn(size, { initial: true, stage });
    }
  }
  // victory = { title, reward }: 승천처럼 이긴 판(결과 창에 승리 제목과 보상 요력). 없으면 평소 종료.
  endRun(killer, victory = null) {
    this.ended = true;
    this.releaseControls();
    this.combat.clearEffects();
    this.enemyFire.clear();
    this.fireGfx.clear();
    this.hud.end(this.player, killer, {
      onRestart: () => this.scene.restart({ progress: this.progress }),
      onHub: () => this.openHub(),
    }, this.run, victory);
    // 매혹한 요괴가 번 요력은 획득한 요력에 이미 들어 있다. 결과 창에 따로 적는다(설계 4-4).
    const reward = document.getElementById('run-reward');
    if (reward && this.run.allyYoryeok > 0) reward.textContent += ' (매혹한 요괴가 번 요력 ' + Math.round(this.run.allyYoryeok) + ' 포함)';
    this.events.emit('runEnd', {
      eaten: this.player.eaten, maxSize: this.player.maxSize, killerFormId: killer.id ?? null,
      ascended: !!victory, reward: victory?.reward ?? 0,
    });
  }
  // 승천(balance.ascension): 5단계에서 목표 크기에 닿으면 판을 이기고 끝낸다. 보상 요력을 지급·저장하고 결과 창에 승리 제목을 띄운다.
  ascend({ reward }) {
    const title = CONFIG.balance.ascension.title;
    this.progress.yoryeok += reward;
    this.saveProgress(this.progress);
    this.fx.burst(this.player.x, this.player.y, 0xffe27a, 40, 2);
    this.endRun({ name: title, message: '크기 ' + Number(this.player.size.toFixed(1)) + '에 닿아 ' + title + '했습니다.' }, { title, reward });
  }
  // 특수 적 구슬에 맞으면 크기(=체력)가 줄고, 일정 크기 아래면 판 종료.
  applyEnemyHits(hits) {
    for (const hit of hits) {
      // 생명력 게이지가 먼저 막고, 모자란 비율만큼만 크기가 줄어든다.
      const { damageRatio } = absorbHit(this.vitality);
      // 시험 판(?stress)은 플레이어 크기를 지키려고 구슬 피해를 크기에 반영하지 않는다.
      if (!this.stress) this.player.setSize(Math.max(1, this.player.size - hit.damage * damageRatio));
      this.fx.flash(this.player);
      this.fx.burst(hit.x, hit.y, 0xd0508f, 6, 0.6);
      if (isFatal(this.player.size) && !this.stress) {
        this.endRun({ name: '특수 요괴', message: '특수 요괴의 구슬에 맞아 쓰러졌습니다.' });
        return;
      }
    }
  }
  resolveMeals(grid, dt) {
    // 72마리면 최대 2,556쌍. 제곱거리로 검사하고 먹힌 개체는 즉시 제외한다.
    const now = this.simTime;
    let threat = null; // 이번 단계에 나를 먹을 수 있는 적과 겹친 첫 적
    for (const enemy of this.enemies) {
      if (!enemy.sprite.active) continue;
      // 매혹된 아군(풀린 직후 유예 포함)과는 서로 먹지 않는다(충돌 무시).
      if (isShielded(enemy, now)) continue;
      // 보물로 역전한 상대는 크기가 조금만 작아져도 바로 먹을 수 있다.
      const pair = reversalPair(this.player, enemy) ?? eatPair(this.player, enemy);
      if (!pair) continue;
      const [hunter, prey] = pair;
      if (prey === this.player) {
        // 빙결·경직·위협(겁먹음) 중인 적은 나를 먹지 못한다.
        if (!eatBlocked(hunter, now)) threat ??= hunter;
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
    if (threat && eaten && !this.stress) {
      this.fx.burst(this.player.x, this.player.y, 0xfffbe6, 18, 1.2);
      threat.eat(this.player);
      this.endRun(FORM_BY_ID[threat.formId]);
      return;
    }
    // 적끼리: 공간 격자로 닿은 쌍만 찾아 큰 쪽이 작은 쪽을 먹는다. 빙결·위협 중인 사냥꾼은 먹지 못한다.
    for (const [big, small] of findMeals(grid, undefined, now)) {
      if (!big.sprite.active || !small.sprite.active) continue;
      if (isAlly(big, now)) {
        // 매혹한 요괴가 먹으면 그 요력은 내 요력이다(요력만, 식성·성향·드롭 없음).
        const meal = this.combat.allyMeal(small, big);
        this.fx.eatPop(big, small);
        big.eat(small);
        small.destroy();
        this.events.emit('eat', meal);
        continue;
      }
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
  // 부스터 연출: 가속하며 움직이는 동안 플레이어 뒤쪽으로 옅은 먼지를 흘린다(Fx.burst 재사용, 실제 시간 기준). 모션 줄이기 설정이면 끈다.
  boostTrail(dt, direction, boosting) {
    const fx = this.boostFx;
    const speed = Math.hypot(direction.x, direction.y);
    const live = boosting && speed > 0.2 && !this.reducedMotion;
    if (!live) {
      fx.active = false;
      fx.clock = 0;
      return;
    }
    const t = CONFIG.booster.trail;
    const p = this.player;
    const power = t.power * Math.max(1, p.size / 40);
    if (!fx.active) {
      fx.active = true;
      this.fx.burst(p.x, p.y, t.color, t.startCount, power * 1.6);
    }
    fx.clock += dt;
    if (fx.clock < t.interval) return;
    fx.clock = 0;
    const back = (p.size * t.back) / speed;
    this.fx.burst(p.x - direction.x * back, p.y - direction.y * back, t.color, t.count, power);
  }
  // ---- 시험 판: ?stress=abilities[&only=능력키][&lv=0~15][&ms=구간 길이(밀리초)] ----
  // 줄기 16개의 5단계 형태로 차례로 바꿔 가며(여의주 +lv, 속도 곡선 최대 = 템포 3.9 × 1.5) 적 72마리를 플레이어 둘레에 유지하고
  // 자동으로 쏜다. 능력이 실제로 발동한 횟수와 프레임 시간을 window.__stressReport와 콘솔(STRESS_REPORT)에 남긴다. 저장하지 않는다.
  setupStress(params) {
    const only = params.get('only');
    const level = clamp(Math.trunc(Number(params.get('lv') ?? 15)) || 0, 0, 15);
    const ms = Math.max(300, Number(params.get('ms') ?? 2500) || 2500);
    const phases = [];
    for (const stem of STEMS) {
      if (only && stem.ability !== only) continue;
      const form = FORMS.find((f) => f.stem === stem.id && f.stage === 5 && f.entry) ?? FORMS.find((f) => f.stem === stem.id && f.stage === 5);
      if (form) phases.push({ ability: stem.ability, stem: stem.id, form });
    }
    const first = phases[0]?.form ?? FORM_BY_ID.mimul;
    Object.assign(this.progress, { formId: first.id, stage: first.stage, grade: 'C', treasure: { level } });
    this.progress.enh = { ...this.progress.enh, speed: 10 };
    window.__stressReport = { done: false };
    return {
      phases, index: -1, level, ms, phaseStart: 0, angle: 0, last: 0, done: false, allyMeals: 0, simMs: 0,
      base: null, frame: [], upd: [], sim: [], steps: [], orbs: [], perPhase: [],
    };
  }
  stressDirection(dt) {
    const st = this.stress;
    st.angle += dt * 1.2;
    return { x: Math.cos(st.angle) * 0.35, y: Math.sin(st.angle) * 0.35 };
  }
  // 적 72마리를 플레이어 둘레(반지름 120~440)에 유지한다. 단계 1~5와 크기를 섞어서 능력 전부가 맞을 상대가 있게 한다.
  stressFill() {
    const p = this.player;
    const world = CONFIG.world.size;
    const dirs = Object.keys(REGIONS);
    const ring = () => {
      const a = Math.random() * Math.PI * 2, r = 120 + Math.random() * 320;
      return { x: clamp(p.x + Math.cos(a) * r, 100, world - 100), y: clamp(p.y + Math.sin(a) * r, 100, world - 100) };
    };
    // 도망가는 적이 멀리 흩어지지 않게, 너무 멀어진 적은 둘레로 다시 데려온다.
    for (const e of this.enemies) {
      if (e.sprite.active && Math.hypot(e.x - p.x, e.y - p.y) > 520) {
        const pos = ring();
        e.sprite.x = pos.x;
        e.sprite.y = pos.y;
      }
    }
    while (this.enemies.length < CONFIG.world.population) {
      const pos = ring();
      const stage = 1 + Math.floor(Math.random() * 5);
      const size = Math.max(CONFIG.player.startSize * 0.4, p.size * (0.6 + Math.random() * 1.8));
      this.enemies.push(new Enemy(this, pos, size, dirs[Math.floor(Math.random() * dirs.length)], stage));
    }
  }
  stepStress(now) {
    const st = this.stress;
    if (st.done) {
      this.fireRequested = false;
      return;
    }
    if (st.index < 0 || now - st.phaseStart >= st.ms) this.nextStressPhase(now);
    if (st.done) return;
    this.fireRequested = true;
    this.stressFill();
  }
  nextStressPhase(now) {
    const st = this.stress;
    if (st.index >= 0) this.closeStressPhase();
    st.index++;
    if (st.index >= st.phases.length) {
      this.finishStress();
      return;
    }
    const { form } = st.phases[st.index];
    Object.assign(this.progress, { formId: form.id, stage: form.stage });
    this.applyForm();
    this.recalcPace();
    st.phaseStart = now;
    st.base = { ...this.combat.counters };
    st.last = 0;
    for (const list of [st.frame, st.upd, st.sim, st.steps, st.orbs]) list.length = 0;
  }
  recordStress(t0, t1) {
    const st = this.stress;
    if (st.done || st.index < 0) return;
    if (st.last) st.frame.push(t0 - st.last);
    st.last = t0;
    st.upd.push(t1 - t0);
    st.sim.push(st.simMs);
    st.steps.push(this.simSteps ?? 0);
    st.orbs.push(this.combat.orbs.length);
  }
  closeStressPhase() {
    const st = this.stress;
    const { ability, form } = st.phases[st.index];
    const summary = (list) => {
      if (!list.length) return { avg: 0, p95: 0, max: 0 };
      const sorted = [...list].sort((a, b) => a - b);
      const avg = list.reduce((sum, v) => sum + v, 0) / list.length;
      return { avg: +avg.toFixed(2), p95: +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))].toFixed(2), max: +sorted.at(-1).toFixed(2) };
    };
    st.perPhase.push({
      ability, form: form.id, stage: form.stage, level: st.level,
      triggers: this.combat.counters[ability] - st.base[ability],
      frames: st.upd.length,
      enemies: this.enemies.length,
      orbsMax: st.orbs.reduce((m, v) => Math.max(m, v), 0),
      stepsPerFrame: +(st.steps.reduce((sum, v) => sum + v, 0) / Math.max(1, st.steps.length)).toFixed(2),
      intervalMs: summary(st.frame), updateMs: summary(st.upd), simMs: summary(st.sim),
    });
  }
  finishStress() {
    const st = this.stress;
    st.done = true;
    this.fireRequested = false;
    const report = {
      done: true,
      level: st.level, tempo: CONFIG.tempo, pace: +this.pace.toFixed(3), tempoTimesPace: +(CONFIG.tempo * this.pace).toFixed(3),
      population: CONFIG.world.population, allyMeals: st.allyMeals,
      abilities: st.perPhase,
      allFired: st.perPhase.length > 0 && st.perPhase.every((phase) => phase.triggers > 0),
      silent: st.perPhase.filter((phase) => phase.triggers === 0).map((phase) => phase.ability),
    };
    window.__stressReport = report;
    console.log('STRESS_REPORT ' + JSON.stringify(report));
  }

  // 템포: 시뮬레이션(이동·AI·발사·쿨타임·보충)에만 CONFIG.tempo를 곱한다. 연출·카메라·HUD는 실제 시간.
  // 빨라진 물체가 서로 통과하지 않게 한 프레임을 maxStep 이하의 작은 단계로 나눠 계산한다.
  simulate(sim, direction) {
    const steps = Math.max(1, Math.ceil(sim / CONFIG.render.maxStep));
    const h = sim / steps;
    this.simSteps = steps;
    this.boostSec = 0;
    for (let i = 0; i < steps && !this.ended; i++) {
      this.simTime += h;
      const grid = buildGrid(this.enemies, CONFIG.hunt.detect);
      // 부스터는 플레이어 이동에만 배율을 곱한다(적 AI·발사체·쿨타임은 그대로). 게이지는 화면 시간(h ÷ 템포 ÷ 속도 곡선)으로 닳는다.
      const boost = stepBoosterSim(this.booster, { pressed: this.boostHeld, h, scale: CONFIG.tempo * this.pace, max: CONFIG.booster.maxSec });
      this.boostSec += boost.boostSec;
      this.player.step(direction, h, boost.boostSec, this.boostMult);
      this.combat.step(direction, h, i === 0 && this.fireRequested, grid);
      for (const enemy of this.enemies) {
        enemy.step(this.player, h, grid);
        if (enemy.special && enemy.sprite.active) this.enemyFire.tryFire(enemy, this.player, h, this.simTime);
      }
      this.resolveMeals(grid, h);
      if (this.ended) break;
      if (!this.stress) {
        // 승천은 먹은 직후에 판정한다(유지비가 목표 직전의 크기를 깎지 못하게). 그다음 크기 유지비: start 위에서는 초당 조금씩 준다.
        const win = ascension(this.progress, this.player.size);
        if (win) {
          this.ascend(win);
          break;
        }
        const kept = upkeep(this.player.size, h);
        if (kept !== this.player.size) this.player.setSize(kept);
      }
      this.applyEnemyHits(this.enemyFire.step(h, this.player, this.combat.shield));
    }
    this.fireRequested = false;
  }
  update(_time, delta) {
    if (!this.stress) {
      this.tick(delta);
      return;
    }
    const t0 = performance.now();
    this.stepStress(t0);
    this.tick(delta);
    this.recordStress(t0, performance.now());
  }
  tick(delta) {
    const stress = this.stress;
    // 시험 판은 프레임이 느려도 같은 계산 단계 수(60fps 기준)로 돌려서 수치를 비교할 수 있게 한다.
    const dt = stress ? 1 / 60 : Math.min(delta / 1000, CONFIG.render.maxDelta);
    if (this.ended) {
      this.fx.update(dt, null, this.progress.grade);
      return;
    }
    if (this.paused) return;
    if (!this.preview && !stress && shouldPause(this.progress, this.level, performance.now() / 1000)) {
      this.openQuickPick();
      if (this.paused) return;
    }
    const direction = stress ? this.stressDirection(dt) : this.joystick.direction();
    this.boostHeld = !!this.boosterButton?.held;
    // 진화로 단계 템포가 오르면 곧바로 빨라지지 않고 서서히 따라간다(나는 가만히 있는데 맵이 늘어나 더 느려 보인다).
    if (this.pace !== this.paceTarget) this.pace = easePace(this.pace, this.paceTarget, dt);
    const sim = dt * CONFIG.tempo * this.pace;
    const simStart = stress ? performance.now() : 0;
    this.simulate(sim, direction);
    if (stress) stress.simMs = performance.now() - simStart;
    if (this.ended) return;
    const boosting = this.boostSec > 0;
    this.boosterButton?.update(this.booster, CONFIG.booster.maxSec, boosting);
    this.boostTrail(dt, direction, boosting);
    for (const enemy of this.enemies) {
      this.fx.animateActor(enemy, dt, enemy.vx, enemy.vy);
      if (enemy.rival) enemy.followLabel();
    }
    const sp = this.playerStats.speed * (boosting ? this.boostMult : 1);
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
      // 3단계 이후에는 보충되는 적도 플레이어 둘레(화면 밖)에서 나온다(nearSpawn). 1·2단계는 월드 전체.
      const refill = nearSpawnPlan(this.player.stage ?? 1, CONFIG.world.population);
      const refillRing = refill ? refillRingFor(view, refill.refillRing) : null; // 고리 안쪽 반지름을 화면 크기에 맞춘다
      for (let i = 0; i < count; i++) {
        const s = spawnSize(size, this.player.stage ?? 1);
        // 그래도 자리를 못 찾으면 월드 전체에서 한 번 더 찾는다(보충이 멈추지 않게).
        if (!(refillRing && this.spawn(s, { view, near: refillRing }))) this.spawn(s, { view });
      }
    }
    // 맞수 대요괴(balance.rivalPlan): 4·5단계에서 실제 25초마다, 동시 최대 2마리. 시험 판(?stress)은 적 구성을 직접 정하므로 건너뛴다.
    if (!this.stress) {
      this.rivalState.alive = this.enemies.reduce((n, e) => n + (e.rival && e.sprite.active ? 1 : 0), 0);
      // 맞수 간격은 실제 25초: 템포가 서서히 오르는 동안에도 어긋나지 않게 목표 템포로 환산한 시뮬레이션 시간을 준다.
      const plan = rivalPlan(this.player.stage ?? 1, this.player.size, this.rivalState, dt * CONFIG.tempo * this.paceTarget);
      const nearPlan = nearSpawnPlan(this.player.stage ?? 1, CONFIG.world.population);
      const ring = nearPlan ? refillRingFor(view, nearPlan.refillRing) : null;
      const rivalOpts = { view, stage: plan?.stage, rival: true };
      if (plan && !(ring && this.spawn(plan.size, { ...rivalOpts, near: ring })) && !this.spawn(plan.size, rivalOpts)) rivalRetry(this.rivalState);
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
