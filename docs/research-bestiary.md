# 요괴·신수 후보 조사 — 산해경 중심 (형태 약 170종 확장용)

- 작성: 조사 담당 (2026-11-23). 코드(src/, tests/)는 건드리지 않음. 표만 정리한 자료이며 형태 확정이 아니다.
- 후보 216개 (핵심 170 + 예비 46). 핵심 170은 사용자가 정한 단계 분포(1단계 8 / 2단계 24 / 3단계 60 / 4단계 50 / 5단계 28)에 맞춘 풀이고, 예비는 대체용이다.
- 기존 게임·애니메이션 캐릭터 이름은 넣지 않았다. 한국 설화·도교 신선·용생구자·사신 같은 고전 신화 소재만 썼다.

## 1. 조사 방법과 출처

| 구분 | 내용 |
|---|---|
| 도구 | ego-browser (Ego Lite 브라우저). Bing 검색, 페이지 열람, 텍스트 추출 |
| 검색어 | `산해경 요괴 목록 이름 한자` / `山海經 異獸 列表 圖鑑` / `산해경 신수 구미호 박이 필방 천구 한자` |
| 1차 원문 | 위키문헌 山海經 18편(남산경~해내경) 전문을 내려받아 곽박 주석을 지우고 읽음. 산경 5편은 한 줄씩 읽고 `其狀如…，其名曰…` 항목을 뽑음 → https://zh.wikisource.org/wiki/山海經 |
| 교차 확인 | 神獸百科 SHANHAI(242개 항목) https://www.shanhai.art/wiki/bestiary · 山海经在线 異獸圖鑑(391조) https://www.shanhaij.wiki/beasts · The Chinese Bestiary(72종) https://chinesebestiary.com/ · 나무위키 산해경 https://namu.wiki/w/산해경 · 한국어 위키백과 산해경 https://ko.wikipedia.org/wiki/산해경 · 중국어 위키백과 龍生九子 https://zh.wikipedia.org/wiki/龍生九子 · 영어 위키백과 List of supernatural beings in Chinese folklore https://en.wikipedia.org/wiki/List_of_supernatural_beings_in_Chinese_folklore |
| 후대·설화 | 용생구자·사신·4흉·신선(열선전 계열)·한국 설화는 각 항목 URL(위키백과 중심)에서 확인. 표에 적은 외형은 일반적으로 알려진 도상을 부품 말로 요약한 것 |
| URL 검증 | 표에 쓴 URL 82개를 모두 접속해 HTTP 200을 확인함. 처음에 404였던 3개(ko 두억시니·학 문서, zh 虯 문서)는 나무위키 두억시니, ko 두루미, zh 龍 문서로 바꿈 |
| 막힌 곳 | 없음. 단, 중국어 위키백과에 `山海經神獸列表` 문서는 없고(문서 없음 안내만 나옴), 한국어 위키백과 `분류:산해경의 괴물`은 문서 8개뿐이라 목록 근거로 쓰지 못했다. Bing 이미지 검색은 화면만 보고 내려받지 않음 |

### 읽는 법

- **방위**: 남산경→south, 서산경→west, 북산경→north, 동산경→east. 중산경·해외경·해내경·대황경과 후대 항목은 묘사(색·기운·서식처·소속 신)로 가장 가까운 방위를 골랐고, 근거를 괄호로 한 줄 적었다. 산경 5편에서 직접 나온 항목은 근거를 생략했다.
- **성향**: yo(요기) = 사람을 해치거나 재앙을 부르는 징조, 야수·흉수 / seon(선기) = 상서롭거나 이로운 효능, 신·신선·길한 새와 짐승. 1~2단계는 최종 갈래가 아니라 기본 기질 표시일 뿐이다.
- **추천 단계**: 크기·위력·신성도 기준. 1 미물 / 2 작은 짐승 / 3 요괴·정령 / 4 대왕·수행 / 5 용·신수·신선 최종.
- **구분**: 핵심 = 170종 풀, 예비 = 대체 후보(묘사가 짧거나 인간형이라 부품 재료가 적은 것 우선).
- **외형 특징**: 그림 방향 문서(docs/research/art-direction.md, 조사3 담당)의 부품 이름으로 바로 바꿀 수 있게 머리 수·꼬리 수·다리 수·날개·뿔·갈기·불꽃 같은 말을 썼다.

## 2. 집계표

### 핵심 170종 (단계 × 방위)

| 단계 | east | west | south | north | 합계 |
|---|---:|---:|---:|---:|---:|
| 1단계 | 2 | 2 | 2 | 2 | 8 |
| 2단계 | 6 | 6 | 6 | 6 | 24 |
| 3단계 | 15 | 15 | 15 | 15 | 60 |
| 4단계 | 12 | 13 | 12 | 13 | 50 |
| 5단계 | 7 | 7 | 7 | 7 | 28 |
| **합계** | **42** | **43** | **42** | **43** | **170** |

### 전체 216종 (핵심 + 예비)

| 단계 | east | west | south | north | 합계 |
|---|---:|---:|---:|---:|---:|
| 1단계 | 3 | 2 | 2 | 3 | 10 |
| 2단계 | 8 | 7 | 8 | 7 | 30 |
| 3단계 | 19 | 20 | 20 | 19 | 78 |
| 4단계 | 15 | 17 | 15 | 15 | 62 |
| 5단계 | 9 | 10 | 8 | 9 | 36 |
| **합계** | **54** | **56** | **53** | **53** | **216** |

### 성향 분포 (전체)

| 단계 | yo(요기) | seon(선기) |
|---|---:|---:|
| 1단계 | 6 | 4 |
| 2단계 | 15 | 15 |
| 3단계 | 49 | 29 |
| 4단계 | 30 | 32 |
| 5단계 | 5 | 31 |
| **합계** | **105** | **111** |

### 출전 유형 분포

| 유형 | 전체 | 핵심 |
|---|---:|---:|
| 산경(5편) | 108 | 86 |
| 해경(해외·해내) | 34 | 24 |
| 대황경 | 17 | 13 |
| 후대 설화·도교·한국 | 57 | 47 |
| **합계** | **216** | **170** |

## 3. 후보표

### 1단계 — 미물 (작은 벌레·물속 미물)

| # | 한글 이름 | 한자 | 출전 | 방위 | 외형 특징 | 단계 | 성향 | 구분 | 출처 URL | 비고 |
|---:|---|---|---|---|---|---:|---|---|---|---|
| 1 | 활사 | 活師 | 동산경·번산(藟山) 호수 | east | 올챙이 같은 둥근 몸·가는 꼬리·다리 없음·작은 눈 | 1 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/東山經 | 물속 미물 (활사=올챙이) |
| 2 | 주별어 | 珠蟞魚 | 동차이경·갈산(葛山) 풍수 | east | 허파 같은 둥근 몸·눈 달림·여섯 다리·몸에 진주알 | 1 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/東山經 | 여섯 다리(sixLegs) 재사용 |
| 3 | 신요 | 蜃珧 | 동차이경·역고산(嶧皋山) 물속 | east | 두 쪽 조가비 껍데기·조가비 틈의 흰 기운 | 1 | seon | 예비 | https://zh.wikisource.org/wiki/山海經/東山經<br>https://zh.wikipedia.org/wiki/蜃 | 후대 설화의 신기루 토하는 대합(蜃)과 연결 |
| 4 | 나모 | 蠃母 | 서차삼경·괴강산(槐江之山) 물속 | west | 나선 껍데기·단단한 껍질 한 개·몸을 숨김 | 1 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/西山經 | 소라·고둥류. 蠃母之山은 산 이름이기도 함 |
| 5 | 목충 | 木蟲 | 서산경·부산(浮山) | west | 나무껍질 색 몸·마디 있는 몸·짧은 더듬이 | 1 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/西山經 | '木蟲居之'만 있고 묘사가 없어 부품은 설계로 보충 |
| 6 | 복충 | 蝮虫 | 남차이경·우산(羽山)·비산(非山) | south | 살무사처럼 짧은 뱀 몸·삼각 머리·작은 크기 | 1 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/南山經 | 묘사가 짧아 부품은 설계로 보충 |
| 7 | 역 | 蜮 | 대황남경·역산(蜮山) | south (대황남경이므로 south) | 물여우 같은 작은 벌레·입으로 모래를 쏨 | 1 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/大荒南經 | 蜮人은 이것을 활로 쏴 먹음 |
| 8 | 주아 | 朱蛾 | 해내북경 | north (해내북경이므로 north) | 나방 몸·붉은 날개·더듬이 | 1 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/海內北經 |  |
| 9 | 비질 | 蜚蛭 | 대황북경·불함산(不咸山) | north (대황북경이므로 north) | 날개 넉 장·거머리 같은 몸 | 1 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/大荒北經 |  |
| 10 | 금충 | 琴蟲 | 대황북경·불함산(不咸山) | north (대황북경이므로 north) | 짐승 머리·뱀 몸 | 1 | yo | 예비 | https://zh.wikisource.org/wiki/山海經/大荒北經 |  |

