import { CONFIG } from '../config.js';
import { STEM_BY_ID } from '../data/stems.js';

// 여의주 구슬 그림. 지금은 자리표시다: 모든 줄기·티어에 예전과 같은 구슬 하나를 그린다.
// T2가 이 파일을 16개 모양(stems.js의 orbStyle.shape) × 단계 5티어로 바꾼다. T3(능력 시스템)는 combat.js에서 drawOrb만 부른다.
//   g        Phaser Graphics
//   orb      { x, y, vx, vy }: 위치와 이동 방향(꼬리는 반대쪽으로 그린다)
//   styleKey 줄기 id('E1'~'N4'). 줄기 없는 mimul·모르는 값은 null/undefined → 지금 구슬(옥색)
//   tier     능력 단계 1~5
// 사용자 결정(2026-11-23): 4·5단계 특수 적의 구슬도 그 적 줄기의 모양·색으로 그린다(효과는 지금 구슬과 같음).

// 지금 구슬(#9DEED3 / #245F5B / #6BC6AF). mimul과 줄기 없는 구슬이 쓴다.
export const DEFAULT_ORB_STYLE = Object.freeze({ shape: 'default', main: 0x9deed3, sub: 0x245f5b, tail: 0x6bc6af });

// 줄기의 구슬 모양·색. 모르는 줄기는 지금 구슬.
export function orbStyleOf(styleKey) {
  return STEM_BY_ID[styleKey]?.orbStyle ?? DEFAULT_ORB_STYLE;
}

export function drawOrb(g, orb, styleKey = null, tier = 1) {
  const { x, y, vx, vy } = orb;
  const r = CONFIG.combat.orbRadius;
  g.lineStyle(r, DEFAULT_ORB_STYLE.tail, 0.65).lineBetween(x - vx * r * 3, y - vy * r * 3, x, y);
  g.fillStyle(DEFAULT_ORB_STYLE.sub).fillCircle(x, y, r + 1);
  g.fillStyle(DEFAULT_ORB_STYLE.main).fillCircle(x, y, r);
  g.fillStyle(0xfffbe6).fillCircle(x - r * 0.25, y - r * 0.3, r * 0.45);
}
