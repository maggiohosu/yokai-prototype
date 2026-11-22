// 판 중 [정비](PlayScene.openMaintenance)의 순수 규칙. Phaser·DOM 의존이 없다.
// 정비 화면에서는 강화·진화·여의주·상점으로 요력이 늘고 줄 수 있는데, 판 안 성장 카드가 쓰는 '이번 판에 번 요력'
// (levelup.earnedThisRun = 잔액 - 판 시작 잔액 + 쓴 요력)에는 섞이지 않아야 한다. 그래서 닫을 때 기준 잔액을 같은 만큼 옮긴다.

// 정비를 열기 직전의 값을 적어 둔다. 닫을 때 무엇이 바뀌었는지 비교한다.
export function snapshotForMaintenance(progress) {
  return { formId: progress.formId, stage: progress.stage, grade: progress.grade, yoryeok: progress.yoryeok };
}

// 정비를 닫을 때 부른다. run은 levelup.createRunLevel()이 만든 판 상태.
// - 판에 번 요력은 그대로 두려고 run.baseYoryeok에 잔액 변화를 더한다.
// - 닫자마자 성장 카드가 뜨지 않도록 마지막 멈춤 시각을 지금으로 한다(쌓아 둔 성장 게이지는 지우지 않는다).
// 반환 { formChanged, yoryeokDelta }: formChanged면 호출한 쪽이 applyForm()으로 크기를 처음으로 되돌린다.
export function finishMaintenance(progress, run, before, nowSec) {
  const yoryeokDelta = progress.yoryeok - before.yoryeok;
  run.baseYoryeok = (run.baseYoryeok ?? before.yoryeok) + yoryeokDelta;
  run.lastPauseSec = nowSec;
  const formChanged = progress.formId !== before.formId || progress.stage !== before.stage || progress.grade !== before.grade;
  return { formChanged, yoryeokDelta };
}
