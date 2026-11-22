import { CONFIG, REGIONS } from '../config.js';
import { regionAt } from './world.js';

const byId = (id) => document.getElementById(id);
const number = (size) => Number(size.toFixed(1)).toString();
const miniColors = { north: '#bbcdd1', east: '#b8d7bd', south: '#e8b8a0', west: '#e8d9b5' };

function drawMap(ctx, player, view) {
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
    ctx.fillStyle = miniColors[dir];
    ctx.beginPath();
    ctx.moveTo(m, m);
    ctx.lineTo(vertices[0], vertices[1]);
    ctx.lineTo(vertices[2], vertices[3]);
    ctx.fill();
  }
  ctx.strokeStyle = '#526d5840';
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
  ctx.fillStyle = '#304f49';
  ctx.font = 'bold ' + Math.round(s * 0.12) + 'px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [label, x, y] of [
    ['北', 0.5, 0.13],
    ['東', 0.87, 0.5],
    ['南', 0.5, 0.87],
    ['西', 0.13, 0.5],
  ])
    ctx.fillText(label, x * s, y * s);
  ctx.strokeStyle = '#38544f88';
  ctx.lineWidth = 2;
  ctx.strokeRect(view.x * scale, view.y * scale, view.width * scale, view.height * scale);
  ctx.beginPath();
  ctx.fillStyle = '#284638';
  ctx.arc(player.x * scale, player.y * scale, s * 0.035, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff9e5';
  ctx.lineWidth = 3;
  ctx.stroke();
}

export class Hud {
  constructor() {
    this.size = byId('size');
    this.eaten = byId('eaten');
    this.area = byId('area');
    this.map = byId('map');
    this.map.width = this.map.height = CONFIG.render.mapPixels;
    this.ctx = this.map.getContext('2d');
    this.result = byId('result');
    this.result.hidden = true;
    this.lastSize = '';
    this.lastEaten = -1;
    this.lastArea = '';
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
    drawMap(this.ctx, player, view);
  }
  end(player, killer, onRestart, run = null) {
    byId('final-eaten').textContent = player.eaten;
    byId('final-size').textContent = number(player.maxSize);
    byId('killer').textContent = killer.name + '에게 먹혔습니다.' + (run ? ' 요력 +' + number(run.yoryeok) + (run.drops ? ' · 여의주 ' + run.drops + '개 획득' : '') : '');
    this.result.hidden = false;
    const button = byId('restart');
    button.onclick = () => {
      button.onclick = null;
      onRestart();
    };
    button.focus({ preventScroll: true });
  }
}
