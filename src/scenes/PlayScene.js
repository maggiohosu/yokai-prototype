import { CONFIG, REGIONS } from '../config.js';
import { FORMS, FORM_BY_ID } from '../data/forms.js';
import { STEMS } from '../data/stems.js';
import { abilityLabel } from '../systems/abilities.js';
import { eatBlocked, isAlly, isShielded } from '../game/status.js';
import { drawCreature, getFormThumbnail } from '../art/creature.js';
import { bossRingFor, clamp, colorPicker, drawWorld, growMoveCount, offscreenPad, refillIncrement, regionAt, rollSpawnSize, seedField, shouldCullOnEvolve, spawnPoint, spawnSize, spawnStage } from '../game/world.js';
import { canEat, eatPair, reversalPair } from '../systems/rules.js';
import { afterPause, applyQuickCard, createRunLevel, deferEvolve, evolveOnly, evolveReady, growthView, pickQuickCards, rerollQuickCards, rerollsLeft, shouldPause } from '../systems/levelup.js';
import { drawStageMark, StageMarks } from '../art/marks.js';
import { Player } from '../game/player.js';
import { Enemy } from '../game/enemy.js';
import { Joystick } from '../game/joystick.js';
import { cameraView, followPlayer } from '../game/camera.js';
import { Hud } from '../game/hud.js';
import { Combat } from '../game/combat.js';
import { WEAPON_IDS } from '../data/weapons.js';
import { seedWeaponStress } from '../game/weaponFire.js';
import { FireButton } from '../game/fireButton.js';
import { BoosterButton, boosterMult, createBooster, stepBoosterSim } from '../game/booster.js';
import { MaintButton } from '../game/maintButton.js';
import { finishMaintenance, snapshotForMaintenance } from '../systems/maintenance.js';
import { hasPendingChoice } from '../systems/protect.js';
import { getCurrentSlot, loadProgress, saveProgress } from '../state/save.js';
import { hasLives, normalizeDifficulty, onRunEnd } from '../systems/difficulty.js';
import { takeTitleSelection } from '../ui/TitleView.js';
import { attachSession, mealYoryeok, playerStats } from '../game/session.js';
import { ascension, createRivalState, easePace, rivalPlan, rivalRetry, startPace, upkeep } from '../systems/balance.js';
import { applyWorldScale, growthTarget } from '../systems/worldScale.js';
import { buildGrid, findMeals, insertGrid, MealBounds, queryGrid } from '../game/enemyAI.js';
import { EnemyFire, drawSpecialMark, isFatal } from '../game/enemyFire.js';
import { Fx } from '../game/fx.js';
import { createVitality, feedVitality, hitVitality, starvingSize, stepHunger } from '../systems/vitality.js';
import { sfx } from '../audio/sfx.js';
import { bgm, FADE_OUT_STOP_MS, FIELD_TRACKS } from '../audio/bgm.js';
import { createMoodTracker, evaluateMoodState } from '../systems/musicMood.js';
import { HubView } from '../ui/HubView.js';
import { AbilityInfoView } from '../ui/AbilityInfoView.js';
import { EvolveView, gradeChanceText } from '../ui/EvolveView.js';
import { QuickPick } from '../ui/QuickPick.js';
import { QUICK_STAT_NAMES } from '../systems/levelup.js';
import { createHeraldState, heraldBonusYoryeok, heraldRetry, heraldSizeCap, heraldView, stepHerald } from '../systems/herald.js';
import { grantHeraldBopae, heraldRewardText } from '../systems/heraldReward.js';
import { createResonanceState, recordMeal, resonanceView } from '../systems/resonance.js';
import { PopulationStress, withSeed } from '../game/populationStress.js';

// 공명 표시용 방위 이름(청·백·적·흑)과 연출 색
const DIR_NAME = Object.fromEntries(Object.entries(REGIONS).map(([dir, region]) => [dir, region.color]));
const DIR_FX = { east: 0x58c8a4, west: 0xf3ead2, south: 0xff8a6b, north: 0x6f87a8 };

