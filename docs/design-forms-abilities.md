# 형태 170종·진화 줄기 16개·여의주 능력 16종 설계

- 작성: 계획 담당 Opus (2026-11-23). 코드는 고치지 않았다. 이 문서만 새로 만들었다.
- 읽은 자료: `docs/spec.md`, `docs/plan.md`(변경 이력 3까지), `docs/research-bestiary.md`, `docs/research/upgrade-options.md`, `docs/research/art-direction.md`, `src/data/forms.js`, `src/systems/{evolution,rules,levelup,tuning-evolution,tuning-upgrade,progress}.js`, `src/game/{combat,enemy,enemyAI,session,world}.js`, `src/state/save.js`, `src/art/creature.js`, `src/scenes/{PlayScene,GalleryScene}.js`, `src/config.js`.
- 전제: S4 작업(빠른 성장 카드 3장, 좌하단 스틱, 속도 곡선 1/3배→1.5배, 생명력)이 끝난 코드다. 지금 작업 트리의 `config.pace`, `session.paceMultiplier`, `levelup.allQuickCards`, `vitality` 기준으로 썼다.
- 사용자 확정 사항(이 문서가 바꾸지 않음): 진화 5단계, 형태 170종(1단계 8 / 2단계 24 / 3단계 60 / 4단계 50 / 5단계 28), 줄기 16개(방위마다 4개)마다 서로 다른 여의주 능력, 같은 줄기 안에서 단계가 오를수록 강해짐, 상위 단계 적에게 상태이상 지속이 단계 차이당 절반, 매혹된 적은 잠시 내 편이 되어 사냥하고 그 요력은 내 것, 여의주 강화 레벨은 피해·발사 수와 능력 수치를 함께 올림, 강화 부가 옵션 약 30종(수치만), 판 안 카드 3장, 속도 곡선, 생명력, 플레이어 전용 부스터(배율 = 1.3 × 줄기 보정 + 이동 속도 강화 레벨 × 0.02).

## 0. 요약

1. **줄기 16개**: research-bestiary 5절의 계통 초안을 바탕으로 방위마다 4개를 만들었다. 기존 17종은 id를 그대로 두고 줄기에 넣었다(기존 2단계 4종은 방위별 첫째 줄기의 입구).
2. **형태 = 170종 + 시작 형태 `mimul` 1개 = 데이터 171행.** `mimul`은 저장 호환과 시작 형태라서 남기고, 1단계 8종은 방위별 미물 2종이다(적 1단계·역진화 대상).
3. **진화 3택**: ① 식성·성향 1위 ② 지금 줄기 유지(①이 이미 지금 줄기면 다른 줄기 1위) ③ 미지. ①과 ②는 항상 줄기가 달라서 3택이 늘 "능력을 바꿀지"를 묻는다.
4. **능력 16종**은 모두 구슬이 맞을 때나 날아가는 동안 생기는 효과다. 시간 값은 화면 시간(초)으로 정하고, 상위 단계 적에게는 `0.5^(단계 차)`로 약해진다. 적은 능력을 쓰지 않는다(권장).
5. **4·5단계 수치**: 진화 비용 2,000 / 8,000, 점수 단계 배율 ×48 / ×128, 판 안 진화 카드 상한 5단계, 적 자가 진화는 플레이어 단계 +1까지.
6. **구현은 세 갈래**: T1 데이터·규칙(Sonnet) → T2 부품·발사체 그림(Codex)과 T3 능력 시스템(Sonnet)을 나란히 → T4 통합 검수(Opus).

---

## 1. 줄기 16개

### 1-1. 줄기 사다리 (단계마다 입구 형태 1개, 괄호는 같은 단계의 형제 수)

입구(★)는 그 줄기의 대표 형태다. 다른 줄기에서 건너올 때는 입구로 들어온다(3절).

| 줄기 | 방위 | 줄기 이름 | 1단계 | 2단계 | 3단계 | 4단계 | 5단계 |
|---|---|---|---|---|---|---|---|
| E1 | east | 청룡 줄기(뱀·용) | `hwalsa` 활사 活師 | `littleSnake` 새끼 뱀 (+1) | `imugi` 이무기 螭 (+2) | `gyuryong` 규룡 虯龍 (+2) | `cheongnyong` 청룡 青龍 (+1) |
| E2 | east | 구미호 줄기(여우) | — | `juyu` 주유 朱獳 (+1) | `hillFox` 청구 여우 青丘狐 (+3) | `gumiho` 구미호 九尾狐 (+2) | `cheonho` 천호 天狐 |
| E3 | east | 선학 줄기(학·신선) | — | `danggang` 당강 當康 | `crane` 청학 青鶴 (+3) | `seonhak` 선학 仙鶴 (+2) | `dongwanggong` 동왕공 東王公 (+1) |
| E4 | east | 거오 줄기(거북·바다) | `jubyeoreo` 주별어 珠蟞魚 | `dongdong` 동동 狪狪 | `hyugwi` 휴귀 蠵龜 (+3) | `geoo` 거오 巨鼇 (+2) | `donghaeyongwang` 동해용왕 東海龍王 (+1) |
| W1 | west | 백호 줄기(범·맹수) | — | `littleTiger` 새끼 범 (+1) | `skyHound` 천구 天狗 (+2) | `bak` 박 駮 (+2) | `baekho` 백호 白虎 (+1) |
| W2 | west | 해치 줄기(사자·정의) | — | `gyebyeon` 계변 谿邊 | `gyo` 교 狡 (+2) | `haechi` 해치 獬豸 (+3) | `yoksu` 욕수 蓐收 |
| W3 | west | 서왕모 줄기(새·곤륜) | `namo` 나모 蠃母 | `gyeomyang` 겸양 羬羊 | `whiteDeer` 백록 白鹿 (+3) | `yugo` 육오 陸吾 (+2) | `seowangmo` 서왕모 西王母 (+1) |
| W4 | west | 흉수 줄기 | `mokchung` 목충 木蟲 | `hyo` 효 嚻 (+1) | `boYi` 박이 猼訑 (+4) | `hyeongcheon` 형천 刑天 (+2) | `gunggi` 궁기 窮奇 (+1) |
| S1 | south | 주작 줄기(새·불) | — | `littleBird` 새끼 새 (+1) | `biFang` 필방 畢方 (+3) | `wonchu` 원추 鵷鶵 (+2) | `jujak` 주작 朱雀 (+2) |
| S2 | south | 도깨비 줄기 | `yeok` 역 蜮 | `iryeok` 이력 貍力 | `dokkaebi` 도깨비 (+3) | `imae` 이매 魑魅 (+1) | `yeomje` 염제 炎帝 |
| S3 | south | 선동 줄기(신선) | — | `seongseong` 성성 狌狌 (+1) | `attendant` 선동 仙童 (+2) | `jeoksongja` 적송자 赤松子 (+3) | `namgeukseonong` 남극선옹 南極仙翁 (+1) |
| S4 | south | 축융 줄기(가뭄·불뱀) | `bokchung` 복충 蝮虫 | `hogyo` 호교 虎蛟 | `myeongsa` 명사 鳴蛇 (+3) | `pasa` 파사 巴蛇 (+2) | `chugyung` 축융 祝融 |
| N1 | north | 현무 줄기(거북·물) | — | `littleTurtle` 새끼 거북 (+1) | `darkTurtle` 현구 玄龜 (+2) | `bihui` 비희 贔屭 (+2) | `hyeonmu` 현무 玄武 (+2) |
| N2 | north | 도철 줄기(어둠·식인) | `bijil` 비질 蜚蛭 | `jokja` 족자 足訾 | `dueoksini` 두억시니 (+3) | `pohyo` 포효 狍鴞 (+2) | `docheol` 도철 饕餮 |
| N3 | north | 촉룡 줄기(뱀·물귀신) | — | `yueon` 유언 幽鴳 | `waterSpirit` 수귀 水鬼 (+3) | `sangnyu` 상류 相柳 (+2) | `chongnyong` 촉룡 燭龍 |
| N4 | north | 붕 줄기(물고기·큰 새) | `jua` 주아 朱蛾 | `iseo` 이서 耳鼠 (+1) | `jeongwi` 정위 精衛 (+3) | `gon` 곤 鯤 (+3) | `bung` 붕 鵬 (+1) |

### 1-2. 줄기별 능력·발사체·부스터·곁줄기

- 발사체 색은 art-direction 4장 팔레트만 쓴다. 등급 고리 색(분홍 `#FF6FD8`, 보라 `#A46BFF`, 파랑 `#4A9DFF`, 금 `#FFC53D`)과 특수 적 구슬 색(`#C2185B`·`#FFB3DD`·`#7B1FA2`)은 쓰지 않는다. 금은 `#EFBD6C`에 먹 외곽선을 둘러서만 쓴다.
- `boostMult`는 부스터 배율 `1.3 × boostMult + 이동 속도 강화 레벨 × 0.02`의 줄기 보정이다. 범위는 0.9~1.2이고, `mimul`은 1.0이다.
- 곁줄기는 같은 방위에서 진화로 건너갈 수 있는 다른 줄기 2개다(3-1). 방위별 첫째 줄기(E1·W1·S1·N1)의 곁줄기는 기존 `next`를 보존하도록 골랐다.

| 줄기 | 능력 id | 능력 이름 | 능력 한 줄 | 발사체 모양 | 주색 / 보조색 / 꼬리색 | boostMult | 부스터 근거 | 곁줄기 |
|---|---|---|---|---|---|---:|---|---|
| E1 | `chain` | 뇌쇄 雷鎖 | 맞은 적에서 가까운 적으로 번개가 몇 번 튄다 | 번개 마름모 + 지그재그 꼬리 | `#4C8DB8` / `#D2EFC8` / `#439483` | 1.05 | 구름 타는 용이지만 뱀 몸이라 조금만 빠름 | E2, E3 |
| E2 | `charm` | 매혹 魅惑 | 맞은 적이 잠시 내 편이 되어 다른 요괴를 사냥한다 | 여우불 물방울 + 세 갈래 꼬리 | `#85CFB7` / `#2D6B5E` / `#D2EFC8` | 1.10 | 여우는 날쌔다 | E3, E4 |
| E3 | `homing` | 학익 추적 鶴翼 | 구슬이 사방에서 적을 찾아 끝까지 쫓아간다 | 흰 깃털 화살 | `#FFFDF1` / `#439483` / `#D2EFC8` | 1.15 | 학은 날개로 난다 | E1, E4 |
| E4 | `orbit` | 호신주 護身珠 | 진주 구슬이 내 몸 둘레를 돌며 닿는 적을 치고 적 구슬을 막는다 | 진주 원 + 옥 고리 | `#DCEFE0` / `#7CC4A4` / `#3F8F72` | 0.90 | 거북·자라는 느리다 | E1, E2 |
| W1 | `pierce` | 관통 貫通 | 구슬이 적을 꿰뚫고 다음 적까지 날아간다 | 발톱 초승달 | `#FFF7DF` / `#8C7A58` / `#BFCBCF` | 1.20 | 범은 맹수 중 가장 빠르게 덮친다 | W3, W4 |
| W2 | `mark` | 파사인 破邪印 | 맞은 적에 표식: 받는 피해가 늘고 다른 요괴의 먹잇감이 된다 | 뿔 삼각 화살 + 금 점 | `#BFCBCF` / `#EFBD6C` / `#B69D76` | 1.00 | 위엄 있게 걷는 신수, 보통 | W1, W4 |
| W3 | `boomerang` | 회선 回旋 | 구슬이 맞거나 끝까지 가면 되돌아오며 길 위 적을 한 번 더 친다 | 갈매기 모양(V) | `#B69D76` / `#7CC4A4` / `#FFF7DF` | 1.10 | 심부름 새·사슴은 가볍다 | W1, W2 |
| W4 | `fear` | 위협 威嚇 | 맞은 적이 겁먹고 나에게서 도망치며, 그동안 나를 먹지 못한다 | 가시 톱니 별(6점) | `#8C7A58` / `#C45148` / `#B69D76` | 0.95 | 양·돼지 몸 흉수는 무겁다 | W2, W3 |
| S1 | `burn` | 작열 灼熱 | 맞은 적이 잠시 불타며 계속 깎인다 | 불꽃 혜성 | `#D9503F` / `#FFD3A2` / `#C06558` | 1.20 | 불새는 바람보다 빠르다 | S2, S3 |
| S2 | `split` | 분화 分火 | 맞으면 도깨비불 여러 개로 갈라져 사방으로 튄다 | 작은 불덩이 3개 묶음 | `#F2D98A` / `#C45148` / `#D9503F` | 1.05 | 장난꾸러기라 껑충 뛴다 | S1, S4 |
| S3 | `zone` | 선무 仙霧 | 구슬이 멈춘 자리에 구름이 남아 안의 적을 느리게 하고 깎는다 | 복숭아(원 + 홈 + 잎) | `#FFD3A2` / `#7CC4A4` / `#FFFDF1` | 1.00 | 신선은 구름을 타고 느긋하다 | S1, S4 |
| S4 | `explode` | 폭염 爆炎 | 맞은 자리에서 터져 둘레의 적도 깎는다 | 불씨 폭탄(원 + 네 갈래 불꽃) | `#C06558` / `#EFBD6C` / `#D9503F` | 0.95 | 큰 뱀(파사)은 몸이 무겁다 | S2, S3 |
| N1 | `freeze` | 빙결 氷結 | 맞은 적이 얼어붙어 움직이지도, 먹지도, 쏘지도 못한다 | 얼음 육각 조각 | `#E4EAEE` / `#536581` / `#C0D1DA` | 0.90 | 거북은 느리다 | N2, N3 |
| N2 | `drain` | 흡정 吸精 | 깎아 낸 만큼 내 몸이 조금 자란다 | 이빨 입 구슬(원 + 지그재그 입) | `#2F3B57` / `#C45148` / `#536581` | 0.95 | 큰 덩치 식인 짐승은 둔하다 | N1, N4 |
| N3 | `vortex` | 와류 渦流 | 맞은 자리에 소용돌이가 생겨 둘레 적을 끌어당긴다 | 물방울 + 나선 | `#899BB3` / `#C0D1DA` / `#536581` | 1.00 | 물귀신은 미끄러지듯 다닌다 | N1, N4 |
| N4 | `gust` | 대풍 大風 | 맞은 적을 세게 밀어내고 잠깐 멈칫하게 한다 | 겹초승달 바람 깃 | `#C0D1DA` / `#E4EAEE` / `#899BB3` | 1.15 | 붕의 날갯짓은 구만 리를 간다 | N2, N3 |

