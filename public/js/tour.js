// Тур «Vice Skies — USA»: экран с карточками рейсов и сборка маршрута под выбранные ВПП
import { icon } from './art.js';
import { findAircraft } from './aircraft.js';
import { photoBox, hydratePhotos } from './photos.js';

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

const legDist = (leg) => leg.segments.reduce((s, x) => s + x.distance, 0);
const legCities = (leg) => {
  const seg = leg.segments[0];
  return `${CITY[seg.dep]} ${leg.roundTrip ? '⇄' : '→'} ${CITY[seg.arr]}`;
};
const legCodes = (leg) => {
  const seg = leg.segments[0];
  return `${seg.dep} ${leg.roundTrip ? '⇄' : '→'} ${seg.arr}`;
};

function stopRow(leg, done, selected) {
  return `<li class="stop ${selected ? 'is-selected' : ''} ${done ? 'is-done' : ''}" data-leg="${leg.id}">
    <button class="stop__hit" data-select-leg="${leg.id}" aria-pressed="${selected}" aria-label="Рейс ${leg.id}: ${esc(legCities(leg))}"></button>
    <span class="stop__num">${done ? icon('check') : leg.id}</span>
    <div class="stop__body">
      <div class="stop__route">${esc(legCities(leg))}</div>
      <div class="stop__meta"><span class="mono">${legCodes(leg)}</span><span>${legDist(leg).toLocaleString('ru-RU')} nm</span><span>≈ ${fmtHours(legHours(leg))}</span></div>
      <div class="stop__ac">${esc(leg.aircraft.map((a) => a.label).join(' / '))}</div>
    </div>
    <div class="stop__thumb">${photoBox(leg.landmarks[leg.landmarks.length - 1], { credit: false })}</div>
  </li>`;
}

/** Карточка выбранного рейса над картой */
export function renderTourFocus(tour, legId) {
  const leg = tour.legs.find((l) => l.id === legId) || tour.legs[0];
  const seg = leg.segments[0];
  const done = doneSet().has(leg.id);
  const cover = leg.landmarks[leg.landmarks.length - 1];
  const procs = [seg.sid?.name && `SID ${seg.sid.name}`, seg.star?.name && `STAR ${seg.star.name}`].filter(Boolean);
  const el = document.getElementById('tourFocus');
  el.innerHTML = `
    <figure class="focus__cover">${photoBox(cover)}<figcaption>${esc(cover.name)}</figcaption></figure>
    <div class="focus__body">
      <p class="focus__count">Рейс ${leg.id} из ${tour.legs.length}${leg.finale ? ' · финал тура' : ''}${done ? ' · пройден' : ''}</p>
      <h2 class="focus__title">${esc(leg.title)}</h2>
      <p class="focus__text">${esc(leg.blurb)}</p>
      <div class="focus__facts">
        <div><small>Маршрут</small><b class="mono">${legCodes(leg)}</b></div>
        <div><small>Дистанция</small><b>${legDist(leg).toLocaleString('ru-RU')} nm</b></div>
        <div><small>В воздухе</small><b>≈ ${fmtHours(legHours(leg))}</b></div>
      </div>
      <p class="focus__line">Самолёт: ${esc(leg.aircraft.map((a) => a.label).join(' / '))}</p>
      <p class="focus__line">${procs.length ? `<span class="mono">${esc(procs.join(' · '))}</span> · ` : ''}${seg.rules === 'V' ? 'визуальный полёт вдоль берега' : seg.level === 'high' ? 'верхние трассы' : 'нижние трассы'} · сценарии ${esc(leg.scenery.join(', '))}</p>
      <ul class="focus__places">${leg.landmarks.slice(0, -1).slice(0, 3).map((m) => `<li><div class="mini">${photoBox(m, { credit: false })}</div><span>${esc(m.name)}</span></li>`).join('')}</ul>
      <div class="row-btns">
        <button class="btn cta lg" data-start-leg="${leg.id}">${icon('plane')}Спланировать рейс</button>
      </div>
    </div>`;
  hydratePhotos(el);
}

export function renderTourView(tour, selectedId) {
  const done = doneSet();
  const total = tour.legs.reduce((s, l) => s + legDist(l), 0);
  const hours = tour.legs.reduce((s, l) => s + legHours(l), 0);
  const next = tour.legs.find((l) => !done.has(l.id)) || tour.legs[0];
  const sel = selectedId || next.id;
  const types = new Set(tour.legs.flatMap((l) => l.aircraft.map((a) => a.id)));
  const pct = Math.round((done.size / tour.legs.length) * 100);
  document.getElementById('tourHero').innerHTML = `
    <h1 class="tour-title">Vice Skies</h1>
    <p class="tour-lede">Восемь рейсов от дождливого Сиэтла до закатного Майами. Маршруты уже проложены по трассам FAA с SID и STAR — полосу и заход сайт подберёт по свежему METAR.</p>
    <p class="tour-facts"><span>${total.toLocaleString('ru-RU')} nm</span><span>≈ ${Math.round(hours)} ч в воздухе</span><span>${types.size} типов самолётов</span></p>
    <div class="progress" role="progressbar" aria-label="Пройдено рейсов" aria-valuenow="${done.size}" aria-valuemin="0" aria-valuemax="${tour.legs.length}"><div style="transform:scaleX(${pct / 100})"></div></div>
    <p class="progress-l">Пройдено ${done.size} из ${tour.legs.length}</p>
    <div class="row-btns">
      <button class="btn cta lg" data-start-leg="${next.id}">${icon('plane')}${done.size ? 'Продолжить' : 'Начать'}: рейс ${next.id}</button>
      <button class="btn ghost lg" data-nav="planner">${icon('map')}Свободный план</button>
    </div>`;
  document.getElementById('tourGrid').innerHTML = tour.legs.map((l) => stopRow(l, done.has(l.id), l.id === sel)).join('');
  document.getElementById('tourFoot').innerHTML = `
    <p class="foot-stmt__line">Финал — закат над Ocean Drive.</p>
    <div class="foot-stmt__meta"><span>Навданные FAA CIFP/NASR, AIRAC от ${esc(tour.airac)} · только для симуляторов</span><span>Фото: Wikimedia Commons, Wikipedia</span></div>`;
  renderTourFocus(tour, sel);
  hydratePhotos(document.getElementById('viewTour'));
  return sel;
}

export function selectTourRow(id) {
  document.querySelectorAll('#tourGrid .stop').forEach((li) => {
    const on = +li.dataset.leg === id;
    li.classList.toggle('is-selected', on);
    li.querySelector('.stop__hit').setAttribute('aria-pressed', on);
  });
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
