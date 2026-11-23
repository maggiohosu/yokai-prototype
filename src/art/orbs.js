import { CONFIG } from '../config.js';
import { STEM_BY_ID } from '../data/stems.js';

// 모든 원형의 앞은 +x. 속력은 그림에 영향을 주지 않는다.
export const DEFAULT_ORB_STYLE = Object.freeze({ shape: 'default', main: 0x9deed3, sub: 0x245f5b, tail: 0x6bc6af });
const INK = 0x343a37, GOLD = 0xefbd6c;

// 줄기의 구슬 모양·색. 모르는 줄기는 지금 구슬.
export function orbStyleOf(styleKey) {
  return STEM_BY_ID[styleKey]?.orbStyle ?? DEFAULT_ORB_STYLE;
}

// 제어점 한 쌍이 더 있으면 이차 곡선이다. 모든 구슬이 같은 꼭짓점 배열을 재사용한다.
function contour(...commands) {
  const points = [commands[0]];
  for (const command of commands.slice(1)) {
    if (command.length === 2) { points.push(command); continue; }
    const [x, y] = points.at(-1);
    const [cx, cy, endX, endY] = command;
    for (let i = 1; i <= 6; i++) {
      const t = i / 6, u = 1 - t;
      points.push([u * u * x + 2 * u * t * cx + t * t * endX, u * u * y + 2 * u * t * cy + t * t * endY]);
    }
  }
  return points;
}
function ellipse(cx, cy, w, h, vertices = 24) {
  return Array.from({ length: vertices }, (_, i) => {
    const a = i * Math.PI * 2 / vertices;
    return [cx + w * Math.cos(a), cy + h * Math.sin(a)];
  });
}

// 바깥 먹선(몸)과 그 안의 두 번째 색면(무늬)으로 나눈 작은 판화.
const designs = {
  lightning: {
    body: contour([-12, 1], [-1, -10], [-1, -5], [12, -3], [0, 10], [1, 4]),
    mark: contour([-7, 1], [3, -5], [0, 0], [6, -1], [-2, 5], [0, 1]),
  },
  foxfire: {
    body: contour([-10, -9], [-5, -4, 1, -6], [8, -8, 10, -1], [13, 6, 6, 10],
      [-2, 14, -7, 7], [-11, 3, -9, -1], [-7, -5, -10, -9]),
    mark: contour([-3, -2], [0, 1, 4, -3], [9, 5, 4, 6], [-2, 8, -3, -2]),
  },
  feather: {
    body: contour([-13, 6], [-5, -4, 0, -7], [-1, -3], [5, -8, 13, -8], [10, 2, 3, 5],
      [4, 2], [-2, 8, -8, 6], [-12, 9]),
    mark: contour([-9, 6], [0, -1, 10, -6], [1, 2, -9, 6]),
  },
  pearl: { body: ellipse(0, 0, 10, 10), mark: contour([-9, 1], [0, 8, 9, -3], [7, 9, -4, 8], [-9, 6, -9, 1]) },
  claw: {
    body: contour([-9, -9], [10, -11, 12, -1], [12, 8, -9, 11], [8, 0, -9, -9]),
    mark: contour([0, -7], [10, -5, 9, 0], [8, 4, 2, 6], [8, 0, 0, -7]),
  },
  hornArrow: { body: contour([-11, -8], [0, -7, 13, 0], [-11, 9], [-6, 1]), mark: ellipse(0, 0, 2.8, 2.8, 8) },
  chevron: { body: contour([-10, -12], [5, -6], [10, 0], [-10, 12], [-6, 3], [0, 0], [-7, -3]),
    mark: contour([-4, -7], [6, 0], [-4, 7], [2, 0]) },
  thornStar: {
    body: Array.from({ length: 12 }, (_, i) => {
      const a = Math.PI * i / 6, r = i % 2 ? 5.4 : 11;
      return [Math.cos(a) * r, Math.sin(a) * r];
    }),
    mark: contour([-4, -2], [4, -3], [1, 0], [4, 2], [-4, 4], [-1, 0]),
  },
  comet: { body: contour([-13, -8], [-4, -6, -2, -8], [8, -12, 11, -3], [14, 10, 1, 10],
    [-6, 10, -13, 3], [-4, 4], [-10, -1], [-4, 0]), mark: contour([-5, -3], [3, 0, 5, -5], [12, 4, 5, 6], [0, 7, -5, -3]) },
  tripleFire: { body: contour([-11, -11], [-6, -9, -4, -10], [2, -11, 2, -4],
    [9, -7, 12, -1], [15, 5, 9, 7], [3, 9, 1, 4], [1, 10, -4, 11],
    [-10, 14, -12, 8], [-14, 3, -8, 0], [-14, -2, -11, -7], [-10, -9, -11, -11]),
    mark: contour([-9, -5], [-7, -8, -4, -7], [-3, -5, -5, -4], [-7, -3, -9, -5]),
    flecks: [ellipse(7, 1, 2.4, 2.4), ellipse(-6, 6, 2, 2)] },
  peach: { body: contour([0, -6], [-10, -11, -11, -1], [-12, 6, 0, 11], [11, 7, 10, -1],
    [10, -7, 5, -7], [10, -10, 9, -13], [2, -14, 0, -6]),
    mark: contour([0, -5], [1, -12, 8, -12], [7, -5, 1, -5], [4, -1, 1, 5], [2, 0, 0, -5]) },
  bomb: { body: contour([-11, -1], [-9, -3], [-9, -9], [-3, -7], [0, -12], [3, -7], [10, -9],
    [8, -4], [13, -3], [8, 1], [9, 10, 0, 10], [-8, 11, -9, 4]), mark: contour([-2, -4], [2, -7], [1, -1], [5, -1], [-2, 6], [0, 1], [-4, 1]) },
  iceHex: { body: ellipse(0, 0, 11, 10, 6), mark: contour([-8, 0], [-2, -1], [-4, -6], [0, -2],
    [4, -6], [2, -1], [8, 0], [2, 1], [4, 6], [0, 2], [-4, 6], [-2, 1]) },
  toothMouth: { body: ellipse(0, 0, 10, 10), mark: contour([-8, -3], [-5, 0], [-2, -3], [1, 0], [4, -3],
    [8, -4], [6, 5, 0, 6], [-6, 6, -8, -3]) },
  whirlDrop: { body: contour([-13, 0], [-6, -1, -2, -7], [7, -14, 11, -4], [16, 6, 5, 9], [-3, 13, -13, 0]),
    mark: contour([-5, 1], [0, 8, 7, 3], [11, -4, 4, -5], [-1, -5, 1, 0], [4, 2, 5, -1],
      [7, 3, 2, 3], [-3, 2, -2, -3], [1, -10, 8, -6], [15, 2, 6, 7], [-1, 11, -5, 1]) },
  windFeather: { body: contour([-12, -5], [-1, -14, 12, -7], [4, -7, 1, -2], [6, -3, 10, -1],
    [5, -1, 0, 6], [-7, 13, -13, 8], [-7, 8, -4, 2], [-1, -5, 3, -6], [-6, -5, -12, -5]),
    mark: contour([-9, 7], [-4, 6, -1, 1], [3, -4, 6, -3], [2, -1, 0, 3], [-3, 8, -9, 7]) },
};