### 2단계 — 새끼·작은 짐승

| # | 한글 이름 | 한자 | 출전 | 방위 | 외형 특징 | 단계 | 성향 | 구분 | 출처 URL | 비고 |
|---:|---|---|---|---|---|---:|---|---|---|---|
| 11 | 종종 | 從從 | 동산경·순상산(栒狀之山) | east | 개 몸·여섯 다리·짧은 꼬리 | 2 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/東山經 |  |
| 12 | 동동 | 狪狪 | 동산경·태산(泰山) | east | 새끼돼지 몸·몸에 박힌 구슬(진주)·둥근 코 | 2 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/東山經 |  |
| 13 | 주유 | 朱獳 | 동차이경·경산(耿山) | east | 여우 몸·물고기 지느러미 날개 한 쌍·붉은 털 | 2 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/東山經 | 나타나면 나라에 두려움 |
| 14 | 구여 | 犰狳 | 동차이경·여아산(餘峩山) | east | 토끼 몸·새 부리·올빼미 눈·뱀 꼬리 | 2 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/東山經 | 瞿如(구여, 남산경)와 한글 독음이 같으니 한자로 구분 |
| 15 | 혈구 | 絜鉤 | 동차이경·□산(䃌山) | east | 오리 몸·쥐 꼬리·나무 타기 | 2 | yo | 예비 | https://zh.wikisource.org/wiki/山海經/東山經 |  |
| 16 | 정정 | 精精 | 동차삼경·우우산(踇隅之山) | east | 소 몸·말 꼬리 | 2 | yo | 예비 | https://zh.wikisource.org/wiki/山海經/東山經 | 묘사가 짧아 부품이 단순 |
| 17 | 영령 | 軨軨 | 동차이경·공상산(空桑之山) | east | 소 몸·호랑이 줄무늬 | 2 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/東山經 | 나타나면 큰 물난리 |
| 18 | 당강 | 當康 | 동차사경·흠산(欽山) | east | 새끼돼지 몸·위로 솟은 어금니 | 2 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/東山經 | 나타나면 풍년 |
| 19 | 겸양 | 羬羊 | 서산경·전래산(錢來之山) | west | 양 몸·말 꼬리 | 2 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/西山經 |  |
| 20 | 충거 | 䳋渠 | 서산경·송과산(松果之山) | west | 산꿩 몸·검은 몸·붉은 다리 | 2 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/西山經 | 독음 확인 필요 |
| 21 | 호체 | 毫彘 | 서산경·죽산(竹山) | west | 돼지 몸·흰 털·털끝이 검은 비녀 같은 가시 | 2 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/西山經 | 가시털 부품(spikes) |
| 22 | 계변 | 谿邊 | 서산경·천제산(天帝之山) | west | 개 몸 | 2 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/西山經 | 가죽을 깔고 앉으면 독을 막음 |
| 23 | 거보 | 舉父 | 서차삼경·숭오산(崇吾之山) | west | 원숭이 몸·무늬 있는 팔·표범 무늬 | 2 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/西山經 |  |
| 24 | 효 | 嚻 | 서산경·유차산(羭次之山) | west | 원숭이 몸·긴 팔 | 2 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/西山經 | 던지기를 잘함 |
| 25 | 당호 | 當扈 | 서차사경·상신산(上申之山) | west | 꿩 몸·턱수염 같은 깃으로 날아다님 | 2 | seon | 예비 | https://zh.wikisource.org/wiki/山海經/西山經 |  |
| 26 | 성성 | 狌狌 | 남산경·초요산(招搖之山)·해내남경 | south | 원숭이 몸·흰 귀·네 발로 엎드렸다 사람처럼 걸음 | 2 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/南山經 | 먹으면 잘 달림 |
| 27 | 녹촉 | 鹿蜀 | 남산경·유양산(杻陽之山) | south | 말 몸·흰 머리·호랑이 줄무늬·붉은 꼬리 | 2 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/南山經 | 가죽을 지니면 자손이 많음 |
| 28 | 류 | 類 | 남산경·단원산(亶爰之山) | south | 살쾡이 몸·긴 갈기털 | 2 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/南山經 | 암수한몸 |
| 29 | 이력 | 貍力 | 남차이경·거산(柜山) | south | 돼지 몸·며느리발톱·개 짖는 소리 | 2 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/南山經 | 나타나면 토목공사 |
| 30 | 장우 | 長右 | 남차이경·장우산(長右之山) | south | 원숭이 몸·귀 네 개 | 2 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/南山經 | 나타나면 큰 물난리 |
| 31 | 관관 | 灌灌 | 남산경·청구산(青丘之山) | south | 비둘기 몸·꾸짖는 듯한 소리 | 2 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/南山經 | 지니면 미혹되지 않음 |
| 32 | 적유 | 赤鱬 | 남산경·청구산(青丘之山) | south | 물고기 몸·사람 얼굴·원앙 소리 | 2 | yo | 예비 | https://zh.wikisource.org/wiki/山海經/南山經 |  |
| 33 | 호교 | 虎蛟 | 남차삼경·도과산(禱過之山) | south | 물고기 몸·뱀 꼬리 | 2 | seon | 예비 | https://zh.wikisource.org/wiki/山海經/南山經 | 蛟 이름이지만 물고기형 |
| 34 | 수마 | 水馬 | 북산경·구여산(求如之山) 물속 | north | 말 몸·무늬 있는 앞다리·소 꼬리 | 2 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/北山經 |  |
| 35 | 이서 | 耳鼠 | 북산경·단훈산(丹熏之山) | north | 쥐 몸·토끼 머리·고라니 몸·꼬리로 날아다님 | 2 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/北山經 |  |
| 36 | 비서 | 飛鼠 | 북차삼경·천지산(天池之山) | north | 토끼 몸·쥐 머리·등으로 날아다님 | 2 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/北山經 |  |
| 37 | 맹극 | 孟極 | 북산경·석자산(石者之山) | north | 표범 몸·무늬 있는 이마·흰 몸 | 2 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/北山經 |  |
| 38 | 유언 | 幽鴳 | 북산경·변춘산(邊春之山) | north | 원숭이 몸·무늬 있는 몸·잘 웃음 | 2 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/北山經 |  |
| 39 | 족자 | 足訾 | 북산경·만련산(蔓聯之山) | north | 원숭이 몸·갈기·소 꼬리·말발굽·무늬 있는 팔 | 2 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/北山經 |  |
| 40 | 맹괴 | 孟槐 | 북산경·초명산(譙明之山) | north | 고슴도치 몸·붉은 털 | 2 | seon | 예비 | https://zh.wikisource.org/wiki/山海經/北山經 |  |

### 3단계 — 요괴·정령 (방위마다 요 2 : 선 1 구도의 재료)

