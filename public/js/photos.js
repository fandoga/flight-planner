// Фото достопримечательностей из Википедии (REST API, CORS).
// Пока фото грузится (или если его нет) — показывается SVG-постер.
import { sceneSvg } from './art.js';

const KEY = 'fp-wiki-v1';
let cache = {};
try { cache = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { cache = {}; }
const pending = new Map();
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function saveCache() { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* пусто */ } }

export function wikiPhoto(title) {
  if (!title) return Promise.resolve(null);
  if (cache[title] !== undefined) return Promise.resolve(cache[title]);
  if (pending.has(title)) return pending.get(title);
  const p = fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      let src = null;
      if (j?.originalimage?.source && j.originalimage.width <= 1280) src = j.originalimage.source;
      else if (j?.thumbnail?.source) src = j.thumbnail.source.replace(/\/\d+px-/, '/960px-');
      const res = src ? { src, page: j.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${title}` } : null;
      cache[title] = res;
      saveCache();
      return res;
    })
    .catch(() => null)
    .finally(() => pending.delete(title));
  pending.set(title, p);
  return p;
}

/** HTML-блок фото с постером-заглушкой */
export function photoBox(lm, { credit = true, cls = '' } = {}) {
  return `<div class="ph duo ${cls}" data-wiki="${esc(lm.wiki || '')}" data-credit="${credit ? 1 : 0}" role="img" aria-label="${esc(lm.name)}">${sceneSvg(lm.art || 'city', lm.wiki || lm.name)}<div class="ph-img"></div></div>`;
}

let io = null;
function load(el) {
  wikiPhoto(el.dataset.wiki).then((res) => {
    if (!res) return;
    const img = new Image();
    img.onload = () => {
      el.querySelector('.ph-img').style.backgroundImage = `url("${res.src}")`;
      el.classList.add('loaded');
      if (el.dataset.credit === '1' && !el.querySelector('.credit')) {
        el.insertAdjacentHTML('beforeend', `<a class="credit" href="${esc(res.page)}" target="_blank" rel="noopener">Фото: Wikipedia</a>`);
      }
    };
    img.src = res.src;
  });
}

/** Лениво подгружает фото для всех .ph[data-wiki] внутри root */
export function hydratePhotos(root = document) {
  const els = [...root.querySelectorAll('.ph[data-wiki]:not([data-hyd])')].filter((e) => e.dataset.wiki);
  if (!els.length) return;
  if (!io && 'IntersectionObserver' in window) {
    io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { io.unobserve(e.target); load(e.target); }
    }, { rootMargin: '300px' });
  }
  for (const el of els) {
    el.dataset.hyd = '1';
    if (io) io.observe(el); else load(el);
  }
}