`mimul`(줄기 없음)은 능력이 없고 지금 구슬(`#9DEED3` / `#245F5B` / `#6BC6AF`)을 그대로 쓴다.

---

## 2. 형태 170종

### 2-1. 결정 사항과 근거 (research 4·6절의 미결 항목)

| 항목 | 결정 | 근거 |
|---|---|---|
| 시작 형태 `mimul` | 170종과 별도로 남긴다. 데이터는 171행이고, 도감은 "0번 미물 + 170종"으로 센다 | 저장의 `formId: 'mimul'`과 새 판 시작이 이 id를 쓴다. 1단계 8종을 방위마다 2종씩 맞추려면 `mimul`을 그 안에 넣을 수 없다 |
| 1단계 8종의 쓰임 | 적의 1단계 형태(지금의 색만 바꾼 `mimul` 대신), 2단계에서 역진화했을 때 돌아가는 형태 | 플레이어는 늘 `mimul`로 시작하므로 다른 쓰임이 필요하다. 8개 줄기가 1단계 뿌리를 가진다 |
| 박이(`boYi`) 방위 | **west 유지** | 저장된 박이의 색(서·백 상아색)과 새끼 범 계통을 바꾸지 않는다. research도 필방·청구 여우는 산경 규칙 대신 해외경을 따랐으므로 규칙이 절대적이지 않다. 9꼬리·양뿔은 서(金)의 흉수 줄기에 맞는다 |
| 현구(`darkTurtle`) 방위 | **north 유지** | 玄(검음) = 북, 윗단계 비희 → 현무로 이어진다 |
| 필방·청구 여우 | research대로 south·east | 기존 게임과 같다 |
| 박이 이동에 따른 수 맞춤 | west 3단계 부혜(鳧徯)를 예비로 내리고, south 3단계에 예비 염화(厭火)를 올림 | 방위마다 3단계 15종을 지킨다. 염화는 불을 뿜어 S4(가뭄·불뱀)에 맞는다 |
| 기존 2단계 4종 | 유지. research 2단계 핵심을 방위마다 6 → 5종으로 줄임 | 2단계 24종 = 기존 4 + 새 20 |
| 2단계에서 내린 형태 | east 구여(犰狳), west 충거(䳋渠), south 장우·류, north 비서. 대신 south에 예비 호교(虎蛟)를 올림 | 구여는 瞿如와 독음 충돌, 충거는 독음 미확인, 비서는 이서와 모양이 겹침. 호교의 뱀 꼬리는 S4 줄기의 2단계로 필요하다 |
| 이름 충돌 蛟·狡 | 蛟(east 3단계)를 예비로 내리고 예비 박어(薄魚)를 올림. 狡는 "교" 그대로 | 같은 방위의 용 줄기에 규룡·교룡이 이미 있어 蛟가 빠져도 사다리가 끊기지 않는다 |
| 이름 충돌 瞿如·犰狳 | 犰狳를 뺐으므로 瞿如만 "구여" | — |
| 이름 충돌 肥遺 | 뱀형 1종만 쓴다. 게임 안에서는 충돌 없음 | — |
| 5단계 천호 | 예비에서 핵심으로 올리고, east 5단계 동방삭을 예비로 내림 | 구미호 줄기의 5단계가 필요하다. 동방삭은 동왕공과 모양(도포·수염)이 겹친다 |
| 독음 미확인 4종 | 창부(𪁺𩿧), 산휘(山𤟤), 독욕(獨𤞞), 흠비(欽䲹)는 잠정 독음으로 넣고 표에 †를 단다 | 원전 묘사가 부품 재료로 좋다(머리 셋 닭, 사람 얼굴 바람 개, 개 머리 범, 물수리). 독음이 틀리면 `name`만 고치면 된다 |
| 머리 아홉 형태의 단계 예외 | 상류(4)·구봉(4)은 `multiHead(9)`, 3단계 창부·쌍쌍은 `multiHead(3)`, 병봉·비익조는 `multiHead(2)`를 허용 | 기획서 예시("상류 — 아홉 머리로…")가 9를 쓴다. 장식 점수는 T2가 세트에서 덜어 맞춘다(2-2) |
| 5단계 성향 | research 그대로(28종 중 요 4종: 궁기·혼돈·도철·촉룡). 요 줄기가 5단계에서 선 형태가 되는 것은 "이무기가 용이 되는" 승천으로 본다 | 기획서 3장 "요괴나 신선이 되어 용에 이르는 게임" |
| 1·2단계의 성향 | research의 기질(yo/seon)을 적되, 진화 점수에는 3단계 이상 후보에만 쓰고, 흰 테두리는 3단계부터 그린다. 기존 `mimul`과 새끼 4종은 `none` 유지 | 지금 `buildChoices`의 `useBranch = stage ≥ 2`와 같다. art-direction 6-1 "갈래 구분은 3단계부터" |
| 색과 설명의 충돌 | 몸 색은 방위 팔레트로 정해지므로 설명에 방위 팔레트와 다른 색 말(예: 서녘 형태에 "붉은")은 쓰지 않았다 | 화면과 글이 어긋나지 않게 |

### 2-2. 데이터 모양과 장식 세트

```js
// src/data/forms.js 한 행(예)
{ id: 'gumiho', name: '구미호', hanja: '九尾狐', stage: 4, dir: 'east', branch: 'yo',
  stem: 'E2', entry: true,
  parts: [['multiTail', { n: 9 }], 'paws', 'foxEars', 'body', 'face', 'foxMuzzle'],
  deco: 'yo4',
  desc: '아홉 꼬리를 부채처럼 펴고 아기 울음으로 홀린다.',
  next: [/* 3-1 규칙으로 생성 */] }
```

- `parts`는 몸 구조 부품만 뒤→앞 순서로 적는다. 인자형 부품은 `['이름', { n }]`.
- `deco`는 아래 장식 세트 이름이다. 세트 부품의 그리기 층(광륜 뒤, 비단 띠 앞 등)은 art-direction 5-3의 층 규칙대로 그리기 코드(T2)가 놓는다.
- 장식 점수 = 세트 점수 + 구조 부품 점수(art-direction 7장). 단계 구간(3: 3~4 / 4: 6~8 / 5: 10~13)을 넘으면 T2의 `decorate(form)`이 세트에서 `cloudMark` → `tasselKnot` → `goldLeaf` → `cloudRibbon` 수 순서로 덜어 낸다. 데이터는 고치지 않는다.

| 세트 | 부품 | 점수 |
|---|---|---:|
| `base2` | `foreheadMark` | 1 |
| `seon3` | `foreheadMark`, `jadeBeads`, `['cloudRibbon', { n: 1 }]` | 3 |
| `yo3` | `foreheadMark`, `talismanStrip`, `tasselKnot` | 3 |
| `seon4` | `goldTrim`, `['halo', { n: 1 }]`, `['cloudRibbon', { n: 2 }]`, `cloudBase` | 6 |
| `yo4` | `goldTrim`, `foreheadMark`, `talismanStrip`, `patternBand`(雷紋), `cloudMark`, `tasselKnot` | 6 |
| `seon5` | `goldTrim`, `goldLeaf`, `['halo', { n: 2 }]`, `mandorla`, `['cloudRibbon', { n: 2 }]`, `lotusSeat` | 11 |
| `yo5` | `goldTrim`, `goldLeaf`, `flameAura`, `talismanStrip`, `patternBand`(雷紋), `foreheadMark`, `tasselKnot`, `cloudMark` | 10 |

- 1단계는 세트 없음. 2단계 새 형태는 `base2`. 기존 17종은 `parts`를 그대로 두고 `deco`만 붙인다(새끼 4종 `base2`, 3단계 12종 `seon3`/`yo3`). 그림이 조금 화려해질 뿐 저장에는 영향이 없다.
- 표의 부품 칸에서 `multiTail(9)`는 `['multiTail', { n: 9 }]`를 줄여 쓴 것이다.

### 2-3. 전체 목록 (171행 = 시작 형태 1 + 170종)

비고: ★ 줄기 입구, 기존 = 기존 17종(id·단계·부품 유지), † 독음 잠정, ◇ 머리 수 단계 예외, ↑ 예비에서 올림.

