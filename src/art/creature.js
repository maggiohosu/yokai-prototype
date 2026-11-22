import { CONFIG, REGIONS } from '../config.js';
import { FORM_BY_ID } from '../data/forms.js';
import { DECO_SETS, PARTS_CATALOG, partArgs, partName, partScore } from '../data/parts-catalog.js';

// 원화 좌표는 160 × 160. 각 부품은 같은 몸통과 얼굴 기준점을 공유한다.
const INK = 0x343a37,
  WHITE = 0xfffdf1,
  ROSE = 0xe99383,
  GOLD = 0xefbd6c;
const PALETTES = {
  none: [0xc4d777, 0x85a35a, 0xf1ebaa, 0xe6c35c, 0x7c6a2b],
  east: [0x85cfb7, 0x439483, 0xd2efc8, 0x4c8db8, 0x2d6b5e],
  west: [0xf3e6c9, 0xb69d76, 0xfff7df, 0xbfcbcf, 0x8c7a58],
  south: [0xf29979, 0xc06558, 0xffd3a2, 0xd9503f, 0x8f3a33],
  north: [0x899bb3, 0x536581, 0xc0d1da, 0xe4eaee, 0x2f3b57],
};

// Graphics의 캔버스·WebGL 렌더러에서 동일한 외곽선을 얻도록 곡선을 점으로 샘플링한다.
function brush(g, form, halo = false) {
  const [base, shade, light, accent, deep] = PALETTES[form.dir];
  const color = (value) => (halo ? WHITE : value);
  function oval(x, y, w, h, fill, edge = INK, weight = 3.8) {
    if (fill !== null) g.fillStyle(color(fill)).fillEllipse(x, y, w, h, 48);
    if (edge !== null || halo) {
      g.lineStyle(halo ? 11 : weight, color(edge)).strokeEllipse(x, y, w, h, 48);
    }
  }
  function path(start, segments, fill, edge = INK, weight = 3.8) {
    let [x, y] = start;
    g.beginPath().moveTo(x, y);
    for (const s of segments) {
      if (s.length === 2) {
        [x, y] = s;
        g.lineTo(x, y);
      } else {
        const [ax, ay, bx, by, ex, ey] = s;
        for (let i = 1; i <= 10; i++) {
          const t = i / 10,
            u = 1 - t;
          g.lineTo(
            u ** 3 * x + 3 * u * u * t * ax + 3 * u * t * t * bx + t ** 3 * ex,
            u ** 3 * y + 3 * u * u * t * ay + 3 * u * t * t * by + t ** 3 * ey,
          );
        }
        x = ex;
        y = ey;
      }
    }
    if (fill !== null) g.closePath().fillStyle(color(fill)).fillPath();
    if (edge !== null || halo) g.lineStyle(halo ? 11 : weight, color(edge)).strokePath();
  }
  function line(points, width = 3, ink = INK) {
    path(points[0], points.slice(1), null, ink, width);
    const end = points.at(-1);
    for (const [x, y] of [points[0], end.slice(-2)]) {
      g.fillStyle(color(ink)).fillCircle(x, y, (halo ? 11 : width) / 2);
    }
  }
  function stamp(x, y, angle, scale, draw) {
    g.save().translateCanvas(x, y).rotateCanvas(angle).scaleCanvas(scale, scale);
    draw();
    g.restore();
  }
  return { oval, path, line, stamp, base, shade, light, accent, deep, form, fx: 80, fy: 83, spread: 16 };
}

