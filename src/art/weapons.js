import { drawOrb, orbStyleOf } from './orbs.js';
import { WEAPON_BY_ID } from '../data/weapons.js';

const INK = 0x343a37, GOLD = 0xefbd6c, PAPER = 0xfff9df;
const TAU = Math.PI * 2;

// 정점은 모듈을 읽을 때 한 번 만든다. 숫자 네 개는 이차 곡선의 제어점과 끝점이다.
function contour(...commands) {
  const points = [commands[0]];
  for (const command of commands.slice(1)) {
    if (command.length === 2) {
      points.push(command);
      continue;
    }
    const [x, y] = points.at(-1);
    const [cx, cy, ex, ey] = command;
    for (let n = 1; n <= 6; n++) {
      const t = n / 6, u = 1 - t;
      points.push([u * u * x + 2 * u * t * cx + t * t * ex, u * u * y + 2 * u * t * cy + t * t * ey]);
    }
  }
  return points;
}
function oval(x, y, rx, ry, n = 24, angle = 0) {
  return Array.from({ length: n }, (_, i) => [x + rx * Math.cos(i * TAU / n + angle), y + ry * Math.sin(i * TAU / n + angle)]);
}
function trace(g, points, closed = true, scale = 1) {
  g.moveTo(points[0][0] * scale, points[0][1] * scale);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i][0] * scale, points[i][1] * scale);
  if (closed) g.closePath();
}

const flyers = {
  fan: {
    body: contour([-10, 4], [-7, -3, -1, -5], [-3, -2], [3, -7, 12, -6], [9, 1, 3, 3], [5, 0], [0, 5, -6, 4], [-11, 7]),
    mark: contour([-9, 5], [0, -1, 9, -4], [0, 2, -9, 5]),
  },
  sword: {
    body: contour([-11, -2], [-5, -2], [-6, -6], [-3, -5], [-2, -3], [9, -2], [14, 0], [9, 2], [-2, 3], [-4, 6], [-6, 6], [-5, 2], [-11, 2]),
    mark: contour([-3, 0], [10, -1], [6, 1], [-3, 2]),
  },
  beads: { body: oval(0, 0, 6, 6), mark: oval(0, 0, 2.1, 1.4, 12) },
  gourd: {
    body: contour([-10, -3], [-5, 0, 0, -4], [6, -8, 8, -2], [11, 5, 4, 6], [-2, 7, -10, -3]),
    mark: contour([-3, 2], [2, 5, 7, 1], [4, 8, -3, 2]),
  },
  seal: {
    body: contour([-9,-4], [-5,-5], [-4,-9,0,-9], [4,-10,5,-6], [7,-7], [7,-4], [9,-3], [9,7], [3,10], [-9,7]),
    mark: contour([-8,1], [2,3], [8,0], [8,6], [2,8], [2,5], [-8,3]),
  },
};
const trail = contour([-3,-2], [-13,-3], [-21,0], [-13,2], [-3,2]);
const fork = contour([-3,-2], [-14,-4], [-23,-3], [-15,-1], [-7,0], [-15,1], [-22,4], [-12,3], [-3,2]);
const sparks = [oval(-23,-5,1.7,2,4), oval(-28,3,1.4,1.6,4)];

function flyingShape(g, shape, style, tier, tailAngle = 0) {
  if (tier >= 2) {
    g.save().rotateCanvas(tailAngle).scaleCanvas(tier >= 3 ? 1.5 : 1, 1).beginPath();
    trace(g, tier === 5 ? fork : trail);
    g.fillStyle(style.tail, .9).fillPath().restore();
  }
  g.beginPath();
  trace(g, shape.body);
  g.fillStyle(style.main, 1).fillPath().lineStyle(tier >= 4 ? 3.4 : 1.8, INK, 1).strokePath();
  if (tier >= 4) g.lineStyle(1.3, GOLD, 1).strokePath();
  g.beginPath();
  trace(g, shape.mark);
  g.fillStyle(style.sub, 1).fillPath();
  if (tier >= 3) g.fillStyle(PAPER, 1).fillCircle(1, -2.5, 1.25);
  if (tier === 5) {
    g.save().rotateCanvas(tailAngle).beginPath();
    for (const spark of sparks) trace(g, spark);
    g.fillStyle(GOLD, 1).fillPath().restore();
  }
}

