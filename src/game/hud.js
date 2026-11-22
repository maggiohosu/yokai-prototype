const byId = (id) => document.getElementById(id);
const number = (size) => Number(size.toFixed(1)).toString();

export class Hud {
  constructor() {
    const portrait = new Image();
    portrait.id = 'avatar';
    portrait.alt = '';
    byId('avatar-slot').replaceChildren(portrait);
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