function body(p) {
  p.path(
    [36, 89],
    [
      [32, 64, 49, 43, 72, 42],
      [92, 38, 117, 48, 122, 73],
      [134, 99, 118, 118, 90, 121],
      [60, 125, 39, 117, 36, 89],
    ],
    p.base,
  );
  p.path(
    [46, 101],
    [
      [64, 116, 102, 116, 117, 97],
      [116, 120, 65, 129, 46, 108],
    ],
    p.shade,
    null,
  );
  p.line(
    [
      [52, 66],
      [55, 60, 60, 55, 65, 54],
    ],
    4.2,
    p.light,
  );
  p.oval(70, 51, 5, 4, p.light, null);
}
function eye(p, x, y, small = false) {
  const w = small ? 8 : 13,
    h = small ? 10 : 19;
  const yo = p.form.stage >= 3 && p.form.branch === 'yo';
  p.oval(x, y, w, h, yo ? 0x723a43 : INK, INK, 2);
  if (yo) p.oval(x + 0.7, y + h * 0.23, w * 0.62, h * 0.28, 0xe37a67, null);
  p.oval(x - w * 0.14, y - h * 0.22, w * 0.43, h * 0.33, WHITE, null);
  if (!small) p.oval(x + 2.5, y + 3.6, 2.6, 3, WHITE, null);
}
function face(p) {
  const { fx: x, fy: y, spread: s } = p;
  for (const d of [-1, 1]) {
    p.oval(x + d * (s + 10), y + 9, 12, 6.5, ROSE, null);
    if (!p.singleEye) eye(p, x + d * s, y);
  }
  p.line(
    [
      [x - 4, y + 10],
      [x - 1, y + 14, x + 3, y + 14, x + 5, y + 10],
    ],
    2.3,
  );
}
function feet(p, n, bird = false) {
  for (const d of [-1, 1]) {
    if (n === 6) {
      for (let j = 0; j < 3; j++) {
        const y = 78 + j * 12,
          x = 80 + d * (38 - j * 3);
        p.line(
          [
            [x, y],
            [x + d * 8, y + 4],
            [x + d * 13, y + 2 + j * 2],
          ],
          5,
        );
      }
    } else if (bird) {
      p.line(
        [
          [80 + d * 15, 107],
          [80 + d * 16, 126],
          [80 + d * 23, 128],
        ],
        5,
        GOLD,
      );
    } else {
      p.oval(80 + d * 25, 115, 24, 16, p.shade);
    }
  }
}
function ears(p, kind) {
  for (const d of [-1, 1]) {
    const x = (v) => 80 + d * v;
    if (kind === 'round') {
      p.oval(x(33), 53, 29, 30, p.base);
      p.oval(x(33), 52, 15, 15, ROSE, null);
    } else if (kind === 'deer' || kind === 'four') {
      const offsets = kind === 'four' ? [0, 14] : [0];
      for (const v of offsets) {
        p.path(
          [x(24), 62 + v],
          [
            [x(34), 45 + v, x(47), 42 + v, x(56), 47 + v],
            [x(55), 60 + v, x(41), 73 + v, x(24), 62 + v],
          ],
          p.base,
        );
        p.line(
          [
            [x(36), 59 + v],
            [x(47), 52 + v],
          ],
          2.5,
          ROSE,
        );
      }
    } else {
      const tip = kind === 'fox' ? 18 : 27;
      p.path(
        [x(10), 57],
        [
          [x(18), 40, x(34), tip, x(41), tip],
          [x(45), 29, x(48), 52, x(38), 68],
        ],
        p.base,
      );
      p.path(
        [x(23), 51],
        [
          [x(33), tip + 8],
          [x(38), tip + 7],
          [x(38), 52],
        ],
        ROSE,
        null,
      );
    }
  }
}
function tails(p, n) {
  if (n === 3) {
    // 귀는 위쪽, 꼬리는 왼쪽 부채꼴을 차지하게 해 작은 실루엣에서도 셀 수 있다.
    for (const [tipX, tipY, bend, color] of [
      [21, 20, 7, p.shade],
      [5, 54, 14, p.base],
      [6, 91, 18, p.light],
    ]) {
      p.path([62, 106], [
        [26, 108 + bend, tipX - 3, tipY + 21, tipX, tipY],
        [tipX + 12, tipY + 10, 53, tipY + 4, 61, 88],
        [65, 94, 67, 103, 62, 106],
      ], color);
      p.path([tipX + 2, tipY + 4], [
        [tipX + 4, tipY + 8, tipX + 11, tipY + 9, tipX + 15, tipY + 13],
        [tipX + 11, tipY + 12], [tipX + 11, tipY + 18],
        [tipX + 6, tipY + 13], [tipX + 5, tipY + 18],
      ], WHITE, null);
    }
    return;
  }
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (0.94 + i * 1.12 / (n - 1));
    const len = 71, w = 9;
    const x = 80 + Math.cos(a) * len,
      y = 87 + Math.sin(a) * len;
    const dx = Math.cos(a),
      dy = Math.sin(a),
      nx = -dy * w,
      ny = dx * w;
    p.path(
      [80, 91],
      [
        [80 + nx, 75 + ny, x + nx, y + ny, x, y],
        [x - nx, y - ny, 80 - nx, 90 - ny, 80, 91],
      ],
      i % 2 ? p.light : p.base,
      INK,
      2.5,
    );
    p.oval(x - dx * 4, y - dy * 4, 6, 6, WHITE, null);
  }
}
function stripedTail(p) {
  p.path(
    [105, 101],
    [
      [137, 107, 124, 83, 130, 74],
      [140, 60, 150, 76, 145, 94],
      [142, 118, 117, 125, 103, 115],
    ],
    p.base,
  );
  p.line(
    [
      [132, 82],
      [144, 87],
    ],
    5,
    p.shade,
  );
  p.line(
    [
      [132, 96],
      [141, 101],
    ],
    5,
    p.shade,
  );
}
function horns(p, n, short = false) {
  for (const x of n === 1 ? [83] : [55, 105]) {
    const d = x < 80 ? -1 : 1;
    if (short) {
      p.oval(x, 44, 16, 21, GOLD);
      p.oval(x - 2, 39, 5, 5, WHITE, null);
      continue;
    }
    const y = 20;
    p.path(
      [x - 9, 53],
      [
        [x - 9, 41, x + d * 7, y + 3, x + d * 12, y],
        [x + d * 9, 40, x + 13, 42, x + 8, 54],
      ],
      GOLD,
    );
    p.line(
      [
        [x - 3, 45],
        [x + 5, 47],
      ],
      2,
      0xaa784d,
    );
  }
}
function antlers(p) {
  for (const d of [-1, 1]) {
    const a = [
      [80 + d * 21, 52],
      [80 + d * 30, 36],
      [80 + d * 31, 16],
    ];
    const b = [
      [80 + d * 30, 36],
      [80 + d * 45, 28],
      [80 + d * 48, 19],
    ];
    const c = [
      [80 + d * 31, 27],
      [80 + d * 24, 20],
    ];
    for (const pts of [a, b, c]) p.line(pts, 8);
    for (const pts of [a, b, c]) p.line(pts, 4.2, 0xd6b185);
  }
}
function wings(p, long = false) {
  for (const d of [-1, 1]) {
    const x = (v) => 80 + d * v;
    const tip = long ? 65 : 47,
      up = long ? 64 : 87;
    p.path(
      [x(26), 91],
      [
        [x(41), 86, x(50), up, x(tip), up - 6],
        [x(tip + 2), up + 2, x(tip - 1), up + 13, x(tip - 7), up + 18],
        [x(tip - 3), up + 22, x(tip - 7), up + 28, x(tip - 14), up + 25],
        [x(40), 116, x(25), 109, x(26), 91],
      ],
      p.light,
    );
    p.line(
      [
        [x(34), 101],
        [x(40), 98, x(tip - 10), up + 12, x(tip - 6), up + 6],
      ],
      2.5,
      p.shade,
    );
  }
}
function beak(p, pale = false, long = false) {
  const { fx: x, fy: y } = p,
    len = long ? 23 : 12;
  p.path(
    [x - 5, y + 9],
    [
      [x + 5, y + 5, x + 10, y + 8, x + len, y + 12],
      [x + 4, y + 17, x - 3, y + 18, x - 5, y + 9],
    ],
    pale ? WHITE : GOLD,
    INK,
    2.6,
  );
}
function neck(p) {
  p.oval(75, 99, 61, 42, p.base);
  p.path(
    [57, 105],
    [
      [63, 92, 73, 88, 70, 74],
      [51, 48, 75, 32, 94, 37],
      [120, 40, 126, 65, 111, 77],
      [99, 85, 108, 106, 90, 113],
    ],
    p.base,
  );
  p.fx = 91;
  p.fy = 59;
  p.spread = 11;
}
function shell(p) {
  p.oval(73, 85, 92, 73, p.shade);
  p.oval(70, 78, 74, 55, p.base);
  p.path(
    [51, 65],
    [
      [73, 57],
      [87, 70],
      [81, 88],
      [59, 92],
      [47, 80],
    ],
    p.light,
    p.shade,
    3,
  );
  for (const pts of [
    [
      [73, 57],
      [75, 51],
    ],
    [
      [47, 80],
      [36, 83],
    ],
    [
      [60, 92],
      [57, 103],
    ],
    [
      [87, 70],
      [101, 66],
    ],
  ])
    p.line(pts, 3, p.shade);
}
function serpent(p, long) {
  if (long) {
    p.path(
      [56, 106],
      [
        [34, 108, 23, 94, 28, 78],
        [36, 57, 18, 52, 18, 63],
        [9, 43, 42, 35, 45, 59],
        [49, 74, 33, 81, 51, 89],
        [69, 90, 74, 104, 56, 106],
      ],
      p.base,
    );
  }
  p.oval(67, 111, 71, 27, p.shade);
  p.oval(50, 109, 35, 16, p.base, INK, 2.8);
  p.line(
    [
      [42, 105],
      [43, 113],
    ],
    2.6,
    p.shade,
  );
}
function muzzle(p, fox) {
  const { fx: x, fy: y } = p;
  p.path(
    [x - 13, y + 9],
    [
      [x - 10, y + 3, x - 4, y + 6, x, y + 7],
      [x + 12, y + 2, x + 18, y + 10, x + 9, y + 14],
      [x + 4, y + 15, x + 2, y + (fox ? 22 : 18), x, y + (fox ? 22 : 18)],
      [x - 4, y + 15, x - 12, y + 16, x - 13, y + 9],
    ],
    p.light,
    null,
  );
  p.oval(x, y + 8, 7, 5, INK, null);
  p.line(
    [
      [x, y + 10],
      [x, y + 13],
    ],
    1.8,
  );
}
function flame(p) {
  p.path(
    [114, 79],
    [
      [126, 79, 121, 65, 130, 64],
      [130, 69, 134, 69, 137, 59],
      [147, 72, 142, 85, 133, 88],
      [125, 91, 118, 84, 114, 79],
    ],
    0xe98059,
  );
  p.path(
    [125, 81],
    [
      [132, 80, 133, 72, 136, 72],
      [140, 81, 135, 85, 125, 81],
    ],
    GOLD,
    null,
  );
}
function droplet(p) {
  p.path(
    [35, 91],
    [
      [34, 64, 72, 51, 76, 23],
      [87, 32, 88, 42, 90, 47],
      [108, 52, 126, 69, 125, 93],
      [124, 126, 43, 137, 35, 91],
    ],
    p.base,
  );
  p.line(
    [
      [49, 79],
      [51, 70, 56, 65, 60, 62],
    ],
    4,
    p.light,
  );
}
function marking(p, pts, ink = p.shade) {
  for (const [x, y] of pts)
    p.path(
      [x - 4, y],
      [
        [x + 3, y],
        [x, y + 9],
      ],
      ink,
      null,
    );
}

