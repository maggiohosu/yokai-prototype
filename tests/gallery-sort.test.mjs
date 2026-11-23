import test from 'node:test';
import assert from 'node:assert/strict';
import { FORMS } from '../src/data/forms.js';
import { sortGallery } from '../src/data/gallery-sort.js';

const f = (id, stage, dir) => ({ id, stage, dir });
const ids = (list) => list.map((x) => x.id);

test('발견한 형태가 먼저, 그 안에서 단계 → 방위(동·서·남·북) → 기존 순서', () => {
  const forms = [
    f('a', 3, 'north'), f('b', 2, 'south'), f('c', 2, 'east'), f('d', 2, 'east'),
    f('e', 1, 'west'), f('x', 1, 'none'), f('y', 2, 'west'),
  ];
  const found = new Set(['a', 'b', 'c', 'd', 'e', 'x']);
  // 발견: x(1,none) e(1,west) c d(2,east, 기존 순서) b(2,south) a(3) → 미발견: y
  assert.deepEqual(ids(sortGallery(forms, found)), ['x', 'e', 'c', 'd', 'b', 'a', 'y']);
});

test('발견하지 못한 형태는 모두 뒤로, 거기서도 같은 순서', () => {
  const forms = [f('u3', 3, 'east'), f('d5', 5, 'east'), f('u1', 1, 'north'), f('u2w', 2, 'west'), f('u2e', 2, 'east')];
  const out = sortGallery(forms, new Set(['d5']));
  assert.deepEqual(ids(out), ['d5', 'u1', 'u2e', 'u2w', 'u3']);
});

test('원본 배열을 바꾸지 않고, 배열로 넘겨도 되고, 발견 목록이 없어도 된다', () => {
  const forms = [f('b', 2, 'east'), f('a', 1, 'east')];
  const copy = [...forms];
  assert.deepEqual(ids(sortGallery(forms, ['b'])), ['b', 'a']);
  assert.deepEqual(forms, copy);
  assert.deepEqual(ids(sortGallery(forms, undefined)), ['a', 'b']);
  assert.deepEqual(sortGallery([], new Set()), []);
});

test('모르는 방위는 알려진 방위 뒤, 같은 방위끼리는 기존 순서', () => {
  const forms = [f('q2', 2, 'moon'), f('q1', 2, 'moon'), f('n', 2, 'north')];
  assert.deepEqual(ids(sortGallery(forms, new Set(['q2', 'q1', 'n']))), ['n', 'q2', 'q1']);
});

test('실제 형태 171행: 같은 행을 모두 돌려주고, 발견한 것이 맨 앞(미물 → 1단계부터)이다', () => {
  const found = new Set(['mimul', 'crane', 'hwalsa', 'hyeonmu', 'littleTiger']);
  const out = sortGallery(FORMS, found);
  assert.equal(out.length, FORMS.length);
  assert.deepEqual(new Set(ids(out)), new Set(ids(FORMS)));
  // 앞 5개가 발견한 형태이고, 단계 → 방위 순이다.
  assert.deepEqual(ids(out).slice(0, 5), ['mimul', 'hwalsa', 'littleTiger', 'crane', 'hyeonmu']);
  for (const form of out.slice(5)) assert.equal(found.has(form.id), false);
  // 미발견 구간도 단계가 줄어들지 않는다.
  const rest = out.slice(5).map((x) => x.stage);
  assert.deepEqual(rest, [...rest].sort((a, b) => a - b));
});

test('방위 필터와 함께 쓰면 필터한 카드도 같은 순서를 유지한다', () => {
  const found = new Set(['mimul', 'crane', 'hwalsa', 'hyeonmu', 'littleTiger', 'littleSnake']);
  const out = sortGallery(FORMS, found);
  const east = out.filter((form) => form.dir === 'east');
  assert.deepEqual(ids(east.slice(0, 3)), ['hwalsa', 'littleSnake', 'crane']);
  // 필터 결과 = 동쪽 형태만으로 정렬한 결과
  assert.deepEqual(ids(east), ids(sortGallery(FORMS.filter((form) => form.dir === 'east'), found)));
});
