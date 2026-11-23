// 도감 정렬(순수 함수, Phaser·DOM 없음). 도감 화면(src/scenes/GalleryScene.js)이 카드를 이 순서로 늘어놓는다.
// 규칙(계획서 변경 이력 8): 발견한 형태가 먼저(좌상단부터), 그 안에서 단계 → 방위 → 기존 순서. 발견하지 못한 형태는 뒤에 두고 같은 순서를 쓴다.
// 방위 순서는 config.js의 REGIONS와 같다(동·서·남·북). 시작 형태 mimul처럼 방위가 없는 형태('none')는 맨 앞이다.
// 방위 필터는 카드를 숨기기만 하므로 이 순서가 그대로 남는다.

const DIR_ORDER = ['none', 'east', 'west', 'south', 'north'];
const dirRank = (dir) => {
  const index = DIR_ORDER.indexOf(dir);
  return index < 0 ? DIR_ORDER.length : index;
};

// forms: 형태 배열(원본은 바꾸지 않는다). discovered: 발견한 형태 id의 Set 또는 배열. 새 배열을 돌려준다.
export function sortGallery(forms, discovered) {
  const found = discovered instanceof Set ? discovered : new Set(discovered ?? []);
  return forms
    .map((form, index) => ({ form, index, seen: found.has(form.id) ? 0 : 1 }))
    .sort((a, b) => a.seen - b.seen
      || (a.form.stage ?? 0) - (b.form.stage ?? 0)
      || dirRank(a.form.dir) - dirRank(b.form.dir)
      || a.index - b.index)
    .map(({ form }) => form);
}
