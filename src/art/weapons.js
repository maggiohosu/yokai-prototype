// 보패 7종의 발사체·아이콘 그림 — W1 자리표시. 지금은 모든 무기가 여의주 구슬 그림(drawOrb)을 그린다.
// W3(그림)가 이 파일을 무기별 그림으로 바꾼다. W2(발사 규칙)와 W3가 만나는 곳은 아래 두 함수의 모양(인자·반환)뿐이다
// (docs/design-weapons.md 8-1). Phaser Graphics의 동작은 drawOrb가 이미 쓰는 것만 쓴다.
import { drawOrb } from './orbs.js';

// g: Phaser Graphics. shot: { x, y, vx, vy }(진행 방향이 vx, vy). kind: 무기 id. stemKey: 지금 형태의 진화 줄기(색·모양). tier: 단계 1~5.
export function drawWeaponShot(g, shot, kind, stemKey = null, tier = 1) {
  drawOrb(g, shot, stemKey, tier);
}

// 정사각 size px 아이콘의 가운데에 그린다. 글자는 쓰지 않는다. locked면 먹색 실루엣으로 그릴 자리(지금은 구슬 그대로).
export function drawWeaponIcon(g, kind, stemKey = null, size = 64, { locked = false } = {}) {
  drawOrb(g, { x: size / 2, y: size / 2, vx: 1, vy: 0 }, stemKey, 3, size * 0.28);
}
