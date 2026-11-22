저장소: C:/Users/SG/Desktop/새 폴더 (2)/yokai-game. docs/spec.md, docs/plan.md(특히 맨 아래 '변경 이력')를 먼저 읽고 관련 코드를 파악하라.
다른 Sonnet 에이전트 2명이 동시에 다른 부분을 고치고 있다. 아래 '고쳐도 되는 파일'만 고쳐라. **src/scenes/PlayScene.js는 절대 고치지 마라**(Opus가 마지막에 연결한다). PlayScene에서 바뀌어야 할 호출이 있으면 보고에 정확한 코드로 적어라.
src/config.js는 지정된 섹션만, 작은 Edit로 고친다(동시 수정 충돌 시 다시 읽고 재시도).
원칙: 수치는 설정값에 둔다. 확률·결과를 먼저 정하고 연출은 보여주기만 한다. 휴대폰 60fps.
끝나면 node --test "tests/*.test.mjs" 전부 통과 확인, 모든 src 모듈 node --check. git commit 금지. 바꾼 파일·새 API·PlayScene에 필요한 변경·한계를 한국어로 짧게 보고.

담당 A: 조작(화면 아무 곳 터치 → 그 방향 이동, 반응 10ms)
고쳐도 되는 파일: src/game/joystick.js, src/game/camera.js, src/config.js의 input·camera 섹션, index.html의 .help 안내 문구와 #joystick 요소, src/style.css의 조이스틱·안내 관련 규칙.
- 지금은 왼쪽 화면을 끌어야 하는 플로팅 조이스틱이다. 바꿀 것: 화면(게임 영역) 어디든 누르고 있으면, 캐릭터의 화면 위치에서 손가락 위치를 향하는 방향으로 이동. 손가락을 움직이면 즉시 방향이 바뀐다.
- API: class Joystick(arena, { exclude }) 유지, direction(playerClient) → {x, y} (크기 0~1). playerClient = 캐릭터의 화면(client) 좌표 {x, y}. 거리가 deadZonePx 안이면 0, fullSpeedPx 이상이면 1, 그 사이 비례(config).
- camera.js에 export function worldToClient(scene, x, y) 추가: 캔버스의 getBoundingClientRect, 카메라 scroll·zoom, 캔버스 해상도와 CSS 크기 비율(고해상도 처리)까지 반영해 월드 좌표 → client 좌표.
- 반응: config.input.responseMs = 10. 방향 변화는 10ms 시간상수로만 섞어(사실상 즉시) 떨림만 막는다. pointer 이벤트(pointerdown/move/up/cancel, setPointerCapture)로 최신 위치를 바로 저장. 카메라 추적 smoothRate를 크게 올려(예 16) 캐릭터가 화면 중앙에 붙어 있게.
- 멀티터치: 발사 버튼(.fire 계열 요소, src/game/fireButton.js 참고)·HUD·미니맵·대화상자에서 시작한 포인터는 이동에 쓰지 않는다. 이동 손가락을 누른 채 다른 손가락으로 발사 가능해야 한다.
- 누른 곳에 작은 표시(기존 #joystick 요소 재사용, 반투명 원)를 보여준다.
- 키보드 WASD/방향키 유지. 안내 문구: '화면을 눌러 그 방향으로 이동 · 오른쪽 버튼 발사'.