| No | id | 이름 (한자) | 단계 | 방위 | 줄기 | 성향 | 부품 초안 (구조) + 세트 | 한 줄 설명 | 비고 |
|---|---|---|---:|---|---|---|---|---|---|
| F000 | `mimul` | 미물 | 1 | none | — | none | 기존 유지 | 이슬 한 방울에 배가 부른 여섯 발의 작은 벌레. | 기존·시작 형태 |
| F001 | `hwalsa` | 활사 (活師) | 1 | east | E1 | seon | fishTail, body, leafMark, face | 가는 꼬리 하나로 연못 물결을 거슬러 오른다. | ★ |
| F002 | `littleSnake` | 새끼 뱀 | 2 | east | E1 | none | 기존 유지 + base2 | 풀잎 사이로 옥빛 마디를 굴리며 미끄러진다. | ★ 기존 |
| F003 | `yeongnyeong` | 영령 (軨軨) | 2 | east | E1 | yo | paws, stripedTail, body, stripes, littleHorns, face, muzzle + base2 | 범 무늬 송아지가 울면 강물이 불어난다. | |
| F004 | `imugi` | 이무기 (螭) | 3 | east | E1 | yo | 기존 유지 + yo3 | 물속에서 천 년을 기다리며 두 혹뿔을 틔웠다. | ★ 기존 |
| F005 | `bageo` | 박어 (薄魚) | 3 | east | E1 | yo | fishTail, longSerpent, body, scales, oneEye, face + yo3 | 외눈으로 물살을 노려보며 용문을 기다리는 긴 물고기. | ↑ |
| F006 | `hapyu` | 합유 (合窳) | 3 | east | E1 | yo | stripedTail, paws, body, humanFace, face + yo3 | 사람 얼굴 새끼돼지가 나타나면 둑이 넘친다. | |
| F007 | `gyuryong` | 규룡 (虯龍) | 4 | east | E1 | yo | coilBody, paws, body, scales, maneCloud, littleHorns, face, tongue + yo4 | 작은 뿔 한 쌍을 세우고 처음 구름을 밟은 어린 용. | ★ |
| F008 | `gyoryong` | 교룡 (蛟龍) | 4 | east | E1 | yo | coilBody, paws, body, scales, maneFlame, littleHorns, face + yo4 | 비늘을 곤두세우고 물난리를 몰고 다닌다. | |
| F009 | `gi` | 기 (夔) | 4 | east | E1 | yo | oneLeg, body, stripes, face, muzzle + yo4 | 외다리로 땅을 구르면 천둥이 오백 리를 간다. | |
| F010 | `cheongnyong` | 청룡 (青龍) | 5 | east | E1 | seon | coilBody, paws, antlerTree, maneCloud, body, scales, face, tongue + seon5 | 비늘 사이로 봄비와 우레를 거느린 동녘의 용. | ★ |
| F011 | `eungnyong` | 응룡 (應龍) | 5 | east | E1 | seon | multiWings(2), coilBody, paws, antlerTree, body, scales, face + seon5 | 날개 달린 용이 날갯짓 한 번에 비구름을 부른다. | |
| F012 | `juyu` | 주유 (朱獳) | 2 | east | E2 | yo | wings, paws, foxEars, body, face, foxMuzzle + base2 | 지느러미 날개를 단 여우가 수풀에서 엿본다. | ★ |
| F013 | `jongjong` | 종종 (從從) | 2 | east | E2 | yo | sixLegs, tigerEars, body, face, muzzle + base2 | 여섯 발로 종종걸음 치는 강아지. | |
| F014 | `hillFox` | 청구 여우 (青丘狐) | 3 | east | E2 | yo | 기존 유지 + yo3 | 청구의 솔숲에서 세 꼬리로 달빛을 쓸어 모은다. | ★ 기존 |
| F015 | `bibi` | 비비 (獙獙) | 3 | east | E2 | yo | wings, paws, foxEars, body, face, foxMuzzle + yo3 | 새 날개를 펴고 기러기처럼 울면 가뭄이 든다. | |
| F016 | `nongjil` | 농질 (蠪姪) | 3 | east | E2 | yo | multiTail(3), paws, catEars, body, stripes, face, fang + yo3 | 범 발톱 여우가 꼬리를 세워 산길을 막는다. | 원전 9머리·9꼬리는 윗단계에 남김 |
| F017 | `galjeo` | 갈저 (猲狙) | 3 | east | E2 | yo | stripedTail, paws, tigerEars, body, redMarks, face, muzzle, fang + yo3 | 쥐 눈 늑대가 돼지 울음으로 길손을 놀린다. | |
| F018 | `gumiho` | 구미호 (九尾狐) | 4 | east | E2 | yo | multiTail(9), paws, foxEars, body, face, foxMuzzle + yo4 | 아홉 꼬리를 부채처럼 펴고 아기 울음으로 홀린다. | ★ |
| F019 | `bi` | 비 (蜚) | 4 | east | E2 | yo | snakeTail, paws, body, whiteHead, oneEye, littleHorns, face, muzzle + yo4 | 외눈 흰 머리 소가 지나간 물은 마르고 풀은 시든다. | |
| F020 | `sabisi` | 사비시 (奢比之尸) | 4 | east | E2 | seon | paws, deerEars, body, humanFace, face + seon4 | 큰 귀에 뱀 한 쌍을 걸고 동녘 바람을 듣는다. | |
| F021 | `cheonho` | 천호 (天狐) | 5 | east | E2 | seon | multiTail(9), paws, foxEars, body, face, foxMuzzle + seon5 | 천 년을 닦은 여우가 하늘빛 꼬리를 얻었다. | ★ ↑ |
| F022 | `danggang` | 당강 (當康) | 2 | east | E3 | seon | paws, body, tusks, face, muzzle + base2 | 솟은 어금니로 풍년을 알리는 새끼돼지. | ★ |
| F023 | `crane` | 청학 (青鶴) | 3 | east | E3 | seon | 기존 유지 + seon3 | 신선을 태우고 옥빛 깃으로 구름길을 가른다. | ★ 기존 |
| F024 | `cheonggyeong` | 청경 (青耕) | 3 | east | E3 | seon | birdFeet, wings, body, crest, face, whiteBeak + seon3 | 흰 부리 까치가 울면 돌림병이 물러간다. | |
| F025 | `ryeoho` | 려호 (鵹鶘) | 3 | east | E3 | yo | paws, wings, body, crest, face, beak + yo3 | 원앙 깃에 사람 발을 단 새가 늪을 걷는다. | |
| F026 | `gijak` | 기작 (鬿雀) | 3 | east | E3 | yo | birdFeet, wings, body, whiteHead, crest, face, beak + yo3 | 흰 머리 닭이 범 발톱으로 먹이를 낚아챈다. | |
| F027 | `seonhak` | 선학 (仙鶴) | 4 | east | E3 | seon | birdFeet, multiWings(2), longNeck, crown, face, longBeak + seon4 | 구름을 디딘 신선의 학이 긴 목을 뽑는다. | ★ |
| F028 | `wangjagyo` | 왕자교 (王子喬) | 4 | east | E3 | seon | plumage, body, robe, topknot, taoCrown, face + seon4 | 학을 타고 생황을 불며 구름 위를 거닌다. | |
| F029 | `samjogo` | 삼족오 (三足烏) | 4 | east | E3 | seon | oneLeg, birdFeet, wings, body, sunMoonDisc, face, beak + seon4 | 세 발 까마귀가 해 속에서 날개를 턴다. | |
| F030 | `dongwanggong` | 동왕공 (東王公) | 5 | east | E3 | seon | body, robe, beadCurtainCrown, face, peach + seon5 | 신선들의 우두머리가 동녘 하늘 문을 연다. | ★ |
| F031 | `gumang` | 구망 (句芒) | 5 | east | E3 | seon | multiWings(2), birdFeet, body, humanFace, leafMark, face + seon5 | 사람 얼굴 새가 두 용을 타고 봄 나무를 깨운다. | |
| F032 | `jubyeoreo` | 주별어 (珠蟞魚) | 1 | east | E4 | seon | sixLegs, body, spots, face | 여섯 발 둥근 몸에 진주알이 송송 박혔다. | ★ |
| F033 | `dongdong` | 동동 (狪狪) | 2 | east | E4 | seon | paws, body, spots, face, muzzle + base2 | 몸에 구슬을 품고 제 이름을 부르는 새끼돼지. | ★ |
| F034 | `hyugwi` | 휴귀 (蠵龜) | 3 | east | E4 | seon | flippers, shell, hexShell, turtleHead, face + seon3 | 무늬 등딱지를 진 바다거북이 물길을 안다. | ★ |
| F035 | `hyeongo` | 현고 (玄股) | 3 | east | E4 | seon | wings, body, scales, robe, face + seon3 | 물고기 가죽옷을 입고 양옆에 새를 거느린다. | |
| F036 | `gunja` | 군자 (君子) | 3 | east | E4 | seon | stripedTail, body, robe, taoCrown, face + seon3 | 의관을 바로 하고 범 두 마리에게도 길을 양보한다. | |
| F037 | `samcheongma` | 삼청마 (三青馬) | 3 | east | E4 | seon | paws, stripedTail, body, maneCloud, face, muzzle + seon3 | 갈기를 날리며 바닷가 모래밭을 달리는 말. | |
| F038 | `geoo` | 거오 (巨鼇) | 4 | east | E4 | seon | flippers, shell, hexShell, backSpikes, turtleHead, face, waveRim + seon4 | 등에 봉래산을 이고 바다 한가운데 버틴 큰 자라. | ★ |
| F039 | `uho` | 우호 (禺䝞) | 4 | east | E4 | seon | snakeTail, wings, birdFeet, body, humanFace, face + seon4 | 사람 얼굴 새가 뱀을 밟고 동해를 다스린다. | |
| F040 | `cheono` | 천오 (天吳) | 4 | east | E4 | yo | multiTail(6), paws, body, stripes, multiHead(3), face + yo4 | 여러 머리 물의 신이 여러 꼬리로 파도를 친다. | ◇ |
| F041 | `donghaeyongwang` | 동해용왕 (東海龍王) | 5 | east | E4 | seon | coilBody, paws, antlerTree, body, scales, beadCurtainCrown, face, waveRim + seon5 | 파도 관을 쓰고 동해 물길을 쥔 용왕. | ★ |
| F042 | `bokhui` | 복희 (伏羲) | 5 | east | E4 | seon | coilBody, body, robe, patternBand, face + seon5 | 사람 머리 뱀 몸으로 여덟 괘를 처음 그었다. | |
| F043 | `littleTiger` | 새끼 범 | 2 | west | W1 | none | 기존 유지 + base2 | 아직 울음보다 발소리가 더 작은 하얀 범. | ★ 기존 |
| F044 | `hoche` | 호체 (毫彘) | 2 | west | W1 | yo | paws, backSpikes, body, face, muzzle + base2 | 털끝마다 비녀 같은 가시를 세운 돼지. | |
| F045 | `skyHound` | 천구 (天狗) | 3 | west | W1 | yo | 기존 유지 + yo3 | 흰 머리를 번쩍 들고 울어 산길의 흉을 물리친다. | ★ 기존 |
| F046 | `jaeng` | 쟁 (猙) | 3 | west | W1 | yo | multiTail(3), paws, catEars, body, spots, oneHorn, face, muzzle + yo3 | 외뿔 표범이 꼬리를 휘둘러 돌을 쪼갠다. | |
| F047 | `juyeom` | 주염 (朱厭) | 3 | west | W1 | yo | paws, body, whiteHead, face, fang + yo3 | 흰 머리 원숭이가 나타나면 큰 싸움이 난다. | |
| F048 | `bak` | 박 (駮) | 4 | west | W1 | yo | paws, stripedTail, body, oneHorn, maneFlame, face, muzzle, fang + yo4 | 외뿔 흰 말이 범 이빨로 범과 표범을 잡아먹는다. | ★ |
| F049 | `bihyu` | 비휴 (貔貅) | 4 | west | W1 | yo | wings, paws, maneCloud, body, oneHorn, face, muzzle, fang + yo4 | 날개 달린 외뿔 맹수가 삼킨 것은 내놓지 않는다. | |
| F050 | `pyean` | 폐안 (狴犴) | 4 | west | W1 | yo | paws, stripedTail, tigerEars, maneCloud, body, stripes, face, fang + yo4 | 부릅뜬 범 얼굴로 옥문을 지키는 용의 아들. | |
| F051 | `baekho` | 백호 (白虎) | 5 | west | W1 | seon | stripedTail, paws, tigerEars, body, stripes, face, muzzle, fang + seon5 | 검은 줄무늬 흰 범이 서녘의 쇠 기운을 다스린다. | ★ |
| F052 | `gaemyeongsu` | 개명수 (開明獸) | 5 | west | W1 | seon | paws, stripedTail, body, stripes, multiHead(9), humanFace, face + seon5 | 아홉 사람 얼굴 범이 곤륜의 아홉 문을 지킨다. | |
| F053 | `gyebyeon` | 계변 (谿邊) | 2 | west | W2 | seon | paws, catEars, body, face, muzzle + base2 | 가죽에 앉으면 독이 물러나는 산골 개. | ★ |
| F054 | `gyo` | 교 (狡) | 3 | west | W2 | seon | paws, twinHorns, catEars, body, spots, face, muzzle + seon3 | 표범 무늬 개가 소뿔을 세우면 그해 풍년이 든다. | ★ |
| F055 | `seunghwang` | 승황 (乘黃) | 3 | west | W2 | seon | paws, foxEars, backSpikes, body, face, foxMuzzle + seon3 | 등에 뿔 돋은 여우를 타면 이천 해를 산다. | |
| F056 | `yongeo` | 용어 (龍魚) | 3 | west | W2 | seon | fishTail, paws, catEars, body, scales, face, muzzle + seon3 | 비늘 덮인 살쾡이가 언덕 위를 헤엄치듯 다닌다. | |
| F057 | `haechi` | 해치 (獬豸) | 4 | west | W2 | seon | paws, oneHorn, maneCloud, body, face, muzzle + seon4 | 곧은 외뿔로 옳고 그름을 가려 들이받는다. | ★ |
| F058 | `baektaek` | 백택 (白澤) | 4 | west | W2 | seon | multiHead(2), twinHorns, paws, maneCloud, body, backEyes, face + seon4 | 두 머리 신수가 세상 만물의 이름을 다 안다. | |
| F059 | `sanye` | 산예 (狻猊) | 4 | west | W2 | yo | paws, maneFlame, body, smoke, face, muzzle + yo4 | 향로 연기 속에 앉아 갈기를 터는 사자. | |
| F060 | `aeja` | 애자 (睚眥) | 4 | west | W2 | yo | paws, littleHorns, body, spots, face, fang + yo4 | 용 머리 표범이 부릅뜬 눈으로 원수를 잊지 않는다. | |
| F061 | `yoksu` | 욕수 (蓐收) | 5 | west | W2 | seon | body, robe, taoCrown, sunMoonDisc, face + seon5 | 왼 귀에 뱀을 걸고 두 용을 타 가을 심판을 내린다. | ★ |
| F062 | `namo` | 나모 (蠃母) | 1 | west | W3 | seon | antennae, shell, face | 나선 껍데기 속에 몸을 말고 물밑을 기는 고둥. | ★ |
| F063 | `gyeomyang` | 겸양 (羬羊) | 2 | west | W3 | seon | paws, stripedTail, ramHorns, body, face, muzzle + base2 | 말꼬리를 흔드는 순한 산양. | ★ |
| F064 | `whiteDeer` | 백록 (白鹿) | 3 | west | W3 | seon | 기존 유지 + seon3 | 가지뿔 끝마다 산의 맑은 기운이 맺힌 흰 사슴. | ★ 기존 |
| F065 | `samcheongjo` | 삼청조 (三青鳥) | 3 | west | W3 | seon | birdFeet, wings, body, crest, face, beak + seon3 | 서왕모의 편지를 물고 곤륜을 오가는 심부름 새. | |
| F066 | `manman` | 만만 (蠻蠻) | 3 | west | W3 | seon | birdFeet, wings, body, oneEye, face, beak + seon3 | 눈 하나 날개 하나, 짝을 만나야 날아오른다. | |
| F067 | `munyoeo` | 문요어 (文鰩魚) | 3 | west | W3 | seon | wings, fishTail, body, scales, whiteHead, face, beak + seon3 | 밤마다 서해에서 동해로 날아가는 날개 물고기. | |
| F068 | `yugo` | 육오 (陸吾) | 4 | west | W3 | seon | multiTail(6), paws, tigerEars, body, stripes, humanFace, face + seon4 | 여러 꼬리 범이 곤륜 언덕의 시간을 지킨다. | ★ |
| F069 | `yeongcho` | 영초 (英招) | 4 | west | W3 | seon | wings, paws, stripedTail, body, stripes, humanFace, face + seon4 | 범 무늬 말이 사람 얼굴로 하늘 정원을 돈다. | |
| F070 | `gwangseongja` | 광성자 (廣成子) | 4 | west | W3 | seon | body, robe, topknot, taoCrown, face + seon4 | 공동산 바위굴에서 천이백 해를 닦은 선인. | |
| F071 | `seowangmo` | 서왕모 (西王母) | 5 | west | W3 | seon | stripedTail, body, robe, featherCrown, face, peach + seon5 | 표범 꼬리에 옥 비녀, 곤륜 복숭아밭의 주인. | ★ |
| F072 | `yeowa` | 여와 (女媧) | 5 | west | W3 | seon | coilBody, body, robe, face, jadeBeads + seon5 | 뱀 몸 여신이 오색 돌로 무너진 하늘을 기웠다. | |
| F073 | `mokchung` | 목충 (木蟲) | 1 | west | W4 | yo | antennae, segments, body, face | 나무껍질 빛 마디 몸으로 고목 속을 갉는다. | ★ |
| F074 | `hyo` | 효 (嚻) | 2 | west | W4 | yo | paws, catEars, body, face, fang + base2 | 긴 팔로 돌을 던지기 좋아하는 원숭이. | ★ |
| F075 | `geobo` | 거보 (舉父) | 2 | west | W4 | yo | paws, tigerEars, body, spots, face, muzzle + base2 | 표범 무늬 팔로 돌을 들어 던지는 원숭이. | |
| F076 | `boYi` | 박이 (猼訑) | 3 | west | W4 | yo | 기존 유지 + yo3 | 네 귀로 바람을 듣고 등에 난 두 눈으로 아홉 꼬리를 살핀다. | ★ 기존 |
| F077 | `toru` | 토루 (土螻) | 3 | west | W4 | yo | paws, ramHorns, twinHorns, body, face, fang + yo3 | 네 뿔 산양이 곤륜 아래서 사람을 노린다. | |
| F078 | `byeongbong` | 병봉 (并封) | 3 | west | W4 | yo | multiHead(2), paws, body, face, muzzle + yo3 | 앞뒤로 머리 달린 돼지가 어디로 갈지 다툰다. | ◇ |
| F079 | `biyu` | 비유 (肥遺) | 3 | west | W4 | yo | multiWings(2), sixLegs, longSerpent, body, scales, face, tongue + yo3 | 여섯 다리 네 날개 뱀이 나타나면 큰 가뭄이 든다. | |
| F080 | `sukho` | 숙호 (孰湖) | 3 | west | W4 | yo | wings, snakeTail, paws, body, humanFace, face + yo3 | 사람 얼굴 날개 말이 사람을 번쩍 들어 올린다. | |
| F081 | `hyeongcheon` | 형천 (刑天) | 4 | west | W4 | yo | paws, body, bellyFace, club + yo4 | 머리를 잃고도 배꼽 입으로 외치며 도끼를 휘두른다. | ★ |
| F082 | `heumbi` | 흠비 (欽䲹) | 4 | west | W4 | yo | birdFeet, multiWings(2), body, whiteHead, face, beak + yo4 | 흰 머리 물수리가 범 발톱으로 하늘을 가른다. | † |
| F083 | `bulgasari` | 불가사리 (不可殺伊) | 4 | west | W4 | yo | paws, backSpikes, body, bigHead, tusks, face + yo4 | 쇠를 먹고 자라 칼로도 죽지 않는 괴수. | |
| F084 | `gunggi` | 궁기 (窮奇) | 5 | west | W4 | yo | multiWings(2), paws, backSpikes, body, stripes, face, fang + yo5 | 고슴도치 털 날개 범이 착한 이를 골라 문다. | ★ |
| F085 | `hondon` | 혼돈 (渾敦) | 5 | west | W4 | yo | multiWings(2), sixLegs, body, bellyFace + yo5 | 얼굴 없는 자루 몸이 여섯 발로 춤추며 노래한다. | 얼굴은 배에(귀여움 유지) |
| F086 | `littleBird` | 새끼 새 | 2 | south | S1 | none | 기존 유지 + base2 | 동그란 두 날개에 따뜻한 남풍을 품었다. | ★ 기존 |
| F087 | `gwangwan` | 관관 (灌灌) | 2 | south | S1 | seon | birdFeet, wings, body, face, beak + base2 | 꾸짖듯 우는 비둘기를 지니면 홀리지 않는다. | |
| F088 | `biFang` | 필방 (畢方) | 3 | south | S1 | yo | 기존 유지 + yo3 | 외발로 사뿐히 내려앉으면 흰 부리 끝에 불꽃이 피어난다. | ★ 기존 |
| F089 | `guyeo` | 구여 (瞿如) | 3 | south | S1 | seon | oneLeg, birdFeet, wings, body, whiteHead, humanFace, face, beak + seon3 | 세 발 흰 머리 새가 사람 얼굴로 제 이름을 운다. | |
| F090 | `jeolji` | 절지 (竊脂) | 3 | south | S1 | seon | birdFeet, wings, catEars, body, whiteHead, face, beak + seon3 | 흰 머리 올빼미가 불길을 막아 선다. | |
| F091 | `biikjo` | 비익조 (比翼鳥) | 3 | south | S1 | seon | multiHead(2), wings, birdFeet, body, face, beak + seon3 | 날개 한 짝씩을 맞대야 날 수 있는 두 마리 새. | ◇ |
| F092 | `wonchu` | 원추 (鵷鶵) | 4 | south | S1 | seon | birdFeet, tailFan, plumage, longNeck, crest, face, beak + seon4 | 오동나무가 아니면 앉지 않는 봉황의 친척. | ★ |
| F093 | `inmyeonjo` | 인면조 (人面鳥) | 4 | south | S1 | seon | birdFeet, multiWings(2), body, humanFace, face + seon4 | 벽화 속 사람 얼굴 새가 하늘길을 안내한다. | |
| F094 | `imun` | 이문 (螭吻) | 4 | south | S1 | seon | fishTail, body, scales, littleHorns, face, muzzle + seon4 | 지붕 끝에서 큰 입을 벌려 불을 삼키는 용의 아들. | |
| F095 | `jujak` | 주작 (朱雀) | 5 | south | S1 | seon | birdFeet, tailFan, multiWings(2), body, featherCrown, face, beak + seon5 | 불꽃 꼬리깃을 끌며 남녘 하늘을 지키는 새. | ★ |
| F096 | `bonghwang` | 봉황 (鳳皇) | 5 | south | S1 | seon | birdFeet, tailFan, plumage, longNeck, featherCrown, eyeSpots, face, beak + seon5 | 다섯 덕을 깃에 새긴 새가 오면 천하가 편하다. | |
| F097 | `geumsijo` | 금시조 (金翅鳥) | 5 | south | S1 | seon | multiWings(3), birdFeet, body, maneFlame, face, beak + seon5 | 금빛 날개를 펴면 바다가 갈라져 용이 드러난다. | |
| F098 | `yeok` | 역 (蜮) | 1 | south | S2 | yo | sixLegs, body, spots, face, tongue | 입으로 모래를 쏘아 그림자를 맞히는 물벌레. | ★ |
| F099 | `iryeok` | 이력 (貍力) | 2 | south | S2 | yo | paws, tigerEars, body, face, muzzle, fang + base2 | 며느리발톱 돼지가 개처럼 짖으면 큰 공사가 벌어진다. | ★ |
| F100 | `dokkaebi` | 도깨비 | 3 | south | S2 | yo | 기존 유지 + yo3 | 삐딱한 패랭이 아래로 씨름 상대를 고르는 장난꾸러기. | ★ 기존 |
| F101 | `onghwa` | 옹화 (雍和) | 3 | south | S2 | yo | paws, catEars, body, redMarks, face, beak + yo3 | 부리 달린 원숭이가 나타나면 나라가 떤다. | |
| F102 | `che` | 체 (彘) | 3 | south | S2 | yo | stripedTail, paws, tigerEars, body, stripes, face, muzzle, fang + yo3 | 소꼬리 범이 개 짖는 소리로 사람을 부른다. | |
| F103 | `ju` | 주 (鴸) | 3 | south | S2 | yo | waveHands, wings, catEars, body, face, beak + yo3 | 사람 손을 가진 올빼미가 제 이름을 부르며 운다. | |
| F104 | `imae` | 이매 (魑魅) | 4 | south | S2 | yo | paws, bigHead, littleHorns, body, face, fang + yo4 | 짐승 얼굴 산도깨비가 숲길에 홀림불을 켠다. | ★ |
| F105 | `sanso` | 산소 (山魈) | 4 | south | S2 | yo | waveHands, paws, body, redMarks, face, fang + yo4 | 긴 팔 산귀신이 밤 산을 뛰어다닌다. | |
| F106 | `yeomje` | 염제 (炎帝) | 5 | south | S2 | seon | body, robe, ramHorns, maneFlame, leafMark, face, muzzle + seon5 | 소 머리 불의 임금이 백 가지 풀을 맛보아 곡식을 가르쳤다. | ★ |
| F107 | `seongseong` | 성성 (狌狌) | 2 | south | S3 | seon | paws, catEars, body, face, muzzle + base2 | 흰 귀 원숭이가 네 발로 엎드렸다 사람처럼 걷는다. | ★ |
| F108 | `nokchok` | 녹촉 (鹿蜀) | 2 | south | S3 | seon | paws, stripedTail, body, stripes, whiteHead, face, muzzle + base2 | 흰 머리 범 무늬 말이 노래하듯 운다. | |
| F109 | `attendant` | 선동 (仙童) | 3 | south | S3 | seon | 기존 유지 + seon3 | 단정히 도포 깃을 여미고 봉우리 너머로 복숭아를 나른다. | ★ 기존 |
| F110 | `changbu` | 창부 (𪁺𩿧) | 3 | south | S3 | seon | multiHead(3), wings, sixLegs, body, crest, face, beak + seon3 | 머리 셋 눈 여섯 닭을 먹으면 잠이 달아난다. | † ◇ |
| F111 | `ssangssang` | 쌍쌍 (雙雙) | 3 | south | S3 | seon | multiHead(3), paws, body, face, muzzle + seon3 | 짐승 셋이 몸을 맞대고 한 몸처럼 걷는다. | ◇ |
| F112 | `jeoksongja` | 적송자 (赤松子) | 4 | south | S3 | seon | body, robe, topknot, taoCrown, face, flame + seon4 | 불 속을 걸어 비를 부리는 신선. | ★ |
| F113 | `wolhanoin` | 월하노인 (月下老人) | 4 | south | S3 | seon | body, robe, taoCrown, face, tasselKnot + seon4 | 달빛 아래 실 꾸러미로 인연을 묶는 노인. | |
| F114 | `gyoin` | 교인 (鮫人) | 4 | south | S3 | seon | fishTail, body, wetHair, scales, face, jadeBeads + seon4 | 남해 밖 인어가 흘린 눈물은 진주가 된다. | |
| F115 | `buljeonghoyeo` | 불정호여 (不廷胡余) | 4 | south | S3 | seon | snakeTail, body, robe, face, tongue + seon4 | 두 귀에 뱀을 걸고 뱀을 밟은 남해의 신. | |
| F116 | `namgeukseonong` | 남극선옹 (南極仙翁) | 5 | south | S3 | seon | body, robe, bigHead, face, peach + seon5 | 큰 이마의 장수 별 노인이 복숭아 지팡이를 짚는다. | ★ |
| F117 | `mago` | 마고 (麻姑) | 5 | south | S3 | seon | body, robe, topknot, face, peach + seon5 | 바다가 뽕밭 되기를 세 번 본 손톱 긴 선녀. | |
| F118 | `bokchung` | 복충 (蝮虫) | 1 | south | S4 | yo | segments, body, redMarks, face, fang, tongue | 삼각 머리 꼬마 살무사가 혀를 날름댄다. | ★ |
| F119 | `hogyo` | 호교 (虎蛟) | 2 | south | S4 | seon | fishTail, snakeTail, body, scales, face + base2 | 물고기 몸에 뱀 꼬리를 단 물짐승이 원앙처럼 운다. | ★ ↑ |
| F120 | `myeongsa` | 명사 (鳴蛇) | 3 | south | S4 | yo | multiWings(2), longSerpent, body, scales, face, tongue + yo3 | 네 날개 뱀이 경쇠 소리로 울면 가뭄이 든다. | ★ |
| F121 | `gojo` | 고조 (蠱雕) | 3 | south | S4 | yo | birdFeet, wings, oneHorn, body, face, beak + yo3 | 뿔 달린 독수리가 아기 울음으로 사람을 꾄다. | |
| F122 | `ong` | 옹 (顒) | 3 | south | S4 | yo | birdFeet, wings, catEars, body, humanFace, foreheadEye, face + yo3 | 눈 넷 사람 얼굴 올빼미가 나타나면 큰 가뭄이 든다. | |
| F123 | `yeomhwa` | 염화 (厭火) | 3 | south | S4 | yo | paws, body, flame, face, fang + yo3 | 입에서 불을 뿜는 검은 짐승 사람. | ↑ |
| F124 | `pasa` | 파사 (巴蛇) | 4 | south | S4 | yo | coilBody, longSerpent, body, scales, patternBand, face, tongue + yo4 | 네 빛 비늘 큰 뱀이 코끼리를 삼키고 삼 년 만에 뼈를 뱉는다. | ★ |
| F125 | `samsu` | 삼수 (三首) | 4 | south | S4 | yo | multiHead(3), paws, body, face + yo4 | 몸 하나에 머리 셋이 서로 먼저 먹겠다고 다툰다. | |
| F126 | `yeobal` | 여발 (女魃) | 4 | south | S4 | yo | body, robe, maneFlame, face + yo4 | 머리에 불꽃을 인 가뭄 귀신이 지나가면 비가 그친다. | |
| F127 | `chugyung` | 축융 (祝融) | 5 | south | S4 | seon | paws, maneFlame, body, humanFace, face, flame + seon5 | 짐승 몸 불의 신이 두 용을 타고 남녘 불을 지핀다. | ★ |
| F128 | `littleTurtle` | 새끼 거북 | 2 | north | N1 | none | 기존 유지 + base2 | 밤하늘을 닮은 등딱지 아래로 고개를 내민다. | ★ 기존 |
| F129 | `suma` | 수마 (水馬) | 2 | north | N1 | seon | paws, stripedTail, body, stripes, face, muzzle + base2 | 앞다리에 무늬 있는 물말이 소꼬리를 흔든다. | |
| F130 | `darkTurtle` | 현구 (玄龜) | 3 | north | N1 | seon | 기존 유지 + seon3 | 새의 부리와 뱀의 꼬리를 지닌 거북이 깊은 물을 지킨다. | ★ 기존 |
| F131 | `hwanso` | 환소 (䑏疏) | 3 | north | N1 | seon | paws, oneHorn, maneCloud, body, face, muzzle + seon3 | 거친 결의 외뿔 말이 불길을 막아 선다. | |
| F132 | `cheonma` | 천마 (天馬) | 3 | north | N1 | seon | wings, paws, tigerEars, body, face, muzzle + seon3 | 사람을 보면 훌쩍 날아오르는 흰 개. | |
| F133 | `bihui` | 비희 (贔屭) | 4 | north | N1 | seon | flippers, shell, hexShell, littleHorns, turtleHead, face + seon4 | 용 머리 거북이 무거운 비석을 지고 천 년을 버틴다. | ★ |
| F134 | `chodo` | 초도 (椒圖) | 4 | north | N1 | seon | shell, littleHorns, face, tasselKnot + seon4 | 소라처럼 몸을 닫고 문고리를 무는 용의 아들. | |
| F135 | `hanga` | 항아 (嫦娥) | 4 | north | N1 | seon | body, robe, topknot, sunMoonDisc, face + seon4 | 선약을 삼키고 달 궁전으로 올라간 선녀. | |
| F136 | `hyeonmu` | 현무 (玄武) | 5 | north | N1 | seon | snakeTail, flippers, shell, hexShell, turtleHead, face, starDots + seon5 | 뱀과 거북이 한 몸으로 북녘 물을 지킨다. | ★ |
| F137 | `hyeonmyeong` | 현명 (玄冥) | 5 | north | N1 | seon | snakeTail, body, robe, starDots, face + seon5 | 검은 옷 물의 신이 겨울 얼음을 내린다. | |
| F138 | `gucheonhyeonnyeo` | 구천현녀 (九天玄女) | 5 | north | N1 | seon | body, robe, topknot, featherCrown, face, jadeBeads + seon5 | 아홉 하늘의 선녀가 병법 부적을 내린다. | |
| F139 | `bijil` | 비질 (蜚蛭) | 1 | north | N2 | yo | wings, segments, body, face | 날개 넉 장 거머리가 피 냄새를 쫓는다. | ★ |
| F140 | `jokja` | 족자 (足訾) | 2 | north | N2 | yo | paws, stripedTail, body, face, muzzle + base2 | 갈기 원숭이가 사람을 보면 제 이름을 부르며 놀린다. | ★ |
| F141 | `dueoksini` | 두억시니 | 3 | north | N2 | yo | 기존 유지 + yo3 | 검푸른 연기를 등에 지고 산그늘에서 웅크린다. | ★ 기존 |
| F142 | `jegeon` | 제건 (諸犍) | 3 | north | N2 | yo | stripedTail, paws, catEars, body, spots, humanFace, oneEye + yo3 | 외눈 사람 머리 표범이 제 꼬리를 물고 다닌다. | |
| F143 | `jehoe` | 제회 (諸懷) | 3 | north | N2 | yo | paws, twinHorns, tigerEars, body, face, muzzle, tusks + yo3 | 네 뿔 소가 기러기 울음으로 사람을 먹는다. | |
| F144 | `dogyok` | 독욕 (獨𤞞) | 3 | north | N2 | yo | paws, stripedTail, backSpikes, body, face, muzzle + yo3 | 개 머리 흰 범이 돼지 갈기를 곤두세운다. | † |
| F145 | `pohyo` | 포효 (狍鴞) | 4 | north | N2 | yo | paws, ramHorns, body, humanFace, backEyes, face, fang + yo4 | 겨드랑이 눈 양이 범 이빨로 무엇이든 삼킨다. | ★ |
| F146 | `aryu` | 알유 (窫窳) | 4 | north | N2 | yo | paws, body, humanFace, face, muzzle + yo4 | 사람 얼굴 소가 아기 울음으로 길손을 꾄다. | |
| F147 | `gangnyang` | 강량 (彊良) | 4 | north | N2 | yo | paws, tigerEars, body, stripes, face, fang, tongue + yo4 | 범 머리 장사가 입에 뱀을 물고 땅을 흔든다. | |
| F148 | `docheol` | 도철 (饕餮) | 5 | north | N2 | yo | ramHorns, paws, body, backEyes, patternBand, face, fang, tusks + yo5 | 무엇이든 삼키는 큰 입, 제 몸까지 먹어 치운 탐욕. | ★ |
| F149 | `yueon` | 유언 (幽鴳) | 2 | north | N3 | yo | paws, body, spots, face, muzzle + base2 | 무늬 원숭이가 잘 웃다가 갑자기 잠든 척한다. | ★ |
| F150 | `waterSpirit` | 수귀 (水鬼) | 3 | north | N3 | yo | 기존 유지 + yo3 | 물풀 머리칼 사이로 잔물결 같은 두 손을 내민다. | ★ 기존 |
| F151 | `hwasa` | 화사 (化蛇) | 3 | north | N3 | yo | wings, longSerpent, body, humanFace, face + yo3 | 사람 얼굴 승냥이가 뱀처럼 기어 물난리를 부른다. | |
| F152 | `jangsa` | 장사 (長蛇) | 3 | north | N3 | yo | longSerpent, body, backSpikes, scales, face, tongue + yo3 | 멧돼지 털 긴 뱀이 북 치는 소리로 운다. | |
| F153 | `sanyeo` | 산여 (酸與) | 3 | north | N3 | yo | multiWings(2), oneLeg, birdFeet, longSerpent, body, foreheadEye, face + yo3 | 눈 여섯 네 날개 뱀이 마을에 두려움을 퍼뜨린다. | |
| F154 | `sangnyu` | 상류 (相柳) | 4 | north | N3 | yo | coilBody, body, scales, multiHead(9), humanFace, face + yo4 | 아홉 머리로 아홉 산을 삼킨 뱀. | ★ ◇ |
| F155 | `poroe` | 포뢰 (蒲牢) | 4 | north | N3 | yo | coilBody, littleHorns, body, face, tasselKnot + yo4 | 고래가 무서워 종처럼 크게 우는 용의 아들. | |
| F156 | `gwabo` | 과보 (夸父) | 4 | north | N3 | seon | snakeTail, body, bigHead, face, peach + seon4 | 두 손에 뱀을 쥐고 해를 쫓다 복숭아 숲이 된 거인. | |
| F157 | `chongnyong` | 촉룡 (燭龍) | 5 | north | N3 | yo | coilBody, longSerpent, body, humanFace, foreheadEye, sunMoonDisc, face + yo5 | 눈을 뜨면 낮, 감으면 밤이 되는 사람 얼굴 뱀 신. | ★ |
| F158 | `jua` | 주아 (朱蛾) | 1 | north | N4 | yo | wings, antennae, body, face | 날개를 팔랑이며 등불을 맴도는 나방. | ★ |
| F159 | `iseo` | 이서 (耳鼠) | 2 | north | N4 | seon | stripedTail, deerEars, body, face, muzzle + base2 | 토끼 머리 쥐가 꼬리를 펴고 바람을 탄다. | ★ |
| F160 | `maenggeuk` | 맹극 (孟極) | 2 | north | N4 | seon | paws, catEars, body, spots, face, muzzle + base2 | 이마에 무늬 있는 표범이 눈 속에 숨는다. | |
| F161 | `jeongwi` | 정위 (精衛) | 3 | north | N4 | seon | birdFeet, wings, body, crest, face, whiteBeak + seon3 | 작은 새가 돌을 물어 바다를 메우려 한다. | ★ |
| F162 | `songsa` | 송사 (竦斯) | 3 | north | N4 | seon | birdFeet, wings, body, humanFace, face + seon3 | 사람 얼굴 까투리가 사람을 보면 껑충 뛴다. | |
| F163 | `sanhwi` | 산휘 (山𤟤) | 3 | north | N4 | yo | paws, tigerEars, body, humanFace, face, fang + yo3 | 사람 얼굴 개가 바람처럼 달리면 큰 바람이 분다. | † |
| F164 | `bujeo` | 부저 (夫諸) | 3 | north | N4 | yo | paws, deerEars, antlers, twinHorns, body, face, muzzle + yo3 | 네 뿔 흰 사슴이 나타나면 큰물이 진다. | |
| F165 | `gon` | 곤 (鯤) | 4 | north | N4 | seon | fishTail, body, scales, face, waveRim + seon4 | 몇천 리인지 모를 북녘 바다의 큰 물고기. | ★ |
| F166 | `gubong` | 구봉 (九鳳) | 4 | north | N4 | yo | multiWings(2), birdFeet, body, multiHead(9), humanFace, face + yo4 | 사람 얼굴 아홉 머리 새가 북녘 하늘에서 운다. | ◇ |
| F167 | `chuo` | 추오 (騶吾) | 4 | north | N4 | seon | paws, stripedTail, tigerEars, body, stripes, face, muzzle + seon4 | 몸보다 긴 꼬리 범이 하루에 천 리를 달린다. | |
| F168 | `gillyang` | 길량 (吉量) | 4 | north | N4 | seon | paws, stripedTail, maneCloud, body, face, muzzle + seon4 | 황금 눈 흰 말을 타면 천 해를 산다. | |
| F169 | `bung` | 붕 (鵬) | 5 | north | N4 | seon | multiWings(3), birdFeet, body, scales, face, beak + seon5 | 곤이 변한 큰 새, 날갯짓 한 번에 구만 리 바람이 인다. | ★ |
| F170 | `ugang` | 우강 (禺彊) | 5 | north | N4 | seon | snakeTail, multiWings(2), birdFeet, body, humanFace, face + seon5 | 사람 얼굴 새가 뱀 둘을 밟고 북해 바람을 부린다. | |

