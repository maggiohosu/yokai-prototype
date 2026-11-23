// AbilityInfoView(formId, { progress, onClose, getFormImage, locked, onZoom })를 부르면 그 형태의 능력 안내 창이 열린다.
// 내용: 형태 그림·이름·한자·단계·방위·줄기, 여의주 능력 이름·한 줄 설명, 지금 단계와 장착 무기 레벨 기준 실제 수치, 사용 방법,
//       상위 단계 적 저항, 부스터 보정, (보패를 꼈다면) 그 무기와의 조합. 데이터는 systems/ability-brief.js의 abilityBrief가 만든다.
// - getFormImage(formId): 이미지 URL 또는 canvas(진화·카드·HUD가 쓰는 128px 썸네일과 같다). 없으면 이름 첫 글자.
// - locked: true면 도감의 미발견 형태다. 이름·줄기·능력을 '???'로 가리고 그림은 실루엣으로 둔다.
// - onZoom: 있으면 [그림 크게 보기] 버튼이 생긴다(도감에서 옛 큰 그림 창으로 가는 길). 누르면 이 창을 닫고 onZoom()을 부른다.
// - 닫으면(버튼·Esc·바깥 누르기) onClose()를 한 번 부른다. 반환값 { close }로 바깥에서 닫을 수도 있다.
// 판 멈춤·재개는 부르는 쪽이 맡는다(PlayScene.openAbilityInfo). 모르는 형태면 null을 돌려주고 아무것도 열지 않는다.
// 이 창은 click에서 열어야 한다: pointerdown에서 열면 같은 손가락의 뒤따르는 click이 바깥 누르기로 읽혀 바로 닫힌다.

import { HUNGER_HINT } from '../data/ability-guides.js';
import { vitalityMax } from '../systems/vitality.js';
import { REGIONS } from '../config.js';
import { abilityBrief } from '../systems/ability-brief.js';
import { button, el, formImage, openOverlay } from './OddsTable.js';

export { abilityBrief };

