// 능력 안내 창(src/ui/AbilityInfoView.js)이 쓰는 글과 수치 표시 규칙. 능력 16종 모두의 '사용 방법'을 데이터로 둔다.
// 근거: docs/design-forms-abilities.md 1-2·4-2·4-3·4-4, docs/design-weapons.md 3-2 표. 수치 자체는 src/systems/tuning-abilities.js가 정하고 여기는 글만 가진다.
// - summary 능력 한 줄 설명. use 사용 방법 2~4줄(발사 버튼으로 어떻게 쓰는지, 잘 맞는 상황). resistNote 상위 단계 적 저항에 덧붙일 말(선택).
// - stats 안내 창에 보이는 수치 칸. key = ABILITIES[id]의 배열 이름, unit = 표시 방식:
//     sec 초(소수 첫째 자리) / count 정수 + suffix / dist 거리(월드 단위, 정수) / pct 비율(0.5 → 50%) / pctRaw 이미 퍼센트 값(15 → +15%)
//     mult 배율(×1.0) / num 정수. zeroText가 있으면 값이 0일 때 그 글을 보인다.
//   damage: true인 칸은 '기준 피해(구슬 한 발, 무기·등급 반영)'에 곱하는 비율이라서 안내 창이 실제 피해 값도 함께 적는다.
// - WEAPON_COMBOS 보패(여의주 아닌 무기)를 장착했을 때 그 무기와의 조합 한 줄. 표의 '그대로' 칸은 적지 않는다(안내 창이 한 줄을 생략한다).

import { CONFIG } from '../config.js';

export const HUNGER_HINT = CONFIG.vitality.hungerGraceSec + '초 동안 직접 먹지 않으면 생명력이 줄어요.';