function beam(g, length, halfWidth, style, tier) {
  const w = halfWidth;
  g.beginPath().moveTo(0, 0).lineTo(length * .04, -w).lineTo(length * .92, -w * .62).lineTo(length, 0)
    .lineTo(length * .92, w * .62).lineTo(length * .04, w).closePath().fillStyle(style.main, .82).fillPath();
  g.lineStyle(tier >= 4 ? 3 : 1.6, INK, .95).strokePath();
  if (tier >= 4) g.lineStyle(1.2, GOLD, 1).strokePath();
  if (tier >= 2) {
    const tail = tier >= 3 ? 18 : 12;
    g.beginPath().moveTo(-tail, -w * .5).lineTo(length * .20, -w * .25);
    if (tier === 5) g.moveTo(-tail, w * .5).lineTo(length * .20, w * .25);
    g.lineStyle(2, style.tail, 1).strokePath();
  }
  if (tier >= 3) g.lineStyle(1.3, PAPER, 1).lineBetween(1, 0, length * .9, 0);
  if (tier === 5) {
    g.beginPath();
    for (const spark of sparks) trace(g, spark);
    g.fillStyle(GOLD, 1).fillPath();
  }
}

// 퍼지는 파문은 두 획 안에서 부분 호를 이어 그린다. 반경은 판정의 월드 좌표를 그대로 쓴다.
function ring(g, r, style, tier) {
  if (r <= 0) return;
  g.beginPath().arc(0, 0, r, 0, TAU);
  if (tier >= 2) {
    const inner = r * .86, end = tier >= 3 ? 1.05 : .7;
    g.moveTo(inner, 0).arc(0, 0, inner, 0, end);
    if (tier === 5) g.moveTo(-inner, 0).arc(0, 0, inner, Math.PI, Math.PI + end);
  }
  g.lineStyle(tier >= 4 ? 4 : 3, tier >= 4 ? GOLD : INK, .92).strokePath();
  g.beginPath().arc(0, 0, r, 0, TAU);
  if (tier >= 3) {
    const inner = r * .94;
    g.moveTo(0, -inner).arc(0, 0, inner, -Math.PI / 2, -1.1);
  }
  g.lineStyle(1.6, style.main, 1).strokePath();
  if (tier === 5) {
    g.save().translateCanvas(0, -r).beginPath();
    for (const spark of sparks) trace(g, spark);
    g.fillStyle(GOLD, 1).fillPath().restore();
  }
}

const shoreline = Array.from({ length: 36 }, (_, i) => {
  const a = i * TAU / 36, r = 1 + .032 * Math.sin(5 * a) + .023 * Math.cos(3 * a);
  return [r * Math.cos(a), r * Math.sin(a)];
});
function pool(g, radius, style, tier) {
  g.beginPath();
  trace(g, shoreline, true, radius);
  g.fillStyle(style.main, .22).fillPath().lineStyle(tier >= 4 ? 3.5 : 1.8, INK, .75).strokePath();
  if (tier >= 4) g.lineStyle(1.2, GOLD, .95).strokePath();
  if (tier >= 2) {
    const r = radius * .78;
    g.beginPath().arc(0, 0, r, .15, tier >= 3 ? 1.65 : 1.15);
    if (tier === 5) g.moveTo(-r, 0).arc(0, 0, r, Math.PI, 4.6);
    g.lineStyle(1.8, style.tail, 1).strokePath();
  }
  if (tier >= 3) g.lineStyle(1.8, PAPER, .95).lineBetween(-radius * .60, -radius * .30, -radius * .44, -radius * .37);
  if (tier === 5) {
    g.save().translateCanvas(radius * .2, -radius * .5).beginPath();
    for (const spark of sparks) trace(g, spark);
    g.fillStyle(GOLD, 1).fillPath().restore();
  }
}

