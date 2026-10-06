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

/** HTML-блок фото самолёта (SVG-иллюстрация — пока фото грузится или если его нет) */
export function aircraftPhotoBox(ac, livery, fallbackSvg, { credit = true, cls = '' } = {}) {
  return `<div class="ph ac-ph ${cls}" data-ac="${esc(ac.id)}" data-livery="${esc(livery)}" data-name="${esc(ac.name)}" data-credit="${credit ? 1 : 0}" role="img" aria-label="${esc(ac.name)}"><div class="ac-fallback">${fallbackSvg}</div><div class="ph-img"></div></div>`;
}

let io = null;
function load(el) {
  const job = el.dataset.ac ? aircraftPhoto(el.dataset.ac, el.dataset.livery, el.dataset.name) : wikiPhoto(el.dataset.wiki);
  job.then((res) => {
    if (!res) return;
    const img = new Image();
    img.onload = () => {
      el.querySelector('.ph-img').style.backgroundImage = `url("${res.src}")`;
      el.classList.add('loaded');
      if (el.dataset.credit === '1' && !el.querySelector('.credit')) {
        const text = el.dataset.ac ? `Фото: ${res.credit || 'Wikimedia Commons'}` : 'Фото: Wikipedia';
        el.insertAdjacentHTML('beforeend', res.page ? `<a class="credit" href="${esc(res.page)}" target="_blank" rel="noopener" title="${esc(res.note || '')}">${esc(text)}</a>` : `<span class="credit">${esc(text)}</span>`);
        if (res.note) el.insertAdjacentHTML('beforeend', `<span class="ph-note">${esc(res.note)}</span>`);
      }
    };
    img.src = res.src;
  });
}

/** Лениво подгружает фото для всех .ph[data-wiki] внутри root */
export function hydratePhotos(root = document) {
  const els = [...root.querySelectorAll('.ph:not([data-hyd])')].filter((e) => e.dataset.wiki || e.dataset.ac);
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

// ---------- реальные фото самолётов (Wikimedia Commons, свободные лицензии) ----------
// file — конкретный снимок; q — запасной поиск по Commons, если файл переименуют/удалят.
// local — свой скриншот из симулятора: положите файл в public/img/aircraft/ и укажите путь здесь.
export const AIRCRAFT_PHOTOS = {
  'A21N:house': { file: 'Airbus A321neo (35121126000).jpg', q: 'Airbus A321neo in flight' },
  'A21N:southwest': { file: 'Airbus A321neo (35340369112).jpg', q: 'Airbus A321neo', note: 'Southwest не летает на A321neo — в MSFS это фан-ливрея; на фото A321neo' },
  'A21N:american': { file: 'American Airbus A321neo N448AN on final approach to Boston Feb 2025 1.jpg', q: 'American Airlines Airbus A321neo' },
  'A21N:united': { file: "United A321neo N24505 at Chicago O'Hare.jpg", q: 'United Airlines Airbus A321neo' },
  C208: { file: 'Cessna 208B Grand Caravan, Westwind Aviation AN1540297.jpg', q: 'Cessna 208B Grand Caravan' },
  PC12: { file: 'N727KF Pilatus PC-12 NGX s n 2064 (53778724056).jpg', q: 'Pilatus PC-12 NGX' },
  C172: { file: 'Cessna 172S Skyhawk SP (N94461, cn 172S11205) (7-29-2025).jpg', q: 'Cessna 172S Skyhawk' },
  DA40: { file: 'LN-FTO Diamond DA40 NG Diamond Star.jpg', q: 'Diamond DA40 NG' },
  DRCX: { file: 'PZL-104MF Wilga 2000 SP-VSE (11738099483).jpg', q: 'PZL-104 Wilga 2000', note: 'Draco X построен на базе PZL-104 Wilga — на фото Wilga 2000' },
};

const COMMONS = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=960';
const BAD = /cockpit|cabin|interior|seat|galley|panel|instrument|engine|logo|model|toy|diecast|wreck|crash|accident|lavatory|drawing|diagram|tail|wing|livery|simulator|kit|museum|first class|economy|business class/i;
const stripHtml = (s) => String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

function fromPage(p) {
  const ii = p?.imageinfo?.[0];
  if (!ii?.thumburl) return null;
  const md = ii.extmetadata || {};
  const artist = stripHtml(md.Artist?.value).slice(0, 60);
  const lic = stripHtml(md.LicenseShortName?.value);
  return { src: ii.thumburl, page: ii.descriptionurl, credit: [artist, lic].filter(Boolean).join(' · ') };
}

async function commonsFile(file) {
  const r = await fetch(`${COMMONS}&titles=${encodeURIComponent('File:' + file)}`);
  const j = await r.json();
  const p = Object.values(j?.query?.pages || {})[0];
  return p && !('missing' in p) ? fromPage(p) : null;
}

async function commonsSearch(q) {
  const r = await fetch(`${COMMONS}&generator=search&gsrnamespace=6&gsrlimit=15&gsrsearch=${encodeURIComponent(q + ' filetype:bitmap')}`);
  const j = await r.json();
  const pages = Object.values(j?.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii || BAD.test(p.title) || ii.width < 800 || ii.width < ii.height * 1.25) continue;
    const res = fromPage(p);
    if (res) return res;
  }
  return null;
}

/** Фото ВС: свой скриншот → конкретный файл Commons → поиск по Commons */
export function aircraftPhoto(acId, livery, name) {
  const spec = AIRCRAFT_PHOTOS[`${acId}:${livery}`] || AIRCRAFT_PHOTOS[acId] || { q: name };
  const key = `ac:${acId}:${livery}:v2`;
  if (cache[key] !== undefined) return Promise.resolve(cache[key] && { ...cache[key], note: spec.note });
  if (pending.has(key)) return pending.get(key);
  const p = (async () => {
    if (spec.local) return { src: spec.local, page: null, credit: 'скриншот MSFS' };
    try { const r = spec.file && await commonsFile(spec.file); if (r) return r; } catch { /* дальше */ }
    try { if (spec.q) return await commonsSearch(spec.q); } catch { /* пусто */ }
    return null;
  })().then((res) => {
    if (res) { cache[key] = res; saveCache(); }
    return res && { ...res, note: spec.note };
  }).finally(() => pending.delete(key));
  pending.set(key, p);
  return p;
}