| # | 한글 이름 | 한자 | 출전 | 방위 | 외형 특징 | 단계 | 성향 | 구분 | 출처 URL | 비고 |
|---:|---|---|---|---|---|---:|---|---|---|---|
| 41 | 비비 | 獙獙 | 동차이경·고봉산(姑逢之山) | east | 여우 몸·새 날개 한 쌍·기러기 울음 | 3 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/東山經 | 나타나면 큰 가뭄 |
| 42 | 농질 | 蠪姪 | 동차이경·부려산(鳧麗之山) | east | 여우 몸·머리 아홉·꼬리 아홉·호랑이 발톱 | 3 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/東山經 | multiHead+nineTails 시험 형태 |
| 43 | 합유 | 合窳 | 동차사경·섬산(剡山) | east | 돼지 몸·사람 얼굴·노란 몸에 붉은 꼬리 | 3 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/東山經 |  |
| 44 | 갈저 | 猲狙 | 동차사경·북호산(北號之山) | east | 늑대 몸·붉은 머리·쥐 눈·돼지 울음 | 3 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/東山經 |  |
| 45 | 기작 | 鬿雀 | 동차사경·북호산(北號之山) | east | 닭 몸·흰 머리·쥐 발·호랑이 발톱 | 3 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/東山經 |  |
| 46 | 려호 | 鵹鶘 | 동차이경·노기산(盧其之山) | east | 원앙 같은 새·사람 발 | 3 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/東山經 |  |
| 47 | 청경 | 青耕 | 중차십일경·근리산(堇理之山) | east (푸른(靑) 몸=동·청 계열) | 까치 몸·푸른 깃·흰 부리·흰 눈·흰 꼬리 | 3 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/中山經 | 전염병을 막는 새 |
| 48 | 박어 | 薄魚 | 동차사경·여증산(女烝之山) | east | 철갑상어 같은 긴 몸·외눈 | 3 | yo | 예비 | https://zh.wikisource.org/wiki/山海經/東山經 |  |
| 49 | 휴귀 | 蠵龜 | 동차삼경·기종산(跂踵之山) 심택 | east | 거대한 바다거북·무늬 있는 등딱지 | 3 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/東山經 |  |
| 50 | 군자 | 君子國 | 해외동경 | east (해외동경이므로 east) | 의관·허리에 찬 검·호랑이 두 마리를 부림·무궁화꽃 | 3 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/海外東經 | 사양하는 사람들 |
| 51 | 흑치 | 黑齒國 | 해외동경 | east (해외동경이므로 east) | 검은 몸·검은 이빨·붉은 뱀과 푸른 뱀이 곁에 있음 | 3 | yo | 예비 | https://zh.wikisource.org/wiki/山海經/海外東經 |  |
| 52 | 모민 | 毛民國 | 해외동경 | east (해외동경이므로 east) | 온몸에 털 | 3 | yo | 예비 | https://zh.wikisource.org/wiki/山海經/海外東經 |  |
| 53 | 노민 | 勞民國 | 해외동경 | east (해외동경이므로 east) | 검은 얼굴과 손발·머리 둘 달린 새가 곁에 있음 | 3 | yo | 예비 | https://zh.wikisource.org/wiki/山海經/海外東經 |  |
| 54 | 현고 | 玄股國 | 해외동경 | east (해외동경이므로 east) | 검은 넓적다리·물고기 껍질옷·새 두 마리가 양옆 | 3 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/海外東經 |  |
| 55 | 삼청마 | 三青馬 | 대황동경 | east (푸른(靑) 말=동·청) | 푸른 말·푸른 갈기와 꼬리 | 3 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/大荒東經 | 三騅(삼추)와 함께 나옴 |
| 56 | 청구 여우 | 青丘狐 | 해외동경 청구국·대황동경 청구국 | east (청구국은 해외동경·대황동경 모두 동쪽) | 여우 몸·꼬리 세 개(원전은 아홉)·푸른 털 | 3 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/海外東經<br>https://zh.wikisource.org/wiki/山海經/大荒東經 | 기존 형태. 게임은 세 꼬리, 원전은 구미호 |
| 57 | 이무기 | 螭 | 한국 설화(이무기)·螭 | east (물·뱀·청룡 계열은 east) | 긴 뱀 몸·혹뿔 두 개·비늘 | 3 | yo | 핵심 | https://ko.wikipedia.org/wiki/이무기 | 기존 형태. 螭와의 대응은 학설 있음 |
| 58 | 청학 | 青鶴 | 한국 설화·도교 설화 | east (푸른(靑) 학=east) | 푸른 깃·긴 목·정수리 관·긴 부리 | 3 | seon | 핵심 | https://ko.wikipedia.org/wiki/두루미 | 기존 형태 |
| 59 | 교 | 蛟 | 산경 물속 곳곳(예 중차십일경) | east (용 계열 물짐승은 east(청룡 하위)) | 뱀 몸·네 발·긴 갈기·비늘 | 3 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/中山經<br>https://zh.wikipedia.org/wiki/蛟 | 물난리를 일으키는 용의 아래 단계 |
| 60 | 천구 | 天狗 | 서차삼경·음산(陰山) | west | 살쾡이 몸·흰 머리 | 3 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/西山經 | 기존 형태. 흉을 막는 개 |
| 61 | 백록 | 白鹿 | 서차사경·상신산(上申之山)·맹산(盂山) | west | 흰 사슴 몸·가지뿔·흰 점 | 3 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/西山經 | 기존 형태. 원전은 '獸多白鹿' 한 줄뿐이라 외형은 설계로 보충 |
| 62 | 비유 | 肥遺 | 서산경·태화산(太華之山) | west | 뱀 몸·다리 여섯·날개 넉 장 | 3 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/西山經 | 나타나면 큰 가뭄. 같은 이름의 새(영산), 몸 둘 뱀(북산경)도 있음 |
| 63 | 교 | 狡 | 서차삼경·옥산(玉山) | west | 개 몸·표범 무늬·소뿔 | 3 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/西山經 | 나타나면 풍년. 蛟(교)와 혼동하니 한자 병기 |
| 64 | 만만 | 蠻蠻 | 서차삼경·숭오산(崇吾之山) | west | 오리 몸·날개 한 장·눈 한 개·둘이 합쳐야 남 | 3 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/西山經 | 비익조 계통 |
| 65 | 문요어 | 文鰩魚 | 서차삼경·태기산(泰器之山) | west | 잉어 몸·새 날개·푸른 무늬·흰 머리·붉은 부리 | 3 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/西山經 | 밤에 서해에서 동해로 날아다님. 풍년 |
| 66 | 토루 | 土螻 | 서차삼경·곤륜구(昆侖之丘) | west | 양 몸·뿔 넷 | 3 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/西山經 | 사람을 먹음 |
| 67 | 주염 | 朱厭 | 서산경·소차산(小次之山) | west | 원숭이 몸·흰 머리·붉은 발 | 3 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/西山經 | 나타나면 큰 전쟁 |
| 68 | 부혜 | 鳧徯 | 서차이경·녹대산(鹿臺之山) | west | 수탉 몸·사람 얼굴 | 3 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/西山經 | 나타나면 전쟁 |
| 69 | 쟁 | 猙 | 서차삼경·장아산(章莪之山) | west | 붉은 표범 몸·꼬리 다섯·뿔 하나 | 3 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/西山經 |  |
| 70 | 삼청조 | 三青鳥 | 서차삼경·삼위산(三危之山)·대황서경 | west | 붉은 머리·검은 눈·푸른 깃 | 3 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/西山經<br>https://zh.wikisource.org/wiki/山海經/大荒西經 | 서왕모의 심부름 새 |
| 71 | 병봉 | 并封 | 해외서경 | west (해외서경이므로 west) | 돼지 몸·앞뒤에 머리 하나씩·검은 털 | 3 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/海外西經 | 머리 둘(앞뒤) |
| 72 | 용어 | 龍魚 | 해외서경 | west (해외서경이므로 west) | 살쾡이 같은 몸·물고기 비늘·언덕 위를 다님 | 3 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/海外西經 | 신성이 타고 구야를 다님 |
| 73 | 승황 | 乘黃 | 해외서경 백민국 | west (해외서경이므로 west) | 여우 몸·등에 뿔 | 3 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/海外西經 | 타면 이천 살 |
| 74 | 숙호 | 孰湖 | 서차사경·엄자산(崦嵫之山) | west | 말 몸·새 날개·사람 얼굴·뱀 꼬리 | 3 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/西山經 | 사람을 들어 올리기를 좋아함 |
| 75 | 염유어 | 冉遺魚 | 서차사경·영정산(英鞮之山) | west | 물고기 몸·뱀 머리·다리 여섯·말 귀 같은 눈 | 3 | seon | 예비 | https://zh.wikisource.org/wiki/山海經/西山經 |  |
| 76 | 마복 | 馬腹 | 중차이경·만거산(蔓渠之山) | west (호랑이 몸=서·백 계열) | 사람 얼굴·호랑이 몸·아기 울음 | 3 | yo | 예비 | https://zh.wikisource.org/wiki/山海經/中山經 | 사람을 먹음 |
| 77 | 루 | 鸓 | 서산경·취산(翠山) | west | 까치 몸·머리 둘·다리 넷·붉고 검은 깃 | 3 | seon | 예비 | https://zh.wikisource.org/wiki/山海經/西山經 | 불을 막음 |
| 78 | 서거 | 犀渠 | 중차사경·이산(釐山) | west (푸른 소=서쪽 산지 계열) | 소 몸·푸른 몸·아기 울음 | 3 | yo | 예비 | https://zh.wikisource.org/wiki/山海經/中山經 | 사람을 먹음 |
| 79 | 린 | 獜 | 중차십일경·의고산(依軲之山) | west (호랑이 발톱·갑옷 비늘=서·백) | 개 몸·호랑이 발톱·갑옷 같은 비늘 | 3 | seon | 예비 | https://zh.wikisource.org/wiki/山海經/中山經 |  |
| 80 | 필방 | 畢方 | 해외남경·서차삼경 장아산 | south (해외남경에 畢方鳥. 서차삼경은 west이나 해외남경 기준 south) | 학 같은 몸·외다리·푸른 몸·붉은 무늬·흰 부리 | 3 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/海外南經<br>https://zh.wikisource.org/wiki/山海經/西山經 | 기존 형태. 불을 일으킴(譌火) |
| 81 | 도깨비 | (고유어) | 한국 설화 | south (방망이·불장난(화)=south) | 뿔 하나·방망이·패랭이·송곳니 | 3 | yo | 핵심 | https://ko.wikipedia.org/wiki/도깨비 | 기존 형태 |
| 82 | 선동 | 仙童 | 도교·한국 설화 | south (복숭아(햇빛)=south·선계 시동) | 상투·도포 깃·복숭아 | 3 | seon | 핵심 | https://ko.wikipedia.org/wiki/신선 | 기존 형태 |
| 83 | 박이 | 猼訑 | 남산경·기산(基山) | south | 양 몸·귀 넷·꼬리 아홉·등에 눈이 있음 | 3 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/南山經 | 기존 형태. 원전은 남산경(south)이나 기존 게임은 west |
| 84 | 창부 | 𪁺𩿧 | 남산경·기산(基山) | south | 닭 몸·머리 셋·눈 여섯·다리 여섯·날개 셋 | 3 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/南山經 | 먹으면 잠이 안 옴. multiHead. 독음 확인 필요 |
| 85 | 구여 | 瞿如 | 남산경·도과산(禱過之山) | south | 학 같은 새·흰 머리·다리 셋·사람 얼굴 | 3 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/南山經 |  |
| 86 | 옹 | 顒 | 남산경·영구산(令丘之山) | south | 올빼미 몸·사람 얼굴·눈 넷·귀 달림 | 3 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/南山經 | 나타나면 큰 가뭄 |
| 87 | 주 | 鴸 | 남차이경·거산(柜山) | south | 올빼미 몸·사람 손 | 3 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/南山經 |  |
| 88 | 체 | 彘 | 남차이경·부옥산(浮玉之山) | south | 호랑이 몸·소 꼬리·개 짖는 소리 | 3 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/南山經 | 사람을 먹음 |
| 89 | 고조 | 蠱雕 | 남차이경·녹오산(鹿吳之山) | south | 독수리 몸·뿔 | 3 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/南山經 | 아기 울음, 사람을 먹음 |
| 90 | 비익조 | 比翼鳥 | 해외남경 | south (해외남경이므로 south) | 새 두 마리가 날개 한 짝씩 합침·푸르고 붉은 깃 | 3 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/海外南經 |  |
| 91 | 쌍쌍 | 雙雙 | 대황남경 | south (대황남경이므로 south) | 푸른 짐승 셋이 몸을 맞대고 나란히 섬 | 3 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/大荒南經 |  |
| 92 | 옹화 | 雍和 | 중차십일경·풍산(豐山) | south (붉은 눈·붉은 부리=남·적) | 원숭이 몸·붉은 눈·붉은 부리·노란 몸 | 3 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/中山經 | 나타나면 나라에 큰 두려움 |
| 93 | 절지 | 竊脂 | 중차구경·거산(崌山) | south (붉은 몸=남·적, 불을 막음) | 올빼미 몸·붉은 몸·흰 머리 | 3 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/中山經 | 불을 막음 |
| 94 | 명사 | 鳴蛇 | 중차이경·선산(鮮山) | south (가뭄=불=남) | 뱀 몸·날개 넉 장·경쇠 소리 | 3 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/中山經 | 나타나면 큰 가뭄 |
| 95 | 우민 | 羽民國 | 해외남경·대황남경 | south (해외남경이므로 south) | 긴 머리·몸에 난 깃털 | 3 | seon | 예비 | https://zh.wikisource.org/wiki/山海經/海外南經 |  |
| 96 | 환두 | 讙頭國 | 해외남경·대황남경(驩頭) | south (해외남경이므로 south) | 사람 얼굴·날개·새 부리 | 3 | yo | 예비 | https://zh.wikisource.org/wiki/山海經/海外南經<br>https://zh.wikisource.org/wiki/山海經/大荒南經 |  |
| 97 | 염화 | 厭火國 | 해외남경 | south (해외남경이므로 south) | 짐승 몸·검은 몸·입에서 불을 뿜음 | 3 | yo | 예비 | https://zh.wikisource.org/wiki/山海經/海外南經 | flame 부품 |
| 98 | 산고 | 山膏 | 중차칠경·고산(苦山) | south (불처럼 붉음=남·적) | 돼지 비슷한 몸·불처럼 붉음 | 3 | yo | 예비 | https://zh.wikisource.org/wiki/山海經/中山經 | 욕을 잘함 |
| 99 | 짐 | 鴆 | 중차십일경·요벽산(瑤碧之山) | south (독·무더운 남방 새) | 꿩 몸·독 깃 | 3 | yo | 예비 | https://zh.wikisource.org/wiki/山海經/中山經 | 독을 지닌 새 |
| 100 | 수귀 | 水鬼 | 한국 설화(물귀신) | north (물(水)=north) | 물방울 몸·젖은 머리카락·물결 같은 손 | 3 | yo | 핵심 | https://ko.wikipedia.org/wiki/물귀신 | 기존 형태 |
| 101 | 두억시니 | (고유어) | 한국 설화 | north (어둠·산그늘=north) | 검푸른 연기·뿔 둘·큰 머리·송곳니 | 3 | yo | 핵심 | https://namu.wiki/w/두억시니 | 기존 형태 |
| 102 | 현구 | 玄龜 | 북산경·남산경 선귀(旋龜)·한국 사신도 | north (검은(玄) 거북=north) | 거북 껍질·새 부리·뱀 꼬리 | 3 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/南山經<br>https://ko.wikipedia.org/wiki/현무 | 기존 형태. 새 부리·뱀 꼬리 거북의 원전은 남산경 旋龜(규칙상 south) |
| 103 | 환소 | 䑏疏 | 북산경·대산(帶山) | north | 말 몸·뿔 하나·뿔에 거친 결 | 3 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/北山經 | 불을 막음. 독음은 驩疏(환소)로 읽음 |
| 104 | 제건 | 諸犍 | 북산경·단장산(單張之山) | north | 표범 몸·사람 머리·소 귀·외눈·긴 꼬리를 물고 다님 | 3 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/北山經 |  |
| 105 | 산휘 | 山𤟤 | 북산경·악법산(嶽法之山) | north | 개 몸·사람 얼굴·바람처럼 달림 | 3 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/北山經 | 나타나면 큰 바람. 독음 확인 필요 |
| 106 | 제회 | 諸懷 | 북산경·북악산(北嶽之山) | north | 소 몸·뿔 넷·사람 눈·돼지 귀 | 3 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/北山經 | 사람을 먹음 |
| 107 | 독욕 | 獨𤞞 | 북산경·북효산(北嚻之山) | north | 호랑이 몸·흰 몸·개 머리·말 꼬리·돼지 갈기 | 3 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/北山經 | 독음 확인 필요 |
| 108 | 천마 | 天馬 | 북차삼경·마성산(馬成之山) | north | 흰 개 몸·검은 머리·사람을 보면 날아감 | 3 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/北山經 | 한국 신라 천마총과는 별개 |
| 109 | 하라어 | 何羅魚 | 북산경·초명산(譙明之山) | north | 물고기 머리 하나에 몸 열 개 | 3 | yo | 예비 | https://zh.wikisource.org/wiki/山海經/北山經 |  |
| 110 | 장사 | 長蛇 | 북산경·대함산(大咸之山) | north | 뱀 몸·멧돼지 갈기털 같은 털·북 치는 소리 | 3 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/北山經 |  |
| 111 | 산여 | 酸與 | 북차삼경·경산(景山) | north | 뱀 몸·날개 넉 장·눈 여섯·다리 셋 | 3 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/北山經 | 나타나면 마을에 두려움 |
| 112 | 정위 | 精衛 | 북차삼경·발구산(發鳩之山) | north | 까마귀 몸·무늬 있는 머리·흰 부리·붉은 발 | 3 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/北山經 | 염제의 딸이 변한 새 |
| 113 | 송사 | 竦斯 | 북산경·관제산(灌題之山) | north | 암꿩 몸·사람 얼굴 | 3 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/北山經 |  |
| 114 | 화사 | 化蛇 | 중차이경·양산(陽山) | north (물난리=물(水)=north) | 사람 얼굴·승냥이 몸·새 날개·뱀처럼 기어감 | 3 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/中山經 | 나타나면 큰 물난리 |
| 115 | 부저 | 夫諸 | 중차삼경·오안산(敖岸之山) | north (물난리=물(水)=north) | 흰 사슴 몸·뿔 넷 | 3 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/中山經 | 나타나면 큰 물난리 |
| 116 | 일목인 | 一目國 | 해외북경 | north (해외북경이므로 north) | 얼굴 한가운데 눈 하나 | 3 | yo | 예비 | https://zh.wikisource.org/wiki/山海經/海外北經 |  |
| 117 | 섭이인 | 聶耳國 | 해외북경 | north (해외북경이므로 north) | 길게 늘어진 귀·무늬 호랑이 두 마리를 부림 | 3 | yo | 예비 | https://zh.wikisource.org/wiki/山海經/海外北經 |  |
| 118 | 옥토끼 | 玉兔 | 달 설화 | north (달(陰)=north) | 흰 토끼·절굿공이·달 무늬 | 3 | seon | 예비 | https://zh.wikipedia.org/wiki/月兔 |  |

