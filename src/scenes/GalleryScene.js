import { REGIONS } from '../config.js';
import { FORMS } from '../data/forms.js';
import { sortGallery } from '../data/gallery-sort.js';
import { AbilityInfoView } from '../ui/AbilityInfoView.js';
import { artUnitsFor, getFormPortrait, getFormThumbnail } from '../art/creature.js';
import { loadProgress } from '../state/save.js';

// 화면에서 벗어나거나 필터로 감춰진 카드는 대기열에서도 뺀다.
function lazyPortraits(root, render) {
  const visible = new Set();
  let frame = 0;
  function flush() {
    frame = 0;
    let count = 0;
    for (const card of visible) {
      visible.delete(card);
      if (card.hidden) continue;
      render(card);
      observer.unobserve(card);
      if (++count === 3) break;
    }
    if (visible.size) frame = requestAnimationFrame(flush);
  }
  const observer = new IntersectionObserver(entries => {
    for (const { target, isIntersecting } of entries) {
      if (isIntersecting && !target.hidden) visible.add(target);
      else visible.delete(target);
    }
    if (visible.size && !frame) frame = requestAnimationFrame(flush);
  }, { root });
  return {
    observe: card => observer.observe(card),
    disconnect() { observer.disconnect(); cancelAnimationFrame(frame); visible.clear(); },
  };
}

export class GalleryScene extends Phaser.Scene {
  constructor() {
    super('Gallery');
  }
  create() {
    const cards = document.getElementById('cards');
    const filters = document.getElementById('filters');
    const branchName = { yo: '요', seon: '선', none: '' };
    const progress = loadProgress();
    const discovered = new Set(['mimul', progress.formId, ...progress.discovered]);
    const dialog = document.getElementById('specimen-dialog');
    const portrait = dialog.querySelector('img');
    const thumbs = lazyPortraits(document.getElementById('gallery'), card => {
      card.querySelector('img').src = getFormThumbnail(this, card.dataset.form);
    });
    function closePortrait() { portrait.removeAttribute('src'); }
    dialog.addEventListener('close', closePortrait);
    let info = null; // 열려 있는 능력 안내 창
    this.events.once('shutdown', () => {
      info?.close();
      thumbs.disconnect();
      dialog.close();
      closePortrait();
      dialog.removeEventListener('close', closePortrait);
      cards.replaceChildren();
      filters.replaceChildren();
    });
    for (const form of sortGallery(FORMS, discovered)) {
      const region = REGIONS[form.dir];
      const locked = !discovered.has(form.id);
      const name = locked ? '???' : form.name;
      const card = document.createElement('article');
      card.className = 'card';
      card.dataset.dir = form.dir;
      card.dataset.form = form.id;
      card.dataset.stage = form.stage;
      card.classList.toggle('undiscovered', locked);
      card.style.setProperty('--tint', region?.tint ?? '#dce5c5');
      card.style.setProperty('--region-ink', region?.ink ?? '#657441');
      const specimen = document.createElement('button');
      specimen.type = 'button';
      specimen.className = 'specimen';
      specimen.style.setProperty('--art-ratio', artUnitsFor(form.stage) / artUnitsFor(5));
      specimen.setAttribute('aria-label', (locked ? '미발견 요괴' : name) + ' 능력 안내 보기');
      specimen.setAttribute('aria-haspopup', 'dialog');
      const img = document.createElement('img');
      img.alt = locked ? '미발견 요괴 실루엣' : name;
      specimen.append(img);
      const entry = document.createElement('div');
      entry.className = 'entry';
      const meta = document.createElement('small');
      meta.textContent = [form.stage + '단계', region?.name, form.stage >= 3 && branchName[form.branch],
        locked && '미발견']
        .filter(Boolean)
        .join(' · ');
      const title = document.createElement('h3');
      title.textContent = name;
      const desc = document.createElement('p');
      desc.textContent = locked ? '능력 ???' : form.desc;
      entry.append(meta, title, desc);
      card.append(specimen, entry);
      cards.append(card);
      thumbs.observe(card);
      // 옛 큰 그림 창. 카드를 탭하면 능력 안내가 열리고, 그 창의 [그림 크게 보기]에서 이 창으로 온다.
      const showSpecimen = () => {
        dialog.classList.toggle('undiscovered', locked);
        dialog.style.setProperty('--tint', region?.tint ?? '#dce5c5');
        dialog.querySelector('h3').textContent = name;
        dialog.querySelector('small').textContent = meta.textContent;
        dialog.querySelector('p').textContent = desc.textContent;
        portrait.alt = img.alt;
        portrait.src = getFormPortrait(this, form.id);
        dialog.showModal();
      };
      card.addEventListener('click', () => {
        specimen.focus({ preventScroll: true });
        info?.close();
        info = AbilityInfoView(form.id, {
          progress,
          locked,
          getFormImage: (id) => getFormThumbnail(this, id),
          onZoom: showSpecimen,
          onClose: () => { info = null; },
        });
      });
    }
    const filterBy = (dir) => {
      const visibleForms = new Set();
      for (const card of cards.children) {
        card.hidden = dir !== 'all' && card.dataset.dir !== dir;
        if (!card.hidden) visibleForms.add(card.dataset.form);
      }
      for (const button of filters.children)
        button.setAttribute('aria-pressed', String(button.dataset.dir === dir));
      document.getElementById('form-count').textContent = visibleForms.size + '종';
    };
    for (const [dir, label] of [
      ['all', '전체'],
      ...Object.entries(REGIONS).map(([id, r]) => [id, r.name + ' · ' + r.color]),
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.dataset.dir = dir;
      button.addEventListener('click', () => filterBy(dir));
      filters.append(button);
    }
    filterBy('all');
    document.getElementById('loading').hidden = true;
    // 부팅 중에는 아직 게임 루프가 시작되지 않았을 수 있다.
    this.game.events.once('postrender', () => this.game.loop.sleep());
  }
}
