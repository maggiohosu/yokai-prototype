# 요괴 키우기 시제품 — 설계 (Opus 작성, 2026-11-22)

## 역할
- 계획·점검·검수·조사: Claude Opus 5.5
- 코딩: Codex(GPT)와 Antigravity가 단계별로 번갈아 맡음 / Sonnet 5.5: 작은 수정, 데이터(진화표·설명문)
- 단계별로 GitHub Pages에 게시함

## 기술
- 정적 사이트(빌드 없음). index.html + ES 모듈(src/*.js). Phaser 3.90을 jsDelivr CDN에서 불러옴.
- 세로 화면 고정, Phaser.Scale.RESIZE, 터치 입력, devicePixelRatio 대응.
- 캐릭터: Phaser Graphics로 부품을 그린 뒤 generateTexture로 구워 씀(형태+등급별 캐시).

## 파일 구조
- index.html — 캔버스, 메타 viewport, 모듈 진입
- src/config.js — **모든 수치**(확률·비용·속도·크기·줌·쿨타임·AI 거리·구역 색 비율)
- src/data/forms.js — 형태 17종: id, 이름, 단계, 방위(east/west/south/north/none), 갈래(yo/seon/none), 부품 목록, 한 줄 설명, 진화 경로
- src/art/creature.js — drawCreature(scene, formId, opts) → texture key. 부품 함수 모음
- src/game/ — world.js(맵·구역·스폰), player.js, enemy.js(AI 3규칙), joystick.js, camera.js
- src/scenes/ — PlayScene, (3단계) EvolveScene, (4단계) HubScene
- src/state/ — (3단계) progress.js, (5단계) save.js(localStorage)

## 수치 초안(설정값에 둠, 기획서에 없던 것)
- 진화 비용: 2단계 100 요력, 3단계 400 요력
- 요력 획득: 먹은 요괴 크기 × 1(반올림), 보물로 쓰러뜨리면 ×1.5
- 등급 보정: 본체 강화 레벨 합계 1당 F·E·D 확률에서 0.5%p를 빼서 S+:S:A:B = 1:2:3:4 비율로 더함(최대 합계 30)
- 퇴화 비율 구간: +1~4 0%, +5~6 30%, +7~8 40%, +9~10 50%
- 판 안 레벨업 카드 주기는 다음 버전(15~20초)

## 단계
1. 이동·먹기·크기 판정·적 AI·카메라 줌아웃
2. 발사 버튼·여의주·자동 조준·깎기·역전 표시
3. 요력·식성·성향·1~3단계 진화(3택·등급)
4. 판 사이 화면: 본체 강화(퇴화 A/B), 여의주 강화·판매
5. 저장(localStorage)


## 변경 이력 (사용자 지시, 2026-11-22 밤)
- 초반(플레이어가 작을 때) 나보다 큰 적이 훨씬 많이 나오게. 커질수록 기존 분포로 돌아감.
- 발사체: 처음엔 이동 방향으로만 발사(자동 조준 없음). 보물(여의주·보패) 강화 레벨에 따라 발사 수·방향 수·속도·파워 증가, +8부터 약한 유도.
- 먹히면 즉시 판 종료 → 결과 창에 [다음 판 시작](주) / [강화·진화](보조).
- 조작: 화면 어디를 눌러도 캐릭터 기준 그 방향으로 이동(조이스틱 대체), 반응 10ms(지연·완충 제거) → 20ms로 조정(사용자 지시, 2026-11-23), 발사 버튼은 계속 사용.

### 보물 레벨 표(초안, src/systems/tuning-upgrade.js)
| 레벨 | 방향 수 | 방향당 발사 | 속도 | 파워 | 유도 |
|---|---|---|---|---|---|
| 0 | 1 | 1 | ×1.00 | ×1.00 | 0 |
| 1 | 1 | 1 | ×1.08 | ×1.15 | 0 |
| 2 | 1 | 2 | ×1.12 | ×1.25 | 0 |
| 3 | 2 | 2 | ×1.16 | ×1.35 | 0 |
| 4 | 2 | 2 | ×1.20 | ×1.50 | 0 |
| 5 | 3 | 2 | ×1.25 | ×1.65 | 0 |
| 6 | 4 | 2 | ×1.30 | ×1.80 | 0 |
| 7 | 4 | 3 | ×1.35 | ×2.00 | 0 |
| 8 | 4 | 3 | ×1.40 | ×2.20 | 0.3 |
| 9 | 6 | 3 | ×1.45 | ×2.40 | 0.4 |
| 10 | 6 | 3 | ×1.50 | ×2.70 | 0.5 |
| 11 | 8 | 3 | ×1.55 | ×3.00 | 0.6 |
| 12 | 8 | 3 | ×1.60 | ×3.30 | 0.7 |
| 13 | 8 | 4 | ×1.65 | ×3.70 | 0.8 |
| 14 | 8 | 4 | ×1.70 | ×4.10 | 0.9 |
| 15 | 8 | 5 | ×1.80 | ×4.60 | 1.0 |
- 템포 3배(사용자 지시): config.tempo=3. 이동·적 AI·발사체·쿨타임 등 시뮬레이션 전체에 곱한다(연출·카메라는 제외). 빠른 물체가 서로 통과하지 않게 프레임을 작은 단계로 나눠 계산.
- 적도 자기보다 작은 적을 쫓아가 먹고, 큰 상대에게서 도망. 3단계 적 일부는 '특수 적'(붉은 점선 고리)으로 플레이어에게 구슬을 쏜다(맞으면 크기 감소, 일정 크기 아래면 판 종료).

방향 수 n은 이동 방향을 기준으로 360/n 간격(2=앞뒤, 4=십자, 8=사방팔방). 방향당 발사는 그 방향으로 나란히 나가는 구슬 수.


## 변경 이력 2 (사용자 결정, 2026-11-22 밤)
- 적도 플레이어와 같은 구조: 먹어서 커지고(면적), 요력이 쌓이면 스스로 진화(크기 초기화, 식성 1위 방위로 형태 결정, 등급 굴림)·몸집 강화.
- 판 안 진화·강화: 요력(화폐 하나 유지)이 다음 선택지 비용에 닿으면 게임이 잠깐 멈추고 3장 중 선택 — [진화](3단계 미만, 크기는 초기로) / [몸집 강화](확정, 크기 ×1.2, 판마다 초기화) / [능력 강화](성장·속도·효과 중 하나, 기존 성공률·대성공·퇴화 A/B 규칙) / [계속하기].
- 진화한 모습은 판이 끝나도 유지(다음 판은 그 모습, 크기만 초기).
- 먹기 규칙: 같은 단계 = 1.1배 이상 큰 쪽. 다른 단계 = 상위가 먹음, 단 하위가 상위의 2배 이상 크면 하위가 먹음. 보물로 깎아 쓰러뜨리기는 단계 무관.
- 점수(요력) = 크기^1.6 × 단계 배율(1·4·16) × 등급 배율 × 보물 처치 1.5 × 특수 적 8. 크고 높은 단계 하나 > 작고 낮은 단계 여러 개.
- 1단계 적: 방위 색 미물(디자인: Codex).

### 공유 API 계약
- src/systems/rules.js: stageOf(actor), canEat(a, b, { reversed }), eatPair(a, b, opts) → [먹는 쪽, 먹히는 쪽] | null(겹침 포함), preyValue({ size, stage, grade, special, killedByTreasure }) → 정수 요력.
- src/systems/levelup.js: createRunLevel(), pauseOptions(progress, run), shouldPause(progress, run, nowSec), afterPause(progress, run, nowSec), applyBody(progress, run) → { cost, mult }, bodyCost(n).
- src/ui/LevelUpView.js: LevelUpView(progress, forms, run, { getFormImage, save, onEvolve, onBody, onAbility, onResume }).
- src/art/creature.js: drawCreature(scene, 'mimul', { dir }) → 방위 색 미물 텍스처 키. src/art/marks.js: drawStageMark(g, actor, playerStage, t).
- src/game/hud.js: hud.setGauge(current, target, label).
