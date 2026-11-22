저장소: C:/Users/SG/Desktop/새 폴더 (2)/yokai-game. docs/spec.md(기획)와 docs/plan.md(설계)를 먼저 읽어라. 다른 에이전트가 동시에 index.html, src/config.js, src/data/, src/art/, src/game/, src/scenes/ 를 만들고 있다. 그 파일들은 절대 만들거나 고치지 마라. 아래에 지정한 파일만 만든다.
규칙:
- 순수 ES 모듈(브라우저와 node 둘 다 동작). DOM·Phaser 사용 금지.
- 무작위는 모두 rng 인자(기본 Math.random)로 주입받아 테스트에서 고정할 수 있게.
- 기획 원칙 5: 확률 결과를 먼저 정하고 반환한다(연출용 '아깝게 보이기' 값 금지).
- 수치는 지정된 tuning 파일에만 둔다(나중에 Opus가 src/config.js로 합친다).
- 테스트는 node:test로 tests/ 아래에, 'node --test tests/' 로 통과해야 함. 확률은 고정 rng와 10만 회 몬테카를로로 기대값 ±1%p 확인.
- git commit 하지 마라. 끝나면 만든 파일, 공개 함수 시그니처, 테스트 결과를 한국어로 짧게 보고.

담당 파일: src/systems/tuning-upgrade.js, src/systems/enhance.js, src/systems/treasure.js, tests/enhance.test.mjs, tests/treasure.test.mjs

1) enhance.js — 본체 강화(기획 7절)
- 능력치 3종: growth(크기 성장), speed(이동 속도), signature(대표 효과). 각 0~10.
- tryEnhance(state, stat, {rng}) → {result:'success'|'great'|'fail'|'degrade', from, to, chanceUsed, pityBonusAfter, needsChoice}
  성공률 +1 95 … +10 10%, 천장: 실패·퇴화마다 다음 성공률 +5%p(해당 능력치 기준 또는 전체 — 전체 하나로), 성공 시 0. 대성공: 성공 중 5%는 +2(최대 10). 퇴화 비율(실패 중): 목표 +1~4 0%, +5~6 30%, +7~8 40%, +9~10 50%. 보호권이 있으면 퇴화 대신 실패로 처리하고 보호권 1 소모(결과에 protectedUsed:true).
- 퇴화 시 선택: applyDegradeChoice(state, 'A'|'B', stat) — A: 그 능력치 -1. B: 진화 단계 1 낮춤 표시(state.pendingDevolve = true; 실제 재진화는 진화 모듈이 처리), 1단계면 B 불가(에러 대신 {ok:false}).
- enhanceCost(level) 요력 비용(초안: 20 * 1.6^level 반올림, tuning에).
- autoEnhance(state, stat, targetLevel, {rng, canAfford, pay}) → 시도 기록 배열과 멈춘 이유('target'|'degrade'|'great'|'gold'|'max'). S급 관련 멈춤은 state.grade가 'S'|'S+'일 때 결과가 나오면 멈춤으로 해석. 무한 루프 방지 상한.
- 확률 표시용 getEnhanceOdds(state, stat) → {success, great, fail, degrade}(백분율).
2) treasure.js — 여의주(기획 8절)
- 강화 0~15: 성공률 +1~+5 90→70% 선형, +6~+10 60→40%, +11~+15 30→10%. 실패 시 깨짐: 목표 +1~5 0%, +6~10 10→20%, +11~15 30→50%.
- sellPrice(level): +0 5, +5≈100, +10≈1000, +15≈10000 지수형(tuning). upgradeCost(level)=round(sellPrice(level+1)*0.2).
- tryUpgrade(treasure, {rng}) → {result:'success'|'fail'|'break', from, to, shards}. 깨지면 파편 지급(레벨에 비례, tuning).
- 파편 → 보호권 교환 exchangeShards(state) (예: 10파편=1보호권, tuning).
- treasureStats(level) → {damage, shots, chargePower} 레벨에 따라 상승(2단계 전투에서 사용).
- treasureTitle(level) → +10 이상이면 '+12 천둥 여의주' 같은 칭호(+10~15 단계별 수식어 표: 바람/번개/천둥/폭풍/하늘/용왕 등), 미만이면 '+7 여의주'.
- 드롭: dropChance({killedByTreasure}) 기본 8%, 보물로 쓰러뜨리면 20%(tuning). 보관함 5칸 헬퍼 addToInventory/equip/sell.