### 4단계 — 요괴 대왕·신선 수행 형태

| # | 한글 이름 | 한자 | 출전 | 방위 | 외형 특징 | 단계 | 성향 | 구분 | 출처 URL | 비고 |
|---:|---|---|---|---|---|---:|---|---|---|---|
| 119 | 구미호 | 九尾狐 | 남산경 청구산·해외동경 청구국 | east (청구국이 해외동경(east). 남산경 청구산은 규칙상 south라 충돌) | 여우 몸·꼬리 아홉·아기 같은 울음 | 4 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/南山經<br>https://zh.wikisource.org/wiki/山海經/海外東經<br>https://ko.wikipedia.org/wiki/구미호 | 기존 청구 여우의 윗단계 |
| 120 | 천오 | 天吳 | 해외동경 조양곡·대황동경 | east (해외동경이므로 east) | 머리 여덟·사람 얼굴·다리 여덟·꼬리 여덟·청황색 등 | 4 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/海外東經<br>https://zh.wikisource.org/wiki/山海經/大荒東經 | 물의 신(水伯). multiHead 상한 후보 |
| 121 | 기 | 夔 | 대황동경 유파산(流波山) | east (대황동경이므로 east) | 소 몸·푸른 몸·뿔 없음·외다리·눈빛 광채 | 4 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/大荒東經<br>https://zh.wikipedia.org/wiki/夔 | 바람비·우레 짐승(oneLeg 재사용) |
| 122 | 비 | 蜚 | 동차사경 태산(太山) | east | 소 몸·흰 머리·외눈·뱀 꼬리 | 4 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/東山經 | 물을 지나면 마르고 풀을 지나면 시듦 |
| 123 | 사비시 | 奢比之尸 | 해외동경·대황동경 | east (해외동경이므로 east) | 짐승 몸·사람 얼굴·큰 귀·귀에 푸른 뱀 한 쌍 | 4 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/海外東經<br>https://zh.wikisource.org/wiki/山海經/大荒東經 | 신(神) 계열 |
| 124 | 우호 | 禺䝞 | 대황동경 | east (동해의 해신이라 east) | 사람 얼굴·새 몸·귀에 누런 뱀·누런 뱀을 밟음 | 4 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/大荒東經 | 동해 해신. 禺䝞의 독음은 우호로 표기 |
| 125 | 삼족오 | 三足烏 | 대황동경 탕곡의 해 속 까마귀·한국 고분벽화 | east (해 뜨는 곳(탕곡·부상)이 동쪽) | 까마귀·세 발·몸에서 나는 불빛 | 4 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/大荒東經<br>https://ko.wikipedia.org/wiki/삼족오 | 해의 까마귀 |
| 126 | 안기생 | 安期生 | 열선전·사기 | east (동해 봉래와 낭야 사람이라 east) | 도포·긴 수염·큰 대추 | 4 | seon | 예비 | https://zh.wikipedia.org/wiki/安期生 | 신선(수행) 형태 |
| 127 | 왕자교 | 王子喬 | 열선전 | east (흰 학을 타는 신선이라 청학 계열 east) | 흰 학을 탐·생황·도포 | 4 | seon | 핵심 | https://zh.wikipedia.org/wiki/王子喬 | 학을 타는 신선 |
| 128 | 선학 | 仙鶴 | 도교 설화·십장생 | east (학 계열은 east) | 흰 몸·붉은 정수리·긴 목·검은 꼬리깃·구름 발 | 4 | seon | 핵심 | https://ko.wikipedia.org/wiki/두루미 | 청학의 윗단계 후보 |
| 129 | 규룡 | 虯龍 | 초사·이소 | east (뿔 있는 어린 용이라 청룡 하위 east) | 작은 뿔 한 쌍·푸른 비늘·네 발 | 4 | yo | 핵심 | https://zh.wikipedia.org/wiki/龍 | 이무기→규룡→교룡 계통 |
| 130 | 왕해 | 王亥 | 대황동경 | east (대황동경이므로 east) | 두 손에 새를 쥔 사람·새 머리를 먹음 | 4 | yo | 예비 | https://zh.wikisource.org/wiki/山海經/大荒東經 | 인물 형태라 부품 재료가 적음 |
| 131 | 대인 | 大人國 | 해외동경·대황동경 | east (해외동경이므로 east) | 거대한 몸집·앉아서 배를 깎음·두 팔을 벌림 | 4 | yo | 예비 | https://zh.wikisource.org/wiki/山海經/海外東經 | 거인(크기 부품) |
| 132 | 거오 | 巨鼇 | 열자·탕문 | east (발해 동쪽 바다라 east) | 산을 이고 있는 거대한 자라·등에 봉래산 | 4 | seon | 핵심 | https://zh.wikipedia.org/wiki/鰲 | 거북 계열(shell 재사용) |
| 133 | 교룡 | 蛟龍 | 설화 | east (용 계열 east) | 뱀 몸·네 발·긴 갈기·붉은 비늘·작은 뿔 | 4 | yo | 핵심 | https://zh.wikipedia.org/wiki/蛟 | 교→교룡 계통 |
| 134 | 박 | 駮 | 서차사경·중곡산(中曲之山)·해외북경 | west (서산경 우선) | 말 몸·흰 몸·검은 꼬리·뿔 하나·호랑이 이빨과 발톱 | 4 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/西山經<br>https://zh.wikisource.org/wiki/山海經/海外北經 | 호랑이와 표범을 먹음 |
| 135 | 육오 | 陸吾 | 서차삼경·곤륜구(昆侖之丘) | west | 호랑이 몸·꼬리 아홉·사람 얼굴·호랑이 발톱 | 4 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/西山經 | 곤륜의 문지기. nineTails+tiger |
| 136 | 영초 | 英招 | 서차삼경·괴강산(槐江之山) | west | 말 몸·사람 얼굴·호랑이 무늬·새 날개 | 4 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/西山經 |  |
| 137 | 형천 | 刑天 | 해외서경 | west (해외서경이므로 west) | 머리 없음·젖가슴이 눈·배꼽이 입·방패와 도끼 | 4 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/海外西經 |  |
| 138 | 흠비 | 欽䲹 | 서차삼경·종산(鍾山) | west | 큰 물수리·검은 무늬·흰 머리·붉은 부리·호랑이 발톱 | 4 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/西山經 | 독음 확인 필요 |
| 139 | 준조 | 鵕鳥 | 서차삼경·종산(鍾山) | west | 올빼미 같은 몸·붉은 발·곧은 부리·누런 무늬·흰 머리 | 4 | yo | 예비 | https://zh.wikisource.org/wiki/山海經/西山經 | 고(鼓)가 죽어 변한 새 |
| 140 | 백택 | 白澤 | 후대 설화(운급칠첨 등) | west (흰(白) 신수=서·백) | 사자 같은 몸·머리 둘·뿔 둘·옆구리 눈·수염 | 4 | seon | 핵심 | https://zh.wikipedia.org/wiki/白澤 | 세상 만물을 아는 신수 |
| 141 | 해치 | 獬豸 | 이물지·설화 | west (옳고 그름을 가리는 금(金) 기운=서) | 양 닮은 몸·뿔 하나·곧은 눈 | 4 | seon | 핵심 | https://zh.wikipedia.org/wiki/獬豸<br>https://ko.wikipedia.org/wiki/해태 | 한국 해태와 같은 계통 |
| 142 | 비휴 | 貔貅 | 사기·오제본기 | west (용맹한 맹수(金)=서) | 호랑이 몸·날개·뿔 하나·갈기 | 4 | yo | 핵심 | https://zh.wikipedia.org/wiki/貔貅 |  |
| 143 | 산예 | 狻猊 | 이아·용생구자 | west (사자(서역)=서) | 사자 몸·갈기·불꽃 연기·앉은 자세 | 4 | yo | 핵심 | https://zh.wikipedia.org/wiki/龍生九子 | 용의 아홉 아들 중 하나 |
| 144 | 폐안 | 狴犴 | 용생구자 | west (감옥·정의(金)=서) | 호랑이 얼굴·사자 몸·부릅뜬 눈 | 4 | yo | 핵심 | https://zh.wikipedia.org/wiki/龍生九子 | 용의 아홉 아들 중 하나 |
| 145 | 애자 | 睚眥 | 용생구자 | west (살벌함(金)=서) | 용 머리·표범 몸·부릅뜬 눈 | 4 | yo | 핵심 | https://zh.wikipedia.org/wiki/龍生九子 | 용의 아홉 아들 중 하나 |
| 146 | 장승 | 長乘 | 서차삼경·라모산(蠃母之山) | west | 사람 몸·표범 꼬리 | 4 | seon | 예비 | https://zh.wikisource.org/wiki/山海經/西山經 | 九德의 신 |
| 147 | 광성자 | 廣成子 | 장자·재유 | west (공동산(감숙, 서쪽)) | 도포·긴 수염·불진·구름 | 4 | seon | 핵심 | https://zh.wikipedia.org/wiki/廣成子 | 공동산 선인 |
| 148 | 팔준 | 八駿 | 목천자전 | west (서왕모를 만나러 간 곤륜 길) | 말 여덟 필(색이 다름) | 4 | seon | 예비 | https://zh.wikipedia.org/wiki/八駿 | 주 목왕의 여덟 준마 |
| 149 | 불가사리 | 不可殺伊 | 한국 설화 | west (쇠(金)를 먹음=서) | 곰 몸·코끼리 코·무소 눈·소 꼬리·호랑이 발 | 4 | yo | 핵심 | https://ko.wikipedia.org/wiki/불가사리 | 쇠를 먹는 괴수 |
| 150 | 난조 | 鸞鳥 | 서차이경·여상산(女牀之山) | west | 꿩 몸·오색 무늬·긴 꼬리 | 4 | seon | 예비 | https://zh.wikisource.org/wiki/山海經/西山經 | 나타나면 천하가 편안 |
| 151 | 파사 | 巴蛇 | 해내남경 | south (해내남경이므로 south) | 청·황·적·흑 네 빛 몸·거대한 뱀 | 4 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/海內南經 | 코끼리를 삼킴 |
| 152 | 불정호여 | 不廷胡余 | 대황남경 | south (대황남경 남해 신) | 사람 얼굴·귀에 푸른 뱀 둘·붉은 뱀을 밟음 | 4 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/大荒南經 | 남해의 신 |
| 153 | 이문 | 螭吻 | 용생구자 | south (지붕 위에서 불을 누르는 용(화재막이)) | 용 머리·물고기 꼬리·입 큼·뿔 | 4 | seon | 핵심 | https://zh.wikipedia.org/wiki/龍生九子 |  |
| 154 | 삼수국 | 三首國 | 해외남경 | south (해외남경이므로 south) | 몸 하나에 머리 셋 | 4 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/海外南經 | multiHead |
| 155 | 적송자 | 赤松子 | 열선전 | south (불 속에 들어가 승천(화=남)) | 붉은 소나무 지팡이·도포·불꽃 | 4 | seon | 핵심 | https://zh.wikipedia.org/wiki/赤松子 | 비의 신선(우사) |
| 156 | 교인 | 鮫人 | 술이기·수신기 | south (남해 밖에 사는 인어) | 사람 얼굴·물고기 꼬리·눈물이 진주 | 4 | seon | 핵심 | https://zh.wikipedia.org/wiki/鮫人 |  |
| 157 | 산소 | 山魈 | 설화(유양잡조 등) | south (남방 산중 요괴) | 긴 팔·원숭이 몸·붉은 얼굴·큰 입 | 4 | yo | 핵심 | https://zh.wikipedia.org/wiki/山魈 |  |
| 158 | 여발 | 女魃 | 대황북경 | south (가뭄=불=남(원전은 대황북경)) | 푸른 옷의 여인·머리의 불꽃·가뭄 | 4 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/大荒北經<br>https://zh.wikipedia.org/wiki/旱魃 |  |
| 159 | 이매 | 魑魅 | 좌전·이소 | south (남방 산림의 도깨비) | 짐승 얼굴·사람 몸·산·숲 | 4 | yo | 핵심 | https://zh.wikipedia.org/wiki/魑魅魍魎 |  |
| 160 | 원추 | 鵷鶵 | 남차삼경·남우산(南禺之山)·장자 추수 | south | 봉황 비슷한 새·오동나무에만 앉음 | 4 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/南山經 |  |
| 161 | 인면조 | 人面鳥 | 고구려 고분벽화(오회분) | south (봉황·불 기운(남)) | 사람 얼굴·새 몸·날개 | 4 | seon | 핵심 | https://ko.wikipedia.org/wiki/인면조 |  |
| 162 | 월하노인 | 月下老人 | 속유괴록 | south (붉은 실(赤繩)=남·적) | 붉은 실 꾸러미·책·지팡이·도포 | 4 | seon | 핵심 | https://zh.wikipedia.org/wiki/月下老人 |  |
| 163 | 제지이녀 | 帝之二女 | 중차십이경·동정산(洞庭之山) | south (상수·동정호=남방) | 여인·뱀을 잡음·바람비 | 4 | seon | 예비 | https://zh.wikisource.org/wiki/山海經/中山經 |  |
| 164 | 경보 | 耕父 | 중차십일경·풍산(豐山) | south (옹화와 같은 풍산(남방)) | 사람 형상·맑은 못에서 나는 빛 | 4 | yo | 예비 | https://zh.wikisource.org/wiki/山海經/中山經 |  |
| 165 | 불사민 | 不死民 | 해외남경 | south (해외남경이므로 south) | 검은 몸·오래 삶 | 4 | seon | 예비 | https://zh.wikisource.org/wiki/山海經/海外南經 |  |
| 166 | 상류 | 相柳 | 해외북경·대황북경(相繇) | north (해외북경이므로 north) | 머리 아홉·사람 얼굴·푸른 뱀 몸 | 4 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/海外北經<br>https://zh.wikisource.org/wiki/山海經/大荒北經 | 아홉 산을 먹음. multiHead |
| 167 | 포효 | 狍鴞 | 북차이경·구오산(鈎吾之山) | north | 양 몸·사람 얼굴·눈이 겨드랑이 밑·호랑이 이빨·사람 손톱 | 4 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/北山經<br>https://zh.wikipedia.org/wiki/饕餮 | 도철(饕餮)과 같다고 봄 |
| 168 | 알유 | 窫窳 | 북산경·소함산(少咸之山)·해내남경 | north | 소 몸·붉은 몸·사람 얼굴·말발굽 (해내남경에서는 용 머리) | 4 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/北山經<br>https://zh.wikisource.org/wiki/山海經/海內南經 | 아기 울음, 사람을 먹음 |
| 169 | 구봉 | 九鳳 | 대황북경 | north (대황북경이므로 north) | 머리 아홉·사람 얼굴·새 몸 | 4 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/大荒北經 | multiHead+날개 |
| 170 | 강량 | 彊良 | 대황북경 | north (대황북경이므로 north) | 호랑이 머리·사람 몸·발굽 넷·긴 팔꿈치·뱀을 입에 묾 | 4 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/大荒北經 |  |
| 171 | 과보 | 夸父 | 해외북경·대황북경 | north (해외북경이므로 north) | 거인·양손에 뱀·지팡이 | 4 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/海外北經<br>https://zh.wikisource.org/wiki/山海經/大荒北經 | 해를 쫓다 죽어 복숭아숲이 됨 |
| 172 | 융선왕시 | 戎宣王尸 | 대황북경 | north (대황북경이므로 north) | 말 모양 붉은 짐승·머리 없음 | 4 | yo | 예비 | https://zh.wikisource.org/wiki/山海經/大荒北經 |  |
| 173 | 길량 | 吉量 | 해내북경·견봉국(犬封國) | north (해내북경이므로 north) | 흰 말·붉은 갈기·황금 눈 | 4 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/海內北經 | 타면 천 년을 삶 |
| 174 | 추오 | 騶吾 | 해내북경·임씨국(林氏國) | north (해내북경이므로 north) | 호랑이 몸·오색 무늬·몸보다 긴 꼬리 | 4 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/海內北經 | 하루에 천 리 |
| 175 | 비희 | 贔屭 | 용생구자 | north (무거운 짐을 지는 거북(수·북)) | 거북 껍질·용 머리·비석을 짐 | 4 | seon | 핵심 | https://zh.wikipedia.org/wiki/龍生九子 |  |
| 176 | 포뢰 | 蒲牢 | 용생구자 | north (바닷가·고래를 무서워함(수·북)) | 용 머리·종 고리 모양·우는 입 | 4 | yo | 핵심 | https://zh.wikipedia.org/wiki/龍生九子 |  |
| 177 | 초도 | 椒圖 | 용생구자 | north (조개처럼 닫힌 문(수·북)) | 소라 껍질·용 얼굴·문고리 | 4 | seon | 핵심 | https://zh.wikipedia.org/wiki/龍生九子 |  |
| 178 | 공복 | 蚣蝮 | 용생구자 | north (물을 좋아하는 용(수·북)) | 용 머리·거북 몸·다리 넷 | 4 | seon | 예비 | https://zh.wikipedia.org/wiki/龍生九子 |  |
| 179 | 곤 | 鯤 | 장자·소요유(북명) | north (북명(北冥)=북) | 거대한 물고기·비늘·지느러미 | 4 | seon | 핵심 | https://zh.wikipedia.org/wiki/鯤鵬 | 붕(鵬)의 아래 단계 |
| 180 | 항아 | 嫦娥 | 회남자·후한서 | north (달(陰)=north) | 여인·옷자락·옥토끼·두꺼비 | 4 | seon | 핵심 | https://zh.wikipedia.org/wiki/嫦娥<br>https://ko.wikipedia.org/wiki/항아 | 월궁 선녀 |