export class PlayScene extends Phaser.Scene {
  constructor() {
    super('Play');
  }
  create(data = {}) {
    const params = new URLSearchParams(location.search);
    this.populationStress = params.get('stress') === 'population' ? new PopulationStress(params) : null;
    if (this.populationStress) {
      withSeed(this.populationStress.seed, () => this.createField({ progress: this.populationStress.progress }));
      this.populationStress.attach(this);
    } else this.createField(data);
    this.framePerf = null;
    if (params.get('perf') === '1') this.attachFramePerf();
  }
  createField(data) {
    // 형태 171종을 부팅 때 모두 굽지 않는다(휴대폰 메모리). 필요할 때 drawCreature가 한 번 굽는다.
    for (const dir of Object.keys(REGIONS)) drawCreature(this, 'mimul', { dir });
    this.fx = new Fx(this);
    const debug = new URLSearchParams(location.search).get('debug');
    const preview = debug === 'hub' || debug === 'evolve';
    this.musicTracker = createMoodTracker();
    this.musicNearby = [];
    this.nextMusicCheck = 0.25;
    this.musicHitUntil = -Infinity;
    bgm.duck(preview);
    bgm.keepOnly(FIELD_TRACKS); // 타이틀·도감 곡의 해독본(약 17 MB)은 판 중에 들고 있지 않는다.
    bgm.setMood('calm');
    this.events.once('runEnd', () => {
      bgm.stop();
      this.time.delayedCall(FADE_OUT_STOP_MS, () => bgm.setMood('title'));
    });
    this.events.once('shutdown', () => bgm.duck(false));
    // ?debug=lv: 저장하지 않는 시험 판. 게임은 그대로 돌고 요력만 지급해 빠른 성장 선택을 열어 본다.
    // ?stress=abilities: 저장하지 않는 시험 판. 능력 16종을 차례로 한 번씩 발동시키고 프레임 시간을 잰다(setupStress).
    const stressMode = new URLSearchParams(location.search).get('stress');
    const sandbox = this.populationStress || preview || debug === 'lv' || debug === 'music' || stressMode === 'abilities' || stressMode === 'weapons';
    const selected = takeTitleSelection();
    this.slot = selected?.slot ?? this.slot ?? getCurrentSlot();
    const progress = data.progress ?? selected?.progress ?? this.registry.get('progress') ?? loadProgress(undefined, this.slot);
    this.progress = sandbox ? structuredClone(progress) : progress;
    this.saveProgress = sandbox ? () => true : (p) => saveProgress(p, undefined, this.slot);
    if (!sandbox) this.registry.set('progress', this.progress);
    this.difficulty = normalizeDifficulty(this.progress.difficulty);
    const easy = this.difficulty === 'easy' ? CONFIG.difficulty.easy : null;
    this.autoFire = easy?.autoFire ?? false;
    this.simTime = 0; // 시뮬레이션 시계(초). 상태이상 타이머가 이 시계로 돈다 — 판 안 카드로 멈춘 동안에는 서 있다.
    this.stress = this.populationStress ?? (stressMode === 'abilities' || stressMode === 'weapons' ? this.setupStress(new URLSearchParams(location.search)) : null);
    // 일반 판과 인구 부하 시험은 선택한 단계의 월드 크기·적 수를 쓴다.
    applyWorldScale(this.progress.stage);
    // 능력·무기 단독 시험은 과거 측정과 비교할 수 있도록 한 변 4000, 적 72마리로 고정한다.
    if (this.stress && !this.populationStress) Object.assign(CONFIG.world, { size: 4000, population: 72 });
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
    this.hunger = createVitality(this.playerStats.vitalityMax);
    this.hungerTimeMs = null;
    // 세로 화면에서 게임 루프가 잠들거나 탭·장면이 멈춘 시간은 다음 프레임에 더하지 않는다.
    const resetHungerClock = () => { this.hungerTimeMs = null; };
    const orientation = window.matchMedia('(orientation: portrait)');
    orientation.addEventListener('change', resetHungerClock);
    this.game.events.on('resume', resetHungerClock);
    this.events.on('pause', resetHungerClock);
    this.events.on('sleep', resetHungerClock);
    this.events.once('shutdown', () => {
      orientation.removeEventListener('change', resetHungerClock);
      this.game.events.off('resume', resetHungerClock);
      this.events.off('pause', resetHungerClock);
      this.events.off('sleep', resetHungerClock);
    });
    this.paused = false;
    this.preview = preview;
    this.run = attachSession(this, this.progress, Math.random, this.saveProgress);
    sfx.preload(['boost-start', 'boost-loop', 'eat', 'player-hurt', 'orb-fire', 'orb-hit',
      'shot-fan', 'shot-sword', 'shot-gourd', 'shot-beads', 'shot-bell', 'shot-seal', 'shot-mirror']);
    this.boostVoice = null;
    this.game.events.on('hidden', this.stopBoostSfx, this);
    this.game.events.on('blur', this.stopBoostSfx, this);
    this.events.once('shutdown', () => {
      this.game.events.off('hidden', this.stopBoostSfx, this);
      this.game.events.off('blur', this.stopBoostSfx, this);
      this.stopBoostSfx();
    });
    const onEatFx = (meal) => {
      const p = this.player;
      if (!meal.byAlly) sfx.play('eat', { volume: 0.8 });
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
    // 예고된 대요괴(herald.js)·공명 연쇄(resonance.js): 상태는 판마다 새로 만든다. 시간은 판을 진행한 실제 초(playSec)로 센다(판이 멈춘 동안은 서 있다).
    this.heraldState = createHeraldState();
    this.heraldStats = { spawned: 0, slain: 0 };
    this.resonance = createResonanceState();
    this.resonanceStats = { streak: 0, cycle: 0, bonus: 0 };
    this.playSec = 0;
    // 리스너 등록 순서가 중요하다: session.attachSession의 먹기 처리(요력·기본 드롭 굴림)가 먼저, 아래 afterEat(대요괴 보상·공명)가 그다음에 돈다.
    const onAfterEat = (meal) => this.afterEat(meal);
    this.events.on('eat', onEatFx);
    this.events.on('eat', onAfterEat);
    this.events.on('treasureDrop', onDropFx);
    this.events.once('shutdown', () => {
      this.events.off('eat', onEatFx);
      this.events.off('eat', onAfterEat);
      this.events.off('treasureDrop', onDropFx);
    });
    this.enemies = [];
    this.grid = undefined;
    this.placementGrid = undefined;
    this.cameraBounds = {};
    this.thinkStep = 0;
    this.nextThinkSlot = 0;
    this.meals = [];
    this.mealBounds = new MealBounds();
    this.eatenThisStep = new Set();
    this.refillPending = 0;
    this.simDebt = 0;
    this.nextColor = colorPicker();
    this.ended = false;
    this.refillTime = 0;
    this.rivalState = createRivalState(); // 맞수 대요괴 타이머(실제 초)와 살아 있는 수(balance.rivalPlan)
    this.hudTime = 0;
    const arena = document.getElementById('arena');
    this.joystick = new Joystick(document);
    this.combat = new Combat(this, this.progress);
    // 내가 잡은 먹이가 대요괴이면 meal에 표시를 붙인다(직접 먹기·여의주로 쓰러뜨리기 모두 combat.meal을 거친다). 매혹한 요괴가 먹은 것도 표시는 붙지만 afterEat가 보상에서 뺀다.
    const baseMeal = this.combat.meal.bind(this.combat);
    this.combat.meal = (enemy, killedByTreasure) => {
      const meal = baseMeal(enemy, killedByTreasure);
      if (enemy.herald) meal.herald = true;
      return meal;
    };
    this.enemyFire = new EnemyFire(this);
    this.fireGfx = this.add.graphics().setDepth(4.5);
    this.stageMarks = new StageMarks(this);
    this.events.once('shutdown', () => this.enemyFire?.destroy());
    this.fireRequested = false;
    this.fireButton = new FireButton(arena, () => {
      if (this.scene.isActive() && !this.ended && !this.paused) this.fireRequested = true;
    }, { autoFire: this.autoFire });
    // 부스터: 게이지는 판마다 가득 시작한다(scene.restart마다 create가 다시 돈다).
    this.booster = createBooster();
    this.boostMult = boosterMult(this.progress, FORM_BY_ID[this.progress.formId]);
    this.boostHeld = false;
    this.boostSec = 0; // 이번 프레임에 실제로 가속한 시뮬레이션 시간
    this.boostFx = { active: false, clock: 0 };
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.boosterButton = easy?.booster === false ? null : new BoosterButton(arena);
    const keyHints = arena.querySelectorAll('.keys > span');
    keyHints[1].hidden = this.autoFire;
    keyHints[2].hidden = !this.boosterButton;
    this.maintenance = null; // 정비 화면이 열려 있는 동안 { before }
    this.maintButton = new MaintButton(arena, () => this.openMaintenance());
    this.follow = followPlayer(this, this.player);
    this.viewChanged = true;
    const resize = size => { this.follow.recenter(size); this.viewChanged = true; };
    this.scale.on('resize', resize);
    this.events.once('shutdown', () => this.scale.off('resize', resize));
    this.hud = new Hud(() => this.openAbilityInfo(), () => this.openEvolveFromHud());
    this.hud.setLives(hasLives(this.difficulty) ? this.progress.lives : null);
    this.refreshIdentity();
    document.getElementById('result').hidden = true;
    this.makePlayerMarker();
    this.seedEnemies();
    this.hud.update(this.player, this.cameras.main.worldView);
    this.events.once('shutdown', this.releaseControls, this);
    this.events.once('shutdown', () => this.quickPick?.close());
    this.events.once('shutdown', () => this.abilityInfo?.close());
    this.events.once('shutdown', () => this.hud?.dispose());
    document.getElementById('loading').hidden = true;
    // 확인용: ?debug=hub / ?debug=evolve (저장하지 않는 시험용 요력 지급), ?debug=lv는 판 중에 요력을 지급한다.
    if (debug === 'lv' && !data.progress) {
      setTimeout(() => { this.progress.yoryeok += 400; this.progress.diet.south += 40; }, 400);
    } else if (debug && debug !== 'music' && !data.progress) {
      if (preview) { this.progress.yoryeok += 5000; this.progress.diet.south += 40; this.progress.treasure ??= { level: 9 }; }
      setTimeout(() => (debug === 'evolve' ? EvolveView(this.progress, FORMS, { getFormImage: (id) => this.formImage(id), save: this.saveProgress, onDone: () => this.openHub() }) : this.openHub()), 300);
    }
    // 보호권·퇴화 선택이 저장된 채 열렸다면(새로고침) 판을 시작하기 전에 정비 화면으로 같은 선택창을 연다(변경 이력 23). 굴림은 이미 끝났고 선택만 남아 있다.
    // 다른 창(진화 카드 등)이 판을 멈춰 두고 있으면 닫힐 때까지 기다렸다가(최대 약 10초) 연다.
    if (!sandbox && hasPendingChoice(this.progress)) {
      let tries = 0;
      const openPending = () => {
        if (this.ended || this.maintenance || !hasPendingChoice(this.progress) || ++tries > 20) return;
        if (this.paused) setTimeout(openPending, 500);
        else this.openMaintenance();
      };
      setTimeout(openPending, 300);
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
  // 2단계 이상(변경 이력 21)은 진화 카드만 나오고 [계속 모으기]가 곁들여진다(요력이 진화 비용에 닿았을 때 한 번, 이후에는 HUD의 '진화 가능' 단추로).
  openQuickPick() {
    const cards = pickQuickCards(this.progress, this.level, FORMS);
    if (!cards.length) {
      afterPause(this.progress, this.level, performance.now() / 1000);
      return;
    }
    const evolveOnlyPick = evolveOnly(this.progress);
    this.paused = true;
    bgm.duck(true);
    this.hungerTimeMs = null;
    this.joystick?.suspend();
    this.boosterButton?.suspend();
    this.quickPick = QuickPick(cards, {
      progress: this.progress,
      yoryeok: this.progress.yoryeok,
      getFormImage: (id) => this.formImage(id),
      onPick: (card) => this.pickCard(card),
      title: evolveOnlyPick ? '진화할 수 있어요!' : undefined,
      onDefer: evolveOnlyPick ? () => this.deferCard() : undefined,
      // 다시 뽑기(한 판에 CONFIG.reroll.perRun번): 같은 잔액·같은 규칙으로 새로 뽑는다. 새 카드는 여기서 이미 정해지고 화면은 보여주기만 한다.
      // 진화 전용 선택은 카드 구성이 늘 같아 바꿀 것이 없으므로 숨긴다.
      rerollsLeft: evolveOnlyPick ? 0 : rerollsLeft(this.level),
      onReroll: (shown) => rerollQuickCards(this.progress, this.level, FORMS, { previous: shown }),
    });
  }
  // HUD의 '진화 가능' 단추: [계속 모으기]를 골랐거나 쿨다운 중인 진화 카드를 원할 때 연다.
  openEvolveFromHud() {
    if (this.paused || this.ended || this.preview || this.stress || !evolveReady(this.progress)) return;
    this.openQuickPick();
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
      this.resumeAfterQuickPick();
    }
  }
  // [계속 모으기]: 아무것도 사지 않고 재개한다. 이 단계에서는 진화 카드가 자동으로 다시 열리지 않는다.
  deferCard() {
    this.quickPick = null;
    deferEvolve(this.progress, this.level, performance.now() / 1000);
    this.resumeAfterQuickPick();
  }
  resumeAfterQuickPick() {
    this.fireRequested = false;
    this.paused = false;
    bgm.duck(false);
    this.joystick?.resume();
    this.boosterButton?.resume();
    this.hudTime = 0; // 다음 틱에 HUD 성장 표시를 바로 갱신한다(진화했으면 새 단계의 게이지로, 미뤘으면 '진화 가능' 단추 그대로)
  }
  // 결과는 게임 화면에 떠오르는 글자로 짧게만 보여준다.
  showQuickResult(result) {
    const p = this.player;
    if (result.kind === 'evolve') {
      this.applyForm();
      this.recalcPace();
      // 결과 글자는 한 줄씩 겹치지 않게 쌓는다(줄 간격은 화면 픽셀이라 줌으로 나눈다). 이 결과(등급)가 나올 확률 한 줄은 계획서 변경 이력 5.
      const lines = [['진화! ' + result.form.name + ' · ' + result.grade + '등급', '#ffd45c'], [gradeChanceText(this.progress, result.grade), '#fff1b8'], [abilityLabel(result.form), '#85cfb7']];
      if (result.firstDiscovery) lines.push(['첫 발견! 보호권 +1', '#c4f7e6']);
      const step = 22 / this.cameras.main.zoom;
      lines.filter(([text]) => text).forEach(([text, color], i) => this.fx.floatText(p.x, p.y - p.size * 2.1 - i * step, text, color));
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
    const previousStage = p.stage;
    p.formId = this.progress.formId;
    p.stage = this.progress.stage;
    if (p.stage !== previousStage) {
      for (const enemy of this.enemies) enemy.refreshOrbRule();
    }
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
  // 바닥을 다시 그리고, 새 땅에는 옛 땅의 적 일부를 화면 밖에서 옮겨 온다(적 수가 모든 단계에서 같아 그냥 두면 새 땅이 텅 비고 옛 땅 한가운데만 붐빈다). 날아가던 구슬·장판은 지운다.
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
    // 3단계 이상으로 오르면 멀리 흩어진 낮은 단계 적을 evolveCull 비율만큼 지운다: 보충이 stageWeights대로 더 강한 적을 채운다.
    const myStage = this.progress.stage;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (!shouldCullOnEvolve(this.enemies[i], this.player, myStage)) continue;
      this.enemies[i].destroy();
      this.enemies.splice(i, 1);
    }
    this.spreadIntoNewLand(before, size, shift);
    this.combat.clearEffects();
    this.enemyFire.clear();
    this.worldView?.destroy();
    this.worldView = drawWorld(this);
    this.follow?.rebound?.();
    this.refillTime = 0;
  }
  // 맵이 커진 직후, 옛 땅(한 변 before, 새 땅 안 shift 오프셋)에 몰린 적의 (1 - 면적 비율)만큼을 새 땅(테두리)의 화면 밖으로 옮긴다.
  // 지금 화면에 보이는 적(스프라이트가 걸친 것까지)과 맞수·대요괴는 그대로 두고, 도착 자리는 진화 연출로 물러서는 화면 밖에서 고른다. 자리가 모자라면 옮길 수 있는 만큼만 옮긴다.
  spreadIntoNewLand(before, size, shift) {
    const p = this.player;
    // 카메라는 아직 옛 위치(플레이어·적만 shift 옮겨짐; follow·setBounds는 렌더 직전·뒤에 갱신): 시야를 shift만큼 보정한다.
    const raw = cameraView(this.cameras.main, this.cameraBounds);
    const old = { left: raw.left + shift, right: raw.right + shift, top: raw.top + shift, bottom: raw.bottom + shift };
    // 진화 뒤 카메라는 새 맵 경계 [0, size] 안에서 플레이어를 가운데에 두도록 다시 잡힌다(옛 카메라가 옛 경계에 붙어 있었어도): 지금 배율과 물러선 배율의 두 시야를 직접 구한다.
    const centered = (w, h) => {
      const left = Math.min(Math.max(0, p.x - w / 2), Math.max(0, size - w));
      const top = Math.min(Math.max(0, p.y - h / 2), Math.max(0, size - h));
      return { left, right: left + w, top, bottom: top + h };
    };
    const now = centered(raw.width, raw.height);
    const back = centered(raw.width / CONFIG.balance.view.evolveZoom, raw.height / CONFIG.balance.view.evolveZoom);
    const union = (...v) => ({
      left: Math.min(...v.map((r) => r.left)), right: Math.max(...v.map((r) => r.right)),
      top: Math.min(...v.map((r) => r.top)), bottom: Math.max(...v.map((r) => r.bottom)),
    });
    const wide = union(old, now, back);
    const cam = union(old, now);
    const seen = (e) => {
      const pad = offscreenPad(e.size, e.stage);
      return e.x > cam.left - pad && e.x < cam.right + pad && e.y > cam.top - pad && e.y < cam.bottom + pad;
    };
    const inOld = (x, y) => x >= shift && x <= shift + before && y >= shift && y <= shift + before;
    const movable = this.enemies.filter((e) => e.sprite.active && !e.rival && !e.herald && !seen(e));
    let todo = growMoveCount(this.enemies.length, before, size);
    for (let i = movable.length - 1; i > 0; i--) { // 무작위로 섞는다
      const j = Math.floor(Math.random() * (i + 1));
      [movable[i], movable[j]] = [movable[j], movable[i]];
    }
    // 격자는 한 번만 만든다. 옮긴 적은 새 칸에 다시 넣는다(옛 칸의 항목은 살아 있는 좌표를 읽어 새 자리가 아니면 반경 밖이라 무해하다).
    // 옮길 적 자신의 옛 자리는 옛 땅 안이고 도착 자리는 새 땅이라, 자기 자신과 겹침을 따지는 것은 경계 근처에서 보수적으로 거를 뿐이다.
    const grid = this.placementGrid = buildGrid(this.enemies, CONFIG.render.enemyCell, this.placementGrid);
    for (const e of movable) {
      if (todo <= 0) break;
      const pos = spawnPoint(p, this.enemies, e.size, { view: wide, stage: e.stage, grid, region: (x, y) => !inOld(x, y) });
      if (!pos) continue;
      e.sprite.x = pos.x;
      e.sprite.y = pos.y;
      insertGrid(grid, e);
      todo--;
    }
  }
  // 판 안 카드·진화 화면·HUD 초상화는 도감과 같은 128px 썸네일(formId → dataURL 캐시)을 쓴다.
  formImage(formId) {
    return getFormThumbnail(this, formId);
  }
  openHub() {
    bgm.duck(true);
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
  pauseForDialog() {
    this.paused = true;
    bgm.duck(true);
    this.hungerTimeMs = null;
    this.fireRequested = false;
    this.joystick?.suspend();
    this.boosterButton?.suspend();
    this.maintButton?.setDisabled(true);
  }
  resumeAfterDialog() {
    this.fireRequested = false;
    this.paused = false;
    bgm.duck(false);
    this.joystick?.resume();
    this.boosterButton?.resume();
    this.maintButton?.setDisabled(false);
  }
  openAbilityInfo() {
    if (this.ended || this.paused) return;
    this.abilityInfo = AbilityInfoView(this.progress.formId, {
      progress: this.progress,
      getFormImage: id => this.formImage(id),
      onClose: () => {
        this.abilityInfo = null;
        this.resumeAfterDialog();
      },
    });
    if (this.abilityInfo) this.pauseForDialog();
  }
  openMaintenance() {
    if (this.ended || this.paused || this.maintenance) return;
    this.maintenance = { before: snapshotForMaintenance(this.progress) };
    this.pauseForDialog();
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
    this.resumeAfterDialog();
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
    const stage = options.stage ?? spawnStage(this.player.stage ?? 1, Math.random, this.difficulty);
    // 대요괴·맞수는 자리가 없으면 다음 프레임에 다시 시도하므로 화면 밖 여유를 줄여서라도 찾는다(relax). 일반 보충은 몸 전체가 화면 밖인 자리만 쓴다.
    const pos = spawnPoint(this.player, this.enemies, size, { ...options, stage, relax: !!options.rival });
    if (!pos) return false;
    const dir = this.nextColor(regionAt(pos.x, pos.y));
    const enemy = new Enemy(this, pos, size, dir, stage);
    if (!options.initial && CONFIG.world.spawnGraceSec > 0) enemy.graceUntil = this.simTime + CONFIG.world.spawnGraceSec * CONFIG.tempo * this.pace; // 보충으로 놓인 적은 실제 spawnGraceSec초 동안 먹지도 먹히지도 않는다(시뮬레이션 시간으로 환산)
    if (options.rival) enemy.markRival(); // 맞수 대요괴: 이름표 '맞수', 진화 없음, 몸집 상한 플레이어 × 1.3
    if (options.herald) this.markHerald(enemy); // 예고된 대요괴: 맞수와 같은 규칙에 이름표 '대요괴', 몸집 상한 플레이어 × herald.sizeMax
    this.enemies.push(enemy);
    if (options.grid) insertGrid(options.grid, enemy);
    this.lastSpawned = enemy;
    return true;
  }
  // 예고된 대요괴(herald.js): markRival(진화·몸집 강화·특수 적 없음, 이름표)을 먼저 거친 적에 이름표·몸집 상한만 바꾼다. 맞수와 세는 방식이 달라서 herald 표식을 따로 둔다.
  markHerald(enemy) {
    enemy.herald = true;
    enemy.label?.setText(CONFIG.herald.label).setFontSize('13px').setBackgroundColor('#914837');
    enemy.capSize = () => {
      const cap = heraldSizeCap(this.player?.size);
      if (cap > 0 && enemy.size > cap) enemy.setSize(cap);
    };
  }
  // 대요괴 한 프레임: 등장 시각이면 플레이어 둘레 화면 밖(모든 단계에서)에 한 마리 놓고, 남은 시간이 warnSec 이하가 되면 안내한다. dt는 실제 초(멈춘 동안은 호출되지 않는다).
  stepHeraldWave(dt, view) {
    const h = CONFIG.herald;
    const alive = this.enemies.reduce((n, e) => n + (e.herald && e.sprite.active ? 1 : 0), 0);
    const { spawn, cue } = stepHerald(this.heraldState, { dt, alive, playerStage: this.player.stage ?? 1, playerSize: this.player.size });
    if (cue === 'warn') this.hud.heraldNotice('대요괴가 곧 나타납니다! 준비하세요', h.noticeSec, 'warn');
    if (!spawn) return;
    const opts = { view, stage: spawn.stage, rival: true, herald: true };
    const ring = bossRingFor(view);
    if (!(this.spawn(spawn.size, { ...opts, near: ring }) || this.spawn(spawn.size, opts))) {
      heraldRetry(this.heraldState);
      return;
    }
    this.heraldStats.spawned++;
    const ratio = Number((spawn.size / this.player.size).toFixed(1));
    this.hud.heraldNotice('대요괴 출현! 내 크기의 ' + ratio + '배, 잡으면 보패 1개와 큰 보상', h.noticeSec, 'arrive');
    if (!this.reducedMotion) this.cameras.main.shake(this.fx.m.shakeMs, this.fx.m.shakeIntensity);
  }
  // 먹기 직후 처리(session의 요력·기본 드롭 굴림이 먼저 돈 뒤): 대요괴 처치 보상과 공명 연쇄. 매혹한 요괴가 먹은 것은 내 처치·내 연쇄가 아니다.
  afterEat(meal) {
    if (meal.byAlly || this.stress) return;
    if (meal.herald) this.slayHerald(meal);
    this.chainResonance(meal);
  }
  // 대요괴 처치: 요력 보너스(기본 요력 × bonusMult) + 보패 1개(heraldReward.js: 안 가진 보패 중 무작위, 없으면 강화, 그도 없으면 요력).
  // 보패는 필드에 떨어뜨리지 않고 처치 순간 바로 progress에 넣고 곧바로 저장한다(판이 끝나기 전에 죽어도 유지). 판은 멈추지 않는다.
  slayHerald(meal) {
    const p = this.player;
    const gain = mealYoryeok(meal);
    const bonus = heraldBonusYoryeok(gain);
    this.progress.yoryeok += bonus;
    this.run.yoryeok += bonus;
    const reward = grantHeraldBopae(this.progress, { bonusYoryeok: bonus });
    this.run.yoryeok += reward.yoryeok;
    this.saveProgress(this.progress);
    this.heraldStats.slain++;
    this.heraldStats.last = reward;
    if (reward.type !== 'yoryeok') sfx.play('weapon-unlock', { volume: 0.9 });
    this.fx.floatText(p.x, p.y - p.size * 2.6, '대요괴 처치! 요력 +' + bonus + ' 더', '#ffd45c');
    this.fx.burst(p.x, p.y, 0xffd45c, 36, 1.8);
    this.hud.heraldNotice('대요괴를 잡았습니다! 요력 +' + (gain + bonus) + ' · ' + heraldRewardText(reward), CONFIG.herald.noticeSec + 1, 'slain');
  }
  // 공명 연쇄(resonance.js): 먹은 요괴의 방위가 이어지면 보너스 요력과 짧은 연출.
  chainResonance(meal) {
    const hit = recordMeal(this.resonance, { dir: meal.dir, gain: mealYoryeok(meal) }, this.playSec);
    if (!hit) return;
    const p = this.player;
    this.progress.yoryeok += hit.bonus;
    this.run.yoryeok += hit.bonus;
    this.saveProgress(this.progress);
    this.resonanceStats[hit.rule]++;
    this.resonanceStats.bonus += hit.bonus;
    const name = hit.rule === 'streak' ? DIR_NAME[hit.dir] + ' ' + hit.count + '연속' : '네 방위 한 바퀴';
    this.fx.floatText(p.x, p.y - p.size * 3.2, '공명! ' + name + ' +' + hit.bonus + ' 요력', '#c4f7e6');
    this.fx.burst(p.x, p.y, hit.dir ? DIR_FX[hit.dir] : 0xffe27a, 26, 1.5);
    this.hud.flashResonance('공명! +' + hit.bonus, CONFIG.resonance.flashSec);
  }
  // 대요괴 표식: 몸 둘레의 겹 고리(숨쉬듯 깜박임). 화면 밖에 있으면 화면 가장자리에 방향 화살표를 그린다. 두께·크기는 화면 픽셀이라 줌으로 나눈다.
  drawHeraldMark(g, enemy, now, view = this.cameras.main.worldView) {
    const cam = this.cameras.main;
    const zoom = cam.zoom;
    const pulse = 0.5 + 0.5 * Math.sin(now * 5);
    const r = enemy.size * 1.3;
    const inside = enemy.x + r > view.left && enemy.x - r < view.right && enemy.y + r > view.top && enemy.y - r < view.bottom;
    if (inside) {
      g.lineStyle(3 / zoom, 0x914837, 0.55 + 0.4 * pulse);
      g.strokeCircle(enemy.x, enemy.y, r);
      g.lineStyle(2 / zoom, 0xe7cb8a, 0.9);
      g.strokeCircle(enemy.x, enemy.y, r + 6 / zoom);
      return;
    }
    const dx = enemy.x - view.centerX, dy = enemy.y - view.centerY;
    const margin = 30 / zoom;
    const k = Math.min((view.width / 2 - margin) / Math.max(1e-6, Math.abs(dx)), (view.height / 2 - margin) / Math.max(1e-6, Math.abs(dy)));
    const px = view.centerX + dx * k, py = view.centerY + dy * k;
    const a = Math.atan2(dy, dx), u = 1 / zoom;
    g.fillStyle(0x914837, 0.7 + 0.3 * pulse);
    g.lineStyle(2 * u, 0xe7cb8a, 1);
    g.beginPath();
    g.moveTo(px + Math.cos(a) * 16 * u, py + Math.sin(a) * 16 * u);
    g.lineTo(px + Math.cos(a + 2.5) * 12 * u, py + Math.sin(a + 2.5) * 12 * u);
    g.lineTo(px + Math.cos(a - 2.5) * 12 * u, py + Math.sin(a - 2.5) * 12 * u);
    g.closePath();
    g.fillPath();
    g.strokePath();
  }
  // 적을 모두 놓는다(world.seedField): 플레이어 둘레에 initialNeighbors마리, 나머지는 모든 단계에서 맵 전체에 고르게. 1·2단계는 처음에 모두 1단계, 3단계부터는 startStageWeights로 높은 단계가 나온다.
  seedEnemies() {
    const grid = this.placementGrid = buildGrid(this.enemies, CONFIG.render.enemyCell, this.placementGrid);
    const { left, right, top, bottom } = cameraView(this.cameras.main, this.cameraBounds);
    seedField({
      player: this.player, difficulty: this.difficulty, startView: { left, right, top, bottom },
      spawn: (size, options) => this.spawn(size, { ...options, grid }),
    });
  }
  // victory = { title, reward }: 승천처럼 이긴 판(결과 창에 승리 제목과 보상 요력). 없으면 평소 종료.
  // 하드: 판이 먹히거나 쓰러져 끝나면 목숨 1개를 쓴다(승천은 쓰지 않는다). 0이 되면 이 캐릭터(저장 슬롯)를 지운다.
  endRun(killer, victory = null) {
    if (this.ended || this.paused) return;
    this.ended = true;
    this.releaseControls();
    this.combat.clearEffects();
    this.enemyFire.clear();
    this.fireGfx.clear();
    this.stageMarks.finish();
    const life = onRunEnd(this.progress, victory ? 'ascension' : 'defeat');
    if (life.livesLeft !== null) this.progress.lives = life.livesLeft;
    const actions = life.erased
      ? { onRestart: () => location.replace('./index.html') }
      : { onRestart: () => this.scene.restart({ progress: this.progress }), onHub: () => this.openHub() };
    this.hud.end(this.player, killer, actions, this.run, victory, life);
    this.hud.setLives(life.livesLeft);
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
    this.fx.burst(this.player.x, this.player.y, 0xffe27a, 40, 2);
    this.endRun({ name: title, message: '크기 ' + Number(this.player.size.toFixed(1)) + '에 닿아 ' + title + '했습니다.' }, { title, reward });
  }
  stopBoostSfx() {
    this.boostVoice?.stop(0);
    this.boostVoice = null;
  }
  applyEnemyHits(hits) {
    if (hits.length) {
      this.musicHitUntil = this.playSec + 1.5;
      sfx.play('player-hurt', { volume: 0.9 });
    }
    for (const hit of hits) {
      const sizeHit = hitVitality(this.hunger);
      if (sizeHit && !this.stress) this.player.setSize(Math.max(1, this.player.size - hit.damage));
      this.fx.flash(this.player);
      this.fx.burst(hit.x, hit.y, 0xd0508f, 6, 0.6);
      if (sizeHit && isFatal(this.player.size) && !this.stress) {
        this.endRun({ name: '특수 요괴', message: '특수 요괴의 구슬에 맞아 쓰러졌습니다.' });
        return;
      }
    }
  }
  resolveMeals(grid, boundsVerified = false, cleanUp = true) {
    // 원의 좌우 경계가 겹치지 않으면 상태·단계 판정까지 갈 필요가 없다.
    const now = this.simTime;
    for (const enemy of this.enemies) {
      if (!enemy.sprite.active) continue;
      if (Math.abs(enemy.x - this.player.x) >= enemy.size + this.player.size) continue;
      // 매혹된 아군(풀린 직후 유예 포함)과는 서로 먹지 않는다(충돌 무시).
      if (isShielded(enemy, now)) continue;
      // 보물로 역전한 상대는 크기가 조금만 작아져도 바로 먹을 수 있다.
      const pair = reversalPair(this.player, enemy) ?? eatPair(this.player, enemy);
      if (!pair) continue;
      const [hunter, prey] = pair;
      if (prey === this.player) {
        // 빙결·경직·위협(겁먹음) 중인 적은 나를 먹지 못한다.
        if (eatBlocked(hunter, now) || this.stress) continue;
        this.fx.burst(this.player.x, this.player.y, 0xfffbe6, 18, 1.2);
        hunter.eat(this.player);
        this.endRun(FORM_BY_ID[hunter.formId]);
        return;
      }
      feedVitality(this.hunger, prey.size, hunter.size, this.playerStats.vitalityMax);
      const meal = this.combat.meal(prey, false);
      this.fx.eatPop(hunter, prey);
      hunter.eat(prey);
      prey.destroy();
      this.events.emit('eat', meal);
      // 보상·능력 리스너가 다른 적도 옮길 수 있다. 이 단계는 전체 후보를 다시 본다.
      boundsVerified = false;
      cleanUp = true;
    }
    // 적끼리: 공간 격자로 닿은 쌍만 찾아 큰 쪽이 작은 쪽을 먹는다. 빙결·위협 중인 사냥꾼은 먹지 못한다.
    for (const [big, small] of findMeals(grid, undefined, now, this.meals, this.eatenThisStep, boundsVerified)) {
      if (!big.sprite.active || !small.sprite.active) continue;
      cleanUp = true;
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
    if (cleanUp) {
      let live = 0;
      for (const enemy of this.enemies) if (enemy.sprite.active) this.enemies[live++] = enemy;
      this.enemies.length = live;
    }
  }
  advanceHunger(nowMs, fixedSec) {
    const activeSec = this.hungerTimeMs === null ? 0 : Math.max(0, nowMs - this.hungerTimeMs) / 1000;
    this.hungerTimeMs = nowMs;
    const hunger = this.hunger, p = this.player;
    const before = hunger.state;
    const shrinkSec = stepHunger(hunger, fixedSec ?? activeSec, this.playerStats.vitalityMax);
    if (shrinkSec > 0) {
      const size = starvingSize(p.size, shrinkSec, p.stage);
      if (size !== p.size) p.setSize(size);
    }
    if (before !== 'starving' && hunger.state === 'starving') {
      this.fx.floatText(p.x, p.y - p.size * 1.6, '배고파!', '#ffb39d');
      if (!this.reducedMotion) this.fx.burst(p.x, p.y, CONFIG.vitality.warnColor, 5, 0.5);
    }
  }
  // 안쪽은 생명력, 바깥쪽 가는 선은 다음 식사까지 남은 유예(hungerGraceSec, 3초)다. 빈 게이지도 위험 신호가 보이게 한다.
  drawVitality(g) {
    const v = CONFIG.vitality, hunger = this.hunger;
    const zoom = this.cameras.main.zoom;
    const { x, y, size } = this.player;
    const r = size + v.arcPad / zoom;
    const top = -Math.PI / 2, turn = Math.PI * 2;
    const width = v.arcWidth / zoom;
    const starved = hunger.state === 'starving';
    const draining = hunger.state === 'draining';
    g.lineStyle(starved ? width / 2 : width, starved ? v.warnColor : 0x241f1a, starved ? 0.95 : 0.4);
    g.strokeCircle(x, y, r);
    if (hunger.value > 0) {
      const alpha = draining && !this.reducedMotion ? 0.78 + 0.2 * Math.cos(hunger.sinceMeal * turn * v.flashHz) : 0.95;
      g.lineStyle(width, draining ? v.drainColor : v.arcColor, alpha);
      g.beginPath();
      g.arc(x, y, r, top, top + turn * hunger.value / this.playerStats.vitalityMax);
      g.strokePath();
    }
    if (hunger.state === 'grace') {
      g.lineStyle(1.5 / zoom, 0xf3e3b6, 0.9);
      g.beginPath();
      g.arc(x, y, r + width, top, top + turn * (1 - hunger.sinceMeal / v.hungerGraceSec));
      g.strokePath();
    } else if (starved) {
      // 빈 고리에 짧은 눈금을 남겨 색을 구별하기 어려워도 알아볼 수 있게 한다.
      g.lineStyle(width, v.warnColor, 1);
      g.lineBetween(x, y - r - width * 2, x, y - r + width);
    }
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
  // ?stress=weapons&w=<무기id>[&ab=<능력키|all>][&lv=0~15][&ms=...]: 같은 판을 그 무기(+lv, 기본 +15)로 돌린다. 능력은 그 무기에서 가장 무거운 조합이 기본이고(설계 6절), ab=all이면 16종을 차례로 돌린다.
  setupStress(params) {
    const weapon = params.get('stress') === 'weapons' ? (WEAPON_IDS.includes(params.get('w')) ? params.get('w') : 'yeouiju') : null;
    const heavy = { yeouiju: 'split', fan: 'split', mirror: 'chain', sword: 'explode', beads: 'orbit', gourd: 'vortex', bell: 'split', seal: 'chain' };
    const only = weapon ? (params.get('ab') ?? params.get('only') ?? heavy[weapon]) : params.get('only');
    const level = clamp(Math.trunc(Number(params.get('lv') ?? 15)) || 0, 0, 15);
    const ms = Math.max(300, Number(params.get('ms') ?? 2500) || 2500);
    const phases = [];
    for (const stem of STEMS) {
      if (only && only !== 'all' && stem.ability !== only) continue;
      const form = FORMS.find((f) => f.stem === stem.id && f.stage === 5 && f.entry) ?? FORMS.find((f) => f.stem === stem.id && f.stage === 5);
      if (form) phases.push({ ability: stem.ability, stem: stem.id, form });
    }
    const first = phases[0]?.form ?? FORM_BY_ID.mimul;
    Object.assign(this.progress, { formId: first.id, stage: first.stage, grade: 'C', treasure: weapon ? { kind: weapon, level } : { level } });
    this.progress.enh = { ...this.progress.enh, speed: 10 };
    window.__stressReport = { done: false };
    return {
      weapon, phases, index: -1, level, ms, phaseStart: 0, angle: 0, last: 0, done: false, allyMeals: 0, simMs: 0,
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
    if (st.weapon) {
      this.stressFill();
      seedWeaponStress(this.combat);
    }
    st.phaseStart = now;
    st.base = { ...this.combat.counters, hits: this.combat.wc.hits };
    st.last = 0;
    for (const list of [st.frame, st.upd, st.sim, st.steps, st.orbs]) list.length = 0;
    if (st.weapon) st.orbs.push(this.combat.orbs.length);
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
      ability, form: form.id, stage: form.stage, level: st.level, weapon: this.combat.weaponKind,
      triggers: this.combat.counters[ability] - st.base[ability],
      weaponHits: this.combat.wc.hits - st.base.hits,
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
      done: true, weapon: st.weapon,
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
  simulate(elapsed, direction) {
    const limit = CONFIG.render.maxSteps * CONFIG.render.maxStep;
    const available = elapsed + (this.simDebt ?? 0);
    const sim = Math.min(available, limit);
    this.simDebt = Math.min(available - sim, limit); // 일시 지연은 따라잡고, 지속 지연은 한 프레임까지만 이월한다.
    const steps = Math.max(1, Math.ceil(sim / CONFIG.render.maxStep));
    const h = sim / steps;
    const blend = 1 - Math.exp(-CONFIG.enemy.turnRate * h);
    const near2 = (CONFIG.hunt.detect * 2) ** 2;
    this.simSteps = steps;
    this.boostSec = 0;
    for (let i = 0; i < steps && !this.ended; i++) {
      this.simTime += h;
      if (i === 0) this.mealBounds?.capture(this.enemies);
      const grid = this.grid = buildGrid(this.enemies, CONFIG.render.enemyCell, this.grid);
      // 부스터는 플레이어 이동에만 배율을 곱한다(적 AI·발사체·쿨타임은 그대로). 게이지는 화면 시간(h ÷ 템포 ÷ 속도 곡선)으로 닳는다.
      const boost = stepBoosterSim(this.booster, { pressed: this.boostHeld, h, scale: CONFIG.tempo * this.pace, max: CONFIG.booster.maxSec });
      this.boostSec += boost.boostSec;
      this.player.step(direction, h, boost.boostSec, this.boostMult, this.hunger?.speedMult);
      this.combat.step(direction, h, this.autoFire || (i === 0 && this.fireRequested), grid);
      const slot = this.thinkStep = ((this.thinkStep ?? 0) + 1) % CONFIG.render.farThinkSteps;
      let boundsVerified = this.mealBounds?.valid ?? false, cleanUp = false;
      for (const enemy of this.enemies) {
        const dx = enemy.x - this.player.x, dy = enemy.y - this.player.y;
        const near = dx * dx + dy * dy <= near2 || enemy.sprite.visible !== false || this.viewChanged;
        const detailed = near || !this.mealBounds?.valid || enemy.mealPossible || enemy.reversed || enemy.rival ||
          enemy.knockUntil > this.simTime || enemy.frozenUntil > this.simTime || enemy.stunUntil > this.simTime ||
          enemy.charmGraceUntil > this.simTime || enemy.charmUntil > this.simTime || enemy.fearUntil > this.simTime ||
          enemy.slowUntil > this.simTime || enemy.burnUntil > this.simTime;
        if (detailed) {
          enemy.travelSteps = 0;
          enemy.step(this.player, h, grid, near || slot === enemy.thinkSlot, blend);
        } else enemy.stepDistant(this.player, h, grid, steps - i);
        if (boundsVerified && !this.mealBounds.contains(enemy)) boundsVerified = false;
        if (!enemy.sprite.active) cleanUp = true;
        if (enemy.special && enemy.sprite.active) this.enemyFire.tryFire(enemy, this.player, h, this.simTime);
      }
      this.resolveMeals(grid, boundsVerified, cleanUp);
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
    return sim;
  }
  attachFramePerf() {
    const events = this.game.events;
    const perf = this.framePerf = { updateMs: null };
    let frames = 0, updateSum = 0, updateMax = 0, renderSum = 0, renderMax = 0, renderStart = 0;
    const pre = () => { renderStart = performance.now(); };
    const post = () => {
      if (perf.updateMs === null) return;
      const renderMs = performance.now() - renderStart;
      updateSum += perf.updateMs;
      updateMax = Math.max(updateMax, perf.updateMs);
      renderSum += renderMs;
      renderMax = Math.max(renderMax, renderMs);
      perf.updateMs = null;
      if (++frames < 120) return;
      console.log(`PERF update avg ${(updateSum / frames).toFixed(2)}ms max ${updateMax.toFixed(2)}ms render avg ${(renderSum / frames).toFixed(2)}ms max ${renderMax.toFixed(2)}ms enemies ${this.enemies.length}`);
      frames = updateSum = updateMax = renderSum = renderMax = 0;
    };
    events.on('prerender', pre);
    events.on('postrender', post);
    this.events.once('shutdown', () => {
      events.off('prerender', pre);
      events.off('postrender', post);
    });
  }
  updateFieldMusic(view) {
    const { x, y, size } = this.player;
    const dangerRadius = view.width / 2;
    const near = this.grid && queryGrid(this.grid, x, y, dangerRadius, this.musicNearby);
    let count = 0, nearest = Infinity;
    for (const enemy of near ?? []) {
      if (!enemy.sprite.active || enemy.size <= size || isShielded(enemy, this.simTime) ||
          enemy.x < view.left || enemy.x > view.right || enemy.y < view.top || enemy.y > view.bottom) continue;
      count++;
      nearest = Math.min(nearest, Math.hypot(enemy.x - x, enemy.y - y));
    }
    const raw = evaluateMoodState({ heraldAlive: this.heraldState.alive > 0, hungerState: this.hunger.state,
      recentHit: this.playSec < this.musicHitUntil, nearbyThreatCount: count, minThreatDist: nearest, dangerRadius });
    bgm.setMood(this.musicTracker.update(raw, this.playSec));
  }
  update(_time, delta) {
    const start = this.framePerf || (this.stress && !this.populationStress) ? performance.now() : 0;
    if (this.populationStress) this.populationStress.update(this, delta);
    else if (this.stress) {
      this.stepStress(start);
      this.tick(delta);
      this.recordStress(start, performance.now());
    } else this.tick(delta);
    if (this.framePerf) this.framePerf.updateMs = performance.now() - start;
  }
  tick(delta, nowMs = performance.now()) {
    const stress = this.stress;
    // 시험 판은 프레임이 느려도 같은 계산 단계 수(60fps 기준)로 돌려서 수치를 비교할 수 있게 한다.
    const dt = stress ? 1 / 60 : Math.min(delta / 1000, CONFIG.render.maxDelta);
    if (this.ended) {
      this.stopBoostSfx();
      this.fx.update(dt, null, this.progress.grade);
      return;
    }
    if (this.paused) {
      this.hungerTimeMs = null;
      if (this.boostVoice) this.stopBoostSfx();
      return;
    }
    if (!this.preview && !stress && shouldPause(this.progress, this.level, performance.now() / 1000)) {
      this.openQuickPick();
      if (this.paused) return;
    }
    const direction = stress ? this.stressDirection(dt) : this.joystick.direction();
    this.boostHeld = !!this.boosterButton?.held;
    // 진화로 단계 템포가 오르면 곧바로 빨라지지 않고 서서히 따라간다(나는 가만히 있는데 맵이 늘어나 더 느려 보인다).
    if (this.pace !== this.paceTarget) this.pace = easePace(this.pace, this.paceTarget, dt);
    this.playSec += dt; // 판을 진행한 실제 초(멈춘 동안은 여기까지 오지 않는다): 공명 연쇄의 끊김 시간에 쓴다
    const simStart = stress ? performance.now() : 0;
    if (document.hidden) this.hungerTimeMs = null;
    else this.advanceHunger(nowMs, stress ? dt : undefined);
    const sim = this.simulate(dt * CONFIG.tempo * this.pace, direction);
    if (stress) stress.simMs = performance.now() - simStart;
    if (this.ended) {
      this.stopBoostSfx();
      return;
    }
    const boosting = this.boostSec > 0;
    const drawStart = this.populationStress ? performance.now() : 0;
    if (boosting && !this.boostVoice?.started) {
      if (this.boostVoice) this.boostVoice.stop();
      else sfx.play('boost-start', { volume: 0.7 });
      this.boostVoice = sfx.play('boost-loop', { volume: 0.5, loop: true });
    } else if (!boosting && this.boostVoice) {
      this.stopBoostSfx();
    }
    this.boosterButton?.update(this.booster, CONFIG.booster.maxSec, boosting);
    this.boostTrail(dt, direction, boosting);
    this.follow(dt);
    const animView = cameraView(this.cameras.main, this.cameraBounds);
    for (const enemy of this.enemies) {
      // 화면 밖(여유 범위 밖) 적은 모양 갱신을 건너뛴다: 보이지 않는 적 수백 마리의 setScale·angle 비용을 줄인다.
      const pad = 90 + 48 / this.cameras.main.zoom + enemy.size * 4;
      const near = enemy.x > animView.left - pad && enemy.x < animView.right + pad && enemy.y > animView.top - pad && enemy.y < animView.bottom + pad;
      if (near !== enemy.sprite.visible) {
        enemy.sprite.setVisible(near);
        enemy.label?.setVisible(near);
      }
      if (!near) {
        enemy.phase ??= Math.random() * Math.PI * 2;
        this.fx.decayActor(enemy, dt);
        continue;
      }
      this.fx.animateActor(enemy, dt, enemy.vx, enemy.vy);
      if (enemy.rival) enemy.followLabel();
    }
    const sp = this.playerStats.speed * this.hunger.speedMult * (boosting ? this.boostMult : 1);
    this.fx.animateActor(this.player, dt, direction.x * sp, direction.y * sp);
    this.viewChanged = false;
    this.fx.update(dt, this.player, this.progress.grade, animView);
    this.combat.draw();
    const fg = this.fireGfx.clear();
    this.enemyFire.draw(fg);
    this.drawVitality(fg);
    const now = this.time.now / 1000;
    const myStage = this.player.stage ?? 1;
    for (const enemy of this.enemies) {
      if (!enemy.sprite.active) continue;
      if (enemy.special) drawSpecialMark(fg, enemy, now, animView);
      if (enemy.herald) this.drawHeraldMark(fg, enemy, now, animView);
      if (enemy.sprite.visible) drawStageMark(fg, enemy, myStage, now, this.stageMarks, animView);
    }
    this.stageMarks.finish();
    this.fireButton.update(1 - Math.min(1, this.combat.cooldown / this.combat.cooldownMax)); // 무기마다 쿨타임이 다르다(cooldownMax)
    const { x, y, size } = this.player;
    this.marker.setPosition(x, y + size * 0.64).setScale(size / 46);
    const ringGap = (CONFIG.vitality.arcPad + CONFIG.vitality.arcWidth * 2) / this.cameras.main.zoom;
    this.nameTag.setPosition(x, y + Math.max(size * 1.18, size + ringGap));
    if (this.populationStress) this.populationStress.prepareMs = performance.now() - drawStart;
    const refillStart = this.populationStress ? performance.now() : 0;
    this.refillTime -= sim;
    const view = animView;
    if (this.refillTime <= 0) {
      this.refillTime = CONFIG.world.refillInterval;
      const missing = Math.max(0, CONFIG.world.population - this.enemies.length);
      this.refillPending = Math.min(this.refillPending + refillIncrement(missing), missing);
    }
    if (this.refillPending > 0) {
      const count = Math.min(this.refillPending, CONFIG.render.refillPerFrame, Math.max(0, CONFIG.world.population - this.enemies.length));
      this.refillPending = count ? this.refillPending - count : 0;
      const grid = this.placementGrid = buildGrid(this.enemies, CONFIG.render.enemyCell, this.placementGrid);
      // 보충되는 적은 모든 단계에서 맵 전체의 화면 밖에 고르게 놓는다(몰리지 않게). 화면 밖 자리가 모자라면 간격을 못 지켜도 가장 덜 붐비는 화면 밖 후보를 쓰고, 그것도 없으면 이번 보충은 건너뛴다(화면 밖 여유는 줄이지 않는다: relax는 대요괴·맞수만).
      for (let i = 0; i < count; i++) {
        const playerStage = this.player.stage ?? 1;
        const stage = spawnStage(playerStage, Math.random, this.difficulty);
        const enemySize = spawnSize(size, playerStage, this.difficulty, stage, rollSpawnSize());
        this.spawn(enemySize, { view, stage, grid });
      }
    }
    if (this.populationStress) this.populationStress.refillMs = performance.now() - refillStart;
    // 맞수 대요괴(balance.rivalPlan): 4·5단계에서 실제 25초마다, 동시 최대 2마리. 시험 판(?stress)은 적 구성을 직접 정하므로 건너뛴다.
    if (!this.stress) {
      this.rivalState.alive = this.enemies.reduce((n, e) => n + (e.rival && !e.herald && e.sprite.active ? 1 : 0), 0); // 대요괴는 맞수 수에 세지 않는다(따로 센다)
      // 맞수 간격은 실제 25초: 템포가 서서히 오르는 동안에도 어긋나지 않게 목표 템포로 환산한 시뮬레이션 시간을 준다.
      const plan = rivalPlan(this.player.stage ?? 1, this.player.size, this.rivalState, dt * CONFIG.tempo * this.paceTarget);
      const ring = bossRingFor(view);
      const rivalOpts = { view, stage: plan?.stage, rival: true };
      if (plan && !this.spawn(plan.size, { ...rivalOpts, near: ring }) && !this.spawn(plan.size, rivalOpts)) rivalRetry(this.rivalState);
    }
    // 예고된 대요괴(herald.js): 모든 단계에서 실제 intervalSec마다. 시험 판(?stress)과 미리보기(?debug=hub|evolve)에서는 세지 않는다.
    const heraldOn = !this.stress && !this.preview;
    if (heraldOn) this.stepHeraldWave(dt, view);
    if (!this.preview && this.playSec >= this.nextMusicCheck) {
      this.nextMusicCheck = this.playSec + 0.25;
      this.updateFieldMusic(view);
    }
    this.hudTime -= dt;
    if (this.hudTime <= 0) {
      this.hudTime = CONFIG.render.hudInterval;
      this.hud.update(this.player, view);
      this.hud.setGrowth(growthView(this.progress, this.level));
      this.hud.setHerald(heraldOn ? heraldView(this.heraldState) : { mode: 'off' });
      this.hud.setResonance(resonanceView(this.resonance, this.playSec), DIR_NAME);
    }
  }
}