const JADE = 0x7cc4a4, PAPER = 0xf2d98a, VERMILION = 0xc45148;
const TAU = Math.PI * 2;

// 꽃잎과 깃털은 끝이 위를 향한다. 같은 원판을 돌려 관·부채·연화좌를 찍는다.
function petal(p, x, y, length, width, angle, color, pattern = false) {
  p.stamp(x, y, angle, 1, () => {
    p.path([0, 1], [
      [-width, -length * .15, -width, -length * .65, 0, -length],
      [width, -length * .72, width, -length * .22, 0, 1],
    ], color, INK, 2.7);
    p.line([[0, -length * .18], [1, -length * .57]], 1.8, p.deep);
    if (pattern) featherEye(p, 0, -length * .66, width * .45);
  });
}

function featherEye(p, x, y, r) {
  p.oval(x, y, r * 2, r * 2.7, GOLD, INK, 1.6);
  p.oval(x, y, r * 1.3, r * 1.8, JADE, null);
  p.oval(x, y, r * .65, r, INK, null);
}

function multipleHeads(p, { n = 3 }) {
  // 가운데 몸에 그려지는 본래 얼굴을 포함한 수. 나머지는 목과 작은 얼굴을 따로 찍는다.
  const extra = n - 1;
  const mouths = p.form.parts.map(partName);
  const scale = n >= 6 ? .32 : .46;
  const span = p.form.stage >= 4 ? 77 : 57;
  for (let i = 0; i < extra; i++) {
    const a = extra === 1 ? -1.24 : -1.76 + 3.52 * i / (extra - 1);
    const x = 80 + Math.sin(a) * span, y = 76 - Math.cos(a) * (span - 2);
    const neck = [[80, 95], [x, 95, x, y + 20, x, y]];
    p.line(neck, 16, INK);
    p.line(neck, 11, p.shade);
    p.stamp(x, y, 0, scale, () => {
      p.oval(0, 0, 74, 62, p.base, INK, 5);
      const head = { ...p, fx: 0, fy: -2, spread: 13 };
      face(head);
      if (mouths.some(name => ['beak', 'whiteBeak', 'longBeak'].includes(name))) beak(head);
      else if (mouths.includes('muzzle')) muzzle(head, false);
    });
  }
}

function multipleWings(p, { n = 1 }) {
  const span = p.form.stage >= 4 ? 83 : 66;
  for (const d of [-1, 1]) {
    for (let i = n - 1; i >= 0; i--) {
      const x = v => 80 + d * v;
      const top = 43 + i * 21, tip = span - 5 * i;
      p.path([x(24), 93 + i * 5], [
        [x(37), top + 18, x(tip - 19), top + 15, x(tip), top],
        [x(tip + 2), top + 10, x(tip - 6), top + 24, x(tip - 17), top + 27],
        [x(tip - 12), top + 27], [x(tip - 19), top + 42, x(34), top + 46, x(24), 93 + i * 5],
      ], i % 2 ? p.base : p.light, INK, 3.3);
      p.line([[x(39), top + 34], [x(tip - 12), top + 16]], 2, p.shade);
    }
  }
}

function cloud(p, x, y, scale, color) {
  p.stamp(x, y, 0, scale, () => {
    p.path([-21, 3], [[-25, -3, -17, -9, -11, -7], [-10, -20, 6, -20, 9, -10],
      [22, -14, 29, -3, 22, 4], [18, 10, 4, 8, -3, 6], [-12, 5, -18, 11, -29, 8],
      [-25, 7, -22, 5, -21, 3]], color, INK, 2.5);
    p.line([[-9, -5], [-2, -12, 6, -5, 1, -1]], 2, p.shade);
  });
}

