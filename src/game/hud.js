import { CONFIG, REGIONS } from '../config.js';
import { regionAt } from './world.js';

const byId = (id) => document.getElementById(id);
const number = (size) => Number(size.toFixed(1)).toString();
function mapPalette() {
  const theme = getComputedStyle(document.documentElement);
  const token = name => theme.getPropertyValue('--' + name).trim();
  return {
    north: token('map-north'), east: token('map-east'), south: token('map-south'), west: token('map-west'),
    grid: token('map-grid'), view: token('map-view'), ink: token('ink'), paper: token('paper'), serif: token('serif'),
  };
}

function drawMap(ctx, player, view, palette) {
  const s = ctx.canvas.width,
    m = s / 2,
    scale = s / CONFIG.world.size;
  ctx.clearRect(0, 0, s, s);
  for (const [dir, vertices] of Object.entries({
    north: [0, 0, s, 0],
    east: [s, 0, s, s],
    south: [s, s, 0, s],
    west: [0, s, 0, 0],
  })) {
    ctx.fillStyle = palette[dir];
    ctx.beginPath();
    ctx.moveTo(m, m);
    ctx.lineTo(vertices[0], vertices[1]);
    ctx.lineTo(vertices[2], vertices[3]);
    ctx.fill();
  }
  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;
  for (let i = 1; i < 8; i++) {
    const v = (s * i) / 8;
    ctx.beginPath();
    ctx.moveTo(v, 0);
    ctx.lineTo(v, s);
    ctx.moveTo(0, v);
    ctx.lineTo(s, v);
    ctx.stroke();
  }
  ctx.fillStyle = palette.ink;
  ctx.font = 'bold ' + Math.round(s * 0.12) + 'px ' + palette.serif;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [label, x, y] of [
    ['北', 0.5, 0.13],
    ['東', 0.87, 0.5],
    ['南', 0.5, 0.87],
    ['西', 0.13, 0.5],
  ])
    ctx.fillText(label, x * s, y * s);
  ctx.strokeStyle = palette.view;
  ctx.lineWidth = 2;
  ctx.strokeRect(view.x * scale, view.y * scale, view.width * scale, view.height * scale);
  ctx.beginPath();
  ctx.fillStyle = palette.ink;
  ctx.arc(player.x * scale, player.y * scale, s * 0.035, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = palette.paper;
  ctx.lineWidth = 3;
  ctx.stroke();
}

export class Hud {
  constructor() {
    const portrait = new Image();
    portrait.id = 'avatar';
    portrait.alt = '';
    byId('avatar-slot').replaceChildren(portrait);
    this.size = byId('size');
    this.eaten = byId('eaten');
    this.area = byId('area');
    this.gaugeRow = byId('growth-gauge');
    this.gauge = byId('growth-meter');
    this.gaugeLabel = this.gauge.labels[0];
    this.gaugeCount = byId('growth-count');
    this.gaugeRow.hidden = true;
    this.map = byId('map');
    this.map.width = this.map.height = CONFIG.render.mapPixels;
    this.ctx = this.map.getContext('2d');
    this.palette = mapPalette();
    this.result = byId('result');
    this.result.oncancel = event => event.preventDefault();
    this.result.hidden = true;
    this.lastSize = '';
    this.lastEaten = -1;
    this.lastArea = '';
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
  update(player, view) {
    const size = number(player.size),
      region = regionAt(player.x, player.y);
    if (size !== this.lastSize) {
      this.lastSize = size;
      this.size.textContent = size;
    }
    if (player.eaten !== this.lastEaten) {
      this.lastEaten = player.eaten;
      this.eaten.textContent = player.eaten;
    }
    if (region !== this.lastArea) {
      this.lastArea = region;
      this.area.textContent = REGIONS[region].land;
      byId('region-seal').textContent = { east: '東', west: '西', south: '南', north: '北' }[region];
    }
    drawMap(this.ctx, player, view, this.palette);
  }
  end(player, killer, { onRestart, onHub } = {}, run = null) {
    byId('final-eaten').textContent = player.eaten;
    byId('final-size').textContent = number(player.maxSize);
    byId('killer').textContent = killer.message ?? killer.name + '에게 먹혔습니다.';
    const reward = byId('run-reward');
    reward.hidden = !run;
    reward.textContent = run ? '획득한 요력 ' + number(run.yoryeok) + (run.drops ? ', 여의주 ' + run.drops + '개' : '') : '';
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