**집계(표 기준)**

| 단계 | east | west | south | north | 합계 |
|---|---:|---:|---:|---:|---:|
| 1 | 2 | 2 | 2 | 2 | 8 (+ `mimul`) |
| 2 | 6 | 6 | 6 | 6 | 24 |
| 3 | 15 | 15 | 15 | 15 | 60 |
| 4 | 12 | 13 | 12 | 13 | 50 |
| 5 | 7 | 7 | 7 | 7 | 28 |
| 합계 | 42 | 43 | 42 | 43 | **170** (+1) |

줄기별 형태 수: E1 11 · E2 10 · E3 10 · E4 11 · W1 10 · W2 9 · W3 11 · W4 13 · S1 12 · S2 9 · S3 11 · S4 10 · N1 11 · N2 10 · N3 9 · N4 13. 모든 줄기가 2~5단계에 형태를 하나 이상 가진다.

---

## 3. 진화 연결 규칙

### 3-1. `next` 만들기 (데이터에 적어 두되, T1이 이 규칙으로 생성하고 테스트로 검사)

```
next(form) =
  같은 줄기의 (stage+1) 형태 전부
  ∪ 곁줄기 2개(1-2 표)의 (stage+1) 입구(★)
next(mimul) = 2단계 24종 전부
```

- 모든 줄기가 2~5단계 형태를 가지므로 2단계 이상 형태는 모두 부모가 있다(`from`이 비지 않음). 2단계는 `mimul`이 모두의 부모다.
- 기존 `next`는 새 `next` 안에 그대로 들어 있다: `littleSnake` → `imugi`(E1), `hillFox`(E2 입구), `crane`(E3 입구). 나머지 새끼 셋도 같다(곁줄기를 그렇게 골랐다).
- `from`은 지금처럼 `evolutionCatalog`가 `next`를 뒤집어 계산한다.