function aura(p, jagged) {
  const segments = [];
  const lobes = jagged ? 13 : 16;
  function point(i, radius) {
    const a = i / lobes * TAU - Math.PI / 2;
    return [80 + Math.cos(a) * 89 * radius * (1 - .15 * Math.sin(a) ** 2),
      73 + Math.sin(a) * 98 * radius];
  }
  for (let i = 0; i < lobes; i++) {
    if (jagged) segments.push(point(i + .38, 1.01), point(i + .56, .89), point(i + 1, .83));
    else segments.push([...point(i + .12, 1.02), ...point(i + .81, 1.02), ...point(i + 1, .92)]);
  }
  p.path(point(0, jagged ? .83 : .92), segments, jagged ? p.shade : 0xf8de9a, INK, 3);
  p.oval(80, 75, 145, 156, p.light, p.deep, 2.5);
}

const PARTS = {
  body,
  face,
  shell,
  antlers,
  droplet,
  flame,
  sixLegs: (p) => feet(p, 6),
  paws: (p) => feet(p, 4),
  birdFeet: (p) => feet(p, 2, true),
  antennae(p) {
    for (const d of [-1, 1]) {
      p.line(
        [
          [80 + d * 16, 51],
          [80 + d * 15, 38, 80 + d * 18, 28, 80 + d * 27, 25],
        ],
        4.5,
      );
      p.oval(80 + d * 27, 24, 13, 11, p.light);
    }
  },
  leafMark(p) {
    p.path(
      [77, 60],
      [
        [63, 58, 64, 45, 66, 45],
        [78, 46, 80, 53, 77, 60],
      ],
      p.shade,
      null,
    );
    p.path(
      [78, 61],
      [
        [77, 48, 87, 45, 94, 46],
        [93, 55, 87, 60, 78, 61],
      ],
      p.shade,
      null,
    );
  },
  segments: (p) => serpent(p, false),
  longSerpent: (p) => serpent(p, true),
  scales(p) {
    for (const [x, y] of [
      [72, 56],
      [84, 55],
      [78, 63],
      [99, 104],
      [108, 100],
    ])
      p.line(
        [
          [x - 3, y],
          [x, y + 3],
          [x + 3, y],
        ],
        2.5,
        p.shade,
      );
  },
  tongue: (p) =>
    p.line(
      [
        [80, 96],
        [84, 103],
        [90, 103],
      ],
      2.6,
      0xc86268,
    ),
  stripedTail,
  tigerEars: (p) => ears(p, 'round'),
  foxEars: (p) => ears(p, 'fox'),
  catEars: (p) => ears(p, 'cat'),
  deerEars: (p) => ears(p, 'deer'),
  fourEars: (p) => ears(p, 'four'),
  threeTails: (p) => tails(p, 3),
  nineTails: (p) => tails(p, 9),
  stripes: (p) =>
    marking(p, [
      [68, 50],
      [80, 47],
      [92, 50],
      [44, 79],
      [113, 78],
    ]),
  muzzle: (p) => muzzle(p, false),
  foxMuzzle: (p) => muzzle(p, true),
  wings: (p) => wings(p, false),
  plumage: (p) => wings(p, true),
  longNeck: neck,
  beak: (p) => beak(p),
  whiteBeak: (p) => beak(p, true, true),
  longBeak: (p) => beak(p, false, true),
  crest(p) {
    p.path(
      [67, 48],
      [
        [52, 35, 62, 24, 74, 40],
        [67, 20, 85, 16, 84, 37],
        [97, 25, 105, 34, 91, 48],
      ],
      p.shade,
    );
  },
  crown: (p) => p.oval(90, 39, 17, 11, 0xd87966),
  flippers(p) {
    for (const [x, y] of [
      [40, 97],
      [51, 111],
      [92, 110],
      [108, 90],
    ])
      p.oval(x, y, 24, 16, p.base);
  },
  turtleHead(p) {
    p.oval(94, 94, 64, 47, p.light);
    p.fx = 96;
    p.fy = 91;
    p.spread = 12;
  },
  littleHorns: (p) => horns(p, 2, true),
  twinHorns: (p) => horns(p, 2),
  oneHorn: (p) => horns(p, 1),
  backEyes(p) {
    for (const x of [67, 91]) {
      p.oval(x, 58, 16, 13, p.light, p.shade, 2);
      eye(p, x, 58, true);
    }
  },
  ramHorns(p) {
    for (const d of [-1, 1]) {
      const x = 80 + d * 34;
      p.oval(x, 54, 31, 34, GOLD);
      p.line(
        [
          [x + d * 3, 62],
          [x + d * 15, 56, x + d * 6, 39, x - 3 * d, 46],
          [x - 9 * d, 51, x - 6 * d, 58, x, 55],
        ],
        2.8,
        0x956c49,
      );
    }
  },
  whiteHead: (p) => p.oval(80, 76, 82, 66, WHITE),
  spots(p) {
    for (const [x, y] of [
      [55, 59],
      [65, 55],
      [99, 60],
      [106, 65],
      [47, 97],
    ])
      p.oval(x, y, 6, 4, WHITE, null);
  },
  oneLeg(p) {
    p.line(
      [
        [77, 106],
        [76, 126],
        [82, 135],
        [95, 136],
      ],
      7,
    );
    p.line(
      [
        [77, 106],
        [76, 126],
        [82, 135],
        [95, 136],
      ],
      3,
      GOLD,
    );
  },
  redMarks: (p) =>
    marking(
      p,
      [
        [82, 43],
        [92, 44],
        [77, 94],
        [69, 98],
      ],
      0xc45148,
    ),
  club(p) {
    p.line(
      [
        [108, 117],
        [131, 74],
      ],
      10,
    );
    p.path(
      [119, 86],
      [
        [112, 83, 119, 65, 126, 55],
        [130, 48, 143, 52, 145, 61],
        [147, 69, 137, 85, 130, 91],
      ],
      0xab7c58,
    );
    for (const [x, y] of [
      [125, 68],
      [134, 60],
      [131, 81],
    ])
      p.oval(x, y, 4, 4, GOLD, null);
  },
  hat(p) {
    p.path(
      [42, 53],
      [
        [54, 50, 62, 44, 66, 31],
        [78, 26, 93, 30, 94, 41],
        [102, 48, 113, 50, 120, 54],
        [104, 63, 64, 64, 42, 53],
      ],
      0xd8b67e,
    );
    p.line(
      [
        [67, 43],
        [81, 47, 89, 46, 96, 44],
      ],
      4,
      0x715a46,
    );
  },
  fang: (p) =>
    p.path(
      [75, 96],
      [
        [79, 104],
        [83, 96],
      ],
      WHITE,
      INK,
      1.5,
    ),
  topknot(p) {
    p.oval(80, 37, 35, 27, INK);
    p.line(
      [
        [68, 44],
        [92, 44],
      ],
      4,
      GOLD,
    );
    p.path(
      [41, 71],
      [
        [39, 35, 102, 28, 119, 70],
        [107, 67, 99, 60, 95, 55],
        [77, 68, 56, 68, 41, 71],
      ],
      INK,
    );
  },
  robe(p) {
    p.path(
      [41, 101],
      [
        [60, 113, 93, 113, 117, 99],
        [111, 121, 65, 129, 45, 113],
      ],
      p.shade,
    );
    p.line(
      [
        [56, 105],
        [76, 118],
        [101, 106],
      ],
      5,
      WHITE,
    );
  },
  peach(p) {
    p.oval(109, 110, 24, 23, 0xefa398);
    p.path(
      [110, 101],
      [
        [110, 93, 121, 92, 124, 94],
        [120, 102, 113, 103, 110, 101],
      ],
      0x76976c,
      INK,
      2,
    );
  },
  waveHands(p) {
    for (const d of [-1, 1]) {
      const x = (v) => 80 + d * v;
      p.path(
        [x(32), 95],
        [
          [x(54), 98, x(63), 82, x(60), 74],
          [x(71), 79, x(71), 101, x(56), 110],
          [x(43), 118, x(36), 109, x(32), 95],
        ],
        p.light,
      );
    }
  },
  wetHair(p) {
    p.path(
      [39, 83],
      [
        [47, 55, 73, 45, 77, 29],
        [95, 48, 112, 47, 119, 73],
        [114, 94, 109, 97, 106, 66],
        [100, 81, 91, 84, 90, 62],
        [79, 76, 70, 82, 72, 62],
        [60, 80, 48, 85, 39, 83],
      ],
      p.shade,
    );
  },
  smoke(p) {
    for (const [x, y, w] of [
      [30, 93, 25],
      [40, 71, 34],
      [47, 47, 23],
      [104, 50, 26],
      [126, 69, 30],
      [130, 97, 32],
      [106, 115, 27],
    ])
      p.oval(x, y, w, w, p.shade);
  },
  bigHead(p) {
    p.oval(80, 82, 103, 86, p.base);
    p.fx = 80;
    p.fy = 80;
    p.spread = 20;
    p.line(
      [
        [48, 67],
        [61, 70],
      ],
      5,
      p.shade,
    );
    p.line(
      [
        [99, 70],
        [112, 64],
      ],
      5,
      p.shade,
    );
  },
  snakeTail(p) {
    p.path(
      [53, 109],
      [
        [26, 116, 11, 96, 19, 81],
        [22, 76, 24, 70, 20, 67],
        [18, 65.5, 18.5, 65, 21, 65.5],
        [36, 66, 38, 81, 29, 90],
        [29, 98, 43, 96, 54, 95],
      ],
      p.base,
    );
    p.line(
      [
        [22, 69],
        [16, 63],
      ],
      2,
      ROSE,
    );
  },
};

