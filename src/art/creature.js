import { CONFIG } from '../config.js';
import { FORM_BY_ID } from '../data/forms.js';

// 원화 좌표는 160 × 160. 각 부품은 같은 몸통과 얼굴 기준점을 공유한다.
const INK = 0x343a37,
  WHITE = 0xfffdf1,
  ROSE = 0xe99383,
  GOLD = 0xefbd6c;
const PALETTES = {
  none: [0xc4d777, 0x85a35a, 0xf1ebaa],
  east: [0x85cfb7, 0x439483, 0xd2efc8],
  west: [0xf3e6c9, 0xb69d76, 0xfff7df],
  south: [0xf29979, 0xc06558, 0xffd3a2],
  north: [0x899bb3, 0x536581, 0xc0d1da],
};

// Graphics의 캔버스·WebGL 렌더러에서 동일한 외곽선을 얻도록 곡선을 점으로 샘플링한다.
function brush(g, form, halo = false) {
  const [base, shade, light] = PALETTES[form.dir];
  const color = (value) => (halo ? WHITE : value);
  function oval(x, y, w, h, fill, edge = INK, weight = 3.8) {
    g.fillStyle(color(fill)).fillEllipse(x, y, w, h, 48);
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
  return { oval, path, line, base, shade, light, form, fx: 80, fy: 83, spread: 16 };
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
  const yo = p.form.branch === 'yo';
  p.oval(x, y, w, h, yo ? 0x723a43 : INK, INK, 2);
  if (yo) p.oval(x + 0.7, y + h * 0.23, w * 0.62, h * 0.28, 0xe37a67, null);
  p.oval(x - w * 0.14, y - h * 0.22, w * 0.43, h * 0.33, WHITE, null);
  if (!small) p.oval(x + 2.5, y + 3.6, 2.6, 3, WHITE, null);
}
function face(p) {
  const { fx: x, fy: y, spread: s } = p;
  for (const d of [-1, 1]) {
    p.oval(x + d * (s + 10), y + 9, 12, 6.5, ROSE, null);
    eye(p, x + d * s, y);
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
        [22, 76, 23, 69, 18, 66],
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

// 3단계에서 등급 장식을 추가할 그리기 위치. 지금은 모든 형태가 기본 등급이다.
export function drawGradeBorder(_graphics, _grade) {}

export function drawCreature(scene, formId, opts = {}) {
  const key = 'creature-' + formId;
  if (scene.textures.exists(key)) return key;
  const form = FORM_BY_ID[formId];
  const { textureSize, artUnits } = CONFIG.render;
  const g = scene.make.graphics({ add: false });
  const scale = textureSize / artUnits;
  g.scaleCanvas(scale, scale);
  if (form.branch === 'seon') {
    const halo = brush(g, form, true);
    for (const part of form.parts) PARTS[part](halo);
  }
  const paint = brush(g, form);
  for (const part of form.parts) PARTS[part](paint);
  drawGradeBorder(g, opts.grade);
  g.generateTexture(key, textureSize, textureSize);
  g.destroy();
  return key;
}