### 3-2. 3택 선택지 (`buildChoices` 2판)

```
후보 C = cur.next
      ∪ (식성 1위 방위 d1 ≠ cur.dir 이면) d1 방위 4개 줄기의 (stage+1) 입구
점수(form) = SCORE.dir × 식성 비율(form.dir)
          + SCORE.branch × 성향 일치(3단계 이상 후보일 때, 지금과 같은 식)
          + SCORE.stem × (form.stem === cur.stem ? 1 : 0)
SCORE = { dir: 1, branch: 0.5, stem: 0.35 }   // stem만 새로 추가

① = C에서 점수 1위
② = ①이 지금 줄기가 아니면 → C 안의 지금 줄기 형태 중 1위 ("줄기 유지")
    ①이 지금 줄기면       → C 안의 다른 줄기 형태 중 1위
③ = 미지: (stage+1) 전체에서 ①·②를 뺀 나머지 중 균등 무작위
동점 정렬: 같은 줄기 → 입구(★) → FORMS 배열 순서 (rng 동점 깨기 제거)
```

- **①과 ②는 줄기가 항상 다르다.** 그래서 3택은 언제나 "이 능력을 유지할지, 바꿀지"를 보여 준다. 카드와 진화 화면에는 형태 이름 밑에 능력 이름 한 줄(예: "능력: 매혹")을 붙인다.
- 미지에서 ①·②를 빼는 것은 미지의 진화 확률 층(원칙 6)의 후보 수만 바꾼다. 확률 표(`OddsTable`)의 미지 칸도 "남은 n종 중 하나"로 적는다.
- `mimul`(줄기 없음)과 `useBranch`: 1→2에서는 지금처럼 성향을 쓰지 않는다. 같은 방위 줄기 넷이 동점이면 줄기 순서(1 → 4)로 정한다. `mimul`은 지킬 줄기가 없으므로 ②는 "①과 다른 줄기 중 1위"다.
- 점수 계산의 성향 일치는 지금 `scoreForm`과 같다(일치 +크기, 불일치 −크기, 크기 = |성향|/100).

**예시** (성향 −60 = 요 쪽 60%)

| 지금 | 식성 | ① | ② | 해설 |
|---|---|---|---|---|
| `hillFox`(E2, 3단계) | 동 80 · 남 20 | `gumiho` 구미호(E2, 매혹) 1.45 | `seonhak` 선학(E3, 학익 추적) 0.50 | ①이 줄기 유지라서 ②는 다른 줄기 1위. E2의 곁줄기는 E3·E4(선학·거오 동점 → FORMS 순서) |
| `hillFox`(E2, 3단계) | 남 70 · 동 30 | `imae` 이매(S2, 분화) 1.00 | `gumiho` 구미호(E2, 매혹) 0.95 | 남녘을 많이 먹어 ①이 방위·능력을 바꾸고, ②가 지금 줄기를 지킨다 |
| `mimul`(1단계) | 서 60 · 북 40 | `littleTiger` 새끼 범(W1) | `gyebyeon` 계변(W2) | 같은 방위 줄기 넷이 동점이라 줄기 순서 |

### 3-3. 역진화·적의 진화·1단계

| 대상 | 규칙 |
|---|---|
| 역진화(`devolve`) | `cur.from` 중 ① 같은 줄기 ② 같은 방위 ③ `mimul` 순서로 고른다. 지금 코드는 `prevs.find`가 FORMS 순서로 첫 부모를 집으므로 순서를 명시해야 한다 |
| 2단계 → 1단계 역진화 | 같은 줄기에 1단계 뿌리가 있으면 그 미물(예: `littleSnake` → `hwalsa`), 없으면 같은 방위 1단계 중 첫째, 그다음 `mimul` |
| 적의 진화(`pickEvolution`) | 식성 1위 방위 = 지금 방위면 같은 줄기 다음 단계 중 무작위, 다르면 그 방위 입구 4개 중 무작위. 적은 3택을 쓰지 않는다 |
| 적의 자가 진화 상한 | `min(5, 플레이어 단계 + config.enemy.selfEvolveLead(=1))`. 플레이어가 2단계인데 5단계 용이 판 안에서 생겨나지 않게 한다 |
| 적 1단계 형태 | 색만 바꾼 `mimul` 대신 그 방위 1단계 2종 중 무작위(`formFor(dir, 1)`) |
| 플레이어 시작 | 언제나 `mimul`. 1단계 8종은 역진화로만 플레이어 형태가 된다 |