// 시작 형태 17종이 쓰는 기존 PARTS에 단계·수 인자를 받는 부품을 합친다.
const FORM_PARTS = {
  ...PARTS,
  multiHead: multipleHeads,
  multiTail(p, { n = 3 }) {
    if (n === 3) return tails(p, n);
    const length = p.form.stage >= 4 ? 89 : 72;
    for (let i = 0; i < n; i++) {
      const a = -1.84 + 3.68 * i / (n - 1 || 1);
      p.stamp(80, 88, a, 1, () => {
        const w = n > 6 ? 12 : 16;
        p.path([0, 2], [[-w, -16, -w * 1.45, -length + 21, 1, -length],
          [w * .3, -length + 12, w * 1.9, -length + 13, w, -length * .48],
          [w * .7, -18, 7, 2, 0, 2]], i % 2 ? p.base : p.shade, INK, 3);
        p.path([1, -length + 4], [[3, -length + 13, 8, -length + 13, w, -length + 23],
          [3, -length + 20], [1, -length + 28], [-3, -length + 21], [-w + 3, -length + 24],
          [-7, -length + 13, -2, -length + 6, 1, -length + 4]], p.light, null);
      });
    }
  },
  multiWings: multipleWings,
  sixArms(p, { n = 6 }) {
    for (const d of [-1, 1]) for (let i = 0; i < n / 2; i++) {
      const x = 80 + d * (60 + (i % 2) * 6), y = 56 + i * 24;
      const arm = [[80 + d * 27, 91 + i * 4], [x - d * 7, y + 13], [x, y]];
      p.line(arm, 12); p.line(arm, 7, p.base);
      p.oval(x, y, 14, 12, p.light, INK, 2.5);
    }
  },
  foreheadEye(p) {
    p.oval(p.fx, p.fy - 23, 15, 12, p.light, p.deep, 2);
    eye(p, p.fx, p.fy - 23, true);
  },
  oneEye(p) {
    p.oval(p.fx, p.fy, 30, 27, p.light, INK, 2.5);
    eye(p, p.fx, p.fy);
    p.singleEye = true;
  },
  bellyFace(p) {
    p.oval(80, 95, 69, 48, p.light, p.shade, 2.5);
    face({ ...p, fy: 89, spread: 13 });
  },
  humanFace(p) {
    p.path([p.fx - 30, p.fy - 10], [[p.fx - 28, p.fy - 37, p.fx + 19, p.fy - 36, p.fx + 30, p.fy - 14],
      [p.fx + 44, p.fy + 24, p.fx - 31, p.fy + 38, p.fx - 30, p.fy - 10]], p.light, p.deep, 2.3);
    for (const d of [-1, 1]) p.line([[p.fx + d * 20, p.fy - 13], [p.fx + d * 12, p.fy - 16]], 2.7);
  },
  coilBody(p, { n = 3 }) {
    for (let i = 0; i < n; i++) {
      const x = 49 + i * 8, y = 114 - i * 9;
      p.oval(x, y, 82 - i * 9, 27, i % 2 ? p.base : p.shade);
      p.line([[x - 29, y], [x - 25, y + 5, x - 18, y + 7, x - 14, y + 6]], 2.5, p.light);
    }
  },
  fishTail(p) {
    p.path([45, 96], [[31, 89, 30, 66, 10, 65], [15, 76, 8, 82, 22, 91],
      [14, 95, 10, 100, 8, 111], [27, 114, 37, 105, 45, 102]], p.base);
    p.line([[16, 72], [26, 87], [37, 96]], 2.4, p.shade);
    p.line([[16, 105], [31, 98]], 2.4, p.shade);
  },
  backSpikes(p) {
    for (const [x, y, h] of [[35, 84, 15], [40, 70, 25], [49, 57, 27], [63, 50, 25], [79, 47, 18]]) {
      p.path([x - 4, y + 6], [[x - 11, y - h], [x + 11, y - 2]], p.shade, INK, 3);
    }
  },
  hexShell(p) {
    for (const [x, y, r] of [[52, 76, 11], [70, 64, 9], [66, 88, 10], [87, 75, 9]]) {
      const pts = Array.from({ length: 6 }, (_, i) => [x + r * Math.cos(i * TAU / 6), y + r * Math.sin(i * TAU / 6)]);
      p.path(pts[0], pts.slice(1), p.base, p.deep, 2.2);
      p.oval(x - 2, y - 2, 5, 4, p.light, null);
    }
  },
  antlerTree(p) {
    for (const d of [-1, 1]) {
      const x = v => 80 + d * v;
      const branches = [[[x(18), 51], [x(32), 33], [x(38), 9], [x(48), -4]],
        [[x(31), 34], [x(52), 26], [x(62), 13]], [[x(38), 14], [x(29), 8], [x(26), 0]],
        [[x(50), 26], [x(51), 13]]];
      for (const [color, width] of [[INK, 8], [GOLD, 4.3]]) for (const line of branches) p.line(line, width, color);
    }
  },
  maneFlame(p) {
    for (const d of [-1, 1]) {
      const x = v => 80 + d * v;
      p.path([x(24), 44], [[x(42), 49, x(42), 36, x(49), 33], [x(46), 56, x(65), 51, x(60), 44],
        [x(76), 65, x(57), 73, x(61), 83], [x(68), 81], [x(66), 101, x(43), 102, x(36), 111],
        [x(42), 88, x(45), 64, x(24), 44]], p.shade);
      p.line([[x(52), 62], [x(58), 69, x(51), 72, x(50), 77]], 2.6, p.light);
    }
  },
  maneCloud(p) {
    for (const d of [-1, 1]) for (const [off, y, s] of [[27, 54, .64], [40, 72, .68], [39, 92, .55]]) {
      cloud(p, 80 + d * off, y, s, p.light);
    }
  },
  tusks(p) {
    for (const d of [-1, 1]) {
      const x = p.fx + d * 22, y = p.fy + 16;
      p.path([x - d * 6, y], [[x, y + 14, x + d * 17, y + 3, x + d * 15, y - 15],
        [x + d * 9, y - 5, x + d * 7, y + 1, x - d * 6, y]], p.light, INK, 2.6);
    }
  },
  tailFan(p) {
    for (let i = -3; i <= 3; i++) petal(p, 80, 99, 91 - Math.abs(i) * 2, 13, i * .39,
      i % 2 ? p.base : p.light, true);
  },
  featherCrown(p) {
    for (let i = -2; i <= 2; i++) petal(p, 80, 46, 46 - Math.abs(i) * 5, 9, i * .33,
      i % 2 ? p.accent : p.light, true);
    p.oval(80, 44, 32, 10, GOLD, INK, 2.5);
  },
  taoCrown(p) {
    p.path([63, 45], [[64, 29], [68, 33], [74, 20], [80, 29], [87, 19], [92, 33], [98, 29], [97, 45]],
      GOLD, INK, 3);
    p.oval(80, 40, 10, 11, JADE, INK, 2);
  },
  beadCurtainCrown(p) {
    p.path([57, 47], [[61, 19], [98, 19], [104, 45]], p.deep);
    p.path([43, 16], [[87, 9], [120, 18], [74, 26]], p.light, INK, 3.3);
    p.line([[45, 19], [73, 29], [118, 20]], 3, GOLD);
    for (let i = 0; i < 6; i++) {
      const x = 48 + i * 13, y = 21 + (3 - Math.abs(i - 2)) * 2;
      p.line([[x, y], [x, y + 12]], 2.2);
      p.oval(x, y + 14, 6, 8, JADE, INK, 1.6);
    }
  },
  hornWrap(p) {
    for (const d of [-1, 1]) for (const y of [37, 43]) {
      const pts = [[80 + d * 31, y], [80 + d * 21, y + 3]];
      p.line(pts, 4.5); p.line(pts, 2.2, GOLD);
    }
  },
  foreheadMark(p) {
    const x = p.fx, y = p.fy - 25;
    p.path([x, y - 6], [[x - 2, y - 2, x - 8, y + 2, x, y + 6],
      [x + 6, y + 3, x + 4, y - 2, x, y - 6]], p.accent, p.deep, 1.6);
  },
  jadeBeads(p) {
    for (let i = -3; i <= 3; i++) {
      const x = 81 + i * 8, y = 117 - i * i * .75;
      p.oval(x, y, 8, 8.6, JADE, INK, 1.8);
      p.oval(x - 1, y - 1.5, 2.5, 2.5, WHITE, null);
    }
  },
  tasselKnot(p) {
    const x = 112, y = 108;
    for (const d of [-1, 0, 1]) {
      const pts = [[x, y + 4], [x + d * 3, y + 11], [x + d * 4, y + 17 - Math.abs(d) * 3]];
      p.line(pts, 3.8); p.line(pts, 2.1, VERMILION);
    }
    p.path([x, y - 6], [[x + 6, y], [x, y + 7], [x - 6, y]], GOLD, INK, 2);
  },
  talismanStrip(p) {
    p.stamp(48, 96, .25, 1, () => {
      p.path([-6, -3], [[6, -3], [7, 21], [1, 18], [-5, 23]], PAPER, INK, 2.3);
      p.line([[-3, 2], [3, 2]], 1.8, VERMILION);
      p.line([[-2, 6], [2, 8], [-2, 11], [2, 14]], 2.1, VERMILION);
    });
  },
  goldTrim(p) {
    const contours = [[[44, 89], [45, 98, 48, 103, 54, 107]], [[109, 105], [116, 99, 119, 94, 119, 87]]];
    if (p.form.stage === 5) contours.push([[49, 88], [49, 94, 52, 99, 57, 102]]);
    for (const pts of contours) { p.line(pts, 3.1); p.line(pts, 1.4, GOLD); }
  },
  goldLeaf(p) {
    for (const [x, y, r] of [[52, 91, 2.6], [56, 96, 2], [59, 91, 1.5], [108, 91, 2.3]]) {
      p.oval(x, y, r * 2, r * 2, GOLD, INK, 1.4);
    }
  },
  cloudRibbon(p, { n = 1 }) {
    for (let i = 0; i < n; i++) {
      const d = i % 2 ? -1 : 1;
      const x = v => 80 + d * v, y = i === 2 ? 18 : 0;
      const tip = p.form.stage >= 4 ? 86 : 72;
      p.path([x(26), 109 + y], [[x(49), 105 + y, x(57), 133 + y, x(66), 110 + y],
        [x(70), 98 + y, x(tip - 8), 87 + y, x(tip), 89 + y],
        [x(tip - 5), 94 + y], [x(tip), 98 + y], [x(72), 97 + y, x(79), 131 + y, x(57), 127 + y],
        [x(45), 124 + y, x(36), 113 + y, x(26), 115 + y]], WHITE, p.deep, 2.4);
    }
  },
  cloudMark(p) {
    for (const [x, y] of [[50, 86], [58, 98], [106, 99]]) cloud(p, x, y, .23, p.light);
  },
  cloudBase(p, { n = 3 }) {
    for (let i = 0; i < n; i++) {
      const t = i - (n - 1) / 2;
      cloud(p, 80 + t * (n < 5 ? 31 : 22), 131 - Math.abs(t) * 4, .9, i % 2 ? WHITE : p.light);
    }
  },
  waveRim(p, { n = 1 }) {
    p.path([38, 122], [[50, 133, 101, 136, 122, 119], [117, 138, 54, 151, 38, 122]], p.base, INK, 2.5);
    for (let row = 0; row < n; row++) for (let i = 0; i < 5; i++) {
      const x = 48 + i * 13, y = 132 + Math.sin(i * Math.PI / 4) * 4 - row * 4;
      p.line([[x, y], [x + 3, y - 7, x + 10, y - 7, x + 12, y]], 1.8, p.deep);
    }
  },
  patternBand(p, { key = 'thunder' }) {
    p.path([49, 106], [[65, 117, 97, 118, 112, 104], [110, 113], [96, 126, 65, 125, 51, 115]], p.shade, p.deep, 1.8);
    for (let i = -2; i <= 2; i++) {
      const x = 78 + i * 11, y = 115 - i * i * 1.05;
      const motif = key === 'wave' ? [[x - 4, y + 3], [x, y - 4, x + 3, y - 3, x + 5, y + 1]]
        : key === 'whiteLine' ? [[x - 4, y + 3], [x + 3, y - 1]]
        : key === 'hoeja' ? [[x - 3, y + 3], [x - 3, y - 2], [x + 4, y - 2], [x + 4, y + 3], [x, y + 3]]
        : [[x - 5, y + 2], [x - 2, y + 2], [x - 2, y - 2], [x + 3, y - 2], [x + 3, y + 1]];
      p.line(motif, 1.6, key === 'whiteLine' ? WHITE : p.light);
    }
  },
  starDots(p) {
    const stars = [[46, 73], [53, 67], [59, 68], [64, 63], [63, 55], [72, 54], [74, 60]];
    p.line(stars, 1.8, p.deep);
    for (const [x, y] of stars) p.oval(x, y, 4.8, 4.8, p.accent, p.deep, 1.2);
  },
  eyeSpots(p) {
    for (const [x, y] of [[24, 66], [34, 78], [126, 78], [136, 66]]) featherEye(p, x, y, 4);
  },
  halo(p, { n = 1 }) {
    const r = n === 2 ? 66 : 57, y = 58;
    // 환 안의 투명한 종이 공간을 남겨 머리·귀의 외곽이 읽힌다.
    for (let i = 0; i < n; i++) {
      const size = 2 * (r - i * 7);
      p.oval(80, y, size, size, null, INK, 5);
      p.oval(80, y, size, size, null, GOLD, 2.7);
    }
    for (let i = 0; i < 12; i++) {
      const a = i * TAU / 12, dx = Math.cos(a), dy = Math.sin(a);
      p.line([[80 + dx * (r + 4), y + dy * (r + 4)], [80 + dx * (r + 8), y + dy * (r + 8)]], 2.3, p.deep);
    }
  },
  mandorla: p => aura(p, false),
  flameAura: p => aura(p, true),
  lotusSeat(p) {
    for (let i = -3; i <= 3; i++) petal(p, 80 + i * 5, 147 - Math.abs(i) * 2,
      29 + Math.abs(i) * 5, 13, i * .41, i % 2 ? JADE : p.light);
    p.oval(80, 146, 54, 9, GOLD, INK, 2.4);
  },
  sunMoonDisc(p) {
    p.oval(117, 23, 28, 28, p.form.dir === 'south' ? GOLD : p.light, INK, 2.5);
    if (p.form.dir === 'north') p.path([115, 10], [[108, 22, 117, 30, 130, 25],
      [125, 39, 98, 39, 104, 18]], p.shade, INK, 2);
    else p.oval(117, 23, 18, 18, null, p.deep, 1.6);
  },
};

