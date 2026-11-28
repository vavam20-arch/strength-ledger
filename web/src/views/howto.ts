// The "How to" sheet: a short looping demo (or the full tutorial), loaded only when tapped,
// and short cues to read between sets.

import { h, icon, sheet } from '../ui.ts';
import { clipUrl, embedUrl, watchUrl, type HowTo } from '../../../src/program/howto.ts';

export function openHowTo(name: string, how: HowTo): void {
  const full = how.video;
  const clip = how.clip;
  const frame = h('div', { class: 'howto-video' });
  const credit = h('p', { class: 'howto-credit' });

  const player = (src: string, title: string) =>
    h('iframe', {
      src,
      title,
      allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
      allowfullscreen: '',
      referrerpolicy: 'strict-origin-when-cross-origin',
    });
  const offline = () => {
    if (navigator.onLine) return false;
    frame.replaceChildren(h('p', { class: 'howto-offline' }, 'The video needs a connection. The cues below work without one.'));
    return true;
  };

  const showFull = (autoplay: boolean) => {
    frame.classList.remove('is-clip');
    if (autoplay) {
      if (!offline()) frame.replaceChildren(player(embedUrl(full), full.title));
    } else {
      frame.replaceChildren(poster(full.id, `Play the full tutorial: ${full.title}`, () => showFull(true)));
    }
    credit.replaceChildren(...[
      h('span', null, h('strong', null, full.title), ` by ${full.channel}`),
      ...(clip ? [h('button', { type: 'button', class: 'link-btn', onclick: () => showClip(true) }, 'Back to the quick demo')] : []),
      h('a', { href: watchUrl(full), target: '_blank', rel: 'noopener' }, 'Open in YouTube'),
    ]);
  };
  const showClip = (autoplay: boolean) => {
    if (!clip) return;
    frame.classList.add('is-clip');
    if (autoplay) {
      if (!offline()) frame.replaceChildren(player(clipUrl(clip), `${name} demo`));
    } else {
      frame.replaceChildren(poster(clip.id, `Play the quick demo of ${name}`, () => showClip(true)));
    }
    credit.replaceChildren(
      h('span', null, h('strong', null, 'Quick demo'), ` by ${clip.channel}. Loops silently; tap it for sound.`),
      h('button', { type: 'button', class: 'link-btn', onclick: () => showFull(true) }, 'Watch the full tutorial'),
    );
  };
  if (clip) showClip(false);
  else showFull(false);

  const list = (title: string, items: string[], cls = '') =>
    h('section', { class: `howto-list ${cls}` }, h('h3', null, title), h('ul', null, items.map((t) => h('li', null, t))));

  sheet(name, h('div', { class: 'howto' },
    frame,
    credit,
    list('Set up', how.setup),
    list('Each rep', how.cues),
    list('Watch out for', how.avoid, 'is-avoid'),
  ));
}

function poster(id: string, label: string, onclick: () => void): HTMLElement {
  return h('button', { type: 'button', class: 'howto-poster', 'aria-label': label, onclick },
    h('img', { src: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, alt: '', loading: 'lazy', onerror: (e: Event) => (e.target as HTMLElement).remove() }),
    h('span', { class: 'howto-play' }, icon('play')),
  );
}