---

## 4. 여의주 능력 16종

### 4-1. 공통 규칙

| 항목 | 규칙 |
|---|---|
| 어느 능력인가 | 지금 형태의 `stem` → `stems.js`의 `ability`. 능력 단계 = 지금 형태의 `stage`(1~5). `mimul`은 능력 없음 |
| 어디에 붙나 | 여의주가 쏘는 모든 구슬(방향 수 × 방향당 발사). 보물이 없어도 레벨 0 구슬에 붙는다 |
| 강화 레벨 배율 | 연속 수치: `lv(L) = 1 + 0.04 × L` (L = 여의주 강화 0~15, +15에서 ×1.6). 정수 수치: `+lvInt(L) = floor(L / 5)` (+5·+10·+15에서 +1). 피해는 기존 표(`TREASURE.levels`의 파워)가 이미 올린다 |
| 상위 단계 저항 | `r(Δ) = 0.5^max(0, Δ)`, Δ = 적 단계 − 내 단계. **지속 시간**(빙결·매혹·위협·작열·파사인)과 **밀고 당기는 크기**(와류 끌기 속도·대풍 거리·선무 둔화율)에 곱한다. 피해(뇌쇄·폭염·관통·분화·회선·호신주·흡정)에는 곱하지 않는다. 하위 단계 적에게 더 세지지는 않는다 |
| 최소 효과 | 저항을 곱한 지속이 0.15초 미만이거나 크기가 기본값의 10% 미만이면 걸지 않고 표시도 하지 않는다 |
| 시간 단위 | 능력의 시간 값은 **화면 시간(초)** 이다. 걸 때 `시뮬레이션 시간 = 화면 초 × CONFIG.tempo × pace f`로 바꿔 적의 `...Until`(시뮬레이션 시계 기준)에 적는다. 판 안 카드로 멈춘 동안에는 시뮬레이션 시계가 서므로 효과도 멈춘다. 속도 곡선 f가 1/3~1.5로 변해도 눈에 보이는 지속이 같게 하려는 것이다 |
| 속도 단위 | 끌기·밀기 속도처럼 움직임에 관한 값은 다른 이동과 같은 시뮬레이션 단위(템포가 곱해짐) |
| 피해 경로 | 구슬·번개·폭발·화상·구름·진주·갈래·되돌이 피해는 모두 `applyTreasureDamage(enemy, amount)` 하나로 보낸다. 이 함수가 파사인 증가, `rewardSize` 기록, 역전 판정, 쓰러뜨리기(보물 처치 = 선기·드롭 확률)를 한 곳에서 처리한다. 지금 `Combat.hit`을 이 함수로 바꾼다 |
| 등급 | 등급 배율은 지금처럼 구슬 피해에만 곱한다. 능력의 피해 값은 구슬 피해에서 나오므로 등급이 자연히 따라간다. 지속·범위에는 곱하지 않는다(8절 질문 4) |
| 부가 옵션 30종 | 능력 수치에 직접 붙지 않는다(수치·공통 효과만). 구슬 피해·속도·사거리 옵션은 능력에도 간접 반영된다 |
| 아군·자기 자신 | 매혹된 아군과 플레이어는 어떤 능력 효과도 받지 않는다(구슬이 통과) |

### 4-2. 능력 개요

| ID | 능력 | 줄기 | 효과 | 쿨타임·재적용 | 화면 표시 (평면 도형만) |
|---|---|---|---|---|---|
| A01 | 뇌쇄 `chain` | E1 | 맞은 적에서 반경 R 안의 가장 가까운(아직 안 맞은) 적으로 번개가 튄다. k번째 튐 피해 = 구슬 피해 × 감쇠^k | 없음. 연쇄 사건 초당 12회 상한(넘으면 튀지 않음) | 적과 적 사이 3꺾임 지그재그 선(`#4C8DB8` 3px + `#D2EFC8` 1px), 0.12초 |
| A02 | 매혹 `charm` | E2 | 맞은 적이 T초 동안 내 편(4-4) | 재사용 대기 cd(화면 초). 동시 아군 상한 | 아군 발밑 옥색 고리 + 머리 위 여우불 1개, 남은 시간은 고리 호 길이 |
| A03 | 학익 추적 `homing` | E3 | 구슬 유도를 `max(보물 유도, h)`로 올리고, 회전 속도 배율, 사방 탐지(부채꼴 대신 360°), 표적이 죽으면 반경 안 새 표적 | 없음 | 표적 머리 위 작은 깃 표시(지금 표적 삼각형 대신) |
| A04 | 호신주 `orbit` | E4 | 진주 k개가 내 몸 둘레(반지름 = 내 크기 × 1.3 + 24)를 돌며 닿는 적에 피해, 특수 적 구슬을 막는다(막은 진주는 사라졌다가 재생) | 같은 적 재타격 0.4초. 진주 재생 시간 | 진주 원(`#DCEFE0` + `#7CC4A4` 고리) |
| A05 | 관통 `pierce` | W1 | 구슬이 맞은 뒤 사라지지 않고 P마리 더 꿰뚫는다. 꿰뚫을 때마다 피해 × 유지율 | 없음. 같은 구슬은 같은 적을 한 번만 | 구슬 모양만(발톱 초승달) |
| A06 | 파사인 `mark` | W2 | T초 동안 받는 보물 피해 +X%. 3단계 이상이면 다른 요괴의 먹잇감 점수 × 0.6(사냥당하기 쉬움) | 다시 맞으면 시간만 새로 고침(중첩 없음) | 머리 위 금 마름모(`#EFBD6C`, 먹 외곽) |
| A07 | 회선 `boomerang` | W3 | 첫 명중이나 사거리 끝에서 방향을 돌려 플레이어 쪽으로 돌아온다. 돌아오는 길에 R마리까지 꿰뚫으며 피해 × b. 플레이어에게 닿으면 사라짐 | 없음. 가는 길·오는 길 각각 같은 적 한 번 | 구슬 모양만(V) |
| A08 | 위협 `fear` | W4 | T초 동안 강제로 '도망' 의도(플레이어에게서), 그동안 **플레이어를 먹지 못한다**. 사냥도 안 함 | 끝난 뒤 면역 1.0초 | 머리 위 붉은 톱니 선 3개(`#C45148`) |
| A09 | 작열 `burn` | S1 | T초 동안 초당 `총량/기본 T` 피해. 저항으로 T가 줄면 받는 총량도 준다 | 다시 맞으면 시간 새로 고침, 초당 피해는 큰 값 | 적 몸 위 작은 불꽃 삼각 2개(`#D9503F` + `#FFD3A2`) |
| A10 | 분화 `split` | S2 | 맞은 자리에서 갈래 n개가 원을 n등분한 방향(맞은 적 쪽 제외)으로 튄다. 갈래 피해 × c, 사거리 짧음, 다시 갈라지지 않음 | 없음. 갈래도 `combat.maxOrbs` 120에 포함 | 갈래는 작은 불덩이 1개 |
| A11 | 선무 `zone` | S3 | 구슬이 맞거나 사거리 끝에 닿은 자리에 반경 Rz 구름이 Tz초 남는다. 안의 적은 이동 × (1 − s), 초당 구슬 피해 × d | 동시 구름 상한(넘으면 가장 오래된 것 제거) | 구름 외곽선(원 3개 겹친 윗선, `#FFFDF1` 면 + `#C06558` 2.5 외곽) |
| A12 | 폭염 `explode` | S4 | 맞은 자리 반경 Re 안의 다른 적에게 구슬 피해 × e | 폭발 초당 15회 상한 | 동심 고리 2개(`#D9503F`·`#EFBD6C`), 0.15초 |
| A13 | 빙결 `freeze` | N1 | T초 동안 이동·사냥·먹기·발사·자가 진화가 멈춘다(다른 적에게는 먹힐 수 있음) | 끝난 뒤 면역 1.0초 | 적 둘레 육각 외곽선(`#E4EAEE` + `#2F3B57`) |
| A14 | 흡정 `drain` | N2 | 구슬로 깎은 면적의 q만큼 내 면적이 는다(먹기 성장과 같은 면적 계산) | 성장 상한: 내 면적의 4%/화면 초 | 적 → 나 가는 선(`#2F3B57`), 0.1초 |
| A15 | 와류 `vortex` | N3 | 맞은 자리에 소용돌이 Tv초. 반경 Rv 안의 적을 중심 쪽으로 속도 v로 끌어당김 | 생성 간격 0.5초, 동시 상한 | 회전하는 호 3개(`#536581` + `#E4EAEE`) |
| A16 | 대풍 `gust` | N4 | 맞은 적을 구슬 방향으로 D만큼 밀고(0.15초에 걸쳐) 0.2초 경직. 4·5단계는 둘레 적도 절반 거리 | 같은 적 재밀기 0.3초 | 밀린 적 뒤 짧은 바람 선 2개(`#899BB3`) |

### 4-3. 단계별 수치 (단계 1 → 5, 강화 레벨 적용 방식, 상한)

시간은 화면 초, 거리는 월드 단위, 비율은 구슬 1발 피해(등급·보물 레벨 포함) 기준.

| ID | 수치 | 1단계 | 2단계 | 3단계 | 4단계 | 5단계 | 강화 레벨 | 저항 | 상한 |
|---|---|---:|---:|---:|---:|---:|---|---|---|
| A01 | 튐 횟수 | 1 | 1 | 2 | 2 | 3 | + lvInt | — | 6 |
| A01 | 튐 반경 R | 90 | 100 | 110 | 125 | 140 | × lv | — | 220 |
| A01 | 감쇠 | 0.50 | 0.55 | 0.60 | 0.65 | 0.70 | — | — | — |
| A02 | 지속 T | 2.0 | 2.5 | 3.0 | 3.5 | 4.5 | × lv | × r | 8.0 |
| A02 | 재사용 대기 | 3.0 | 2.6 | 2.2 | 1.8 | 1.4 | — | — | — |
| A02 | 동시 아군 | 1 | 1 | 2 | 2 | 3 | +10에서 +1 | — | 4 |
| A03 | 유도 세기 h | 0.40 | 0.55 | 0.70 | 0.85 | 1.00 | — | — | 1.0 |
| A03 | 회전 배율 | 1.00 | 1.10 | 1.25 | 1.40 | 1.60 | × lv | — | 2.4 |
| A03 | 재표적 반경 | 120 | 140 | 160 | 190 | 220 | — | — | — |
| A04 | 진주 수 k | 1 | 2 | 2 | 3 | 4 | + lvInt | — | 6 |
| A04 | 접촉 피해 | 0.50 | 0.60 | 0.70 | 0.80 | 1.00 | — | — | — |
| A04 | 진주 재생 | 3.0 | 2.5 | 2.0 | 1.6 | 1.2 | ÷ lv | — | 최소 0.8 |
| A05 | 추가 관통 P | 1 | 1 | 2 | 2 | 3 | + lvInt | — | 6 |
| A05 | 관통 후 유지율 | 0.70 | 0.75 | 0.80 | 0.85 | 0.90 | — | — | — |
| A06 | 받는 피해 +X% | 15 | 20 | 25 | 30 | 40 | × lv | — | 80 |
| A06 | 지속 T | 2.0 | 2.5 | 3.0 | 3.5 | 4.0 | × lv | × r | 6.4 |
| A07 | 되돌이 피해 b | 0.60 | 0.70 | 0.80 | 0.90 | 1.00 | — | — | — |
| A07 | 되돌이 관통 R | 1 | 1 | 2 | 2 | 3 | + lvInt | — | 5 |
| A07 | 사거리 + | 0% | 10% | 15% | 20% | 25% | — | — | — |
| A08 | 지속 T | 1.0 | 1.3 | 1.6 | 2.0 | 2.5 | × lv | × r | 4.0 |
| A09 | 총 화상 피해 | 0.6 | 0.8 | 1.0 | 1.3 | 1.6 | — | (T로) | — |
| A09 | 지속 T | 1.5 | 2.0 | 2.5 | 3.0 | 3.5 | × lv | × r | 5.6 |
| A10 | 갈래 n | 2 | 2 | 3 | 3 | 4 | + lvInt | — | 6 |
| A10 | 갈래 피해 c | 0.40 | 0.45 | 0.50 | 0.55 | 0.60 | — | — | — |
| A10 | 갈래 사거리 | 120 | 130 | 150 | 170 | 200 | × lv | — | 280 |
| A11 | 반경 Rz | 40 | 50 | 60 | 70 | 85 | × lv | — | 130 |
| A11 | 지속 Tz | 1.5 | 2.0 | 2.5 | 3.0 | 3.5 | — | — | — |
| A11 | 둔화 s | 20% | 25% | 30% | 35% | 40% | — | × r | 40% |
| A11 | 초당 피해 d | 0.20 | 0.25 | 0.30 | 0.35 | 0.40 | — | — | — |
| A11 | 동시 구름 | 3 | 3 | 4 | 5 | 6 | — | — | 6 |
| A12 | 반경 Re | 40 | 50 | 60 | 75 | 90 | × lv | — | 140 |
| A12 | 둘레 피해 e | 0.50 | 0.55 | 0.60 | 0.70 | 0.80 | — | — | — |
| A13 | 지속 T | 0.6 | 0.8 | 1.0 | 1.3 | 1.6 | × lv | × r | 2.6 |
| A14 | 흡수율 q | 0.10 | 0.13 | 0.16 | 0.20 | 0.25 | × lv | — | 0.40 |
| A15 | 반경 Rv | 80 | 95 | 110 | 130 | 150 | × lv | — | 220 |
| A15 | 끌기 속도 v | 60 | 75 | 90 | 110 | 130 | — | × r | — |
| A15 | 지속 Tv | 0.8 | 1.0 | 1.2 | 1.4 | 1.6 | — | — | — |
| A15 | 동시 소용돌이 | 2 | 2 | 3 | 3 | 4 | — | — | 4 |
| A16 | 밀기 거리 D | 40 | 55 | 70 | 90 | 110 | × lv | × r | 180 |
| A16 | 둘레 밀기 반경 | 0 | 0 | 0 | 40 | 60 | — | — | — |