// 기본은 {x,y,vx,vy}. 광선은 끝점 x2,y2 또는 방향과 length, 파문은 r을 받는다.
// 웅덩이는 {effect:'pool',r}, 인장 예고는 {effect:'shadow',r}, 낙하는 {height}로 나타낸다.
export function drawWeaponShot(g, shot, kind, stemKey = null, tier = 1) {
  if (kind === 'yeouiju' || !Object.hasOwn(WEAPON_BY_ID, kind)) {
    drawOrb(g, shot, stemKey, tier);
    return;
  }
  const style = orbStyleOf(stemKey);
  const stage = Math.max(1, Math.min(5, Math.trunc(tier) || 1));
  const dx = shot.x2 != null ? shot.x2 - shot.x : shot.vx ?? 1;
  const dy = shot.y2 != null ? shot.y2 - shot.y : shot.vy ?? 0;
  g.save().translateCanvas(shot.x, shot.y);
  if (kind === 'mirror') {
    const length = shot.x2 != null ? Math.hypot(dx, dy) : shot.length ?? 32;
    g.rotateCanvas(Math.atan2(dy, dx));
    beam(g, length, shot.halfWidth ?? 4, style, stage);
  } else if (kind === 'bell') {
    ring(g, shot.r ?? 15, style, stage);
  } else if (kind === 'gourd' && shot.effect === 'pool') {
    pool(g, shot.r ?? 45, style, stage);
  } else if (kind === 'seal' && shot.effect === 'impact') {
    ring(g, shot.r, style, stage);
  } else if (kind === 'seal' && shot.effect === 'shadow') {
    const r = shot.r ?? 16;
    g.fillStyle(INK, .22).fillCircle(0, 0, r);
    g.beginPath().moveTo(-r, 0).lineTo(0, -r * .72).lineTo(r, 0).lineTo(0, r * .72).closePath();
    g.fillStyle(style.sub, .32).fillPath().lineStyle(2, INK, .9).strokePath();
    if (stage >= 4) g.lineStyle(1, GOLD, 1).strokePath();
    if (stage >= 2) {
      const end = stage >= 3 ? -.25 : -.5;
      g.beginPath().moveTo(-r, r * .18).lineTo(r * end, r * .46);
      if (stage === 5) g.moveTo(r, r * .18).lineTo(-r * end, r * .46);
      g.lineStyle(1.6, style.tail, .95).strokePath();
    }
    if (stage >= 3) g.fillStyle(PAPER, .95).fillCircle(0, -r * .69, 1.6);
    if (stage === 5) {
      g.beginPath();
      for (const spark of sparks) trace(g, spark);
      g.fillStyle(GOLD, 1).fillPath();
    }
  } else {
    if (kind === 'seal') g.translateCanvas(0, -(shot.height ?? 0));
    else g.rotateCanvas(Math.atan2(dy, dx));
    const scale = .8 + .06 * (stage - 1);
    g.scaleCanvas(scale, scale);
    flyingShape(g, flyers[kind], style, stage, kind === 'seal' ? Math.PI / 2 : 0);
  }
  g.restore();
}

// 아이콘 원판은 64×64. 바깥 윤곽과 안쪽 무늬를 나눠 잠긴 물건의 구멍과 돌출부도 보존한다.
const plate = (points, fill, width = 2.4) => ({ points, fill, width });
const detail = (points, fill) => ({ points, fill, detail: true });
const line = (points, color = INK, width = 1.5) => ({ points, color, width, detail: true });
const RED = 0xb46149, BRONZE = 0xc49a59, WOOD = 0xcf905c;