export const ABILITY_GUIDES = {
  chain: {
    summary: '맞은 적에서 가까운 적으로 번개가 몇 번 튄다',
    use: [
      '구슬을 한 마리에게 맞히면 둘레의 다른 요괴로 번개가 이어진다. 뭉쳐 다니는 작은 요괴 떼에 쏘자.',
      '처음 맞힌 요괴가 가장 크게 깎이고 튈수록 약해진다. 가장 큰 적을 직접 겨누자.',
      '이미 맞은 적에게는 다시 튀지 않는다. 혼자 떨어진 적에게는 번개가 튈 곳이 없다.',
    ],
    stats: [
      { key: 'hops', label: '튀는 횟수', unit: 'count', suffix: '번' },
      { key: 'range', label: '튀는 거리', unit: 'dist' },
      { key: 'falloff', label: '튈 때마다 남는 피해', unit: 'pct' },
    ],
  },
  charm: {
    summary: '맞은 적이 잠시 내 편이 되어 다른 요괴를 사냥한다',
    use: [
      '발사 버튼으로 쏴 맞히면 그 요괴가 잠시 내 편이 되어 둘레의 다른 요괴를 사냥한다.',
      '내 편이 사냥하면 요력을 얻는다. 생명력은 내가 직접 먹어야 찬다.',
      '내 편은 나를 먹지 않고 내 구슬도 통과한다. 끝난 뒤 1초는 나에게서 도망치고, 한동안 다시 걸리지 않는다.',
      '다시 걸기까지 대기 시간이 있고, 동시에 거느릴 수 있는 수도 정해져 있다.',
    ],
    stats: [
      { key: 'duration', label: '내 편이 되는 시간', unit: 'sec' },
      { key: 'cooldown', label: '다시 걸기까지', unit: 'sec' },
      { key: 'allies', label: '동시에 거느리는 수', unit: 'count', suffix: '마리' },
    ],
  },
  homing: {
    summary: '구슬이 사방에서 적을 찾아 끝까지 쫓아간다',
    use: [
      '구슬이 사방에서 가까운 적을 찾아 휘어 날아간다. 방향만 대충 맞춰 쏴도 맞는다.',
      '표적이 쓰러지면 둘레에서 새 표적을 찾아 끝까지 쫓아간다.',
      '도망치면서 뒤쪽 적을 맞히거나, 재빠른 작은 요괴를 잡을 때 좋다.',
    ],
    stats: [
      { key: 'strength', label: '쫓아가는 힘', unit: 'pct' },
      { key: 'turn', label: '방향을 트는 속도', unit: 'mult' },
      { key: 'retarget', label: '새 표적을 찾는 거리', unit: 'dist' },
    ],
  },
  orbit: {
    summary: '진주 구슬이 내 몸 둘레를 돌며 닿는 적을 치고 적 구슬을 막는다',
    use: [
      '진주가 내 몸 둘레를 돌며 닿는 적을 친다. 쏘지 않아도 계속 일한다.',
      '특수 적이 쏜 구슬을 막는다. 막은 진주는 사라졌다가 시간이 지나면 다시 생긴다.',
      '작은 적 사이로 뛰어들거나 포위당했을 때 든든하다. 같은 적은 0.4초마다 한 번씩만 맞는다.',
    ],
    stats: [
      { key: 'count', label: '진주 수', unit: 'count', suffix: '개' },
      { key: 'damage', label: '닿을 때 피해', unit: 'pct', damage: true },
      { key: 'regen', label: '진주가 다시 생기는 시간', unit: 'sec' },
    ],
  },
  pierce: {
    summary: '구슬이 적을 꿰뚫고 다음 적까지 날아간다',
    use: [
      '구슬이 적을 꿰뚫고 다음 적까지 날아간다. 한 줄로 늘어선 적에게 쏘자.',
      '꿰뚫을 때마다 피해가 줄어든다. 첫 번째 적이 가장 크게 깎인다.',
      '같은 구슬은 같은 적을 한 번만 친다.',
    ],
    stats: [
      { key: 'extra', label: '더 꿰뚫는 수', unit: 'count', suffix: '마리' },
      { key: 'keep', label: '꿰뚫은 뒤 남는 피해', unit: 'pct' },
    ],
  },
  mark: {
    summary: '맞은 적에 표식이 붙어 받는 피해가 늘고 다른 요괴의 먹잇감이 된다',
    use: [
      '맞은 적에게 표식이 붙어 정해진 시간 동안 내가 주는 피해가 늘어난다. 큰 적에 표식을 붙이고 이어서 쏘자.',
      '3단계 이상이면 표식 붙은 요괴를 다른 요괴가 더 잘 사냥한다.',
      '표식을 다시 맞히면 시간만 새로 고쳐진다(겹쳐 쌓이지 않는다).',
    ],
    stats: [
      { key: 'amp', label: '받는 피해 증가', unit: 'pctRaw' },
      { key: 'duration', label: '표식 시간', unit: 'sec' },
    ],
  },
  boomerang: {
    summary: '구슬이 맞거나 끝까지 가면 되돌아오며 길 위 적을 한 번 더 친다',
    use: [
      '구슬이 첫 명중이나 사거리 끝에서 방향을 돌려 나에게 돌아오며, 오는 길의 적을 한 번 더 친다.',
      '가는 길에 못 맞힌 적이 오는 길에 걸린다. 멀리 쏴서 길 위의 적을 노리자.',
      '가는 길·오는 길 각각 같은 적은 한 번만 맞는다. 돌아온 구슬은 나에게 닿으면 사라진다.',
    ],
    stats: [
      { key: 'damage', label: '돌아올 때 피해', unit: 'pct', damage: true },
      { key: 'pierce', label: '오는 길에 꿰뚫는 수', unit: 'count', suffix: '마리' },
      { key: 'rangeBonus', label: '사거리 증가', unit: 'pctRaw' },
    ],
  },
  fear: {
    summary: '맞은 적이 겁먹고 나에게서 도망치며, 그동안 나를 먹지 못한다',
    use: [
      '발사 버튼으로 쏴 맞히면 그 요괴가 겁먹어 나에게서 도망치고, 그동안 나를 먹지 못한다.',
      '큰 적에게 쫓길 때 맞히고 도망치거나, 먹히기 직전의 위기를 넘길 때 쓴다.',
      '겁먹은 동안에는 사냥도 하지 않는다. 끝난 뒤 1초는 다시 겁주지 못하니 그 사이 거리를 벌리자.',
    ],
    stats: [
      { key: 'duration', label: '겁먹는 시간', unit: 'sec' },
    ],
  },
  burn: {
    summary: '맞은 적이 잠시 불타며 계속 깎인다',
    use: [
      '맞은 적이 잠시 불타며 시간이 흐르는 동안 계속 깎인다.',
      '큰 적에게 한 발 맞히고 거리를 벌리며 불이 일하길 기다리자.',
      '다시 맞히면 타는 시간이 새로 고쳐진다. 불 하나가 주는 총 피해는 정해져 있다.',
    ],
    resistNote: '지속이 줄면 받는 총 화상 피해도 같은 비율로 줄어든다.',
    stats: [
      { key: 'total', label: '총 화상 피해', unit: 'pct', damage: true },
      { key: 'duration', label: '타는 시간', unit: 'sec' },
    ],
  },
  split: {
    summary: '맞으면 도깨비불 여러 개로 갈라져 사방으로 튄다',
    use: [
      '맞은 자리에서 도깨비불이 여러 갈래로 갈라져 사방으로 튄다. 요괴가 빽빽한 곳에서 터뜨리자.',
      '갈래는 짧게 날아가고 다시 갈라지지 않는다. 갈래 하나는 약하니 수가 많을수록 좋다.',
      '맞은 적 쪽으로는 갈래가 가지 않는다. 적이 둘레에 퍼져 있을 때 잘 맞는다.',
    ],
    stats: [
      { key: 'count', label: '갈래 수', unit: 'count', suffix: '개' },
      { key: 'damage', label: '갈래 한 개 피해', unit: 'pct', damage: true },
      { key: 'range', label: '갈래 사거리', unit: 'dist' },
    ],
  },
  zone: {
    summary: '구슬이 멈춘 자리에 구름이 남아 안의 적을 느리게 하고 깎는다',
    use: [
      '구슬이 맞거나 사거리 끝에 닿은 자리에 구름이 남아 안의 적을 느리게 하고 계속 깎는다.',
      '쫓아오는 적의 길목에 깔아 놓고 달아나자. 느려진 적은 따라오기 어렵다.',
      '구름은 동시에 정해진 수까지만 남고, 넘치면 가장 오래된 것부터 사라진다.',
    ],
    stats: [
      { key: 'radius', label: '구름 반경', unit: 'dist' },
      { key: 'duration', label: '구름이 남는 시간', unit: 'sec' },
      { key: 'slow', label: '안의 적 둔화', unit: 'pct' },
      { key: 'dps', label: '초당 피해', unit: 'pct', damage: true },
      { key: 'clouds', label: '동시에 남는 구름', unit: 'count', suffix: '개' },
    ],
  },
  explode: {
    summary: '맞은 자리에서 터져 둘레의 적도 깎는다',
    use: [
      '맞은 자리에서 터져 둘레의 다른 적도 깎는다. 뭉친 무리의 한가운데를 맞히자.',
      '처음 맞은 적에게는 구슬 피해가, 둘레에는 폭발 피해가 들어간다.',
      '둘레에 아무도 없으면 폭발은 구경거리일 뿐이다. 적이 붙어 있을 때 쏘자.',
    ],
    stats: [
      { key: 'radius', label: '폭발 반경', unit: 'dist' },
      { key: 'damage', label: '둘레 적 피해', unit: 'pct', damage: true },
    ],
  },
  freeze: {
    summary: '맞은 적이 얼어붙어 움직이지도, 먹지도, 쏘지도 못한다',
    use: [
      '발사 버튼으로 쏴 맞히면 그 요괴가 얼어붙어 움직이지도, 먹지도, 쏘지도 못한다.',
      '큰 적에게 쫓길 때 맞히고 도망치거나, 위협적인 큰 요괴를 얼려 두고 역전을 노릴 때 쓴다.',
      '얼음이 풀린 뒤 1초는 다시 얼지 않는다. 얼어 있는 적도 다른 요괴에게는 먹힐 수 있다.',
    ],
    stats: [
      { key: 'duration', label: '얼어붙는 시간', unit: 'sec' },
    ],
  },
  drain: {
    summary: '깎아 낸 만큼 내 몸이 조금 자란다',
    use: [
      '구슬로 적을 깎아 낸 만큼 내 몸이 조금 자란다. 먹지 않아도 크는 능력이다.',
      '큰 적을 오래 깎을수록 많이 자란다. 맞히기만 해도 되니 위험한 적을 멀리서 괴롭히자.',
      '흡수로 늘어나는 면적은 1초에 내 몸 면적의 4%까지다.',
    ],
    stats: [
      { key: 'rate', label: '깎은 면적의 흡수율', unit: 'pct' },
    ],
  },
  vortex: {
    summary: '맞은 자리에 소용돌이가 생겨 둘레 적을 끌어당긴다',
    use: [
      '맞은 자리에 소용돌이가 생겨 둘레 요괴를 가운데로 끌어당긴다.',
      '흩어진 작은 요괴를 한곳에 모아 이어서 쏘면 한꺼번에 맞힌다.',
      '소용돌이는 짧게만 남고, 0.5초에 한 번씩만 만들어진다.',
    ],
    stats: [
      { key: 'radius', label: '소용돌이 반경', unit: 'dist' },
      { key: 'pull', label: '끌어당기는 속도', unit: 'num' },
      { key: 'duration', label: '지속', unit: 'sec' },
      { key: 'count', label: '동시에 남는 수', unit: 'count', suffix: '개' },
    ],
  },
  gust: {
    summary: '맞은 적을 세게 밀어내고 잠깐 멈칫하게 한다',
    use: [
      '맞은 적을 구슬이 날아간 방향으로 힘껏 밀어내고 잠깐 멈칫하게 한다.',
      '달려드는 적을 날려 거리를 벌리고 위기를 넘기자.',
      '4단계부터는 맞은 적 둘레의 요괴도 절반 거리만큼 밀린다. 같은 적은 0.3초 안에 다시 밀리지 않는다.',
    ],
    stats: [
      { key: 'distance', label: '밀어내는 거리', unit: 'dist' },
      { key: 'areaRadius', label: '둘레 요괴를 미는 반경', unit: 'dist', zeroText: '없음' },
    ],
  },
};

