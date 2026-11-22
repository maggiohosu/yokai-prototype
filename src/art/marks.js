import { pixelRatio } from '../game/camera.js';
import { stageOf } from '../systems/rules.js';

// 한 프레임의 적들이 Graphics를 공유한다. 지우기는 호출자가 프레임 시작 때 한 번만 한다.
export function drawStageMark(g, actor, playerStage, _t) {
  const camera = g.scene.cameras.main;
  const unit = pixelRatio() / camera.zoom; // 화면 1 CSS px에 해당하는 월드 거리
  const radius = Math.max(2.5 * unit, Math.min(4 * unit, actor.size * 0.12));
  const stage = stageOf(actor);
  const spacing = 2 * radius + 2.5 * unit;
  const halfSpan = ((stage - 1) * spacing) / 2;
  const y = actor.y - actor.size * 1.7 * (actor.punch || 1) - radius - 2 * unit;
  const view = camera.worldView;
  if (y + radius < view.top || y - radius > view.bottom ||
      actor.x + halfSpan + radius < view.left || actor.x - halfSpan - radius > view.right) return;

  const color = stage > playerStage ? 0xe88270 : stage < playerStage ? 0x91ca91 : 0xffedc5;
  g.lineStyle(1.25 * unit, 0x304537, 1);
  g.fillStyle(color, 1);
  for (let i = 0; i < stage; i++) {
    g.beginPath();
    g.arc(actor.x - halfSpan + i * spacing, y, radius, 0, Math.PI * 2);
    g.closePath();
    g.fillPath();
    g.strokePath();
  }
}