### 5단계 — 용·신수·신선 최종

| # | 한글 이름 | 한자 | 출전 | 방위 | 외형 특징 | 단계 | 성향 | 구분 | 출처 URL | 비고 |
|---:|---|---|---|---|---|---:|---|---|---|---|
| 181 | 청룡 | 青龍 | 사신(四神)·사상 | east (동방 신수) | 긴 몸·푸른 비늘·뿔·수염·네 발·구름 | 5 | seon | 핵심 | https://zh.wikipedia.org/wiki/青龍<br>https://ko.wikipedia.org/wiki/청룡 | 사신 중 동쪽. 방위 색 청 |
| 182 | 응룡 | 應龍 | 대황동경·대황북경 | east (대황동경 응룡(바깥에 대황북경도 있음)) | 날개 달린 용·비늘·뿔 | 5 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/大荒東經<br>https://zh.wikipedia.org/wiki/應龍 | 날개 용(wings+dragon) |
| 183 | 동왕공 | 東王公 | 신이경·동황경 | east (이름과 신이경 동황경) | 도포·흰 수염·관·부채 | 5 | seon | 핵심 | https://zh.wikipedia.org/wiki/東王公 | 서왕모의 짝 |
| 184 | 구망 | 句芒 | 해외동경 | east (해외동경 동방 신) | 새 몸·사람 얼굴·용 두 마리를 탐 | 5 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/海外東經<br>https://zh.wikipedia.org/wiki/句芒 | 동방 목(木)의 신 |
| 185 | 희화 | 羲和 | 대황동경·대황남경 | east (해를 목욕시키는 감연이 동쪽) | 여인·구름 수레·열 개의 해 | 5 | seon | 예비 | https://zh.wikisource.org/wiki/山海經/大荒東經 | 해의 어머니 |
| 186 | 복희 | 伏羲 | 회남자·신화 (海內經의 太皞) | east (동방 목덕 천제 태호와 같은 존재) | 사람 머리·뱀 몸·팔괘 무늬 | 5 | seon | 핵심 | https://zh.wikipedia.org/wiki/伏羲 | 동방 천제 |
| 187 | 동해용왕 | 東海龍王 | 민간 설화 | east (동해 = 동쪽) | 용 얼굴·관·수염·파도 | 5 | seon | 핵심 | https://zh.wikipedia.org/wiki/龍王 | 사해용왕 4방위 짝 |
| 188 | 천호 | 天狐 | 현중기·구미호 설화 | east (구미호의 윗단계라 청구(동)) | 구미호 꼬리 아홉 + 빛 테두리·흰 털 | 5 | seon | 예비 | https://zh.wikipedia.org/wiki/狐妖<br>https://ko.wikipedia.org/wiki/구미호 | 구미호가 천 년을 살면 되는 하늘 여우 |
| 189 | 동방삭 | 東方朔 | 한국 설화·한서 | east (이름의 동방과 삼천갑자 설화) | 도포·긴 수염·복숭아 | 5 | seon | 핵심 | https://ko.wikipedia.org/wiki/동방삭 | 장수 신선 |
| 190 | 서왕모 | 西王母 | 서차삼경·옥산·해내북경 | west | 사람 몸·표범 꼬리·호랑이 이빨·헝클어진 머리·승(勝) 장식 | 5 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/西山經<br>https://zh.wikipedia.org/wiki/西王母 | 곤륜의 신선 우두머리 |
| 191 | 백호 | 白虎 | 사신(四神) | west (서방 신수) | 흰 호랑이·검은 줄무늬·이빨·구름 | 5 | seon | 핵심 | https://zh.wikipedia.org/wiki/白虎<br>https://ko.wikipedia.org/wiki/백호 |  |
| 192 | 여와 | 女媧 | 대황서경 여와의 창자·회남자 | west (여와의 창자가 대황서경에 나옴) | 사람 얼굴·뱀 몸·오색 돌 | 5 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/大荒西經<br>https://zh.wikipedia.org/wiki/女媧 |  |
| 193 | 욕수 | 蓐收 | 해외서경·서차삼경 박산(泑山) | west | 왼쪽 귀에 뱀·용 두 마리를 탐 | 5 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/海外西經<br>https://zh.wikipedia.org/wiki/蓐收 | 서방 금(金)의 신 |
| 194 | 혼돈 | 渾敦 | 서차삼경·천산(天山)의 제강(帝江) | west | 누런 자루 같은 몸·불처럼 붉음·다리 여섯·날개 넷·얼굴 없음 | 5 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/西山經<br>https://zh.wikipedia.org/wiki/渾沌 | 제강(帝江)과 같은 존재. 4흉 |
| 195 | 궁기 | 窮奇 | 서차사경·방산(邽山)·해내북경 | west | 소 몸·고슴도치 털 (해내북경에서는 날개 달린 호랑이) | 5 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/西山經<br>https://zh.wikisource.org/wiki/山海經/海內北經<br>https://zh.wikipedia.org/wiki/四凶 | 4흉 |
| 196 | 도올 | 檮杌 | 좌전·신이경 서황경 | west (신이경 서황경) | 호랑이 몸·긴 털·사람 얼굴·멧돼지 어금니 | 5 | yo | 예비 | https://zh.wikipedia.org/wiki/四凶 | 4흉 |
| 197 | 개명수 | 開明獸 | 해내서경 곤륜 | west (해내서경이므로 west) | 호랑이 몸·머리 아홉·사람 얼굴 | 5 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/海內西經 | 곤륜의 문지기. multiHead |
| 198 | 서해용왕 | 西海龍王 | 민간 설화 | west (서해 = 서쪽) | 용 얼굴·흰 관·수염·파도 | 5 | seon | 예비 | https://zh.wikipedia.org/wiki/龍王 | 사해용왕 4방위 짝 |
| 199 | 소호 | 少昊 | 서차삼경 장류산(長留之山)·대황동경 | west (서산경 장류산이 소호의 땅) | 새 깃 관·흰 옷·오색 새 | 5 | seon | 예비 | https://zh.wikisource.org/wiki/山海經/西山經 | 서방 백제 |
| 200 | 주작 | 朱雀 | 사신(四神) | south (남방 신수) | 붉은 새·긴 꼬리깃·불꽃·구름 | 5 | seon | 핵심 | https://zh.wikipedia.org/wiki/朱雀<br>https://ko.wikipedia.org/wiki/주작 |  |
| 201 | 봉황 | 鳳皇 | 남차삼경·단혈산(丹穴之山)·대황서경 | south (남차삼경 단혈산이 우선) | 닭 같은 몸·오색 깃·머리·날개·등·가슴·배에 덕·의·예·인·신 무늬 | 5 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/南山經<br>https://zh.wikipedia.org/wiki/鳳凰<br>https://ko.wikipedia.org/wiki/봉황 | 나타나면 천하가 편안 |
| 202 | 축융 | 祝融 | 해외남경 | south (해외남경 남방 신) | 짐승 몸·사람 얼굴·용 두 마리를 탐 | 5 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/海外南經<br>https://zh.wikipedia.org/wiki/祝融 | 불의 신 |
| 203 | 염제 | 炎帝 | 산해경·사기 | south (남방 천제(화)) | 소 머리·사람 몸·불꽃·곡식 이삭 | 5 | seon | 핵심 | https://zh.wikipedia.org/wiki/炎帝<br>https://ko.wikipedia.org/wiki/염제 | 신농씨 |
| 204 | 남극선옹 | 南極仙翁 | 도교 설화(수성노인) | south (남극성) | 큰 이마·긴 흰 수염·복숭아·지팡이 | 5 | seon | 핵심 | https://zh.wikipedia.org/wiki/壽星 | 장수의 별 신선 |
| 205 | 금시조 | 金翅鳥 | 불교 설화(가루라) | south (불을 지닌 금빛 새) | 금빛 날개·부리·불꽃·용을 잡아먹음 | 5 | seon | 핵심 | https://ko.wikipedia.org/wiki/가루라 | 가루라(迦樓羅) |
| 206 | 마고 | 麻姑 | 신선전 | south (마고산(강서 남성현)) | 손톱이 긴 여선·도포·복숭아·술병 | 5 | seon | 핵심 | https://zh.wikipedia.org/wiki/麻姑 | 바다가 뽕밭이 되는 것을 세 번 봄 |
| 207 | 남해용왕 | 南海龍王 | 민간 설화 | south (남해 = 남쪽) | 용 얼굴·붉은 관·수염·파도 | 5 | seon | 예비 | https://zh.wikipedia.org/wiki/龍王 | 사해용왕 4방위 짝 |
| 208 | 현무 | 玄武 | 사신(四神) | north (북방 신수) | 거북 껍질·뱀 꼬리·검은 비늘·구름 | 5 | seon | 핵심 | https://zh.wikipedia.org/wiki/玄武<br>https://ko.wikipedia.org/wiki/현무 |  |
| 209 | 촉룡 | 燭龍 | 해외북경 촉음(燭陰)·대황북경 | north (해외북경이므로 north) | 사람 얼굴·붉은 뱀 몸·눈을 뜨면 낮, 감으면 밤 | 5 | yo | 핵심 | https://zh.wikisource.org/wiki/山海經/海外北經<br>https://zh.wikisource.org/wiki/山海經/大荒北經 |  |
| 210 | 우강 | 禺彊 | 해외북경·대황북경 | north (해외북경이므로 north) | 사람 얼굴·새 몸·귀에 푸른 뱀·푸른 뱀 둘을 밟음 | 5 | seon | 핵심 | https://zh.wikisource.org/wiki/山海經/海外北經 | 북해의 해신·바람 신 |
| 211 | 현명 | 玄冥 | 예기·회남자 | north (북방 수(水)의 신) | 검은 옷·거북·뱀·얼음 | 5 | seon | 핵심 | https://zh.wikipedia.org/wiki/玄冥 | 북방의 수신 |
| 212 | 붕 | 鵬 | 장자·소요유 | north (북명의 곤이 변함) | 거대한 날개·구름·바람·곤의 비늘 | 5 | seon | 핵심 | https://zh.wikipedia.org/wiki/鯤鵬 | 곤→붕 계통 |
| 213 | 도철 | 饕餮 | 좌전·여씨춘추 | north (북산경 포효와 같은 존재) | 양 몸·사람 얼굴·겨드랑이 눈·호랑이 이빨·큰 입 | 5 | yo | 핵심 | https://zh.wikipedia.org/wiki/饕餮<br>https://zh.wikisource.org/wiki/山海經/北山經 | 4흉. 포효의 윗단계 |
| 214 | 구천현녀 | 九天玄女 | 황제 설화 | north (玄=검음=북) | 도포·여인·부적·구름 | 5 | seon | 핵심 | https://zh.wikipedia.org/wiki/九天玄女 |  |
| 215 | 북해용왕 | 北海龍王 | 민간 설화 | north (북해 = 북쪽) | 용 얼굴·검은 관·수염·파도 | 5 | seon | 예비 | https://zh.wikipedia.org/wiki/龍王 | 사해용왕 4방위 짝 |
| 216 | 현천상제 | 玄天上帝 | 도교 | north (북방 현무 대제) | 검은 도포·거북과 뱀·검 | 5 | seon | 예비 | https://zh.wikipedia.org/wiki/真武大帝 |  |

