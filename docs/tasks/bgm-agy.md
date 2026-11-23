# 상황별 BGM 지시서 (Antigravity 작업자 ctx_340da2e2638c, 2026-11-23)

조정자가 Orca 작업자에게 보낸 지시 원문이다. 이 파일만 기준으로 삼는다.

작업 폴더(절대 경로): C:/Users/SG/Desktop/새 폴더 (2)/yokai-game (현재 HEAD 4182ded)
너는 배경음악(BGM) 전담이다. 작곡·합성·게임 연결까지 네가 맡고, 검수는 Claude 조정자가 한다. 보고는 한국어. git commit 금지. 질문 없이 추천안으로 정해 진행하고 근거를 보고에 적어라.
먼저 읽어라: C:/Users/SG/.codex/skills/audio-design/SKILL.md(+references: 버스·데시벨 볼륨·적응형 음악·덕킹), phaser-core/SKILL.md, assets/sfx/README.md·generate_sfx.py(효과음을 같은 방식으로 만들었다), src/audio/sfx.js.

사용자 지시(2026-11-23): "상황별 긴급하거나 여유로운 bgm을 만들어서 넣어 bgm은 안티그라비티가 전담하고 검수만 클로드가해"

동시 작업 주의: Codex 작업자가 지금 맵 크기(변경 이력 11)를 바꾸고 있다(src/config.js world, worldScale.js, PlayScene.js 일부, docs/plan.md, docs/perf-v1.md). 남의 수정을 되돌리지 말고, PlayScene.js에는 음악 연결 몇 줄만 넣어라. 너의 문서는 docs/plan.md '변경 이력 12'로 적는다.

1) 음원(외부 음원·샘플·기존 곡 금지, Python DSP로 100% 직접 합성): assets/bgm/generate_bgm.py, 결과 assets/bgm/*.ogg·*.mp3(wav는 커밋하지 않는다), assets/bgm/README.md(곡별 분위기·BPM·조성·길이·크기·라이선스=자작).
 분위기: 동양 설화(산해경·선협) 풍, 귀엽고 가벼운 톤. 5음계. 악기 느낌은 가야금·고쟁 뜯는 소리, 대금·디즈 같은 피리, 편종·풍경, 북·장구.
 곡(제안, 바꿔도 되지만 근거를 적어라):
  - calm(여유): 탐색·먹기, 70~85 BPM, 맑고 느긋함.
  - tense(긴급): 나보다 큰 적이 가까이 있거나 생명력이 줄어드는 중, 120~140 BPM, 빠른 북·짧은 피리 리듬. calm과 같은 조성과 템포 비율(가능하면 같은 마디 길이의 배수)로 맞춰 바꿀 때 어색하지 않게.
  - boss(대요괴): herald(대요괴) 출현 중, 묵직한 북과 징.
  - title(선택): 타이틀·도감·결과 화면용 짧은 고리.
 각 곡은 끊김 없는 고리(마디 경계에서 정확히 이어지게, 이음매 클릭 없음), 32~64초, 피크 ≤ -1 dBFS, 효과음보다 작게 들리게 음량 기준(LUFS 근사)을 맞추고 README에 적어라. 크기는 곡당 OGG·MP3 각 ≤ 600KB, 전체 ≤ 3MB(모바일). iOS를 위해 MP3를 꼭 함께 만든다(ffmpeg 있음).
2) 재생 모듈 src/audio/bgm.js: sfx.js와 같은 AudioContext를 쓴다(휴대폰은 컨텍스트 수 제한·첫 터치 잠금이 있다. sfx.js에 컨텍스트·마스터를 공유하는 작은 export를 더하는 건 허락). 음악 전용 gain(버스). 곡 전환은 크로스페이드(긴급으로는 빠르게 약 0.6초, 여유로는 천천히 약 2.5초). 탭 숨김·화면 회전 처리 시 일시정지/재개(부스터 반복음 처리 방식 참고), 첫 사용자 입력 전에는 소리를 내지 않는다. 파일이 없거나 해독 실패면 조용히 넘어간다. 음악 음량은 새 저장 키 'yokai-bgm-volume'(기본 0.5, 기존 저장 키·SAVE.version 1은 바꾸지 말 것). 진화·강화 선택지, 일시정지 패널이 떠 있을 때는 음악을 줄인다(덕킹, 약 -8dB).
3) 상황 판정: 순수 함수(Phaser 의존 없음, 예: src/systems/musicMood.js)로 상황을 calm/tense/boss 중 하나로 정한다. 입력 예: 화면 근처(시야 반경 안) 나보다 큰 적의 가장 가까운 거리와 수, 생명력 소모 중인지, 대요괴 생존 여부, 최근 피격. 깜빡임 방지를 위한 이력 현상(hysteresis): 긴급 진입은 즉시, 여유 복귀는 위험이 사라지고 약 4초 뒤. 이 판정을 매 프레임이 아니라 0.25초 정도마다 하고, 성능 예산(5단계 852마리 시뮬레이션 ≤ 6ms)을 해치지 않게 이미 있는 격자·근처 적 정보를 재사용하라.
4) 화면별: 타이틀·도감·결과 화면은 title(또는 calm 작은 음량), 판 시작은 calm, 게임 오버 때 음악 페이드아웃. 이지·노말·하드 모두 같은 규칙.
5) 음악 켜고 끄기: 타이틀 화면이나 일시정지(정비) 화면에 작은 음악 켜기/끄기 단추 하나(44px 이상 터치 영역, 기존 UI 톤에 맞춤). 상태는 'yokai-bgm-volume' 0/0.5로 저장.
6) 테스트: tests/bgm.test.mjs(상황 판정·이력 현상·전환 시간·음량 저장·파일 없음 처리, sfx.test 방식의 가짜 AudioContext). node --test "tests/*.test.mjs" 전부 통과, node --check. 헤드리스 Chrome으로 ?debug=music(또는 ?perf=1 로그)에서 상황 전환이 로그로 찍히는지 확인하고 결과를 보고에 적어라. perf-field 여섯 장면이 기존 목표(평균 ≤ 18ms, p95 ≤ 25ms, 시뮬레이션 ≤ 6ms)를 그대로 지키는지 다시 재라.
허락 파일: assets/bgm/**, src/audio/bgm.js, src/audio/sfx.js(컨텍스트 공유 export만), src/systems/musicMood.js(새), src/scenes/PlayScene.js(연결 몇 줄), 타이틀·정비·결과 화면 UI 파일(단추 하나), src/main.js(필요하면), tests/bgm.test.mjs, docs/plan.md(변경 이력 12).
끝나면 worker_done으로 요약 보고(곡 목록·길이·크기·음량, 판정 규칙, 테스트·성능 결과).

## 추가 지시 (2026-11-23, 생명력 규칙 변경)

조정자 알림: 사용자가 생명력 규칙을 바꿨다. 생명력은 이제 방어가 아니라 '살아 있는 시간'이다(5초 동안 못 먹으면 줄고, 0이면 크기가 줄며 속도가 빨라진다). 다른 Codex 작업자가 굶주림 상태를 PlayScene에서 읽을 수 있게 노출한다(예: this.hunger.state = grace/draining/starving, 이름은 그 작업자 보고 후 확정). 긴급 음악 판정 입력의 '생명력 소모 중'은 이 굶주림 상태(draining·starving)로 바꿔라. 아직 없으면 판정 함수에 입력 칸만 두고 PlayScene 연결은 옵셔널 체이닝으로 해 두어라. 맵 작업자가 world.size를 2000으로 줄이고 있다. 남의 수정은 되돌리지 마라.
