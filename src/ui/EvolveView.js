// EvolveView(progress, forms, { getFormImage, onDone, save })를 호출하면 선택 화면이 열린다.
// getFormImage(formId, grade)는 텍스처의 이미지 URL 또는 canvas를 반환한다.
// 진화 즉시 save(progress)를 호출한다(기본 saveProgress). 닫으면 onDone(진화 결과 또는 null)을 호출한다.
// HubView에서 B를 택했다면 같은 progress를 넘긴다. pendingDevolve 처리는 이 화면이 한 번 맡는다.

import { REGIONS } from '../config.js';
import { saveProgress } from '../state/save.js';
import { buildChoices, canEvolve, devolve, evolve, evolutionCost, gradeOdds } from '../systems/evolution.js';
import { ALIGNMENT } from '../systems/tuning-evolution.js';
import { OddsTable, button, disclosure, el, formImage, number, openOverlay } from './OddsTable.js';

// 도감은 다음 형태(next), 규칙 모듈은 이전 형태(from)로 같은 진화 경로를 표현한다.
function evolutionForms(forms) {
  return forms.map(form => form.from ? form : {
    ...form,
    from: forms.filter(parent => parent.next?.includes(form.id)).map(parent => parent.id),
  });
}

function affinity(progress) {
  const section = el('section', 'yk-card');
  section.append(el('h3', 'yk-label', '이번 단계의 식성'));
  const bars = el('div', 'yk-diet');
  const total = Object.values(progress.diet).reduce((sum, value) => sum + value, 0);
  for (const [dir, region] of Object.entries(REGIONS)) {
    const amount = progress.diet[dir];
    const row = el('div');
    const label = el('div', 'yk-line');
    label.append(el('span', '', region.name + ' · ' + region.color), el('strong', '', number(amount)));
    const track = el('div', 'yk-track');
    const fill = el('span');
    fill.dataset.dir = dir;
    fill.style.width = (total ? amount / total * 100 : 0) + '%';
    track.append(fill);
    row.append(label, track);
    bars.append(row);
  }
  const { alignment } = progress;
  const label = alignment === 0 ? '중립' : (alignment < 0 ? '요기 ' : '선기 ') + number(Math.abs(alignment));
  const scale = el('div', 'yk-alignment');
  scale.setAttribute('role', 'meter');
  scale.setAttribute('aria-label', '음양 성향');
  scale.setAttribute('aria-valuemin', ALIGNMENT.min);
  scale.setAttribute('aria-valuemax', ALIGNMENT.max);
  scale.setAttribute('aria-valuenow', alignment);
  scale.setAttribute('aria-valuetext', label);
  const pin = el('i');
  pin.style.left = (alignment - ALIGNMENT.min) / (ALIGNMENT.max - ALIGNMENT.min) * 100 + '%';
  scale.append(pin);
  const ends = el('div', 'yk-scale-labels');
  ends.append(el('span', '', '요기'), el('strong', '', label), el('span', '', '선기'));
  section.append(bars, el('h3', 'yk-label', '음양 성향'), scale, ends);
  return section;
}

function gradeTable(progress) {
  const sum = Object.values(progress.enh).reduce((total, value) => total + value, 0);
  return disclosure('등급 확률표 보기', OddsTable('본체 강화를 반영한 등급 확률', Object.entries(gradeOdds(sum))));
}

export function EvolveView(progress, forms, { onDone, getFormImage, save = saveProgress } = {}) {
  const catalog = evolutionForms(forms);
  let previous;
  if (progress.pendingDevolve) {
    previous = devolve(progress, catalog);
    delete progress.pendingDevolve;
    save(progress);
  }
  const choices = buildChoices(progress, catalog);
  const cost = evolutionCost(progress.stage + 1);
  const current = catalog.find(form => form.id === progress.formId);
  const { dialog, header, body, footer, close } = openOverlay('진화');
  let result = null;
  function finish() {
    if (!dialog.open) return;
    close();
    onDone?.(result);
  }
  dialog.addEventListener('cancel', event => { event.preventDefault(); finish(); });
  const next = progress.stage + 1;
  header.append(
    el('p', 'yk-overline', progress.stage + '단계 · ' + (current?.name ?? '요괴') + ' · ' + progress.grade + '등급'),
    el('h2', 'yk-title', choices.length ? next + '단계 진화' : '마지막 진화 단계'),
  );
  if (previous) body.append(el('p', 'yk-notice', '역진화로 ' + previous.form.name + '의 모습으로 돌아왔어요.'));
  const budget = el('div', 'yk-wallet');
  budget.append(el('span', '', '보유 요력 ' + number(progress.yoryeok)),
    el('strong', '', choices.length ? '진화 비용 ' + number(cost) : '최고 단계'));
  body.append(budget, affinity(progress));

  function choose(choice) {
    if (result || !dialog.open || !canEvolve(progress)) return;
    result = evolve(progress, choice, catalog);
    save(progress);
    const { form, grade, firstDiscovery } = result;
    header.replaceChildren(el('p', 'yk-overline', form.stage + '단계'), el('h2', 'yk-title', '진화 완료'));
    const reveal = el('section', 'yk-reveal');
    const art = formImage(getFormImage, form, grade);
    art.dataset.grade = grade;
    reveal.append(art, el('strong', 'yk-grade-label', grade + '등급'),
      el('h3', 'yk-form-name', form.name), el('p', 'yk-description', form.desc));
    if (firstDiscovery) reveal.append(el('p', 'yk-discovery', '최초 발견 · 보호권 +1'));
    body.replaceChildren(reveal, gradeTable(progress));
    body.scrollTop = 0;
    const done = button('확인', finish, 'yk-primary');
    footer.replaceChildren(done);
    done.focus({ preventScroll: true });
  }

  if (choices.length) {
    body.append(el('h3', 'yk-section-title', '진화할 모습 선택'));
    const cards = el('div', 'yk-choices');
    for (const choice of choices) {
      const card = button('', () => choose(choice), 'yk-choice');
      card.disabled = !canEvolve(progress);
      if (choice.unknown) {
        card.classList.add('yk-mystery');
        card.append(el('span', 'yk-portrait', '???'), el('strong', '', '미지의 진화'));
      } else {
        // 등급은 선택 이후에 정해지므로 미리보기에는 테두리가 없는 F를 쓴다.
        card.append(formImage(getFormImage, choice.form, 'F'), el('strong', '', choice.form.name));
        card.style.setProperty('--yk-tint', REGIONS[choice.form.dir]?.tint);
      }
      cards.append(card);
    }
    body.append(cards);
    const pool = catalog.filter(form => form.stage === next);
    body.append(disclosure('미지의 진화 확률 보기 · 각각 1/' + pool.length,
      OddsTable('각 모습이 나올 확률', pool.map(form => [form.name, 100 / pool.length]))));
    if (!canEvolve(progress)) footer.append(el('p', 'yk-hint', '요력 ' + number(cost - progress.yoryeok) + '이 더 필요해요.'));
  }
  body.append(gradeTable(progress));
  footer.append(button('돌아가기', finish));
  return { close: finish };
}

export default EvolveView;
