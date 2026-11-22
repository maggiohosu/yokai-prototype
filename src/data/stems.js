// 진화 줄기 16개(방위마다 4개). 설계: docs/design-forms-abilities.md 1절.
// - 같은 줄기 안에서 단계가 오를수록 강해지는 여의주 능력 하나를 가진다(ability는 T3의 tuning-abilities.js 키).
// - orbStyle은 그 줄기의 여의주 구슬 그림 데이터다. 그림은 src/art/orbs.js(T2)가 shape 키로 그린다.
//   사용자 결정(2026-11-23): 4·5단계 특수 적의 구슬도 그 적 줄기의 모양·색으로 그린다(효과는 지금 구슬과 같음).
// - 색은 art-direction 4장 팔레트만 쓴다. 등급 고리 색(#FF6FD8 #A46BFF #4A9DFF #FFC53D)과 특수 적 구슬 색(#C2185B #FFB3DD #7B1FA2)은 쓰지 않는다.
// - boostMult: 부스터 배율 = baseMult × boostMult + 이동 속도 강화 레벨 × perSpeedLevel 의 줄기 보정(0.9~1.2).
// - cross: 같은 방위에서 진화로 건너갈 수 있는 곁줄기 2개(진화 규칙 3-1).
//
// shape 키(그림 담당 T2가 16개를 모두 그린다):
//   lightning 번개 마름모 + 지그재그 꼬리   foxfire 여우불 물방울 + 세 갈래 꼬리   feather 흰 깃털 화살   pearl 진주 원 + 옥 고리
//   claw 발톱 초승달   hornArrow 뿔 삼각 화살 + 금 점   chevron 갈매기(V)   thornStar 가시 톱니 별(6점)
//   comet 불꽃 혜성   tripleFire 작은 불덩이 3개 묶음   peach 복숭아(원 + 홈 + 잎)   bomb 불씨 폭탄(원 + 네 갈래 불꽃)
//   iceHex 얼음 육각 조각   toothMouth 이빨 입 구슬(원 + 지그재그 입)   whirlDrop 물방울 + 나선   windFeather 겹초승달 바람 깃

export const STEMS = [
  {
    id: 'E1', dir: 'east', name: '청룡 줄기', theme: '뱀·용', ability: 'chain',
    orbStyle: { shape: 'lightning', main: 0x4c8db8, sub: 0xd2efc8, tail: 0x439483 },
    boostMult: 1.05, cross: ['E2', 'E3'],
  },
  {
    id: 'E2', dir: 'east', name: '구미호 줄기', theme: '여우', ability: 'charm',
    orbStyle: { shape: 'foxfire', main: 0x85cfb7, sub: 0x2d6b5e, tail: 0xd2efc8 },
    boostMult: 1.1, cross: ['E3', 'E4'],
  },
  {
    id: 'E3', dir: 'east', name: '선학 줄기', theme: '학·신선', ability: 'homing',
    orbStyle: { shape: 'feather', main: 0xfffdf1, sub: 0x439483, tail: 0xd2efc8 },
    boostMult: 1.15, cross: ['E1', 'E4'],
  },
  {
    id: 'E4', dir: 'east', name: '거오 줄기', theme: '거북·바다', ability: 'orbit',
    orbStyle: { shape: 'pearl', main: 0xdcefe0, sub: 0x7cc4a4, tail: 0x3f8f72 },
    boostMult: 0.9, cross: ['E1', 'E2'],
  },
  {
    id: 'W1', dir: 'west', name: '백호 줄기', theme: '범·맹수', ability: 'pierce',
    orbStyle: { shape: 'claw', main: 0xfff7df, sub: 0x8c7a58, tail: 0xbfcbcf },
    boostMult: 1.2, cross: ['W3', 'W4'],
  },
  {
    id: 'W2', dir: 'west', name: '해치 줄기', theme: '사자·정의', ability: 'mark',
    orbStyle: { shape: 'hornArrow', main: 0xbfcbcf, sub: 0xefbd6c, tail: 0xb69d76 },
    boostMult: 1.0, cross: ['W1', 'W4'],
  },
  {
    id: 'W3', dir: 'west', name: '서왕모 줄기', theme: '새·곤륜', ability: 'boomerang',
    orbStyle: { shape: 'chevron', main: 0xb69d76, sub: 0x7cc4a4, tail: 0xfff7df },
    boostMult: 1.1, cross: ['W1', 'W2'],
  },
  {
    id: 'W4', dir: 'west', name: '흉수 줄기', theme: '흉수', ability: 'fear',
    orbStyle: { shape: 'thornStar', main: 0x8c7a58, sub: 0xc45148, tail: 0xb69d76 },
    boostMult: 0.95, cross: ['W2', 'W3'],
  },
  {
    id: 'S1', dir: 'south', name: '주작 줄기', theme: '새·불', ability: 'burn',
    orbStyle: { shape: 'comet', main: 0xd9503f, sub: 0xffd3a2, tail: 0xc06558 },
    boostMult: 1.2, cross: ['S2', 'S3'],
  },
  {
    id: 'S2', dir: 'south', name: '도깨비 줄기', theme: '도깨비', ability: 'split',
    orbStyle: { shape: 'tripleFire', main: 0xf2d98a, sub: 0xc45148, tail: 0xd9503f },
    boostMult: 1.05, cross: ['S1', 'S4'],
  },
  {
    id: 'S3', dir: 'south', name: '선동 줄기', theme: '신선', ability: 'zone',
    orbStyle: { shape: 'peach', main: 0xffd3a2, sub: 0x7cc4a4, tail: 0xfffdf1 },
    boostMult: 1.0, cross: ['S1', 'S4'],
  },
  {
    id: 'S4', dir: 'south', name: '축융 줄기', theme: '가뭄·불뱀', ability: 'explode',
    orbStyle: { shape: 'bomb', main: 0xc06558, sub: 0xefbd6c, tail: 0xd9503f },
    boostMult: 0.95, cross: ['S2', 'S3'],
  },
  {
    id: 'N1', dir: 'north', name: '현무 줄기', theme: '거북·물', ability: 'freeze',
    orbStyle: { shape: 'iceHex', main: 0xe4eaee, sub: 0x536581, tail: 0xc0d1da },
    boostMult: 0.9, cross: ['N2', 'N3'],
  },
  {
    id: 'N2', dir: 'north', name: '도철 줄기', theme: '어둠·식인', ability: 'drain',
    orbStyle: { shape: 'toothMouth', main: 0x2f3b57, sub: 0xc45148, tail: 0x536581 },
    boostMult: 0.95, cross: ['N1', 'N4'],
  },
  {
    id: 'N3', dir: 'north', name: '촉룡 줄기', theme: '뱀·물귀신', ability: 'vortex',
    orbStyle: { shape: 'whirlDrop', main: 0x899bb3, sub: 0xc0d1da, tail: 0x536581 },
    boostMult: 1.0, cross: ['N1', 'N4'],
  },
  {
    id: 'N4', dir: 'north', name: '붕 줄기', theme: '물고기·큰 새', ability: 'gust',
    orbStyle: { shape: 'windFeather', main: 0xc0d1da, sub: 0xe4eaee, tail: 0x899bb3 },
    boostMult: 1.15, cross: ['N2', 'N3'],
  },
];

export const STEM_BY_ID = Object.fromEntries(STEMS.map((stem) => [stem.id, stem]));

// 줄기 보정: 줄기 없는 형태(mimul)나 모르는 줄기는 1.0.
export function stemBoostMult(stemId) {
  const value = STEM_BY_ID[stemId]?.boostMult;
  return Number.isFinite(value) ? value : 1;
}