- 단계가 오를수록 모든 줄기의 주 수치가 오른다(사용자 결정). 1단계 칸은 1단계 뿌리가 있는 8개 줄기(E1·E4·W3·W4·S2·S4·N2·N4)에서만 쓰지만, 표는 16개 모두 채워 둔다.
- 데이터 모양(T3가 `src/systems/tuning-abilities.js`에 그대로 옮김):

```js
export const ABILITY_LEVEL = { perLevel: 0.04, intEvery: 5 };
export const ABILITY_RESIST = { base: 0.5, minSec: 0.15, minRatio: 0.1 };
export const ABILITIES = {
  chain: { stem: 'E1', name: '뇌쇄', hops: [1,1,2,2,3], range: [90,100,110,125,140], falloff: [0.5,0.55,0.6,0.65,0.7],
           scale: { hops: 'int', range: 'lv' }, cap: { hops: 6, range: 220, eventsPerSec: 12 } },
  // ... 16개 모두 위 표와 같은 키 이름으로
};
```

### 4-4. 매혹 동작

| 항목 | 규칙 |
|---|---|
| 걸림 | 재사용 대기가 끝났고 아군 수가 상한 미만일 때, 그 뒤 처음 맞은 적(특수 적 포함)에게 건다. 상한이면 걸지 않고 대기도 쓰지 않는다. 그 구슬의 피해는 그대로 들어간다 |
| 상태 값 | `enemy.charmUntil`(시뮬레이션 시계), `enemy.charmGraceUntil`, `enemy.charmImmuneUntil`. 걸 때 `reversed`를 지운다 |
| 아군의 사냥 | `pickIntent`에서 플레이어를 위협·먹이 어느 쪽으로도 보지 않는다. 감지 거리 × 1.2 안에서 자기가 먹을 수 있는(`canEat`) 적을 쫓고, 자기를 먹을 수 있는 적에게서는 도망한다. 쫓을 것이 없고 플레이어와 260 이상 떨어지면 플레이어 쪽으로 돌아온다(목줄) |
| 다른 적의 대우 | 아군도 평범한 요괴로 본다(쫓거나 도망하거나 먹을 수 있다) |
| 요력 귀속 | 아군이 먹은 먹이의 `preyValue` 100%를 플레이어 요력에 더한다. `eat` 이벤트에 `byAlly: true`를 실어 보내고, `session.onEat`은 이때 **요력만** 더한다(식성·성향·보물 드롭은 기록하지 않음. 식성은 "내가 먹은 것"이기 때문). 결과 화면에 "매혹한 요괴가 번 요력"을 따로 적는다 |
| 아군 자신의 성장 | 먹으면 크기는 지금처럼 커진다(면적). 요력·식성은 쌓이지 않고 자가 진화·몸집 강화도 하지 않는다 |
| 플레이어와의 관계 | 아군 기간과 유예 기간에는 플레이어와 아군이 서로 먹지 않는다(충돌 무시). 플레이어 구슬·능력은 아군을 통과한다. 특수 적 아군은 쏘지 않는다 |
| 지속 | 4-3 표의 T × lv × r(Δ). Δ는 걸 때의 단계 차 |
| 해제 | ① 시간이 끝남 ② 아군이 다른 적에게 먹힘. ①이면 `charmGraceUntil = 지금 + 1.0초`(화면 초) 동안 플레이어에게서 도망 의도로 둔 뒤 평소 AI로 돌아간다. 같은 적은 1.5초 동안 다시 매혹되지 않는다 |
| 역전과의 관계 | 아군은 역전 대상이 아니다. 해제 뒤 유예가 끝나면 평소처럼 크기·단계 규칙을 따른다 |
| 진화 | 플레이어가 판 안에서 진화해도 걸린 매혹은 끝까지 간다. 줄기가 바뀌면 새로 걸리지 않을 뿐이다 |

### 4-5. 적도 능력을 쓰는가 — 권장: **쓰지 않는다**

| 안 | 장점 | 단점 |
|---|---|---|
| **A (권장) 적은 능력 없음.** 특수 적은 지금 구슬(크기 감소) 그대로 | 플레이어 쪽 상태이상(빙결당한 플레이어 등)을 만들 필요가 없다. 72마리 × 효과를 계산하지 않아 휴대폰 성능이 안전하다. "줄기 능력 = 내 것"이라는 수집 동기가 선명하다 | 적의 다양성은 모양과 단계뿐 |
| B 4·5단계 특수 적만 자기 줄기 발사체 **모양과 색**으로 쏨(효과는 지금과 같음) | 화면 다양성. 구현은 `enemyFire`의 그리기만 바꾸면 된다 | 플레이어 구슬과 헷갈릴 수 있어 붉은 점선 고리를 꼭 유지해야 함 |
| C 특수 적이 실제 능력을 씀 | 긴장감 | 플레이어 상태이상 설계·조작감 훼손·성능 부담. 시제품 범위를 넘음 |

A로 시작하고, 재미 확인 뒤 B를 고려한다.

### 4-6. 성능 상한 (적 72마리 · 템포 최대 3.9 × 1.5 = 5.85 · 휴대폰 60fps)

`CONFIG.tempo` 3.9에 속도 곡선 최대 1.5를 곱하면 한 프레임 시뮬레이션은 약 0.0975초이고, `maxStep 1/60`으로 6단계로 나뉜다. 능력 처리는 단계마다 돈다.

| 항목 | 상한 | 이유 |
|---|---|---|
| 구슬(갈래 포함) | `combat.maxOrbs` 120 (지금 값) | 갈래·되돌이가 늘어도 넘지 않음 |
| 호신주 진주 | 6 | 단계마다 작은 반경 격자 조회 6번 |
| 선무 구름 / 와류 | 6 / 4 | 단계마다 격자 조회 ≤ 10번 |
| 뇌쇄 연쇄 | 한 번에 튐 6, 초당 사건 12 | 튐마다 격자 조회 1번 |
| 폭염 | 초당 15회 | 폭발마다 격자 조회 1번 |
| 매혹 아군 | 4 | AI 분기 추가 |
| 상태이상 | 적마다 숫자 필드만(`frozenUntil`, `fearUntil`, `burnUntil`, `burnDps`, `markUntil`, `markAmp`, `slowMult`, `knockUntil`, `knockVx`, `knockVy`, `charmUntil` …). 프레임마다 배열·객체를 새로 만들지 않는다 | GC 끊김 방지 |
| 유도 표적 찾기 | 학익 추적과 보물 유도 모두 `aimTarget`의 전체 적 반복 대신 격자 조회(`queryGrid`, 반경 = 사거리) | 지금 구조는 구슬 120 × 적 72 × 6단계 = 프레임당 약 5.2만 번 검사 |
| 그리기 | 구슬은 지금처럼 `combat.graphics` 하나, 상태 표시는 새 `statusGraphics` 하나. 적마다 게임 오브젝트를 만들지 않는다. 파티클은 `motion.maxParticles` 160 안 | 그리기 호출 수 고정 |
| 발사체 그림 | 구슬 하나에 도형 ≤ 8개(5단계 기준) | 구슬 120 × 8 = 960 도형 |
| 검사 | 노드 테스트: 적 72 + 구슬 120 + 모든 상한을 채운 상태로 300단계 → 능력 처리 추가 시간 평균 ≤ 0.25ms/단계(개발 PC). 휴대폰: `?stress=abilities`로 같은 상태를 만들어 평균 55fps 이상 | 휴대폰은 PC보다 약 4배 느리다고 보고 프레임당 시뮬레이션 예산을 6ms(6단계 × 1ms)로 잡음 |

---

## 5. 4·5단계 수치

| 키 | 지금 | 제안 | 근거 |
|---|---|---|---|
| `EVOLVE_COST`(tuning-evolution.js) | `{2:100, 3:400}` | `{2:100, 3:400, 4:2000, 5:8000}` | 아래 "같은 단계 먹이로 몇 번" 표 |
| `config.score.stageMult` | `{1:1, 2:4, 3:16}` | `{1:1, 2:4, 3:16, 4:48, 5:128}` | 4배씩 늘리면 5단계 먹이 1마리가 +15 판매가(10,000)에 가까워져 보물 경제가 무너짐. 4·5단계는 ×3, ×2.7로 늦춤 |
| `config.levelUp.evolveMaxStage` | 3 | 5 | 판 안 진화 카드를 5단계 미만까지 |
| `levelup.js`의 옛 `MAX_STAGE = 3` | 3 | `CONFIG.pace.maxStage` | 옛 창(LevelUpView)도 같은 기준 |
| `rules.nextProgress` `stage < 3` | 3 | `stage < min(pace.maxStage, 플레이어 단계 + selfEvolveLead)` | 3-3 |
| `config.enemy.selfEvolveLead` | 없음 | 1 | 3-3 |
| `config.pace.maxStage` | 5 | 5 (이미 됨) | 속도 곡선 단계 몫이 5단계에서 끝남 |
| `world.spawnStage` 범위 | 1~3 | 1~5 | 아래 가중치 표 |
| `config.eating.stageOverrideStep` | 없음 | 1 (8절 질문 2) | 아래 먹기 규칙 |

**같은 단계 먹이(크기 40, 등급 C)로 진화하려면 몇 마리** — `preyValue = 10 × (40/20)^1.6 × 단계 배율`

| 진화 | 비용 | 한 단계 아래 먹이 1마리 | 마리 수 |
|---|---:|---:|---:|
| 1→2 | 100 | 1단계 30 | 3.3 |
| 2→3 | 400 | 2단계 121 | 3.3 |
| 3→4 | 2,000 | 3단계 485 | 4.1 |
| 4→5 | 8,000 | 4단계 1,455 | 5.5 |

뒤로 갈수록 조금씩 오래 걸린다(마지막 진화의 무게). 5단계 먹이 1마리는 3,880으로 +13 보물 판매가(약 4,000, `TREASURE.prices` 기하 보간)와 비슷하다. 밸런스 시뮬레이션은 하지 않았다.

**`config.enemy.stageWeights` (플레이어 단계 → 새 적의 단계 1~5 가중치)**

| 플레이어 단계 | 1 | 2 | 3 | 4 | 5 |
|---|---:|---:|---:|---:|---:|
| 1 | 0.55 | 0.38 | 0.07 | 0 | 0 |
| 2 | 0.35 | 0.45 | 0.20 | 0 | 0 |
| 3 | 0.22 | 0.38 | 0.32 | 0.08 | 0 |
| 4 | 0.10 | 0.25 | 0.35 | 0.25 | 0.05 |
| 5 | 0.05 | 0.15 | 0.30 | 0.30 | 0.20 |

1·2단계 행은 지금 값 그대로다. 3단계 행에 4단계 적을 8% 넣어 "다음 목표"를 미리 보여 준다.

**먹기 규칙 `stageOverride`가 5단계에서도 맞는가 — 단계 차에 따라 늘리기를 권장**

- 지금 규칙: 단계가 다르면 상위가 먹는다. 단 하위가 상위의 2배 이상 크면 하위가 먹는다. 단계 차는 보지 않는다.
- 5단계에서 생기는 문제: 진화 직후 크기 28인 5단계 용을, 자라서 크기 56이 된 1단계 벌레가 먹는다. 적은 판 안에서 계속 자라므로 드문 일이 아니다. 반대로 1단계 플레이어가 5단계 적을 크기만으로 이기는 것도 같은 2배라서 단계의 무게가 약하다.
- 제안: 하위가 먹으려면 `stageOverride + stageOverrideStep × (Δ − 1)`배 이상 커야 한다(Δ = 단계 차). 값 1이면 단계 차 1·2·3·4에 2·3·4·5배. 크기 28인 5단계 용을 먹으려면 4단계 56, 3단계 84, 2단계 112, 1단계 140(= `maxSpawnSize`)이 필요하다.
- `canEat` 한 곳만 바꾸면 적 AI(위협 판정)·자동 조준·역전 판정이 함께 따라간다. 보물 역전(`reversalPair`)은 지금처럼 단계를 무시한다. 부가 옵션 '이소승대'는 `stageOverride` 기본값에만 빼기를 적용한다.

---

## 6. 저장 이전과 도감 성능

### 6-1. 저장 이전

| 항목 | 처리 |
|---|---|
| `formId`·`stage` | 기존 17종 id·단계를 바꾸지 않으므로 `normalizeProgress`의 "id와 단계가 맞는 형태" 검사를 그대로 통과한다. 박이·현구 방위도 그대로 |
| `discovered` | 그대로. 도감 분모만 17 → 171로 바뀐다 |
| `SAVE.version` | 1 유지. 필드 추가·이름 변경이 없다 |
| 새 필드 | 필수 없음. 능력·아군·상태이상은 판 안 상태라 저장하지 않는다 |
| 달라지는 동작 | ① 2단계에서 역진화하면 `mimul` 대신 같은 줄기의 1단계 미물로 간다 ② 새끼 4종의 진화 후보가 늘어난다(기존 후보 3개는 그대로 포함) ③ 기존 형태도 줄기 능력이 생긴다 |
| 앞으로 id를 바꿔야 할 때 | `FORM_ID_ALIASES = { 옛id: 새id }`를 `save.js`에 두고 `normalizeProgress`에서 먼저 바꾼다. 지금은 비워 둔다 |
| 검사 | 기존 17종 각각으로 만든 옛 저장(`formId`, `stage`, `discovered` 17개)을 불러 그대로인지, `pendingDevolve: true`인 2단계 저장이 같은 줄기 1단계로 가는지 |

### 6-2. 텍스처와 도감 (art-direction 6-2 충돌 6건 반영)