export const ABILITY_GUIDE_IDS = Object.keys(ABILITY_GUIDES);

// 무기 열 이름은 src/data/weapons.js의 id와 같다. 여의주(기준)와 '그대로' 칸은 적지 않는다.
const SAME_STATUS_GOURD = '물방울이 맞을 때와 적이 웅덩이에 처음 들어올 때 걸린다.';
const SAME_STATUS_BELL = '고리가 지나간 적마다 걸리지만 지속이 ×0.6으로 줄어든다(한 번에 여럿이 맞으므로).';

export const WEAPON_COMBOS = {
  chain: {
    fan: '깃을 한 번 쏘면 연쇄 번개가 최대 2번 발동한다.',
    mirror: '줄 끝에서 1번 튀고, 튀는 횟수가 +1이다.',
    sword: '칼이 가는 길·오는 길에서 첫 명중마다 튄다.',
    beads: '같은 적에게 1초에 한 번씩 튄다.',
    gourd: '웅덩이가 생길 때 한 번 튄다.',
    bell: '소리 고리마다 한 번 튄다.',
    seal: '주 표적에서 한 번 튀고, 튀는 횟수가 +1이다.',
  },
  charm: {
    fan: '깃이 여러 장 맞아도 대기 시간 때문에 한 번에 한 마리만 걸린다.',
    gourd: SAME_STATUS_GOURD,
    bell: SAME_STATUS_BELL,
    seal: '주 표적에게 먼저 걸린다.',
  },
  homing: {
    fan: '깃은 앞쪽 부채꼴에서만 표적을 찾고 유도 세기는 절반이다.',
    mirror: '광선의 조준 보정 각도가 넓어진다.',
    sword: '가는 길에 사방 탐지로 표적을 쫓는다.',
    beads: '알이 도는 반지름이 커진다.',
    gourd: '물방울이 사방 탐지로 표적을 쫓는다.',
    bell: '소리 고리의 최대 반경이 커진다.',
    seal: '탐지가 사방으로 넓어지고 탐지 거리도 늘어난다.',
  },
  orbit: {
    beads: '진주를 따로 만들지 않고 알 수가 늘어나며, 알이 적 구슬을 막는다.',
  },
  pierce: {
    fan: '깃마다 꿰뚫는다. 꿰뚫은 뒤 남는 피해는 그대로다.',
    mirror: '광선은 이미 줄 위를 모두 치므로 대신 광선 피해와 폭이 커진다.',
    sword: '칼은 이미 꿰뚫으므로 대신 칼 피해가 커진다.',
    beads: '알 피해가 커진다.',
    gourd: '웅덩이 반경이 커진다.',
    bell: '소리 고리 피해가 커진다.',
    seal: '인장이 떨어지는 반경이 커진다.',
  },
  mark: {
    gourd: SAME_STATUS_GOURD,
    bell: SAME_STATUS_BELL,
  },
  boomerang: {
    fan: '깃이 모두 돌아오면 넘치므로 가운데 깃 한 장만 돌아온다.',
    mirror: '0.15초 뒤 같은 줄을 한 번 더 쏜다(반사).',
    sword: '오는 길 피해가 커지고 가는 거리가 늘어난다.',
    beads: '알이 돌아오는 길에도 적을 맞힌다.',
    gourd: '웅덩이가 남는 시간이 늘어난다.',
    bell: '최대 반경에서 안쪽으로 되돌아오는 메아리 고리가 생긴다.',
    seal: '0.3초 뒤 같은 자리에 인장이 한 번 더 떨어진다.',
  },
  fear: {
    gourd: SAME_STATUS_GOURD,
    bell: SAME_STATUS_BELL,
  },
  burn: {
    gourd: SAME_STATUS_GOURD,
    bell: SAME_STATUS_BELL,
  },
  split: {
    fan: '한 번 쏠 때 최대 2번 갈라진다.',
    mirror: '줄 끝에서 한 번 갈라진다.',
    sword: '칼이 가는 길·오는 길에서 첫 명중마다 갈라진다.',
    beads: '같은 적에게 1초에 한 번씩 갈라진다.',
    gourd: '웅덩이 중심에서 한 번 갈라지고, 갈래 사거리가 ×0.7이다.',
    bell: '소리 고리마다 한 번 갈라진다.',
    seal: '주 표적에서 갈라지고, 갈래가 +1개다.',
  },
  zone: {
    fan: '한 번 쏠 때 가운데 깃 하나만 구름을 남긴다.',
    mirror: '줄 끝에 구름이 하나 남는다.',
    sword: '칼이 돌아서는 자리에 구름이 하나 남는다.',
    beads: '퍼질 때마다 내 자리에 구름이 하나 남고, 반경이 ×0.8이다.',
    gourd: '웅덩이가 구름을 겸해서 안의 적을 느리게 한다.',
    bell: '소리 고리마다 내 자리에 구름이 하나 남고, 반경이 ×0.8이다.',
    seal: '인장이 떨어진 자리에 구름이 하나 남고, 반경이 ×1.2이다.',
  },
  explode: {
    fan: '한 번 쏠 때 최대 2번 터진다.',
    mirror: '줄 끝에서 한 번 터진다.',
    sword: '칼이 가는 길·오는 길에서 첫 명중마다 터진다.',
    beads: '같은 적에게 1초에 한 번씩 터진다.',
    gourd: '웅덩이가 생길 때 한 번 터진다.',
    bell: '소리 고리마다 한 번 터진다.',
    seal: '폭발을 따로 만들지 않고 인장이 떨어지는 반경이 커진다.',
  },
  freeze: {
    gourd: SAME_STATUS_GOURD,
    bell: SAME_STATUS_BELL,
  },
  drain: {
    fan: '모든 무기 피해(웅덩이 포함)에서 흡수한다.',
    mirror: '모든 무기 피해(웅덩이 포함)에서 흡수한다.',
    sword: '모든 무기 피해(웅덩이 포함)에서 흡수한다.',
    beads: '모든 무기 피해(웅덩이 포함)에서 흡수한다.',
    gourd: '모든 무기 피해(웅덩이 포함)에서 흡수한다.',
    bell: '모든 무기 피해(웅덩이 포함)에서 흡수한다.',
    seal: '모든 무기 피해(웅덩이 포함)에서 흡수한다.',
  },
  vortex: {
    fan: '한 번 쏠 때 가운데 깃 하나만 소용돌이를 만든다.',
    mirror: '줄 끝에 소용돌이가 하나 생긴다.',
    sword: '칼이 돌아서는 자리에 소용돌이가 하나 생긴다.',
    beads: '같은 적에게 1초에 한 번씩, 맞은 자리에 생긴다.',
    gourd: '웅덩이가 소용돌이를 겸해서 둘레 적을 끌어당긴다.',
    bell: '소리 고리마다 가장 큰 맞은 적 자리에 하나 생긴다.',
    seal: '인장이 떨어진 자리에 하나 생긴다.',
  },
  gust: {
    fan: '깃마다 밀지만 밀기 거리가 ×0.5로 줄어든다.',
    mirror: '광선이 가는 방향으로 밀고, 밀기 거리가 ×0.7이다.',
    sword: '칼이 가는 방향으로 밀고, 돌아올 때는 바깥쪽으로 민다.',
    beads: '나에게서 적 쪽으로 민다.',
    gourd: '물방울이 맞을 때만 밀고 웅덩이에 들어올 때는 밀지 않는다.',
    bell: '나에게서 바깥쪽으로 밀고, 밀기 거리가 ×0.6이다.',
    seal: '떨어진 자리 중심에서 바깥쪽으로 민다. 주 표적은 그대로, 나머지는 ×0.5다.',
  },
};
