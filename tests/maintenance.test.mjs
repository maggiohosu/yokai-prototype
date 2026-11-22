import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgress } from '../src/systems/progress.js';
import { createRunLevel, earnedThisRun, shouldPause, pauseGauge } from '../src/systems/levelup.js';
import { finishMaintenance, snapshotForMaintenance } from '../src/systems/maintenance.js';

function setup(yoryeok = 500) {
  const progress = Object.assign(createProgress(), { yoryeok });
  return { progress, run: createRunLevel(progress) };
}

test('스냅숏은 형태·단계·등급·요력을 적는다', () => {
  const { progress } = setup(123);
  Object.assign(progress, { formId: 'littleSnake', stage: 2, grade: 'B' });
  assert.deepEqual(snapshotForMaintenance(progress), { formId: 'littleSnake', stage: 2, grade: 'B', yoryeok: 123 });
});

test('정비에서 요력을 써도(강화·진화·구매) 이번 판에 번 요력은 그대로다', () => {
  const { progress, run } = setup(500);
  progress.yoryeok += 40; // 판에서 번 요력
  const earned = earnedThisRun(progress, run);
  const before = snapshotForMaintenance(progress);
  progress.yoryeok -= 300;
  const { yoryeokDelta } = finishMaintenance(progress, run, before, 10);
  assert.equal(yoryeokDelta, -300);
  assert.equal(earnedThisRun(progress, run), earned);
});

test('정비에서 여의주를 팔아 요력이 늘어도 번 요력에 섞이지 않고 성장 카드가 바로 뜨지 않는다', () => {
  const { progress, run } = setup(500);
  progress.yoryeok += 10;
  const gauge = pauseGauge(progress, run);
  assert.equal(shouldPause(progress, run, 100), false);
  const before = snapshotForMaintenance(progress);
  progress.yoryeok += 100_000;
  finishMaintenance(progress, run, before, 100);
  assert.equal(earnedThisRun(progress, run), 10);
  assert.equal(shouldPause(progress, run, 100), false);
  assert.deepEqual(pauseGauge(progress, run).current, gauge.current, '쌓아 둔 성장 게이지는 그대로');
});

test('정비를 닫은 직후에는 성장 카드가 쿨타임 동안 뜨지 않는다(마지막 멈춤 시각을 지금으로)', () => {
  const { progress, run } = setup(500);
  run.nextPauseAt = 0; // 이미 카드가 뜰 조건
  assert.equal(shouldPause(progress, run, 100), true);
  const before = snapshotForMaintenance(progress);
  finishMaintenance(progress, run, before, 100);
  assert.equal(run.lastPauseSec, 100);
  assert.equal(shouldPause(progress, run, 101), false);
  assert.equal(shouldPause(progress, run, 106), true, '쿨타임(5초) 뒤에는 다시 뜰 수 있다');
});

test('형태·단계·등급이 바뀌었는지를 알려 준다(바뀌면 호출한 쪽이 크기를 처음으로)', () => {
  const same = setup();
  assert.equal(finishMaintenance(same.progress, same.run, snapshotForMaintenance(same.progress), 1).formChanged, false);
  for (const patch of [{ formId: 'littleSnake' }, { stage: 2 }, { grade: 'S' }]) {
    const { progress, run } = setup();
    const before = snapshotForMaintenance(progress);
    Object.assign(progress, patch);
    assert.equal(finishMaintenance(progress, run, before, 1).formChanged, true, JSON.stringify(patch));
  }
});

test('요력만 바뀌고 형태가 같으면 formChanged는 false다(강화만 한 경우)', () => {
  const { progress, run } = setup();
  const before = snapshotForMaintenance(progress);
  progress.yoryeok -= 50;
  progress.enh.speed += 1;
  assert.equal(finishMaintenance(progress, run, before, 1).formChanged, false);
});

test('기준 잔액이 비어 있는 run(옛 방식)도 안전하게 처리한다', () => {
  const { progress } = setup(500);
  const run = {};
  const before = snapshotForMaintenance(progress);
  progress.yoryeok -= 100;
  finishMaintenance(progress, run, before, 5);
  assert.equal(run.baseYoryeok, 400);
  assert.equal(earnedThisRun(progress, run), 0);
});

test('정비를 여러 번 열고 닫아도 번 요력이 어긋나지 않는다', () => {
  const { progress, run } = setup(1000);
  let earned = 0;
  for (let i = 0; i < 20; i++) {
    progress.yoryeok += 7; // 판에서 번다
    earned += 7;
    const before = snapshotForMaintenance(progress);
    progress.yoryeok += i % 2 ? -123 : 456; // 정비에서 쓰거나 번다
    finishMaintenance(progress, run, before, i);
    assert.equal(earnedThisRun(progress, run), earned);
  }
});