// index.html에 <link>가 없어도 동작하도록 한 번만 불러온다(quickpick과 같은 방식).
function ensureStyles() {
  const href = new URL('./abilityInfo.css', import.meta.url).href;
  const loaded = [...document.querySelectorAll('link[rel="stylesheet"]')].some((link) => link.href === href);
  if (loaded) return;
  const link = el('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.append(link);
}

function section(title, note, ...content) {
  const box = el('section', 'ai-sec');
  const head = el('h3', 'ai-label', title);
  if (note) head.append(el('small', '', note));
  box.append(head, ...content);
  return box;
}

function statsList(brief) {
  const list = el('dl', 'ai-stats');
  for (const row of brief.stats) {
    const cell = el('div', 'ai-stat');
    const value = el('dd', '', row.text);
    if (row.baseText) value.append(el('small', 'ai-base', '기본 ' + row.baseText));
    cell.append(el('dt', '', row.label), value);
    if (row.damageText) cell.append(el('small', 'ai-dmg', row.damageText));
    list.append(cell);
  }
  return list;
}

// 창 안에 넣을 칸들(머리 제외). 능력이 없거나 가려진 형태는 안내 문장 하나와 (있다면) 부스터 줄만 둔다.
function bodySections(brief) {
  const out = [];
  if (!brief.hasAbility || brief.locked) {
    if (brief.ability) {
      const ability = el('section', 'ai-ability');
      ability.append(el('p', 'ai-tag', '여의주 능력'), el('h3', 'ai-ability-name', brief.ability.name), el('p', 'ai-summary', brief.ability.summary));
      out.push(ability);
    }
    if (brief.note) out.push(el('p', 'ai-note', brief.note));
    if (brief.boost) out.push(section('부스터', '', el('p', 'ai-line', brief.boost.text)));
    return out;
  }
  const ability = el('section', 'ai-ability');
  const name = el('h3', 'ai-ability-name', brief.ability.name);
  if (brief.ability.hanja) name.append(el('small', '', brief.ability.hanja));
  ability.append(el('p', 'ai-tag', '여의주 능력 ' + brief.ability.code), name, el('p', 'ai-summary', brief.ability.summary));
  out.push(ability);

  const stats = [];
  if (brief.baseDamage) {
    const base = el('p', 'ai-line ai-basedmg');
    base.append(brief.baseDamage.label + ' ', el('strong', '', brief.baseDamage.text));
    stats.push(base);
  }
  stats.push(statsList(brief));
  out.push(section('지금 수치', brief.basis, ...stats));

  const usage = el('ol', 'ai-usage');
  for (const line of brief.usage) usage.append(el('li', '', line));
  out.push(section('사용 방법', '', usage));

  if (brief.combo) {
    const combo = section(brief.combo.weaponName + ' 조합', '', el('p', 'ai-line', brief.combo.text));
    combo.classList.add('ai-combo');
    out.push(combo);
  }
  out.push(section('상위 단계 적', '', el('p', 'ai-line', brief.resist.text.replace(/^상위 단계 적:\s*/, ''))));
  out.push(section('부스터', '', el('p', 'ai-line', brief.boost.text)));
  return out;
}

// 카드 옆 작은 (i) 버튼(눌리는 칸 44px). 카드 선택과 분리하려고 카드 버튼 안이 아니라 형제로 둔다(버튼 안의 버튼은 규격 위반).
// 카드를 .ai-cell로 감싸 돌려준다. onOpen은 click에서 불린다(pointerdown은 게임 쪽으로 새지 않게 막는다).
export function withInfoButton(card, name, onOpen) {
  const cell = el('div', 'ai-cell');
  const info = el('button', 'ai-info');
  info.type = 'button';
  info.setAttribute('aria-label', name + ' 능력 안내');
  info.setAttribute('aria-haspopup', 'dialog');
  info.addEventListener('pointerdown', (event) => event.stopPropagation());
  info.addEventListener('click', (event) => {
    event.stopPropagation();
    onOpen(event);
  });
  cell.append(card, info);
  return cell;
}

export function AbilityInfoView(formId, { progress, onClose, getFormImage, locked = false, mystery = false, onZoom, zoomLabel = '그림 크게 보기' } = {}) {
  const brief = mystery ? {
    name: '미지의 진화', locked: true, stageText: progress ? (progress.stage + 1) + '단계' : '',
    ability: { name: '???', summary: '진화할 때 모습과 줄기 능력이 정해져요.' },
  } : abilityBrief(formId, progress, { locked });
  if (!brief) return null;
  ensureStyles();
  const { dialog, header, body, footer, close } = openOverlay(brief.name + ' 능력 안내');
  dialog.classList.add('ai-dialog');
  if (brief.formId) dialog.dataset.formId = brief.formId;
  if (brief.locked) dialog.classList.add('ai-locked');

  const portrait = formImage(mystery ? null : getFormImage, { id: brief.formId, name: brief.locked ? '?' : brief.name }, 'F');
  portrait.classList.add('ai-portrait');
  portrait.style.setProperty('--ai-tint', REGIONS[brief.dir]?.tint ?? '#dce5c5');
  const title = el('h2', 'yk-title ai-name', brief.name);
  if (brief.hanja) title.append(el('small', 'ai-hanja', brief.hanja));
  const meta = [brief.stageText, brief.dirName, brief.branchName, brief.stemName].filter(Boolean).join(' · ');
  const identity = el('div', 'ai-id');
  identity.append(el('p', 'ai-kicker', '능력 안내'), title, el('p', 'yk-caption ai-meta', meta));
  const head = el('div', 'ai-head');
  head.append(portrait, identity);
  header.append(head);

  body.append(...bodySections(brief));
  if (!brief.locked) {
    const seconds = vitalityMax(progress?.enh?.vitality);
    body.append(section('생명력', '최대 ' + Number(seconds.toFixed(1)) + '초',
      el('p', 'ai-line', HUNGER_HINT + ' 허기가 질수록 빨라지고, 생명력이 바닥나면 몸이 작아져요.'),
      el('p', 'ai-line', '큰 먹이일수록 많이 차요. 나를 먹을 수 있는 적과 닿으면 바로 판이 끝나요.')));
  }

  let closed = false;
  function finish() {
    if (closed) return;
    closed = true;
    close();
    onClose?.();
  }
  const done = button('닫기', finish, 'yk-primary ai-close');
  if (typeof onZoom === 'function') {
    footer.append(button(zoomLabel, () => {
      finish();
      onZoom();
    }, 'ai-zoom'));
  }
  footer.append(done);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    finish();
  });
  // 창 바깥(어두운 바탕)을 누르면 닫는다. 창 안쪽 칸은 target이 창이 아니다.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) finish();
  });
  done.focus({ preventScroll: true });
  return { close: finish };
}

export default AbilityInfoView;