| # | 충돌 | 결정 |
|---|---|---|
| 1 | 원화 캔버스 160 고정 | `config.render.artUnitsByStage = {1:160, 2:160, 3:160, 4:200, 5:240}`, 텍스처는 단위당 2px(320/400/480). `Actor.setSize`의 화면 너비 = `size × artUnits(형태) / bodyRadius(42)`. 몸 반지름 42와 판정은 그대로. 몸 중심 좌표는 캔버스 가운데로 옮겨 그린다 |
| 2 | 선 갈래 흰 테두리가 모든 부품에 | 부품 목록(`parts-catalog.js`)에 `halo: false`를 두어 장식(비단 띠·구슬·광배·부적·문양)은 흰 테두리를 받지 않는다. 2단계 이하 형태는 `seon`이어도 흰 테두리 없음 |
| 3 | 텍스처 메모리(전부 구우면 약 95MB, 계산값) | 판에서는 지금처럼 나온 형태만 굽고, **크리처 텍스처 예산 24MB**(`config.render.textureBudgetMB`)를 넘으면 화면의 스프라이트가 쓰지 않는 것부터 오래된 순서로 지운다(참조 수 + LRU). 등급 고리는 굽지 않고 겹쳐 그린다(8배 방지) |
| 4 | 스프라이트 좌우 뒤집기 | 부품에 글자 금지(부적도 부호만). 한쪽 손 도구는 뒤집혀도 문제없는 것만 |
| 5 | 머리 위 단계 점이 관·광륜과 겹침 | `config.render.stageMarkLift = {1:1.7, 2:1.7, 3:1.7, 4:2.1, 5:2.5}`를 `drawStageMark`의 `size ×` 배수로 쓴다 |
| 6 | 작은 화면에서 문양이 사라짐 | 단계 구분은 꼬리·머리 수·관·광륜·날개 같은 큰 도형으로. 문양은 도감·진화 화면용. 갤러리를 48·96·192px로 줄여 검수 |
| 도감 | 지금 `GalleryScene`은 모든 형태를 320px로 굽고 `toDataURL`을 부름(171종이면 휴대폰에서 수 초 + 수십 MB) | 카드 이미지는 128px 썸네일로 따로 그려 dataURL만 남기고 텍스처는 바로 지운다. 화면에 보이는 카드만(IntersectionObserver) 프레임당 3장씩 만든다. `formId → dataURL` 캐시를 진화 카드·빠른 성장 카드(`getFormImage`)와 같이 쓴다. 미발견 형태는 같은 썸네일에 CSS `filter: brightness(0)`로 먹 실루엣. 큰 그림은 카드를 눌렀을 때 1장만 굽고 닫으면 지운다. 방위별 색 미물 변형 4장은 1단계 8종으로 대체되므로 뺀다 |

---

## 7. 구현 분할

### 7-1. 순서와 병렬

```
S4(진행 중) 커밋 ──▶ T1 데이터·규칙(Sonnet) ──┬─▶ T2 부품·발사체 그림(Codex) ──┐
                                              └─▶ T3 능력 시스템(Sonnet)     ──┴─▶ T4 통합 검수(Opus)
```

- **T1은 S4가 커밋한 뒤 시작한다.** S4가 지금 `config.js`·`combat.js`·`enemy.js`·`enemyAI.js`·`levelup.js`·`evolution.js`를 고치고 있어 겹친다.
- **T2와 T3는 나란히 해도 된다.** 고치는 파일이 겹치지 않는다. 둘이 만나는 곳은 `src/art/orbs.js`의 `drawOrb(g, orb, styleKey, tier)` 하나뿐이고, T1이 지금 구슬 그림으로 된 자리표시 구현을 먼저 만들어 둔다.
- `config.js`의 새 키(그림·적·먹기 관련)는 T1이 모두 넣는다. T2·T3는 `config.js`를 고치지 않는다(T3의 능력 수치는 새 파일).

### 7-2. 작업별 범위

| 작업 | 담당 | 할 일 | 고쳐도 되는 파일 | 끝 기준(테스트) |
|---|---|---|---|---|
| T1 데이터·규칙 | Sonnet | 2-3 표 171행을 `forms.js`로 옮김(`hanja`, `stem`, `entry`, `deco` 추가, `next`는 3-1 규칙으로 생성). `stems.js`(1-2 표 16행: `id, dir, name, ability, orbStyle, boostMult, cross`). `parts-catalog.js`(새 부품 39개 + 기존 55개 이름·장식 점수·`halo`·장식 세트 7개). `buildChoices` 2판·`devolve` 순서·`pickEvolution` 줄기 반영·`canEat` 단계 차·`nextProgress` 상한·`spawnStage` 1~5·`formFor(dir, 1)`. 5절 수치. `orbs.js` 자리표시. 각 형태에 줄기의 `boostMult`를 내려 주고(`booster.js`는 `form.boostMult`를 먼저 읽음), `CONFIG.booster.formMult` 임시 표와 `tests/booster.test.mjs`의 임시 표 검사(새끼 범·새 1.1~1.15)를 지운다. 설계값은 W1·S1이 1.20이라 그 검사와 다르다. `creature.js`는 `drawCreature` 반복문 2줄만: 인자형 부품을 풀고 모르는 부품은 건너뜀(T2 전까지 게임이 멈추지 않게) | `src/data/forms.js`, `src/data/stems.js`(새), `src/data/parts-catalog.js`(새), `src/systems/evolution.js`, `src/systems/tuning-evolution.js`, `src/systems/rules.js`, `src/systems/levelup.js`, `src/config.js`, `src/game/world.js`, `src/game/enemy.js`(형태 고르기·자가 진화 상한만), `src/state/save.js`(별칭 자리만), `src/art/orbs.js`(새, 자리표시), `src/art/creature.js`(반복문 2줄), `tests/forms-data.test.mjs`(새), `tests/evolution.test.mjs`, `tests/rules.test.mjs`, `tests/levelup.test.mjs`, `tests/save.test.mjs`, `tests/fixtures-forms.mjs`, `tests/booster.test.mjs`(임시 표 검사만) | 형태 171행·단계별 8/24/60/50/28(+`mimul`)·방위별 42/43/42/43. 줄기 16개, 각 줄기 2~5단계에 형태가 있고 단계마다 입구 정확히 1개. id 중복 없음. 기존 17종 id·단계·방위·`parts` 불변. 2단계 이상 모두 `from` ≥ 1. 모든 `parts`·`deco` 이름이 catalog에 있음. 새끼 4종의 새 `next` ⊇ 옛 `next`. `buildChoices`: ①②의 줄기가 다름, 3-2 예시 3개 재현, rng를 바꿔도 ①② 같음, 미지 후보에서 ①② 제외. `devolve` 같은 줄기 우선. `canEat` 단계 차 2·3·4·5배. `spawnStage` 5행. `nextProgress` 상한. `preyValue` 4·5단계. 옛 저장 17종 로드. `node --test "tests/*.test.mjs"` 전부 통과, 모든 src `node --check` |
| T2 부품·발사체 그림 | Codex | art-direction 7장 새 부품 39개와 인자형(`multiHead`·`multiTail`·`multiWings`·`cloudRibbon`·`halo`)을 `creature.js`에 그림. 층 규칙, `decorate(form)`(세트 펼치기 + 장식 점수 구간에 맞춰 덜기), 단계별 캔버스(6-2의 1), `halo:false`, 텍스처 예산 LRU, 단계 점 높이. `orbs.js`에 16개 발사체 모양 × 단계 5티어(1: 도형+먹 외곽 1.6 / 2: +짧은 꼬리 / 3: 꼬리 ×1.5 + 하이라이트 / 4: +금 테 1.4 / 5: +꼬리 2줄 + 금 불티 2점, 보이는 크기 ×1.0~1.3, 판정 반지름은 그대로). 도감 지연 썸네일 | `src/art/creature.js`, `src/art/orbs.js`, `src/art/marks.js`, `src/game/actor.js`(크기 계산만), `src/scenes/GalleryScene.js`, `index.html`(도감 영역만), `src/style.css`(도감 카드만), `tests/art-parts.test.mjs`(새), `tests/texture-cache.test.mjs`(새), `tests/orbs.test.mjs`(새) | catalog의 모든 부품이 가짜 Graphics 기록기로 오류 없이 그려짐. 171종 모두 그려짐. 3~5단계 형태의 장식 점수가 구간 안(덜어 낸 뒤). 글자 그리기 호출 없음. 예산을 넘기면 쓰지 않는 텍스처부터 지움. 도감 생성 직후 `drawCreature` 호출 ≤ 12. `drawOrb` 16 × 5티어 오류 없음, 구슬당 도형 ≤ 8. 같은 `size`에서 1·4·5단계 몸 크기가 같게 보임(갤러리 캡처를 T4가 확인) |
| T3 능력 시스템 | Sonnet | `abilities.js`(순수 함수: `abilityOf(form)`, `lv`, `lvInt`, `resist`, 단계·레벨 수치 계산), `tuning-abilities.js`(4-3 표), `status.js`(적 상태 필드·타이머·면역·화면 초 → 시뮬레이션 초 변환), `combat.js`(`applyTreasureDamage` 한 곳, 관통·되돌이·갈래·폭발·연쇄·구름·소용돌이·진주·유도 격자 조회), `enemyAI.js`(빙결·위협·매혹·표식 먹잇감 가중), `enemy.js`(상태 반영 이동·아군의 먹기), `enemyFire.js`(빙결·매혹 중 발사 정지, 진주 막기), `PlayScene.js`(아군 먹기 요력, 플레이어-아군 충돌 무시, 상태 그리기, `?stress=abilities`), `session.js`(`byAlly`), 진화 카드·화면에 능력 이름 한 줄 | `src/systems/abilities.js`(새), `src/systems/tuning-abilities.js`(새), `src/game/status.js`(새), `src/game/combat.js`, `src/game/enemyAI.js`, `src/game/enemy.js`, `src/game/enemyFire.js`, `src/scenes/PlayScene.js`, `src/game/session.js`, `src/ui/QuickPick.js`, `src/ui/EvolveView.js`, `tests/abilities.test.mjs`(새), `tests/status.test.mjs`(새), `tests/charm.test.mjs`(새), `tests/combat-abilities.test.mjs`(새), `tests/perf-abilities.test.mjs`(새) | 4-3 표와 `tuning-abilities.js`가 같음(표 스냅샷). `lv(15)=1.6`, `lvInt(15)=3`, `r(2)=0.25`, 최소 효과 미만이면 안 걸림. 모든 상한 지킴(튐 6, 구름·소용돌이·진주·아군 수, 구슬 120). 빙결 중 이동 0, 위협 중 플레이어를 못 먹음, 면역 시간. 매혹: 아군이 먹으면 플레이어 요력 += `preyValue`, 식성·성향 불변, 아군과 플레이어 충돌 없음, 해제 뒤 유예. 모든 피해가 `applyTreasureDamage`를 지나 역전·처치가 한 번씩만. 카드 멈춤 동안 타이머 정지. 성능 테스트 4-6 기준. `node --test` 전부 통과 |
| T4 통합 검수 | Opus | T1~T3 합친 뒤 리뷰, 갤러리 48/96/192px 캡처, 휴대폰 `?stress=abilities` fps, 3-2 예시를 실제 화면에서 확인, 문서와 코드 차이 정리 | 문서만 | 리뷰 지적 0건 또는 수정 요청서 |

---

## 8. 사용자에게 물을 남은 결정 (5개)

| # | 질문 | 선택지 | 추천 |
|---|---|---|---|
| 1 | 식성으로 다른 방위(=다른 줄기·능력)로 건너가는 길을 열까? `next`는 같은 방위만 담지만, 3-2는 식성 1위가 다른 방위면 그 방위 입구를 후보에 더한다 | ① 연다 + ②는 "지금 줄기 유지" 자리(3-2) ② 같은 방위 안에서만(다른 방위는 미지로만) | **①** — 식성 막대가 2단계 이후에도 의미를 갖고, 지금 줄기를 지키는 길도 늘 남는다 |
| 2 | 단계가 다른 요괴끼리 먹기: 하위가 이기는 크기 배수를 단계 차에 따라 늘릴까? (지금 사용자 결정은 단계 차와 상관없이 2배) | ① 단계 차 1·2·3·4에 2·3·4·5배 ② 지금처럼 2배 고정 | **①** — 2배 고정이면 자란 1단계 벌레가 갓 진화한 5단계 용을 먹는다 |
| 3 | 4·5단계 진화 비용과 점수 배율 | ① 비용 2,000 / 8,000, 배율 ×48 / ×128 ② 4배씩 그대로: 1,600 / 6,400, ×64 / ×256 | **①** — ②는 5단계 먹이 1마리가 약 7,800 요력이라 보물 강화·판매 순환이 의미를 잃는다 |
| 4 | 본체 등급(S+ ×2.0 ~ F ×0.5)을 능력의 지속·범위에도 곱할까? | ① 피해에만(지금 구슬과 같음) ② 지속·범위에도 | **①** — ②면 S+ 빙결이 F의 4배라 등급 차이가 조작감을 지배하고, 상한에 자주 걸린다 |
| 5 | 적도 줄기 능력을 쓸까? | ① 쓰지 않음(특수 적은 지금 구슬) ② 4·5단계 특수 적만 줄기 발사체 모양·색으로(효과는 지금과 같음) ③ 실제 능력 사용 | **①**, 재미 확인 뒤 ② — 4-5 |

## 9. 사용자 결정 (2026-11-23)
1. 식성으로 다른 방위 줄기로 건너가는 진화를 연다(3-2의 ①안). 지금 줄기 유지 선택지는 항상 남긴다.
2. 단계가 다른 요괴끼리 먹기: 하위가 이기려면 단계 차 1·2·3·4에 2·3·4·5배(①안).
3. 4·5단계 진화 비용 2,000 / 8,000, 점수 배율 ×48 / ×128(①안).
4. 본체 등급은 능력의 피해에만 곱한다(지속·범위 제외, 추천안 그대로).
5. 적은 능력을 쓰지 않는다. 단 4·5단계 특수 적의 구슬은 그 적 줄기 발사체의 모양·색으로 그린다(효과는 지금 구슬과 같음, ②안).