function trace(g, points) {
  g.moveTo(...points[0]);
  for (let i = 1; i < points.length; i++) g.lineTo(...points[i]);
  g.closePath();
}
const tails = {
  plain: contour([-5, -3], [-16, -4], [-26, 0], [-16, 2], [-5, 3]),
  lightning: contour([-5, -2], [-15, -5], [-13, 0], [-26, -2], [-10, 5], [-12, 1], [-5, 3]),
  foxfire: contour([-5, -3], [-15, -6], [-12, -2], [-26, -4], [-16, 0], [-22, 4], [-11, 2], [-13, 5], [-5, 3]),
  double: contour([-4, -2], [-17, -6], [-28, -4], [-15, -2], [-9, 0], [-17, 2], [-25, 5], [-14, 5], [-4, 2]),
};
const sparks = [
  contour([-19, -9], [-17, -6.2], [-19, -4.5], [-21, -6.2]),
  contour([-26, 4], [-24.2, 6], [-26, 8.1], [-27.8, 6]),
];

// 플레이어·적 공용. 적 구슬은 기존 판정 반지름을 다섯째 인자로 넘길 수 있다.
export function drawOrb(g, { x, y, vx, vy }, styleKey = null, tier = 1, radius = CONFIG.combat.orbRadius) {
  const style = orbStyleOf(styleKey);
  if (style === DEFAULT_ORB_STYLE) {
    const speed = Math.hypot(vx, vy) || 1;
    g.lineStyle(radius, style.tail, .65).lineBetween(x - vx / speed * radius * 3, y - vy / speed * radius * 3, x, y);
    g.fillStyle(style.sub).fillCircle(x, y, radius + 1);
    g.fillStyle(style.main).fillCircle(x, y, radius);
    g.fillStyle(0xfffbe6).fillCircle(x - radius * .25, y - radius * .3, radius * .45);
    return;
  }
  const stage = Math.max(1, Math.min(5, Math.trunc(tier) || 1));
  const scale = radius * (1 + .075 * (stage - 1)) / 10;
  const { body, mark, flecks } = designs[style.shape];
  g.save().translateCanvas(x, y).rotateCanvas(Math.atan2(vy, vx)).scaleCanvas(scale, scale);
  if (stage >= 2) {
    g.save();
    if (stage >= 3) g.scaleCanvas(1.5, 1);
    g.beginPath();
    trace(g, stage === 5 ? tails.double : tails[style.shape] ?? tails.plain);
    g.fillStyle(style.tail, 1).fillPath().restore();
  }
  g.beginPath();
  trace(g, body);
  g.fillStyle(style.main, 1).fillPath();
  g.lineStyle((stage >= 4 ? 3 : 1.6) / scale, INK, 1).strokePath();
  if (stage >= 4) g.lineStyle(1.4 / scale, GOLD, 1).strokePath();
  g.beginPath();
  trace(g, mark);
  if (flecks) for (const fleck of flecks) trace(g, fleck);
  g.fillStyle(style.sub, 1).fillPath();
  if (stage >= 3) g.fillStyle(0xfffdf1, 1).fillCircle(2, -3, 1.8);
  if (stage === 5) {
    g.beginPath();
    for (const spark of sparks) trace(g, spark);
    g.fillStyle(GOLD, 1).fillPath().lineStyle(.7 / scale, INK, 1).strokePath();
  }
  g.restore();
}