// 등급 장식은 필드의 별도 고리다. 같은 형태를 등급마다 다시 굽지 않는다.
export function drawGradeBorder(_graphics, _grade) {}

const stageMax = { 3: 4, 4: 8, 5: 13 };
const trimOrder = ['cloudMark', 'tasselKnot', 'goldLeaf', 'cloudRibbon', 'cloudBase',
  'jadeBeads', 'talismanStrip', 'lotusSeat', 'foreheadMark', 'patternBand', 'goldTrim'];
const layers = new Map([
  [-4, ['mandorla', 'flameAura']],
  [-3, ['halo', 'sunMoonDisc', 'cloudBase', 'lotusSeat']],
  [-2, ['multiTail', 'tailFan', 'multiWings', 'multiHead', 'sixArms', 'backSpikes', 'maneFlame', 'maneCloud', 'coilBody', 'fishTail', 'antlerTree']],
  [1, ['featherCrown', 'taoCrown', 'beadCurtainCrown', 'hornWrap', 'foreheadMark', 'goldTrim', 'goldLeaf',
    'cloudMark', 'starDots', 'eyeSpots', 'waveRim', 'patternBand']],
  [2, ['tusks', 'tasselKnot', 'jadeBeads', 'cloudRibbon', 'talismanStrip']],
].flatMap(([layer, names]) => names.map(name => [name, layer])));
const layerOf = spec => layers.get(partName(spec)) ?? 0;

