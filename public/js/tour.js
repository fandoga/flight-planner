// Тур «Vice Skies — USA»: экран с карточками рейсов и сборка маршрута под выбранные ВПП
import { aircraftSvg, sceneSvg, icon } from './art.js';
import { findAircraft, artType } from './aircraft.js';
import { photoBox, aircraftPhotoBox, hydratePhotos } from './photos.js';

export const CITY = {
  KSEA: 'Сиэтл', KSFO: 'Сан-Франциско', KLAS: 'Лас-Вегас', KGCN: 'Гранд-Каньон', KTUS: 'Тусон',
  KORD: 'Чикаго', KLAX: 'Лос-Анджелес', KSBA: 'Санта-Барбара', KMIA: 'Майами',
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DONE_KEY = 'fp-tour-done';

export async function loadTour() {
  const r = await fetch('/data/tour.json');
  if (!r.ok) throw new Error('Нет данных тура');
  return r.json();
}

export function doneSet() {
  try { return new Set(JSON.parse(localStorage.getItem(DONE_KEY) || '[]')); } catch { return new Set(); }
}
export function toggleDone(id) {
  const s = doneSet();
  if (s.has(id)) s.delete(id); else s.add(id);
  try { localStorage.setItem(DONE_KEY, JSON.stringify([...s])); } catch { /* пусто */ }
  return s.has(id);
}

export function legHours(leg, segIdx = null) {
  const ac = findAircraft(leg.aircraft[0].id);
  const segs = segIdx == null ? leg.segments : [leg.segments[segIdx]];
  const tas = ac.mach ? 450 : ac.tas;
  return segs.reduce((h, s) => h + s.distance / tas + (ac.mach ? 0.35 : 0.2), 0);
}
export const fmtHours = (h) => `${Math.floor(h)} ч ${String(Math.round((h % 1) * 60)).padStart(2, '0')} мин`;

function legCard(leg, done) {
  const seg = leg.segments[0];
  const cover = leg.landmarks[leg.landmarks.length - 1];
  const minis = leg.landmarks.slice(0, -1).slice(0, 3);
  const ac = leg.aircraft[0];
  const acObj = findAircraft(ac.id);
  const dist = leg.segments.reduce((s, x) => s + x.distance, 0);
  const cities = leg.roundTrip ? `${CITY[seg.dep]} ⇄ ${CITY[seg.arr]}` : `${CITY[seg.dep]} → ${CITY[seg.arr]}`;
  const codes = leg.roundTrip ? `${seg.dep} ⇄ ${seg.arr}` : `${seg.dep} → ${seg.arr}`;
  const procs = [seg.sid?.name, seg.star?.name].filter(Boolean);
  return `<article class="leg ${leg.finale ? 'finale' : ''}" data-leg="${leg.id}">
    <div class="leg-img">${photoBox(cover)}
      <div class="leg-num">${String(leg.id).padStart(2, '0')}</div>
      ${done ? `<span class="leg-flag done">${icon('check')}Пройден</span>` : leg.finale ? `<span class="leg-flag">${icon('flag')}Финал</span>` : ''}
      <div class="leg-route"><div class="codes">${codes}</div><div class="cities">${esc(cities)}</div></div>
    </div>
    <div class="leg-body">
      <div class="leg-title">${esc(leg.title)}</div>
      <div class="leg-ac"><div class="art">${aircraftPhotoBox(acObj, ac.livery, aircraftSvg(artType(acObj), ac.livery), { credit: false })}</div>
        <div><b>${esc(leg.aircraft.map((a) => a.label).join(' / '))}</b>${seg.rules === 'V' ? 'визуальный полёт' : seg.level === 'high' ? 'по верхним трассам' : 'по нижним трассам'}</div></div>
      <div class="leg-meta">
        <span class="tag">${icon('route')}${dist} nm</span>
        <span class="tag">${icon('clock')}≈ ${fmtHours(legHours(leg))}</span>
        ${procs.map((p) => `<span class="tag proc">${esc(p)}</span>`).join('')}
        ${leg.scenery.map((s) => `<span class="tag sc">${icon('layers')}${esc(s)}</span>`).join('')}
      </div>
      ${minis.length ? `<div class="leg-places">${minis.map((m) => `<div class="mini">${photoBox(m, { credit: false })}<span>${esc(m.name)}</span></div>`).join('')}</div>` : ''}
      <button class="btn grad lg" data-start-leg="${leg.id}">${icon('plane')}Спланировать рейс</button>
    </div>
  </article>`;
}

export function renderTourView(tour) {
  const done = doneSet();
  const total = tour.legs.reduce((s, l) => s + l.segments.reduce((a, x) => a + x.distance, 0), 0);
  const hours = tour.legs.reduce((s, l) => s + legHours(l), 0);
  const next = tour.legs.find((l) => !done.has(l.id)) || tour.legs[0];
  const types = new Set(tour.legs.flatMap((l) => l.aircraft.map((a) => a.id)));
  const pct = Math.round((done.size / tour.legs.length) * 100);
  document.getElementById('tourHero').innerHTML = `
    <div>
      <span class="hero-kicker">${icon('flag')}MSFS · тур по США · ${tour.legs.length} рейсов</span>
      <h1 class="hero-title">Vice<span>Skies</span></h1>
      <p class="hero-sub">${esc(tour.subtitle)}. Маршруты уже проложены по реальным трассам с SID и STAR — полосу и заход сайт подберёт по свежему METAR.</p>
      <div class="hero-stats">
        <div class="hs"><b>${tour.legs.length}</b><small>рейсов</small></div>
        <div class="hs"><b>${total.toLocaleString('ru-RU')}</b><small>морских миль</small></div>
        <div class="hs"><b>≈ ${Math.round(hours)} ч</b><small>в воздухе</small></div>
        <div class="hs"><b>${types.size}</b><small>типов самолётов</small></div>
      </div>
      <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div style="width:${pct}%"></div></div>
      <div class="progress-l">Пройдено ${done.size} из ${tour.legs.length}</div>
      <div class="hero-cta">
        <button class="btn grad lg" data-start-leg="${next.id}">${icon('plane')}${done.size ? 'Продолжить' : 'Начать'}: рейс ${next.id} · ${next.segments[0].dep} → ${next.segments[0].arr}</button>
        <button class="btn lg" data-nav="planner">${icon('map')}Свободный план</button>
      </div>
    </div>
    <div class="hero-art">${aircraftPhotoBox(findAircraft('A21N'), 'american', `${sceneSvg('coast', 'hero-miami')}<div class="plane">${aircraftSvg('airliner', 'american')}</div>`, { cls: 'hero-ph' })}</div>`;
  document.getElementById('tourGrid').innerHTML = tour.legs.map((l) => legCard(l, done.has(l.id))).join('');
  document.getElementById('tourFoot').innerHTML = `Навигационные данные: FAA CIFP/NASR (AIRAC от ${esc(tour.airac)}), только для авиасимуляторов. Фото — Wikipedia / Wikimedia Commons, иллюстрации — Vice Skies.`;
  hydratePhotos(document.getElementById('viewTour'));
}

/**
 * Маршрут рейса тура под выбранные ВПП: SID (переход с ВПП) → трассы → STAR (переход на ВПП)
 */
export function composeTourRoute(seg, depRwy, arrRwy, airac) {
  const pick = (map, rw) => map[rw] || Object.values(map)[0] || { legs: [] };
  const d = pick(seg.depRunways, depRwy);
  const a = pick(seg.arrRunways, arrRwy);
  const pts = [];
  const push = (p, stage, via) => {
    const last = pts[pts.length - 1];
    if (last && last.ident === p.ident) return;
    pts.push({ ident: p.ident, lat: p.lat, lon: p.lon, type: p.type, region: p.region, alt: p.alt || '', freq: p.freq, via, stage });
  };
  for (const p of d.legs || []) push(p, 'SID', d.sid);
  const enr = seg.enroute.slice(d.join || 0, a.cut ?? seg.enroute.length);
  for (const p of enr) push(p, 'ENR', !p.via || p.via === 'SID' ? 'DCT' : p.via);
  for (const p of a.legs || []) push(p, 'STAR', a.star);

  const t = [];
  if (d.sid) t.push(d.sid, d.legs[d.legs.length - 1]?.ident);
  enr.forEach((p, k) => {
    if (!t.length && k === 0) { t.push(p.ident); return; }
    if (p.ident === t[t.length - 1]) return;
    const via = !p.via || p.via === 'SID' ? 'DCT' : p.via;
    const next = enr[k + 1];
    if (next && next.via === p.via && via !== 'DCT') return;
    t.push(via, p.ident);
  });
  if (a.star) {
    const entry = a.legs[0]?.ident;
    if (entry && t[t.length - 1] !== entry) t.push('DCT', entry);
    t.push(a.star);
  }
  const notes = [];
  if (d.vectors && seg.rules !== 'V') notes.push('Вылет: радарное векторение до первой точки (SID для этой ВПП нет)');
  if (a.vectors && seg.rules !== 'V' && Object.values(seg.arrRunways).some((x) => x.star)) notes.push('Прилёт: векторение на заход (STAR для этой ВПП нет)');
  return {
    points: pts, route: t.filter(Boolean).join(' ') || 'DCT',
    sid: d.sid ? { name: d.sid, trans: d.trans } : null,
    star: a.star ? { name: a.star, trans: a.trans } : null,
    note: notes.join('. ') || null, airac, tour: true,
    others: { sid: d.others || [], star: a.others || [] },
  };
}

export function tourApproaches(seg, arrRwy) {
  return (seg.arrRunways[arrRwy]?.approaches) || [];
}
