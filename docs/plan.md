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
