const byId = (id) => document.getElementById(id);
const number = (size) => Number(size.toFixed(1)).toString();

export class Hud {
  constructor(onPortrait) {
    const portrait = new Image();
    portrait.id = 'avatar';
    portrait.alt = '';
    byId('avatar-slot').replaceChildren(portrait);
    if (onPortrait) {
      const identity = portrait.closest('.identity');
      this.portraitEvents = new AbortController();
      const options = { signal: this.portraitEvents.signal };
      identity.addEventListener('pointerdown', event => event.stopPropagation(), options);
      identity.addEventListener('click', onPortrait, options);
      identity.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) onPortrait();
      }, options);
    }
    this.size = byId('size');
    this.fieldSize = byId('field-size');
    this.eaten = byId('eaten');
    this.gaugeRow = byId('growth-gauge');
    this.gauge = byId('growth-meter');
    this.gaugeLabel = this.gauge.labels[0];
    this.gaugeCount = byId('growth-count');
    this.gaugeRow.hidden = true;
    this.result = byId('result');
    this.result.oncancel = event => event.preventDefault();
    this.result.hidden = true;
    this.lastSize = '';
    this.lastEaten = -1;
    // 예고된 대요괴 게이지·안내(계획서 변경 이력 5)와 공명 연쇄 표시. index.html에 요소가 없으면 조용히 건너뛴다.
    this.heraldRow = byId('herald-gauge');
    this.heraldMeter = byId('herald-meter');
    this.heraldLabel = byId('herald-label');
    this.heraldCount = byId('herald-count');
    this.heraldNoticeEl = byId('herald-notice');
    this.heraldKey = '';
    this.noticeTimer = 0;
    if (this.heraldRow) this.heraldRow.hidden = true;
    if (this.heraldNoticeEl) this.heraldNoticeEl.hidden = true;
    this.resonanceRow = byId('resonance');
    this.resonanceText = byId('res-text');
    this.resonanceDots = this.resonanceRow ? [...this.resonanceRow.querySelectorAll('.res-dots i')] : [];
    this.resonanceKey = '';
    this.resonanceTimer = 0;
    if (this.resonanceRow) this.resonanceRow.hidden = true;
  }
  // 대요괴 게이지(herald.heraldView 결과). countdown은 등장까지 남은 시간, alive는 나와 있는 동안의 처치 안내, off는 숨김.
  setHerald(view) {
    const row = this.heraldRow;
    if (!row) return;
    const hidden = view.mode === 'off';
    if (row.hidden !== hidden) row.hidden = hidden;
    if (hidden) return;
    const alive = view.mode === 'alive';
    const label = alive ? '대요괴 출현!' : '대요괴 등장까지';
    const count = alive ? '처치하면 큰 보상' : Math.ceil(view.remainSec) + '초';
    const key = [alive, view.warn, label, count, Math.round(view.current * 10)].join('|');
    if (key === this.heraldKey) return;
    this.heraldKey = key;
    if (this.heraldMeter.max !== view.target) this.heraldMeter.max = view.target;
    this.heraldMeter.value = Math.min(view.current, view.target);
    this.heraldMeter.classList.toggle('is-warn', !alive && view.warn);
    this.heraldMeter.classList.toggle('is-alive', alive);
    row.classList.toggle('is-warn', !alive && view.warn);
    row.classList.toggle('is-alive', alive);
    if (this.heraldLabel.textContent !== label) this.heraldLabel.textContent = label;
    if (this.heraldCount.textContent !== count) this.heraldCount.textContent = count;
  }
  // 화면 위쪽 가운데에 짧은 안내를 sec초 동안 띄운다(kind: 'warn' | 'arrive' | 'slain'). 새 안내가 오면 앞의 것을 바꾼다.
  heraldNotice(text, sec = 3, kind = 'warn') {
    const box = this.heraldNoticeEl;
    if (!box) return;
    box.textContent = text;
    box.dataset.kind = kind;
    box.hidden = false;
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => { box.hidden = true; }, Math.max(0.5, sec) * 1000);
  }
  // 공명 연쇄 표시(resonance.resonanceView 결과). 점 4개는 지금 이어진 서로 다른 방위(규칙 B), 글자는 같은 방위 연속 수(규칙 A)다. 규칙이 꺼져 있으면 숨긴다.
  setResonance(view, names = {}) {
    const row = this.resonanceRow;
    if (!row) return;
    const hidden = view.rule === 'off';
    if (row.hidden !== hidden) row.hidden = hidden;
    if (hidden || row.classList.contains('is-hit')) return; // 터진 순간의 결과 글자는 flashResonance가 끝날 때까지 둔다
    const parts = [];
    if (view.rule !== 'cycle' && view.streak.count > 0) parts.push((names[view.streak.dir] ?? '') + ' ' + view.streak.count + '/' + view.streak.length);
    if (view.rule !== 'streak' && view.cycle.dirs.length > 0) parts.push('한 바퀴 ' + view.cycle.dirs.length + '/' + view.cycle.length);
    const text = parts.join(' · ');
    const key = view.rule + '|' + view.cycle.dirs.join(',') + '|' + text;
    if (key === this.resonanceKey) return;
    this.resonanceKey = key;
    row.dataset.mode = view.rule;
    for (const dot of this.resonanceDots) dot.classList.toggle('on', view.cycle.dirs.includes(dot.dataset.dir));
    if (this.resonanceText.textContent !== text) this.resonanceText.textContent = text;
    row.setAttribute('aria-label', '공명 연쇄' + (text ? ': ' + text : ''));
  }
  // 판이 끝나거나 다시 시작될 때: 남은 타이머를 치우고 안내·연출을 끈다(같은 요소를 다음 판 HUD가 이어서 쓴다).
  dispose() {
    this.portraitEvents?.abort();
    clearTimeout(this.noticeTimer);
    clearTimeout(this.resonanceTimer);
    if (this.heraldNoticeEl) this.heraldNoticeEl.hidden = true;
    this.resonanceRow?.classList.remove('is-hit');
  }
  // 공명이 터진 순간: 줄이 sec초 동안 금색으로 켜지고 글자가 결과(예: '공명! +12')로 바뀐다.
  flashResonance(text, sec = 0.9) {
    const row = this.resonanceRow;
    if (!row || row.hidden) return;
    row.classList.add('is-hit');
    this.resonanceText.textContent = text;
    row.setAttribute('aria-label', '공명 연쇄: ' + text);
    clearTimeout(this.resonanceTimer);
    this.resonanceTimer = setTimeout(() => {
      row.classList.remove('is-hit');
      this.resonanceKey = ''; // 다음 setResonance가 연쇄 상태로 되돌린다
    }, Math.max(0.2, sec) * 1000);
  }
  setGauge(current, target, label = '다음 성장까지') {
    const hidden = !Number.isFinite(target) || target <= 0;
    if (this.gaugeRow.hidden !== hidden) this.gaugeRow.hidden = hidden;
    if (hidden) return;

    const balance = Number.isFinite(current) ? Math.max(0, current) : 0;
    const value = Math.min(balance, target);
    const count = number(balance) + ' / ' + number(target);
    if (this.gauge.max !== target) this.gauge.max = target;
    if (this.gauge.value !== value) this.gauge.value = value;
    if (this.gaugeLabel.textContent !== label) this.gaugeLabel.textContent = label;
    if (this.gaugeCount.textContent !== count) this.gaugeCount.textContent = count;
    this.gauge.classList.toggle('is-full', balance >= target);
  }
  update(player) {
    const size = number(player.size);
    if (size !== this.lastSize) {
      this.lastSize = size;
      this.size.textContent = size;
      this.fieldSize.textContent = size;
    }
    if (player.eaten !== this.lastEaten) {
      this.lastEaten = player.eaten;
      this.eaten.textContent = player.eaten;
    }
  }
  // victory = { title, reward }: 승천처럼 이긴 판의 결과(제목과 보상 요력). 없으면 평소 종료 결과다.
  // 꾸미기는 디자인 담당 몫이라 기능만 둔다: 제목 글자, 보상 줄, 결과 창의 data-outcome('ascension' | 'defeat').
  end(player, killer, { onRestart, onHub } = {}, run = null, victory = null) {
    byId('end-title').textContent = victory ? victory.title : '판 종료';
    this.result.dataset.outcome = victory ? 'ascension' : 'defeat';
    byId('final-eaten').textContent = player.eaten;
    byId('final-size').textContent = number(player.maxSize);
    byId('killer').textContent = killer.message ?? killer.name + '에게 먹혔습니다.';
    const reward = byId('run-reward');
    reward.hidden = !run;
    reward.textContent = run ? '획득한 요력 ' + number(run.yoryeok) + (run.drops ? ', 여의주 ' + run.drops + '개' : '') + (victory ? ' · ' + victory.title + ' 보상 ' + number(victory.reward) : '') : '';
    this.result.hidden = false;
    this.result.showModal();
    const button = byId('restart'),
      hub = byId('hub');
    const once = (el, fn) => {
      el.onclick = () => {
        button.onclick = hub.onclick = null;
        this.result.close();
        this.result.hidden = true;
        fn?.();
      };
    };
    once(button, onRestart);
    once(hub, onHub);
    button.focus({ preventScroll: true });
  }
}