## 4. 기존 17종과의 대조 (src/data/forms.js 기준)

| 기존 형태 | 기존 단계·방위 | 표의 대응 | 확인 사항 |
|---|---|---|---|
| 미물 | 1단계·none | 1단계 8종(방위마다 2종)은 모두 방위 색 미물 변형 후보 | 기존 미물은 그대로 두고, 1단계 8종은 같은 벌레 몸통에 부품만 바꾸는 형태로 쓰면 됨 |
| 새끼 뱀·새끼 범·새끼 새·새끼 거북 | 2단계·east/west/south/north | 표에 넣지 않음 (산해경 원형이 없는 범주형 이름) | 유지하면 2단계는 핵심 24 + 기존 4 = 28이 된다. 4종을 방위 대표 기본형으로 두고 표의 방위당 6을 5로 줄이는 방법도 있음 |
| 청구 여우 | 3단계·east | 청구 여우 (east, 기존) / 윗단계 구미호(4) → 천호(5) | 원전 청구국 여우는 꼬리 아홉. 게임은 세 꼬리라 단계 사다리로 맞음 |
| 이무기 | 3단계·east | 이무기 (east, 기존) → 규룡(4) → 교룡(4) → 청룡·응룡(5) | 한국 설화. 한자 대응은 학설이 갈림 |
| 청학 | 3단계·east | 청학 (east, 기존) → 선학(4) → 왕자교(4) | |
| 박이 | 3단계·west | 박이 (**south**, 기존) | **방위 불일치**: 원전은 남산경(기산)이라 규칙상 south. 기존 게임은 west로 둠. 규칙을 따르려면 south로 옮기고, west에는 다른 3단계 요괴(쟁·토루 등)를 채우면 됨 |
| 천구 | 3단계·west | 천구 (west, 기존) | 일치 (서차삼경 음산) |
| 백록 | 3단계·west | 백록 (west, 기존) | 일치. 원전은 `獸多白鹿` 한 줄뿐이라 외형은 설계로 보충 |
| 필방 | 3단계·south | 필방 (south, 기존) | 일치(해외남경 기준). 서차삼경 장아산에도 나와 규칙상 west일 수 있으나 해외남경 畢方鳥를 따름 |
| 도깨비 | 3단계·south | 도깨비 (south, 기존) | 한국 설화 |
| 선동 | 3단계·south | 선동 (south, 기존) | 신선 계통 → 적송자(4)·마고(5) |
| 수귀 | 3단계·north | 수귀 (north, 기존) | 한국 설화 |
| 두억시니 | 3단계·north | 두억시니 (north, 기존) | 한국 설화. 윗단계 후보 포효(4)→도철(5)는 같은 어둠·식인 계열 |
| 현구 | 3단계·north | 현구 (north, 기존) | **방위 불일치 가능**: 새 부리·뱀 꼬리 거북의 원전은 남산경 旋龜(규칙상 south). 검은 거북이라 north로 유지했고, 윗단계는 비희(4)→현무(5) |