export function decorate(form) {
  const present = new Set(form.parts.map(partName));
  const ornaments = (DECO_SETS[form.deco] ?? []).filter(spec => !present.has(partName(spec)));
  const score = [...form.parts, ...ornaments].reduce((sum, spec) => sum + partScore(spec), 0);
  let excess = score - (stageMax[form.stage] ?? Infinity);
  for (const name of trimOrder) {
    if (excess <= 0) break;
    const index = ornaments.findIndex(spec => partName(spec) === name);
    if (index < 0) continue;
    const cost = partScore(ornaments[index]);
    if (name === 'cloudRibbon' && cost > excess) {
      ornaments[index] = [name, { n: cost - excess }];
      break;
    }
    ornaments.splice(index, 1);
    excess -= cost;
  }
  return [...form.parts, ...ornaments].sort((a, b) => layerOf(a) - layerOf(b));
}

export function artUnitsFor(stage) {
  return CONFIG.render.artUnitsByStage[stage] ?? CONFIG.render.artUnits;
}

export function paintCreature(g, form, pixels) {
  const units = artUnitsFor(form.stage);
  const offset = units - CONFIG.render.artUnits;
  g.save().scaleCanvas(pixels / units, pixels / units).translateCanvas(offset / 2, offset * .52);
  const parts = decorate(form);
  const paint = brush(g, form);
  const draw = (spec, p) => FORM_PARTS[partName(spec)](p, partArgs(spec));
  for (const spec of parts) if (layerOf(spec) <= -3) draw(spec, paint);
  if (form.branch === 'seon' && form.stage >= 3) {
    const outline = brush(g, form, true);
    for (const spec of parts) if (PARTS_CATALOG[partName(spec)].halo) draw(spec, outline);
  }
  for (const spec of parts) if (layerOf(spec) > -3) draw(spec, paint);
  g.restore();
}

