저장소 C:/Users/SG/Desktop/새 폴더 (2)/yokai-game. 독립 리뷰어(Opus)가 아래 문제를 지적했다. 각 지적을 코드로 확인하고 타당하면 최소 범위로 고쳐라. 관련 없는 변경 금지, git commit 금지. 고친 뒤 node --test "tests/*.test.mjs" 통과를 확인하고, save.js 변경에는 테스트를 추가하라. 1번은 같은 씬을 restart해도 리스너가 한 번만 붙는지 확인하라(PlayScene.create에서 attachSession 호출 경로 포함). 끝나면 지적 번호별로 고침/안 고침(이유)을 한국어로 짧게 보고.

1. [major] src/game/session.js:22
문제: attachSession이 create()마다 scene.events.on('eat', …)를 등록하고 해제하지 않는다. HubView의 onPlay가 scene.restart({progress})로 같은 씬 객체를 재시작하는데, Phaser 3는 씬을 shutdown해도 scene.events 리스너를 지우지 않는 것으로 알고 있다(3.90.0 소스에서 직접 확인하지는 않음). 따라서 두 번째 판부터는 한 마리를 먹을 때마다 recordEat, 요력 지급, 여의주 드롭 추첨이 판 수만큼 반복된다. 예를 들어 3번째 판에서는 요력과 식성이 3배로 쌓이고 드롭 확률도 크게 오른다.
수정: 핸들러를 변수에 담고 scene.events.once('shutdown', () => scene.events.off('eat', handler))로 해제한다. 또는 PlayScene.create 첫머리에서 this.events.off('eat')를 호출한다.

2. [major] src/state/save.js:10
문제: normalizeProgress가 pendingDegrade와 pendingDevolve를 복사하지 않는다. HubView는 퇴화가 나오면 pendingDegrade가 든 상태를 저장하고, B를 고르면 pendingDevolve=true인 상태를 저장한다. 이 상태에서 새로 고침하면 두 필드가 사라진다. 그래서 A/B 선택 없이 강화 수치를 그대로 유지하거나 역진화를 건너뛸 수 있고, 기획 7절의 퇴화 벌칙이 무력해진다.
수정: normalizeProgress에서 두 필드를 검증해 보존한다. pendingDegrade는 ENHANCE.stats에 있는 문자열일 때, pendingDevolve는 true이고 stage>1일 때만 받아 준다.

3. [minor] src/state/save.js:12
문제: formId는 문자열인지만 검사하고 실제 형태 목록에 있는지, stage와 맞는지는 검증하지 않는다. 손상되거나 조작된 저장값에 없는 id가 들어오면 drawCreature에서 form.branch를 읽다가 TypeError가 나서 게임이 시작되지 않는다.
수정: FORM_BY_ID나 주입받은 forms로 존재 여부와 stage 일치를 검사하고, 맞지 않으면 기본값(mimul, 1단계)으로 되돌린다.

4. [minor] src/scenes/PlayScene.js:60
문제: ?debug=hub와 ?debug=evolve는 주석에 '저장하지 않는 시험용 요력 지급'이라고 적혀 있다. 하지만 openHub가 실제 saveProgress를 쓰고 attachSession도 먹을 때마다 저장하므로, 요력 5000과 +9 여의주가 실제 저장에 남는다.
수정: 디버그 모드에서는 structuredClone으로 만든 복사본 progress를 쓰고, save를 아무것도 하지 않는 함수로 바꾸고 세션 저장도 막는다.