## 5. 계통 제안 (진화 줄기)

같은 몸통에 부품이 늘어나는 순서로 이은 줄기다. 번호 매김은 표의 이름 기준이며, 확정이 아니라 3택 진화 구성을 짤 때 쓰는 재료다.

| 방위 | 줄기 | 단계 사다리 |
|---|---|---|
| east | 뱀·용 | 활사(1) → 주유(2) → 이무기(3) → 규룡(4) → 교룡(4) → 청룡·응룡(5) |
| east | 여우 | 동동(2) → 비비(3) → 청구 여우(3) → 구미호(4) → 천호(5) |
| east | 학·신선 | 당강(2) → 청학(3) → 선학(4) → 왕자교(4) → 동왕공·동방삭(5) |
| east | 거북·바다 | 신요(1) → 휴귀(3) → 거오(4) → 동해용왕(5) |
| west | 범·맹수 | 호체(2) → 천구(3) → 쟁(3) → 박(4)·비휴(4) → 백호(5) |
| west | 사자·정의 | 계변(2) → 교(狡)(3) → 해치(4)·산예(4) → 백택(4) |
| west | 새·곤륜 | 당호(2) → 삼청조(3) → 영초(4) → 서왕모(5) |
| west | 흉수 | 효(2) → 토루(3) → 형천(4) → 궁기·혼돈·도올(5) |
| south | 새·불 | 성성(2) → 필방(3) → 원추(4) → 주작·봉황(5) |
| south | 도깨비 | 이력(2) → 도깨비(3) → 이매(4) → 산소(4) |
| south | 신선 | 관관(2) → 선동(3) → 적송자(4) → 마고·남극선옹(5) |
| south | 뱀·불 | 복충(1) → 명사(3) → 파사(4) → 축융(5) |
| north | 거북·물 | 수마(2) → 현구(3) → 비희(4) → 현무(5) |
| north | 어둠·식인 | 족자(2) → 두억시니(3) → 포효(4) → 도철(5) |
| north | 뱀·물귀신 | 비질(1) → 수귀(3) → 화사(3) → 상류(4) → 촉룡(5) |
| north | 물고기·큰 새 | 이서(2) → 정위(3) → 곤(4) → 붕(5) |

