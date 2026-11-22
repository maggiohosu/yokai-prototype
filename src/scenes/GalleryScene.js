import { REGIONS } from '../config.js';
import { FORMS } from '../data/forms.js';
import { drawCreature } from '../art/creature.js';

export class GalleryScene extends Phaser.Scene {
  constructor() {
    super('Gallery');
  }
  create() {
    const cards = document.getElementById('cards');
    const filters = document.getElementById('filters');
    const branchName = { yo: '요', seon: '선', none: '' };
    const specimens = FORMS.flatMap((form) => {
      if (form.id !== 'mimul') return [form];
      const variants = Object.entries(REGIONS).map(([dir, region]) => ({
        ...form,
        dir,
        name: region.name + ' ' + form.name,
      }));
      return [form, ...variants];
    });
    for (const form of specimens) {
      const region = REGIONS[form.dir];
      const card = document.createElement('article');
      card.className = 'card';
      card.dataset.dir = form.dir;
      card.dataset.form = form.id;
      card.style.setProperty('--tint', region?.tint ?? '#dce5c5');
      card.style.setProperty('--region-ink', region?.ink ?? '#657441');
      const specimen = document.createElement('div');
      specimen.className = 'specimen';
      const img = document.createElement('img');
      img.alt = form.name;
      const key = drawCreature(this, form.id, { dir: form.dir });
      img.src = this.textures.get(key).getSourceImage().toDataURL();
      specimen.append(img);
      const entry = document.createElement('div');
      entry.className = 'entry';
      const meta = document.createElement('small');
      meta.textContent = [form.stage + '단계', region?.name, branchName[form.branch]]
        .filter(Boolean)
        .join(' · ');
      const title = document.createElement('h3');
      title.textContent = form.name;
      const desc = document.createElement('p');
      desc.textContent = form.desc;
      entry.append(meta, title, desc);
      card.append(specimen, entry);
      cards.append(card);
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
