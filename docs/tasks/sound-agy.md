저장소: C:/Users/SG/Desktop/새 폴더 (2)/yokai-game. 너는 사운드 담당(Antigravity)이다. docs/spec.md와 docs/plan.md를 먼저 읽어라.
다른 에이전트가 동시에 src/scenes, src/game, src/ui, src/state 파일을 고치고 있다. 아래 지정 파일만 새로 만든다. git commit 금지.

담당 파일(새로 만들기만): src/audio/sfx.js, src/audio/README.md, tests/sfx.test.mjs

목표: 그림 파일이 없는 것처럼 소리 파일도 없이 Web Audio API로 실시간 합성하는 귀엽고 가벼운 효과음 모음.
- export function createSfx({ context } = {}) → { play(name, opts), setMuted(bool), isMuted(), unlock() }
  - 휴대폰은 첫 터치 전에는 소리가 막히므로 unlock()은 첫 pointerdown에서 AudioContext.resume().
  - context 주입 가능. AudioContext가 없는 환경(node)에서는 무음 객체 반환(에러 금지).
  - 음소거 상태는 localStorage 'yokai-proto-mute'에 저장(없으면 무시).
  - 같은 이름은 50ms 안에 다시 울리지 않게, 전체 음량 0.35 이하.
- 효과음 이름(0.05~0.6초, 동양 설화 분위기: 5음계, 딱따기·방울·피리 느낌을 오실레이터+노이즈+엔벌로프로):
  eat(opts.size: 클수록 낮게), eatBig, fire, hit, reversal(짧은 상승 아르페지오), defeat, death(하강), drop(방울), ui,
  enhanceSuccess, enhanceGreat, enhanceFail, degrade, treasureBreak, sell(엽전), evolveReveal(맑은 종), gradeHigh(반짝임).
- 원칙 5: 소리는 이미 정해진 결과만 알린다. 결과 전 긴장 소리·드럼롤 금지.
- README.md: 각 이름이 언제 울려야 하는지 표(호출 위치는 Opus가 연결).
- tests/sfx.test.mjs: node에서 무음 객체·모든 이름 play 무에러, 가짜 AudioContext 주입 시 오실레이터 생성 확인. node --test "tests/*.test.mjs" 전부 통과.
중간에 멈추거나 질문하지 말고 끝까지 하라. 끝나면 만든 파일과 테스트 결과를 한국어로 짧게 보고.