## 6. 한계와 확인할 점

- **독음 확인 필요**: 희귀 한자라 한글 독음을 문서로 확인하지 못한 것 — 충거(䳋渠), 창부(𪁺𩿧), 산휘(山𤟤), 독욕(獨𤞞), 흠비(欽䲹). 게임 화면에 쓰기 전에 사용자 확인이 필요하다.
- **묘사가 짧아 부품을 설계로 보충해야 하는 것**: 목충(木蟲), 복충(蝮虫), 백록(白鹿).
- **이름 충돌**: 蛟(교)·狡(교), 瞿如(구여)·犰狳(구여), 肥遺(비유, 뱀·새·쌍신 뱀 3종)는 한글만 보면 같다. 게임 안 이름은 구분되게 짓거나 한자를 병기해야 한다.
- **방위 규칙 충돌**: 청구 여우·구미호는 남산경(south)에도, 해외동경(east)에도 나온다. 기존 게임이 east라 east로 적었다. 같은 이유로 박이는 west→south, 필방은 서차삼경(west)→해외남경(south)을 따랐다.
- **인간형·국(國) 항목**: 군자·흑치·모민·섭이·일목 같은 이인(異人)은 부품 재료가 적어 대부분 예비로 돌렸다.
- **4흉**: 혼돈(제강)·궁기·도올·도철은 모두 yo 5단계 최종 후보다. 원전 위치대로 하면 혼돈·궁기·도올이 west에 몰려서, west에는 혼돈·궁기만 핵심으로 두고 도올은 예비로 돌렸다. 도철은 north 핵심이다.
- **후대 외형**: 용생구자·사신·신선의 외형은 원전이 아니라 후대 도상이다. 산해경 원문 항목과 섞어 쓸 때는 4~5단계에 몰려 있음을 감안해야 한다.

<!-- row-count: 216 -->