function bake(scene, form, key, pixels) {
  const g = scene.make.graphics({ add: false });
  try {
    paintCreature(g, form, pixels);
    g.generateTexture(key, pixels, pixels);
  } finally {
    g.destroy();
  }
}

const caches = new WeakMap();
function cacheFor(textures) {
  if (!caches.has(textures)) caches.set(textures, { entries: new Map(), bytes: 0, thumbnails: new Map() });
  return caches.get(textures);
}

// 같은 TextureManager를 쓰는 씬의 스프라이트(잠든 씬·컨테이너 포함)가 참조하는 키는 지우지 않는다.
function activeKeys(scene) {
  const keys = new Set();
  function visit(list) {
    for (const item of list) {
      if (item.texture) keys.add(item.texture.key);
      if (Array.isArray(item.list)) visit(item.list);
    }
  }
  for (const s of scene.game?.scene?.getScenes(false) ?? [scene]) visit(s.children?.list ?? []);
  return keys;
}

function trimTextures(scene, cache, requestedKey) {
  const limit = CONFIG.render.textureBudgetMB * 1024 ** 2;
  if (cache.bytes <= limit) return;
  const pinned = activeKeys(scene);
  pinned.add(requestedKey);
  for (const [key, bytes] of cache.entries) {
    if (pinned.has(key)) continue;
    if (scene.textures.exists(key)) scene.textures.remove(key);
    cache.entries.delete(key);
    cache.bytes -= bytes;
    if (cache.bytes <= limit) break;
  }
  // 방금 반환할 키까지 보호하면 잠시 예산을 넘길 수 있다. 마지막 스프라이트가 사라진
  // 뒤에 새 그리기 요청이 없어도 회수한다. 예산 안에서는 프레임 리스너를 두지 않는다.
  if (cache.bytes > limit && !cache.trimPending && scene.game?.events) {
    cache.trimPending = true;
    scene.game.events.once('poststep', () => {
      cache.trimPending = false;
      trimTextures(scene, cache);
    });
  }
}

export function drawCreature(scene, formId, opts = {}) {
  const dir = formId === 'mimul' && Object.hasOwn(REGIONS, opts.dir) ? opts.dir : null;
  const form = dir ? { ...FORM_BY_ID[formId], dir } : FORM_BY_ID[formId];
  const key = 'creature-' + formId + (dir ? '-' + dir : '');
  const cache = cacheFor(scene.textures);
  const pixels = artUnitsFor(form.stage) * CONFIG.render.textureSize / CONFIG.render.artUnits;
  const bytes = pixels * pixels * 4;
  if (!scene.textures.exists(key)) bake(scene, form, key, pixels);
  if (cache.entries.has(key)) cache.entries.delete(key);
  else cache.bytes += bytes;
  cache.entries.set(key, bytes);
  trimTextures(scene, cache, key);
  return key;
}

// 도감·카드용 이미지는 필드 LRU와 독립적이다. dataURL을 얻은 즉시 임시 GPU 텍스처를 반환한다.
function portraitURL(scene, form, pixels) {
  const key = 'portrait-' + form.id;
  bake(scene, form, key, pixels);
  try {
    return scene.textures.get(key).getSourceImage().toDataURL();
  } finally {
    scene.textures.remove(key);
  }
}

export function getFormThumbnail(scene, formId) {
  const cache = cacheFor(scene.textures).thumbnails;
  if (!cache.has(formId)) cache.set(formId, portraitURL(scene, FORM_BY_ID[formId], 128));
  return cache.get(formId);
}

export function getFormPortrait(scene, formId) {
  const form = FORM_BY_ID[formId];
  return portraitURL(scene, form, artUnitsFor(form.stage) * CONFIG.render.textureSize / CONFIG.render.artUnits);
}