function featherFan() {
  const layers = [];
  for (const n of [-3, 3, -2, 2, -1, 1, 0]) {
    const a = n * .255, length = 40 - Math.abs(n) * 1.7;
    const position = (points) => points.map(([x, y]) => [32 + x * Math.cos(a) - y * Math.sin(a), 46 + x * Math.sin(a) + y * Math.cos(a)]);
    layers.push(plate(position(contour([-1,0], [-8,-14,-5,-28], [-3,-25], [-5,-32,0,-length], [6,-31,5,-24], [3,-25], [7,-16,1,0])), n % 2 ? PAPER : 'main', 2),
      line(position(contour([0,-2], [1,-17,0,-length + 6])), 'sub', 1.25));
  }
  layers.push(plate(contour([29,43],[35,43],[34,55],[32,58],[29,55]), WOOD),
    line([[29,46],[35,46]], RED, 2.4));
  return layers;
}
function bronzeMirror() {
  const layers = [plate(oval(32,32,27,27,8,Math.PI / 8), BRONZE, 2.8),
    plate(oval(32,32,15,15), 'main', 2),
    detail(contour([21,30],[30,20,38,22],[40,24],[28,33]), PAPER),
    detail(contour([26,42],[39,28],[42,28],[32,44]), 'tail')];
  // 각 변의 세 효를 끊어진 선과 이어진 선으로 배치한다.
  const trigrams = [7,3,5,1,0,4,2,6];
  for (let side = 0; side < 8; side++) {
    const a = side * Math.PI / 4, sin = Math.sin(a), cos = Math.cos(a);
    for (let bit = 0; bit < 3; bit++) {
      const y = -18 - bit * 2.5;
      const at = (x) => [32 + x * cos - y * sin, 32 + x * sin + y * cos];
      if (trigrams[side] & (1 << bit)) layers.push(line([at(-4.2), at(4.2)], INK, 1.5));
      else layers.push(line([at(-4.2), at(-1)], INK, 1.5), line([at(1), at(4.2)], INK, 1.5));
    }
  }
  return layers;
}
function prayerBeads() {
  const beads = [];
  for (let i = 0; i < 12; i++) {
    const a = TAU * i / 12;
    const x = 29 + Math.cos(a) * 18 + Math.sin(a) * 5, y = 30 + Math.sin(a) * 19;
    beads.push(plate(oval(x,y,5.6,5.6), i % 3 ? 'main' : WOOD, 1.8),
      detail(oval(x - 1.4,y - 1.6,1.6,1.2,10), PAPER));
  }
  beads.push(plate(contour([45,41],[52,43],[51,48],[58,55],[53,54],[54,58],[47,54],[46,47],[42,46]), RED, 2),
    line([[46,46],[50,44]], PAPER, 1.3));
  return beads;
}
const icons = {
  yeouiju: [
    plate(oval(32,32,22,22,32), 'main', 2.8),
    detail(contour([12,34],[22,46,37,41],[49,38,51,26],[56,45,37,52],[18,56,12,34]), 'sub'),
    detail(contour([16,29],[16,18,29,15],[32,15,30,18],[22,20,20,27],[19,31,16,29]), PAPER),
    detail(oval(34,16.5,2,1.5), PAPER),
  ],
  fan: featherFan(),
  mirror: bronzeMirror(),
  sword: [
    plate(contour([17,42],[44,11],[56,5],[54,19],[27,48]), WOOD),
    detail(contour([21,43],[53,10],[50,18],[26,46]), 'main'),
    line(contour([26,36],[35,29,38,21]), 0x915b40, 1),
    plate(contour([16,42],[22,47],[13,58],[7,53]), 'sub'),
    line([[13,48],[18,52]], PAPER, 1.5), line([[11,51],[16,55]], 'main', 1.5),
    plate(contour([12,37],[17,38],[22,42],[27,45],[30,52],[25,51],[21,46],[16,43],[11,41]), BRONZE, 2),
    plate(contour([9,52],[11,54],[8,57],[5,59],[5,55]), RED, 1.5),
  ],
  beads: prayerBeads(),
  gourd: [
    plate(contour([27,7],[37,7],[36,13],[36,15,39,18],[47,26,39,32],[36,35,41,37],[53,43,49,52],
      [45,62,28,58],[13,57,14,46],[14,38,24,33],[28,31,24,27],[19,21,25,16],[29,13,27,7]), BRONZE),
    detail(contour([36,16],[45,22,37,30],[32,34,36,37],[48,41,46,49],[43,58,30,56],[42,50,33,41],[25,34,31,28],[38,24,36,16]), 'main'),
    detail(contour([19,46],[20,40,27,39],[29,40,26,42],[21,48,19,46]), PAPER),
    plate(contour([25,7],[37,6],[38,11],[26,12]), WOOD, 2),
    plate(contour([25,30],[38,32],[37,36],[25,34]), RED, 1.7),
    plate(contour([37,32],[47,30],[46,35],[41,35],[49,39],[48,43],[36,35]), 'sub', 1.6),
  ],
  bell: [
    plate(oval(32,49,5,7), BRONZE),
    plate(contour([28,12],[24,9,27,6],[30,3,32,8],[35,3,38,6],[40,10,36,12],[34,16],[34,23],[30,23],[30,16]), 'sub', 2),
    plate(contour([11,46],[17,40,18,33],[19,20,28,20],[32,15,36,20],[46,21,47,34],[48,41,53,45],[55,50,47,50],
      [31,46,17,51],[9,53,11,46]), BRONZE, 2.6),
    detail(contour([32,21],[42,22,43,35],[43,40,48,44],[39,43,36,43],[35,29,32,21]), 'main'),
    line(contour([17,45],[32,39,48,44]), 'sub', 2),
    line(contour([22,34],[22,28,26,26]), PAPER, 2),
  ],
  seal: [
    plate(contour([9,32],[33,24],[55,31],[55,49],[30,58],[9,49]), 'main', 2.6),
    plate(contour([9,32],[33,24],[55,31],[30,40]), 'tail', 1.8),
    plate(contour([30,40],[55,31],[55,49],[30,58]), 'sub', 1.8),
    line([[13,45],[28,51]], PAPER, 1.6), line([[35,50],[50,45]], 'main', 1.6),
    plate(contour([15,29],[20,25],[22,17,29,16],[39,14,42,22],[46,23],[47,19],[52,19,52,24],[51,28,44,28],
      [42,32],[38,32],[37,29],[27,31],[24,34],[21,33],[21,30]), 'main', 2.1),
    line(contour([21,25],[29,19,40,23]), 'sub', 1.8),
    line([[28,18],[30,23],[34,27]], 'sub', 1.2),
  ],
};

const cssColor = color => '#' + color.toString(16).padStart(6, '0');

// Phaser Graphics와 허브의 Canvas 2D가 같은 원판을 그린다. DOM이나 장면을 요구하지 않는다.
export function drawWeaponIcon(g, kind, stemKey = null, size = 64, { locked = false } = {}) {
  const style = orbStyleOf(stemKey), scale = size / 64;
  const phaser = typeof g.fillStyle === 'function';
  g.save();
  for (const layer of icons[kind] ?? icons.yeouiju) {
    if (locked && layer.detail) continue;
    g.beginPath();
    trace(g, layer.points, layer.fill != null, scale);
    if (layer.fill != null) {
      const color = locked ? INK : style[layer.fill] ?? layer.fill;
      if (phaser) g.fillStyle(color, 1).fillPath();
      else { g.fillStyle = cssColor(color); g.fill(); }
    }
    if (layer.width) {
      const color = style[layer.color] ?? layer.color ?? INK;
      if (phaser) g.lineStyle(layer.width * scale, color, 1).strokePath();
      else {
        g.strokeStyle = cssColor(color);
        g.lineWidth = layer.width * scale;
        g.lineJoin = 'round';
        g.stroke();
      }
    }
  }
  g.restore();
}
