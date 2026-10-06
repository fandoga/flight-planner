import { AIRCRAFT, findAircraft, artType, PAX_MASS, BAG_MASS } from './aircraft.js';
import { aircraftSvg, icon, hydrateIcons } from './art.js';
import { photoBox, hydratePhotos } from './photos.js';
import { loadTour, renderTourView, composeTourRoute, tourApproaches, doneSet, toggleDone, CITY, legHours, fmtHours } from './tour.js';
import { parseMetar, describeMetar, rankRunways } from './metar.js';
import { computePlan, autoCruiseFl, cruiseTas, bearing, distNm, interpolate, fmtTime } from './calc.js';
import { initMap, drawRoute, drawLandmarks, focusLandmark, invalidate } from './map.js';
import { exportPlan, plnText } from './export.js';
import { listPlans, savePlan, deletePlan, getPlan, parsePln, routeString } from './plans.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------- состояние ----------------
const DEFAULTS = {
  dep: 'KSEA', arr: 'KSFO', altn: '', callsign: 'VSK001', etd: '', rules: 'I',
  acId: 'A21N', livery: 'house', level: 'high', tour: null, view: 'tour',
  depRwy: null, arrRwy: null, sid: null, star: null, approach: null,
  routeText: '', routeMode: 'auto', fixedRoute: null, planId: null,
  ovr: { cruiseFl: null, cruiseSpd: null, windComp: null },
  isaDev: 0,
  load: { pax: null, bagsPerPax: BAG_MASS, cargo: 0 },
  fuel: { contPct: 5, extra: 0, finalMin: 30, taxi: null, altnFuel: null, block: null },
  units: 'kg',
  metarOverride: {},
};
let S = load();
const D = { apt: {}, wx: {}, procs: {}, alternates: [], route: null, plan: null, windAuto: null, windInfo: '', charts: {}, status: null, tour: null };

function load() {
  try {
    const s = JSON.parse(localStorage.getItem('fp-state') || 'null');
    if (s) return { ...structuredClone(DEFAULTS), ...s, ovr: { ...DEFAULTS.ovr, ...s.ovr }, load: { ...DEFAULTS.load, ...s.load }, fuel: { ...DEFAULTS.fuel, ...s.fuel } };
  } catch { /* пусто */ }
  return structuredClone(DEFAULTS);
}
function save() { try { localStorage.setItem('fp-state', JSON.stringify(S)); } catch { /* пусто */ } }

const api = async (url, opts) => {
  const r = await fetch(url, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
  return j;
};

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}

// единицы массы
const W = (kg) => S.units === 'lb' ? Math.round(kg * 2.20462) : Math.round(kg);
const fromW = (v) => S.units === 'lb' ? v / 2.20462 : v;
const U = () => S.units === 'lb' ? 'lb' : 'кг';
const fmtW = (kg) => W(kg).toLocaleString('ru-RU');

// ---------------- аэропорты и погода ----------------
async function loadAirport(code) {
  code = (code || '').toUpperCase();
  if (!code) return null;
  if (D.apt[code]) return D.apt[code];
  const a = await api(`/api/airport/${code}`);
  const t = D.tour?.airports?.[a.icao];
  if (t) { a.runways = t.runways; a.faa = true; }
  D.apt[code] = a;
  if (a.icao !== code) D.apt[a.icao] = a;
  loadWeather(a.icao);
  return a;
}

async function loadWeather(icao, force = false) {
  if (D.wx[icao] && !force) return D.wx[icao];
  D.wx[icao] = { loading: true };
  renderWx();
  try { D.wx[icao] = await api(`/api/weather/${icao}`); }
  catch (e) { D.wx[icao] = { error: e.message }; }
  renderWx();
  updateAll(false);
  return D.wx[icao];
}

function metarOf(icao) {
  const raw = S.metarOverride[icao] || D.wx[icao]?.metar;
  return raw ? parseMetar(raw) : null;
}

async function loadProcs(icao, rwy) {
  const key = `${icao}:${rwy || ''}`;
  if (D.procs[key]) return D.procs[key];
  D.procs[key] = await api(`/api/procedures/${icao}${rwy ? '?rwy=' + rwy : ''}`).catch(() => ({ cifp: false, sid: [], star: [], approaches: [] }));
  return D.procs[key];
}

const depApt = () => D.apt[S.dep];
const arrApt = () => D.apt[S.arr];
const altnApt = () => {
  if (S.altn) return D.apt[S.altn] || null;
  return D.alternates[0] ? (D.apt[D.alternates[0].icao] || D.alternates[0]) : null;
};

// ---------------- тур ----------------
const tourLeg = () => (S.tour && D.tour ? D.tour.legs.find((l) => l.id === S.tour.leg) : null);
const tourSeg = () => {
  const l = tourLeg();
  const seg = l?.segments[S.tour.seg || 0];
  return seg && seg.dep === S.dep && seg.arr === S.arr ? seg : null;
};

// ---------------- выбор ВПП и заходов ----------------
function routeBearing() {
  const d = depApt(), a = arrApt();
  if (!d || !a) return null;
  const seg = tourSeg();
  const pts = seg ? seg.enroute : D.route?.points || [];
  const first = pts.find((p) => distNm(d, p) > 15) || a;
  const last = [...pts].reverse().find((p) => distNm(a, p) > 15) || d;
  return { out: bearing(d, first), inb: bearing(last, a) };
}

function rankedRunways(kind) {
  const ac = findAircraft(S.acId);
  const apt = kind === 'dep' ? depApt() : arrApt();
  if (!apt) return [];
  const rb = routeBearing();
  return rankRunways(apt, metarOf(apt.icao), {
    mode: kind, minLength: kind === 'dep' ? ac.toRwy : ac.ldgRwy,
    prefBearing: rb ? (kind === 'dep' ? rb.out : rb.inb) : null,
  });
}

function selectedRunway(kind) {
  const list = rankedRunways(kind);
  const manual = kind === 'dep' ? S.depRwy : S.arrRwy;
  return list.find((r) => r.ident === manual) || list[0] || null;
}

const MINIMA = {
  'ILS CAT III': { dh: 50, vis: 200 }, 'ILS CAT II': { dh: 100, vis: 350 }, 'ILS CAT I': { dh: 200, vis: 550 },
  ILS: { dh: 200, vis: 550 }, GLS: { dh: 200, vis: 550 }, LOC: { dh: 400, vis: 1200 }, RNAV: { dh: 250, vis: 1000 }, RNP: { dh: 250, vis: 1000 },
  GPS: { dh: 300, vis: 1200 }, 'VOR/DME': { dh: 400, vis: 1500 }, VOR: { dh: 450, vis: 1600 }, NDB: { dh: 500, vis: 1800 }, 'NDB/DME': { dh: 500, vis: 1800 },
  VISUAL: { dh: 1500, vis: 5000 },
};

/** Список доступных заходов на выбранную ВПП (CIFP или синтез из ILS/RNAV/визуального) */
function approachOptions() {
  const rw = selectedRunway('arr');
  const apt = arrApt();
  if (!rw || !apt) return [];
  const procs = D.procs[`${apt.icao}:${rw.ident}`];
  const out = [];
  const seg = tourSeg();
  if (seg) {
    const TYPE = { ILS: 'ILS', RNAV_RNP: 'RNP', RNAV: 'RNAV', LOC: 'LOC', LOC_BC: 'LOC', LDA: 'LOC', VOR: 'VOR', VOR_DME: 'VOR/DME', NDB: 'NDB', NDB_DME: 'NDB/DME', GPS: 'GPS', GLS: 'GLS', VISUAL: 'VISUAL' };
    for (const p of tourApproaches(seg, rw.ident)) {
      let type = TYPE[p.type] || 'RNAV';
      let name = p.name || p.id;
      if (type === 'ILS') {
        const l = rw.ils[0];
        type = `ILS CAT ${l?.cat || 'I'}`;
        if (l) name += ` — ${l.ident} ${l.freq.toFixed(2)}, курс ${Math.round(l.crs)}°`;
      }
      if (type === 'VISUAL') continue;
      out.push({ id: p.id, name, type, legs: p.legs });
    }
    out.push({ id: `VIS${rw.ident}`, name: `Визуальный заход ВПП ${rw.ident}`, type: 'VISUAL' });
    return out;
  }
  if (procs?.approaches?.length) {
    for (const p of procs.approaches) out.push({ id: p.name, name: `${p.type || ''} ${p.name}`.trim(), type: p.type || 'RNAV', legs: p.legs });
  } else {
    for (const l of rw.ils) {
      const cat = l.cat || 'I';
      const type = l.kind === 'LOC' ? 'LOC' : `ILS CAT ${cat}`;
      out.push({ id: `${l.kind}${rw.ident}`, name: `${l.kind} RWY ${rw.ident} — ${l.ident} ${l.freq.toFixed(2)} / ${Math.round(l.crs)}°T${l.kind === 'ILS' ? ` / CAT ${cat}` : ''}`, type, ils: l });
    }
    out.push({ id: `RNAV${rw.ident}`, name: `RNAV (GNSS) RWY ${rw.ident}`, type: 'RNAV' });
    out.push({ id: `VIS${rw.ident}`, name: `Визуальный RWY ${rw.ident}`, type: 'VISUAL' });
  }
  return out;
}

function minimaFor(type) {
  if (!type) return MINIMA.RNAV;
  if (MINIMA[type]) return MINIMA[type];
  const k = Object.keys(MINIMA).find((k) => type.startsWith(k));
  return MINIMA[k] || MINIMA.RNAV;
}

function selectedApproach() {
  const opts = approachOptions();
  const manual = opts.find((o) => o.id === S.approach);
  if (manual) return manual;
  const apt = arrApt();
  const m = apt ? metarOf(apt.icao) : null;
  if (S.rules === 'V') return opts.find((o) => o.type === 'VISUAL') || opts[0];
  // лучшая точность, удовлетворяющая погоде; при равенстве — ILS
  const ok = (o) => {
    if (!m) return true;
    const mi = minimaFor(o.type);
    const vis = m.rvr.length ? Math.max(...m.rvr.map((r) => parseInt(r.val.replace(/\D/g, ''), 10) || 0)) : (m.vis ?? 10000);
    return (m.ceiling ?? 99999) >= mi.dh && vis >= mi.vis;
  };
  const order = ['ILS', 'GLS', 'RNP', 'RNAV', 'LOC', 'GPS', 'VOR/DME', 'VOR', 'NDB'];
  const sorted = opts.filter((o) => o.type !== 'VISUAL').sort((a, b) => order.findIndex((k) => a.type.startsWith(k)) - order.findIndex((k) => b.type.startsWith(k)));
  // для ILS — минимальная категория, которой хватает
  const ils = sorted.filter((o) => o.type.startsWith('ILS'));
  if (ils.length && ok(ils[0])) return ils[0];
  return sorted.find(ok) || sorted[0] || opts[0];
}

// ---------------- маршрут ----------------
let routeSeq = 0;
async function buildRoute(mode = S.routeMode, fit = true) {
  const d = depApt(), a = arrApt();
  if (!d || !a) return;
  S.routeMode = mode;
  const seq = ++routeSeq;
  const btn = $('buildRoute');
  btn.disabled = true;
  $('routeMsg').innerHTML = '<span class="spinner"></span> Строю маршрут…';
  try {
    const depRwy = selectedRunway('dep')?.ident, arrRwy = selectedRunway('arr')?.ident;
    let r;
    if (mode === 'dct') r = { points: [], route: 'DCT', sid: null, star: null, airac: D.status?.airac };
    else if (mode === 'fixed' && S.fixedRoute) r = S.fixedRoute;
    else if (mode === 'tour' && tourSeg()) { r = composeTourRoute(tourSeg(), depRwy, arrRwy, D.tour.airac); r.key = `${depRwy}/${arrRwy}`; }
    else {
      r = await api('/api/route', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dep: d.icao, arr: a.icao, depRwy, arrRwy, level: S.level, sid: S.sid, star: S.star, text: mode === 'text' ? S.routeText : '' }),
      });
    }
    if (seq !== routeSeq) return;
    D.route = r;
    if (mode !== 'fixed') S.fixedRoute = null;
    if (mode !== 'text') S.routeText = r.route;
    $('routeText').value = S.routeText;
    const msgs = [];
    if (r.note) msgs.push(`<span class="warn">${esc(r.note)}</span>`);
    for (const w of r.warnings || []) msgs.push(`<span class="warn">${esc(w)}</span>`);
    msgs.push(`${r.points.length} точек${r.tour ? ` · трассы и схемы FAA, AIRAC ${esc(D.tour.airac)}` : ''}`);
    $('routeMsg').innerHTML = msgs.join('<br>');
    updateAll(fit);
    fetchWinds();
  } catch (e) {
    $('routeMsg').innerHTML = `<span class="bad">${esc(e.message)}</span>`;
  } finally { btn.disabled = false; }
}

// ветер на эшелоне по маршруту (Open-Meteo)
let windSeq = 0;
async function fetchWinds() {
  const d = depApt(), a = arrApt();
  if (!d || !a || !D.plan) return;
  const seq = ++windSeq;
  const fl = currentFl();
  const hpa = Math.round(1013.25 * Math.pow(1 - 6.8756e-6 * fl * 100, 5.2559));
  const all = [d, ...(D.route?.points || []), a];
  // 10 равномерных точек по маршруту
  const samples = [];
  const total = D.plan.dist;
  let acc = 0, k = 0;
  for (let i = 1; i < all.length && samples.length < 10; i++) {
    const seg = distNm(all[i - 1], all[i]);
    while (k < 10 && (k + 0.5) / 10 * total <= acc + seg) {
      const f = seg ? ((k + 0.5) / 10 * total - acc) / seg : 0;
      samples.push({ ...interpolate(all[i - 1], all[i], f), trk: bearing(all[i - 1], all[i]) });
      k++;
    }
    acc += seg;
  }
  D.windInfo = 'загрузка…';
  renderLeftInfo();
  try {
    const w = await api(`/api/winds?hpa=${hpa}&pts=${samples.map((p) => `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`).join(';')}`);
    if (seq !== windSeq) return;
    let comp = 0, tsum = 0;
    w.points.forEach((p, i) => {
      const trk = samples[i].trk;
      comp += p.spd * Math.cos(((p.dir + 180 - trk) * Math.PI) / 180);
      tsum += p.temp;
    });
    D.windAuto = Math.round(comp / w.points.length);
    const tAvg = tsum / w.points.length;
    const altFt = fl * 100;
    const isa = (altFt < 36089 ? 15 - 1.98 * altFt / 1000 : -56.5);
    D.windInfo = `Open-Meteo ${w.level} гПа: средний ${D.windAuto >= 0 ? 'попутный' : 'встречный'} ${Math.abs(D.windAuto)} уз, ISA${tAvg - isa >= 0 ? '+' : ''}${Math.round(tAvg - isa)}`;
  } catch (e) {
    if (seq !== windSeq) return;
    D.windAuto = null;
    D.windInfo = 'ветер на высотах недоступен — задайте вручную';
  }
  updateAll(false);
}

// ---------------- расчёт ----------------
function currentFl() {
  if (S.ovr.cruiseFl) return S.ovr.cruiseFl;
  return D.autoFl || 300;
}

function recompute() {
  const d = depApt(), a = arrApt();
  if (!d || !a) { D.plan = null; return; }
  const ac = findAircraft(S.acId);
  const points = D.route?.points || [];
  const pts = [{ ...d, ident: d.icao, type: 'APT' }, ...points, { ...a, ident: a.icao, type: 'APT', via: S.routeMode === 'dct' ? 'DCT' : 'DCT' }];
  let dist = 0;
  for (let i = 1; i < pts.length; i++) dist += distNm(pts[i - 1], pts[i]);
  D.autoFl = autoCruiseFl(ac, dist, bearing(d, a), d.elev, a.elev, S.rules);
  const fl = currentFl();
  const spd = parseSpeed(S.ovr.cruiseSpd);
  const tas = cruiseTas(ac, fl, S.isaDev, spd?.mach, spd?.tas);
  D.tas = tas;
  if (S.load.pax == null) S.load.pax = Math.round(ac.maxPax * 0.8);
  const altn = altnApt();
  D.plan = computePlan({
    ac, pts, dep: d, arr: a, altn,
    fl, tas, wind: S.ovr.windComp ?? D.windAuto ?? 0, isaDev: S.isaDev, rules: S.rules,
    pax: S.load.pax, bagsPerPax: S.load.bagsPerPax, cargo: S.load.cargo,
    fuel: { ...S.fuel },
  });
}

function parseSpeed(s) {
  if (!s) return null;
  const t = String(s).trim().toUpperCase().replace(',', '.');
  let m;
  if ((m = t.match(/^M?\s*(0?\.\d+)$/))) return { mach: +m[1] };
  if ((m = t.match(/^M(\d{2,3})$/))) return { mach: +m[1] / 100 };
  if ((m = t.match(/^N?(\d{2,4})\s*(KT|УЗ)?$/))) return { tas: +m[1] };
  return null;
}

// ---------------- отрисовка ----------------
function syncTourRoute() {
  const seg = tourSeg();
  if (S.routeMode !== 'tour' || !seg) return;
  const key = `${selectedRunway('dep')?.ident}/${selectedRunway('arr')?.ident}`;
  if (D.route?.tour && D.route.key === key) return;
  D.route = composeTourRoute(seg, selectedRunway('dep')?.ident, selectedRunway('arr')?.ident, D.tour.airac);
  D.route.key = key;
  S.routeText = D.route.route;
  $('routeText').value = S.routeText;
  const msgs = [];
  if (D.route.note) msgs.push(`<span class="warn">${esc(D.route.note)}</span>`);
  msgs.push(`${D.route.points.length} точек · трассы и схемы FAA, AIRAC ${esc(D.tour.airac)}`);
  $('routeMsg').innerHTML = msgs.join('<br>');
}

function updateAll(fit) {
  syncTourRoute();
  recompute();
  renderSelects();
  renderLeftInfo();
  renderSummary();
  renderWx();
  renderFuel();
  renderLog();
  const d = depApt(), a = arrApt();
  if (d && a) {
    drawRoute({ dep: d, arr: a, altn: altnApt(), points: D.route?.points || [], log: D.plan?.log, depRwy: selectedRunway('dep')?.ident, arrRwy: selectedRunway('arr')?.ident }, fit);
  }
  renderTourCard();
  renderPlaces();
  save();
}

function setOptions(sel, opts, value) {
  sel.innerHTML = opts.map((o) => `<option value="${esc(o.value)}"${o.value === value ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
}

function renderSelects() {
  const ac = findAircraft(S.acId);
  for (const kind of ['dep', 'arr']) {
    const list = rankedRunways(kind);
    const sel = selectedRunway(kind);
    setOptions($(kind + 'Rwy'), [
      { value: '', label: list.length ? `Авто: ${list[0].ident}` : '—' },
      ...list.map((r) => ({ value: r.ident, label: `${r.ident}  ${r.length ? Math.round(r.length * 0.3048) + ' м' : ''}${r.ils.length ? ' ILS' : ''}${r.ok ? '' : ' ⚠'}` })),
    ], (kind === 'dep' ? S.depRwy : S.arrRwy) || '');
    const m = metarOf((kind === 'dep' ? depApt() : arrApt())?.icao);
    $(kind + 'WindInfo').textContent = sel && m?.wind ? `· ${sel.ident}: ${sel.head >= 0 ? 'встречн.' : 'попутн.'} ${Math.abs(sel.head)} / бок. ${Math.abs(sel.cross)} уз` : '';
  }
  // SID / STAR
  const dRw = selectedRunway('dep')?.ident, aRw = selectedRunway('arr')?.ident;
  const dp = depApt() && D.procs[`${depApt().icao}:${dRw || ''}`];
  const ap = arrApt() && D.procs[`${arrApt().icao}:${aRw || ''}`];
  let sidList = dp?.sid || [], starList = ap?.star || [];
  const seg = tourSeg();
  if (seg && D.route?.tour) { sidList = []; starList = []; }
  setOptions($('sid'), [
    { value: '', label: D.route?.sid ? `${D.route.sid.name}${D.route.sid.trans ? ' · ' + D.route.sid.trans : ''}` : seg ? (S.rules === 'V' ? 'Визуальный вылет' : 'Радарное векторение') : dp?.cifp ? 'Авто' : 'В MSFS (нет в базе)' },
    ...sidList.map((p) => ({ value: p.name, label: p.name })),
  ], S.sid || '');
  setOptions($('star'), [
    { value: '', label: D.route?.star ? `${D.route.star.name}${D.route.star.trans ? ' · ' + D.route.star.trans : ''}` : seg ? (S.rules === 'V' ? 'Визуальный подход' : 'Векторение на заход') : ap?.cifp ? 'Авто' : 'В MSFS (нет в базе)' },
    ...starList.map((p) => ({ value: p.name, label: p.name })),
  ], S.star || '');
  const apps = approachOptions();
  const auto = selectedApproach();
  setOptions($('approach'), [
    { value: '', label: auto ? `Авто: ${auto.name}` : '—' },
    ...apps.map((o) => ({ value: o.id, label: o.name })),
  ], S.approach || '');
  // предупреждения по минимумам
  const msgs = [];
  const am = arrApt() && metarOf(arrApt().icao);
  const appSel = selectedApproach();
  if (am && appSel) {
    const mi = minimaFor(appSel.type);
    if ((am.ceiling ?? 99999) < mi.dh || (am.vis ?? 10000) < mi.vis) msgs.push(`<span class="bad">Погода ниже минимума ${esc(appSel.type)} (≈${mi.dh} ft / ${mi.vis} м) — нужен запасной</span>`);
  }
  const ar = selectedRunway('arr');
  if (ar && !ar.ok) msgs.push(`<span class="warn">ВПП ${ar.ident}: ${esc(ar.reason)}</span>`);
  const dr = selectedRunway('dep');
  if (dr && !dr.ok) msgs.push(`<span class="warn">ВПП ${dr.ident}: ${esc(dr.reason)}</span>`);
  if (dr && dr.length && dr.length < ac.toRwy) msgs.push(`<span class="warn">Длина ВПП ${dr.ident} меньше потребной (${ac.toRwy} ft)</span>`);
  if (seg && D.route?.tour) {
    const o = D.route.others || { sid: [], star: [] };
    const alt = [...o.sid.filter((x) => x !== D.route.sid?.name).map((x) => 'SID ' + x), ...o.star.filter((x) => x !== D.route.star?.name).map((x) => 'STAR ' + x)];
    msgs.push(`Схемы подобраны под ВПП автоматически (FAA CIFP, AIRAC ${esc(D.tour.airac)}). Смените полосу — SID, STAR и заход пересчитаются.${alt.length ? `<br>Ещё доступны: ${esc(alt.slice(0, 6).join(', '))}` : ''}`);
  } else if (!dp?.cifp) msgs.push('SID/STAR в бесплатной базе нет: после загрузки .pln выберите их в MSFS (EFB / МФД / FMC) под выбранную ВПП.');
  $('procMsg').innerHTML = msgs.join('<br>');
}

function renderLeftInfo() {
  const ac = findAircraft(S.acId);
  const liv = S.tour ? S.livery : ac.cat === 'J' ? 'house' : 'tour';
  if ($('acArt').dataset.key !== ac.id + liv) { $('acArt').innerHTML = aircraftSvg(artType(ac), liv); $('acArt').dataset.key = ac.id + liv; }
  renderRouteChips();
  $('acSpec').innerHTML = [
    ['MTOW', fmtW(ac.mtow)], ['MLW', fmtW(ac.mlw)], ['MZFW', fmtW(ac.mzfw)],
    ['OEW', fmtW(ac.oew)], ['Топливо', fmtW(ac.maxFuel)], ['Мест', ac.maxPax],
    ['Скорость', ac.mach ? 'M' + ac.mach.toFixed(2) : ac.tas + ' kt'], ['Потолок', 'FL' + ac.ceil], ['Расход', fmtW(ac.ff) + '/ч'],
  ].map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('');
  const d = depApt(), a = arrApt();
  $('depName').textContent = d ? `${d.name}${d.city ? ', ' + d.city : ''}` : '';
  $('arrName').textContent = a ? `${a.name}${a.city ? ', ' + a.city : ''}` : '';
  $('depName').title = $('depName').textContent;
  $('arrName').title = $('arrName').textContent;
  const fl = $('cruiseFl');
  if (document.activeElement !== fl) fl.value = currentFl();
  fl.classList.toggle('overridden', !!S.ovr.cruiseFl);
  const sp = $('cruiseSpd');
  if (document.activeElement !== sp) sp.value = S.ovr.cruiseSpd || (ac.mach ? 'M' + ac.mach.toFixed(2) : String(ac.tas));
  sp.classList.toggle('overridden', !!S.ovr.cruiseSpd);
  const wc = $('windComp');
  if (document.activeElement !== wc) wc.value = S.ovr.windComp ?? D.windAuto ?? '';
  wc.classList.toggle('overridden', S.ovr.windComp != null);
  $('windHint').textContent = `+ попутный / − встречный, уз. ${D.windInfo || ''}${D.tas ? ` · TAS ${D.tas} kt` : ''}`;
  $('airacBadge').textContent = D.route?.tour ? `FAA ${D.tour.airac}` : D.status ? `AIRAC ${D.status.airac}${D.status.cifp ? ' + CIFP' : ''}` : '';
}

function renderSummary() {
  const p = D.plan;
  if (!p) { $('summary').innerHTML = ''; return; }
  const ac = findAircraft(S.acId);
  const block = p.times.trip + p.times.taxi;
  let eta = '—';
  if (S.etd) {
    const [h, m] = S.etd.split(':').map(Number);
    const t = h * 60 + m + 10 + p.times.trip;
    eta = `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(Math.round(t % 60)).padStart(2, '0')}z`;
  }
  const bad = p.warnings.some((w) => w.level === 'bad');
  const chips = [
    ['Маршрут', `${S.dep} → ${S.arr}`],
    ['Дистанция', `${Math.round(p.dist)} nm`],
    ['Эшелон', currentFl() < 180 ? `${(currentFl() * 100).toLocaleString('ru-RU')} ft` : `FL${currentFl()}`],
    ['В воздухе', fmtTime(p.times.trip)],
    ['Блок', fmtTime(block)],
    ['ETA', eta],
    ['Топливо', `${fmtW(p.fuel.block)} ${U()}`, bad && p.fuel.block > ac.maxFuel ? 'bad' : ''],
    ['TOW', `${fmtW(p.weights.tow)} ${U()}`, p.weights.tow > ac.mtow ? 'bad' : ''],
    ['Запасной', altnApt()?.icao || '—'],
  ];
  $('summary').innerHTML = chips.map(([k, v, c]) => `<div class="chip ${c || ''}"><small>${k}</small><b>${esc(v)}</b></div>`).join('');
}

function renderWx() {
  const el = $('tab-wx');
  const list = [['Вылет', depApt(), 'dep'], ['Прилёт', arrApt(), 'arr'], ['Запасной', altnApt(), 'altn']].filter((x) => x[1]);
  if (!list.length) { el.innerHTML = '<div class="empty">Введите аэропорты вылета и прилёта</div>'; return; }
  el.innerHTML = list.map(([title, apt, kind]) => {
    const w = D.wx[apt.icao];
    if (!w && kind === 'altn') loadWeather(apt.icao);
    const m = metarOf(apt.icao);
    let body;
    if (!w || w.loading) body = '<div class="msg"><span class="spinner"></span> Загрузка METAR…</div>';
    else {
      const ov = S.metarOverride[apt.icao];
      body = `
        ${m ? `<div class="raw">${esc(m.raw)}</div>` : `<div class="msg warn-t">METAR недоступен${w.errors?.length ? ' (' + esc(w.errors[0]) + ')' : ''}. Вставьте вручную ниже.</div>`}
        ${m ? `<dl class="kv">${describeMetar(m).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
        ${w.taf ? `<div class="subhead">TAF</div><div class="raw taf">${esc(w.taf)}</div>` : ''}
        ${kind !== 'altn' ? runwayTable(kind, apt) : ''}
        <details class="manual"${ov ? ' open' : ''}><summary>${ov ? 'Используется ручной METAR' : 'Свой METAR (погода из симулятора)'}</summary>
          <textarea rows="2" data-metar="${apt.icao}" placeholder="UUEE 061230Z 24008KT 9999 BKN030 12/08 Q1015">${esc(ov || '')}</textarea>
          <div class="row-btns" style="margin-top:6px"><button class="btn" data-metar-apply="${apt.icao}">Применить</button><button class="btn ghost" data-metar-clear="${apt.icao}">Сбросить</button><button class="btn ghost" data-metar-reload="${apt.icao}">Обновить</button></div>
        </details>`;
    }
    return `<section class="card"><div class="wx-head"><h3 style="margin:0">${title}</h3><span class="icao-t">${apt.icao}</span>${m ? `<span class="cat ${m.category}">${m.category}</span>` : ''}<span class="muted" style="margin-left:auto;font-size:11px">${esc(w?.metarSource || '')}</span></div>${body}</section>`;
  }).join('');
}

function runwayTable(kind, apt) {
  const list = rankedRunways(kind);
  const sel = selectedRunway(kind);
  if (!list.length) return '';
  return `<table class="rwy-table"><tr><th>ВПП</th><th>Длина, м</th><th>Встр.</th><th>Бок.</th><th>ILS</th></tr>${list.map((r, i) => `
    <tr class="${i === 0 ? 'best' : ''} ${sel && r.ident === sel.ident ? 'sel' : ''}"><td>${r.ident}</td><td>${r.length ? Math.round(r.length * 0.3048) : '—'}</td><td>${r.head}</td><td>${Math.abs(r.cross)}</td><td>${r.ils.map((l) => l.freq.toFixed(2)).join(' ') || '—'}</td></tr>`).join('')}</table>`;
}

function fuelRow(label, key, valueKg, time, editable = true) {
  return `<div class="fuel-row${key === 'block' ? ' total' : ''}"><span class="lbl">${label}</span><span class="t">${time != null ? fmtTime(time) : ''}</span>
    ${editable ? `<input type="number" data-fuel="${key}" value="${W(valueKg)}" class="${S.fuel[key] != null && key !== 'extra' ? 'overridden' : ''}">` : `<input value="${fmtW(valueKg)}" disabled>`}</div>`;
}

function renderFuel() {
  const el = $('tab-fuel');
  const p = D.plan;
  if (!p) { el.innerHTML = '<div class="empty">Постройте маршрут</div>'; return; }
  const ac = findAircraft(S.acId);
  const bar = (label, val, max) => `<div class="wbar ${val > max + 1 ? 'over' : ''}"><div class="top"><span>${label}</span><span><b>${fmtW(val)}</b> / ${fmtW(max)} ${U()}</span></div><div class="track"><div class="fill" style="width:${Math.min(100, val / max * 100).toFixed(1)}%"></div></div></div>`;
  el.innerHTML = `
    ${p.warnings.map((w) => `<div class="warnbox ${w.level}">${esc(w.text)}</div>`).join('')}
    <section class="card"><h3>Загрузка</h3>
      <label class="field"><span>Пассажиры (макс. ${ac.maxPax})</span>
        <div class="range"><input type="range" min="0" max="${ac.maxPax}" value="${S.load.pax}" data-load="pax"><output>${S.load.pax}</output></div></label>
      <div class="grid2">
        <label class="field"><span>Багаж на пасс., ${U()}</span><input type="number" data-load="bagsPerPax" value="${W(S.load.bagsPerPax)}"></label>
        <label class="field"><span>Груз, ${U()}</span><input type="number" data-load="cargo" value="${W(S.load.cargo)}"></label>
      </div>
      <div class="hint">Пассажир ${W(PAX_MASS)} ${U()} с ручной кладью. Полезная нагрузка: <b>${fmtW(p.weights.payload)}</b> ${U()}, доступно при этом топливе: ${fmtW(p.weights.maxPayload)} ${U()}</div>
    </section>
    <section class="card"><h3>Массы</h3>
      ${bar('ZFW', p.weights.zfw, ac.mzfw)}
      ${bar('TOW', p.weights.tow, ac.mtow)}
      ${bar('LW', p.weights.lw, ac.mlw)}
      ${bar('Топливо', p.fuel.block, ac.maxFuel)}
    </section>
    <section class="card"><h3>Топливо, ${U()}</h3>
      ${fuelRow('Руление', 'taxi', p.fuel.taxi, null)}
      ${fuelRow('Рейсовое (trip)', 'trip', p.fuel.trip, p.times.trip, false)}
      <div class="fuel-row"><span class="lbl">Непредвиденное, %</span><span class="t">${fmtW(p.fuel.cont)}</span><input type="number" step="1" min="0" max="20" data-fuel="contPct" value="${S.fuel.contPct}"></div>
      ${fuelRow(`До запасного${p.altn ? ` (${Math.round(p.altn.dist)} nm, FL${p.altn.fl})` : ''}`, 'altnFuel', p.fuel.altn, p.times.altn)}
      <div class="fuel-row"><span class="lbl">Резерв, мин</span><span class="t">${fmtW(p.fuel.final)}</span><input type="number" step="5" min="0" data-fuel="finalMin" value="${S.fuel.finalMin}"></div>
      ${fuelRow('Дополнительное', 'extra', p.fuel.extra, p.times.extra)}
      ${fuelRow('Заправка (block)', 'block', p.fuel.block, p.times.endurance)}
      <div class="hint">Мин. потребное: ${fmtW(p.fuel.minBlock)} ${U()} · На взлёте ${fmtW(p.fuel.takeoff)} · На посадке ${fmtW(p.fuel.landing)} · Расход крейсер ≈ ${fmtW(p.prof.ff)} ${U()}/ч</div>
      <div class="row-btns" style="margin-top:8px"><button class="btn ghost" id="fuelReset">Сбросить ручные значения</button></div>
    </section>
    <section class="card"><h3>Запасные рядом с ${esc(S.arr)}</h3>
      ${D.alternates.length ? D.alternates.map((x) => `<div class="link-item" data-altn="${x.icao}"><b>${x.icao}</b> ${esc(x.name)}<small>${x.dist} nm · ${Math.round(x.maxRwy * 0.3048)} м</small></div>`).join('') : '<div class="msg">нет данных</div>'}
    </section>`;
}

function renderLog() {
  const el = $('tab-log');
  const p = D.plan;
  if (!p) { el.innerHTML = '<div class="empty">Постройте маршрут</div>'; return; }
  const etdMin = S.etd ? (() => { const [h, m] = S.etd.split(':').map(Number); return h * 60 + m + 10; })() : null;
  const hhmm = (t) => etdMin == null ? fmtTime(t) : (() => { const x = Math.round(etdMin + t); return `${String(Math.floor(x / 60) % 24).padStart(2, '0')}${String(x % 60).padStart(2, '0')}`; })();
  el.innerHTML = `
    <section class="card"><h3>Вертикальный профиль</h3>${profileSvg(p)}</section>
    <section class="card"><h3>Навигационный лог</h3>
    <div class="hint">Курс — истинный путевой угол (°T). Время ${etdMin == null ? 'от взлёта' : 'UTC (ETD + 10 мин руления)'}.</div>
    <table class="table navlog"><tr><th>Точка</th><th>Через</th><th>ПУ</th><th>nm</th><th>Ост.</th><th>Выс.</th><th>Вр.</th><th>Топл.</th></tr>
    ${p.log.map((r) => `<tr class="stage-${r.stage || ''} ${r.type === 'TOC' ? 'toc' : r.type === 'TOD' ? 'tod' : ''}">
      <td class="id">${esc(r.ident)}</td><td class="via">${esc(r.via && r.via !== 'DCT' ? r.via : r.trk == null ? '' : 'DCT')}</td>
      <td>${r.trk == null ? '' : String(Math.round(r.trk) % 360).padStart(3, '0')}</td><td>${r.dist ? Math.round(r.dist) : ''}</td><td>${Math.round(r.remain)}</td>
      <td>${r.alt >= 10000 || r.type === 'TOC' || r.type === 'TOD' ? 'FL' + Math.round(r.alt / 100) : Math.round(r.alt / 100) * 100}</td>
      <td>${hhmm(r.time)}</td><td>${W(r.fuel / 1000 * 1000) >= 10000 ? (W(r.fuel) / 1000).toFixed(1) + 't' : fmtW(r.fuel)}</td></tr>`).join('')}
    </table></section>`;
}

function profileSvg(p) {
  const w = 380, h = 150, pad = { l: 34, r: 8, t: 10, b: 20 };
  const maxAlt = Math.max(...p.log.map((r) => r.alt), 1000) * 1.12;
  const x = (s) => pad.l + (s / Math.max(1, p.dist)) * (w - pad.l - pad.r);
  const y = (a) => h - pad.b - (a / maxAlt) * (h - pad.t - pad.b);
  const pts = p.log.map((r) => `${x(r.cum).toFixed(1)},${y(r.alt).toFixed(1)}`).join(' ');
  const grid = [0.25, 0.5, 0.75, 1].map((f) => {
    const a = Math.round(maxAlt * f / 1000) * 1000;
    return `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(a)}" y2="${y(a)}" stroke="rgba(196,167,255,.15)" stroke-dasharray="2 3"/><text x="${pad.l - 4}" y="${y(a) + 3}" fill="#9484c0" font-size="9" text-anchor="end">${a >= 10000 ? 'FL' + a / 100 : a}</text>`;
  }).join('');
  const labels = p.log.filter((r, i) => i === 0 || i === p.log.length - 1 || r.type === 'TOC' || r.type === 'TOD')
    .map((r) => `<circle cx="${x(r.cum)}" cy="${y(r.alt)}" r="3" fill="${r.type === 'TOC' || r.type === 'TOD' ? '#ffd166' : '#ff7ac0'}"/><text x="${Math.min(w - 30, Math.max(pad.l + 10, x(r.cum)))}" y="${h - 6}" fill="#c2b3e6" font-size="9" text-anchor="middle">${esc(r.ident)}</text>`).join('');
  return `<svg class="profile" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <defs><linearGradient id="pg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ff4fa3" stop-opacity=".35"/><stop offset="1" stop-color="#ff4fa3" stop-opacity="0"/></linearGradient></defs>
    ${grid}<polygon points="${x(0)},${y(0)} ${pts} ${x(p.dist)},${y(0)}" fill="url(#pg)"/><polyline points="${pts}" fill="none" stroke="#ff7ac0" stroke-width="2"/>${labels}</svg>`;
}

// ---------------- чарты ----------------
let chartsFor = 'dep';
async function renderCharts() {
  const el = $('tab-charts');
  const apt = chartsFor === 'dep' ? depApt() : chartsFor === 'arr' ? arrApt() : altnApt();
  const sw = `<div class="apt-switch">${['dep', 'arr', 'altn'].map((k) => {
    const a = k === 'dep' ? depApt() : k === 'arr' ? arrApt() : altnApt();
    return a ? `<button class="btn ${k === chartsFor ? 'on' : ''}" data-charts="${k}">${a.icao}</button>` : '';
  }).join('')}</div>`;
  if (!apt) { el.innerHTML = sw + '<div class="empty">Нет аэропорта</div>'; return; }
  if (!D.charts[apt.icao]) {
    el.innerHTML = sw + '<div class="msg"><span class="spinner"></span> Ищу чарты…</div>';
    D.charts[apt.icao] = await api(`/api/charts/${apt.icao}`).catch((e) => ({ charts: [], links: [], note: e.message }));
  }
  const c = D.charts[apt.icao];
  const groups = { GND: 'Аэродром', SID: 'Вылет (SID)', STAR: 'Прибытие (STAR)', APP: 'Заход', INFO: 'Прочее' };
  let html = sw;
  if (c.charts.length) {
    for (const [g, title] of Object.entries(groups)) {
      const items = c.charts.filter((x) => x.group === g);
      if (!items.length) continue;
      html += `<div class="chart-group"><h4>${title}</h4>${items.map((x) => `<div class="chart-item" data-chart="${esc(x.url)}" data-title="${esc(apt.icao + ' — ' + x.name)}">${esc(x.name)}<small>PDF</small></div>`).join('')}</div>`;
    }
  } else {
    html += `<div class="msg" style="margin-bottom:10px">Для ${apt.icao} прямые PDF доступны только для США (FAA). Для остальных стран — бесплатные источники ниже.${c.note ? '<br><span class="warn-t">' + esc(c.note) + '</span>' : ''}</div>`;
  }
  html += `<div class="chart-group"><h4>Бесплатные источники</h4>${c.links.map((l) => `<a class="link-item" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)}<small>↗</small></a>`).join('')}</div>`;
  el.innerHTML = html;
}

// ---------------- события ----------------
async function setAirport(kind, code, rebuild = true) {
  code = (code || '').trim().toUpperCase();
  const input = $(kind);
  input.value = code;
  if (kind === 'altn' && !code) { S.altn = ''; updateAll(false); return; }
  try {
    const a = await loadAirport(code);
    if (kind !== 'altn' && S[kind] !== a.icao) { S.planId = null; if (S.tour) { S.tour = null; S.ovr.cruiseFl = null; } }
    S[kind] = a.icao;
    input.value = a.icao;
    if (kind === 'dep') { S.depRwy = null; S.sid = null; }
    if (kind === 'arr') {
      S.arrRwy = null; S.star = null; S.approach = null;
      D.alternates = await api(`/api/alternates/${a.icao}?minRwy=${findAircraft(S.acId).ldgRwy}`).catch(() => []);
    }
    D.charts = {};
    await refreshProcs();
    if (rebuild && kind !== 'altn' && depApt() && arrApt()) {
      const mode = tourSeg() ? 'tour' : 'auto';
      S.routeMode = mode;
      await buildRoute(mode);
    } else updateAll(false);
    if ($('tab-charts').classList.contains('on')) renderCharts();
  } catch (e) {
    toast(e.message);
  }
}

async function refreshProcs() {
  const tasks = [];
  if (depApt()) tasks.push(loadProcs(depApt().icao, selectedRunway('dep')?.ident));
  if (arrApt()) tasks.push(loadProcs(arrApt().icao, selectedRunway('arr')?.ident));
  await Promise.all(tasks);
}

function bindAutocomplete(kind) {
  const input = $(kind);
  const list = document.querySelector(`.ac-list[data-for="${kind}"]`);
  let timer, items = [], idx = -1;
  const close = () => { list.classList.remove('show'); idx = -1; };
  const pick = (code) => { clearTimeout(timer); close(); input.dataset.skipBlur = '1'; input.blur(); setAirport(kind, code); };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) return close();
    timer = setTimeout(async () => {
      items = await api(`/api/airport/search?q=${encodeURIComponent(q)}`).catch(() => []);
      if (document.activeElement !== input || input.value.trim() !== q) return;
      list.innerHTML = items.map((a, i) => `<div data-i="${i}"><b>${a.icao}</b><span>${esc(a.name)}${a.city ? ', ' + esc(a.city) : ''}</span></div>`).join('');
      list.classList.toggle('show', items.length > 0);
    }, 150);
  });
  list.addEventListener('mousedown', (e) => {
    const d = e.target.closest('[data-i]');
    if (d) { e.preventDefault(); pick(items[+d.dataset.i].icao); }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!items.length) return;
      idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      [...list.children].forEach((c, i) => c.classList.toggle('sel', i === idx));
      e.preventDefault();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(idx >= 0 && list.classList.contains('show') ? items[idx].icao : input.value);
    } else if (e.key === 'Escape') close();
  });
  input.addEventListener('blur', () => setTimeout(() => {
    close();
    if (input.dataset.skipBlur) { delete input.dataset.skipBlur; return; }
    const v = input.value.trim().toUpperCase();
    if (v !== (S[kind] || '') && (v.length >= 3 || (kind === 'altn' && !v))) setAirport(kind, v);
  }, 150));
}

function bind() {
  ['dep', 'arr', 'altn'].forEach(bindAutocomplete);
  $('callsign').addEventListener('input', (e) => { S.callsign = e.target.value.toUpperCase(); save(); });
  $('etd').addEventListener('change', (e) => { S.etd = e.target.value; updateAll(false); });
  $('rules').addEventListener('change', (e) => { S.rules = e.target.value; S.ovr.cruiseFl = null; updateAll(false); });
  $('aircraft').addEventListener('change', async (e) => {
    S.acId = e.target.value;
    S.load.pax = null;
    S.ovr.cruiseSpd = null; S.ovr.cruiseFl = null;
    S.fuel.block = null; S.fuel.taxi = null;
    if (arrApt()) D.alternates = await api(`/api/alternates/${arrApt().icao}?minRwy=${findAircraft(S.acId).ldgRwy}`).catch(() => D.alternates);
    const ac = findAircraft(S.acId);
    S.level = ac.cat === 'J' || ac.ceil >= 250 ? 'high' : 'low';
    document.querySelectorAll('#levelSeg button').forEach((b) => b.classList.toggle('on', b.dataset.level === S.level));
    const opt = tourLeg()?.aircraft.find((x) => x.id === S.acId);
    if (S.tour) { S.livery = opt ? opt.livery : (ac.cat === 'J' ? 'house' : 'tour'); const seg = tourSeg(); if (seg?.fl) S.ovr.cruiseFl = seg.fl; }
    if (S.routeMode === 'auto') buildRoute('auto', false); else updateAll(false);
  });
  document.querySelectorAll('#levelSeg button').forEach((b) => b.addEventListener('click', () => {
    S.level = b.dataset.level;
    document.querySelectorAll('#levelSeg button').forEach((x) => x.classList.toggle('on', x === b));
    buildRoute('auto');
  }));
  $('buildRoute').addEventListener('click', () => buildRoute('auto'));
  $('directRoute').addEventListener('click', () => buildRoute('dct'));
  $('applyRoute').addEventListener('click', () => { S.routeText = $('routeText').value; buildRoute('text'); });
  $('routeText').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('applyRoute').click(); });

  const rwyChange = (kind) => async (e) => {
    if (kind === 'dep') { S.depRwy = e.target.value || null; S.sid = null; } else { S.arrRwy = e.target.value || null; S.star = null; S.approach = null; }
    await refreshProcs();
    if (S.routeMode === 'auto') buildRoute('auto', false); else updateAll(false);
  };
  $('depRwy').addEventListener('change', rwyChange('dep'));
  $('arrRwy').addEventListener('change', rwyChange('arr'));
  $('sid').addEventListener('change', (e) => { S.sid = e.target.value || null; buildRoute('auto', false); });
  $('star').addEventListener('change', (e) => { S.star = e.target.value || null; buildRoute('auto', false); });
  $('approach').addEventListener('change', (e) => { S.approach = e.target.value || null; updateAll(false); });

  $('cruiseFl').addEventListener('change', (e) => {
    const v = Math.round(+e.target.value / 10) * 10;
    S.ovr.cruiseFl = v > 0 ? v : null; updateAll(false); fetchWinds();
  });
  $('cruiseSpd').addEventListener('change', (e) => {
    const v = e.target.value.trim();
    if (v && !parseSpeed(v)) { toast('Скорость: M0.78, 0.78 или 450 (kt)'); return; }
    S.ovr.cruiseSpd = v || null; updateAll(false);
  });
  $('windComp').addEventListener('change', (e) => { S.ovr.windComp = e.target.value === '' ? null : +e.target.value; updateAll(false); });
  $('isaDev').addEventListener('change', (e) => { S.isaDev = +e.target.value || 0; updateAll(false); });
  document.querySelectorAll('[data-reset]').forEach((b) => b.addEventListener('click', () => {
    S.ovr[b.dataset.reset] = null; updateAll(false);
    if (b.dataset.reset === 'cruiseFl') fetchWinds();
  }));

  // правая панель: делегирование
  const right = $('rightPanel');
  right.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.load === 'pax') {
      S.load.pax = +t.value; t.nextElementSibling.textContent = t.value;
      clearTimeout(bind.paxT); bind.paxT = setTimeout(() => updateAll(false), 120);
    }
  });
  right.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.load && t.dataset.load !== 'pax') { S.load[t.dataset.load] = Math.max(0, fromW(+t.value || 0)); updateAll(false); }
    if (t.dataset.fuel) {
      const k = t.dataset.fuel;
      const v = t.value === '' ? null : +t.value;
      if (k === 'contPct' || k === 'finalMin') S.fuel[k] = v ?? DEFAULTS.fuel[k];
      else if (k === 'extra') { S.fuel.extra = Math.max(0, fromW(v || 0)); S.fuel.block = null; }
      else S.fuel[k] = v == null ? null : fromW(v);
      updateAll(false);
    }
  });
  right.addEventListener('click', (e) => {
    const t = e.target.closest('button, [data-altn], [data-chart]');
    if (!t) return;
    if (t.id === 'fuelReset') { S.fuel = { ...DEFAULTS.fuel }; updateAll(false); }
    if (t.dataset.altn) setAirport('altn', t.dataset.altn);
    if (t.dataset.metarApply) {
      const v = right.querySelector(`textarea[data-metar="${t.dataset.metarApply}"]`).value.trim().toUpperCase();
      if (v) S.metarOverride[t.dataset.metarApply] = v; else delete S.metarOverride[t.dataset.metarApply];
      S.depRwy = S.depRwy; updateAll(false); refreshProcs().then(() => S.routeMode === 'auto' && buildRoute('auto', false));
    }
    if (t.dataset.metarClear) { delete S.metarOverride[t.dataset.metarClear]; updateAll(false); }
    if (t.dataset.metarReload) loadWeather(t.dataset.metarReload, true);
    if (t.dataset.charts) { chartsFor = t.dataset.charts; renderCharts(); }
    if (t.dataset.chart) openChart(t.dataset.chart, t.dataset.title);
  });

  document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x.id === 'tab-' + b.dataset.tab));
    if (b.dataset.tab === 'charts') renderCharts();
  }));

  document.querySelectorAll('[data-collapse]').forEach((b) => b.addEventListener('click', () => {
    const p = $(b.dataset.collapse);
    p.classList.toggle('collapsed');
    document.body.classList.toggle('left-collapsed', $('leftPanel').classList.contains('collapsed'));
  }));

  $('units').value = S.units;
  $('units').addEventListener('change', (e) => { S.units = e.target.value; updateAll(false); });

  $('exportBtn').addEventListener('click', (e) => { e.stopPropagation(); $('exportMenu').classList.toggle('show'); });
  document.addEventListener('click', () => $('exportMenu').classList.remove('show'));
  $('exportMenu').addEventListener('click', (e) => {
    const k = e.target.dataset.export;
    if (k === 'import') { $('plnFile').click(); return; }
    if (!k || !D.plan) return;
    const msg = exportPlan(k, collectExport());
    if (msg) toast(msg);
  });

  $('savePlanBtn').addEventListener('click', () => doSavePlan(true));
  $('savePlan2').addEventListener('click', () => doSavePlan(false));
  $('importPln').addEventListener('click', () => $('plnFile').click());
  $('plnFile').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importPln(f); });
  $('plansList').addEventListener('click', (e) => {
    const t = e.target.closest('[data-plan-open], [data-plan-pln], [data-plan-del]');
    if (!t) return;
    if (t.dataset.planOpen) openPlan(t.dataset.planOpen);
    if (t.dataset.planPln) { const p = getPlan(t.dataset.planPln); if (p) downloadPln(p); }
    if (t.dataset.planDel && confirm('Удалить план?')) {
      deletePlan(t.dataset.planDel);
      if (S.planId === t.dataset.planDel) S.planId = null;
      renderPlans();
    }
  });

  $('chartClose').addEventListener('click', () => { $('chartModal').hidden = true; $('chartFrame').src = 'about:blank'; });
}

function openChart(url, title) {
  $('chartTitle').textContent = title;
  $('chartOpen').href = url;
  $('chartFrame').src = url;
  $('chartModal').hidden = false;
}

function collectExport() {
  const ac = findAircraft(S.acId);
  const app = selectedApproach();
  return {
    S, ac, plan: D.plan, route: D.route, dep: depApt(), arr: arrApt(), altn: altnApt(),
    fl: currentFl(), tas: D.tas, depRwy: selectedRunway('dep')?.ident, arrRwy: selectedRunway('arr')?.ident,
    approach: app, airac: D.route?.tour ? D.tour.airac.replace(/-/g, '').slice(2, 6) : D.status?.airac, metar: { dep: metarOf(S.dep)?.raw, arr: metarOf(S.arr)?.raw, altn: altnApt() ? metarOf(altnApt().icao)?.raw : null },
    units: S.units,
  };
}

// ---------------- тур: виды, карточки, места ----------------
function setView(v, { push = true } = {}) {
  S.view = v;
  document.body.classList.toggle('view-tour', v === 'tour');
  document.body.classList.toggle('view-planner', v === 'planner');
  document.querySelectorAll('.nav [data-nav]').forEach((b) => b.classList.toggle('on', b.dataset.nav === v));
  if (v === 'tour' && D.tour) renderTourView(D.tour);
  if (v === 'planner') setTimeout(() => { invalidate(); if (depApt() && arrApt()) updateAll(true); }, 60);
  if (push) history.replaceState(null, '', v === 'tour' ? '#tour' : S.tour ? `#leg-${S.tour.leg}` : '#planner');
  save();
}

async function startTourLeg(legId, segIdx = 0, acIdx = 0) {
  const leg = D.tour?.legs.find((l) => l.id === +legId);
  if (!leg) return;
  const seg = leg.segments[segIdx] || leg.segments[0];
  const opt = leg.aircraft[acIdx] || leg.aircraft[0];
  const ac = findAircraft(opt.id);
  Object.assign(S, {
    dep: seg.dep, arr: seg.arr, altn: '', rules: seg.rules || 'I',
    acId: opt.id, livery: opt.livery, level: seg.level === 'high' ? 'high' : 'low',
    tour: { leg: leg.id, seg: segIdx, ac: acIdx },
    depRwy: null, arrRwy: null, sid: null, star: null, approach: null,
    routeMode: 'tour', fixedRoute: null, planId: null, routeText: seg.route,
    callsign: { southwest: 'SWA', american: 'AAL', united: 'UAL' }[opt.livery] ? `${{ southwest: 'SWA', american: 'AAL', united: 'UAL' }[opt.livery]}${100 + leg.id * 7}` : `VSK${String(leg.id).padStart(3, '0')}`,
    ovr: { cruiseFl: seg.fl || null, cruiseSpd: null, windComp: null },
    load: { pax: null, bagsPerPax: S.load.bagsPerPax, cargo: 0 },
    fuel: { ...DEFAULTS.fuel },
  });
  if (ac.cat !== 'J') S.load.pax = Math.min(ac.maxPax, 2);
  D.alternates = [];
  D.charts = {};
  D.route = null;
  setView('planner');
  // вкладка «Места» — первой
  document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x.dataset.tab === 'places'));
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x.id === 'tab-places'));
  await loadFromState(true);
}

function renderRouteChips() {
  const r = D.route;
  const el = $('routeChips');
  if (!r || !depApt()) { el.innerHTML = ''; return; }
  const procs = new Set([r.sid?.name, r.star?.name].filter(Boolean));
  const vias = new Set((r.points || []).map((p) => p.via));
  const toks = (r.route || '').split(/\s+/).filter(Boolean);
  el.innerHTML = [`<span class="rc proc" title="Вылет">${esc(S.dep)}${selectedRunway('dep') ? ' · ' + selectedRunway('dep').ident : ''}</span>`,
    ...toks.map((t) => `<span class="rc ${procs.has(t) ? 'proc' : t === 'DCT' ? 'dct' : vias.has(t) && /\d/.test(t) ? 'awy' : 'fix'}">${esc(t)}</span>`),
    `<span class="rc proc" title="Прилёт">${esc(S.arr)}${selectedRunway('arr') ? ' · ' + selectedRunway('arr').ident : ''}</span>`].join('');
}

function renderTourCard() {
  const el = $('tourCard');
  const leg = tourLeg();
  const tabBtn = $('tabBtnPlaces');
  if (!leg) {
    el.hidden = true; tabBtn.hidden = true;
    if (tabBtn.classList.contains('on')) document.querySelector('#tabs [data-tab="wx"]').click();
    drawLandmarks([]);
    return;
  }
  tabBtn.hidden = false;
  const segIdx = S.tour.seg || 0;
  const seg = leg.segments[segIdx];
  const onRoute = !!tourSeg();
  const done = doneSet().has(leg.id);
  const key = `${leg.id}:${segIdx}:${S.acId}:${S.livery}:${onRoute}:${S.routeMode}:${done}`;
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  el.hidden = false;
  const cover = leg.landmarks[leg.landmarks.length - 1];
  el.innerHTML = `
    <div class="tc-img">${photoBox(cover)}</div>
    <div class="tc-body">
      <div class="tc-kicker">${icon('flag')}Рейс ${leg.id} из ${D.tour.legs.length}${leg.finale ? ' · финал' : ''}</div>
      <div class="tc-title">${esc(leg.title)}</div>
      <p class="tc-text">${esc(leg.blurb)}</p>
      ${leg.segments.length > 1 ? `<div class="seg">${leg.segments.map((sg, i) => `<button data-tour-seg="${i}" class="${i === segIdx ? 'on' : ''}">${i ? 'Обратно' : 'Туда'}: ${sg.dep} → ${sg.arr}</button>`).join('')}</div>` : ''}
      <div class="ac-pick">${leg.aircraft.map((a, i) => `<button data-tour-ac="${i}" class="${a.id === S.acId && a.livery === S.livery ? 'on' : ''}" aria-pressed="${a.id === S.acId && a.livery === S.livery}">${aircraftSvg(artType(findAircraft(a.id)), a.livery)}${esc(a.label)}</button>`).join('')}</div>
      <div class="tc-tip">${icon('sparkle')}<span>${esc(leg.tip)}</span></div>
      ${!onRoute || S.routeMode !== 'tour' ? `<div class="row-btns"><button class="btn primary" data-tour-restore="1">${icon('route')}Вернуть маршрут тура</button></div>` : ''}
      <div class="row-btns">
        <button class="btn" data-nav="tour">${icon('back')}Все рейсы</button>
        <button class="btn ${done ? '' : 'grad'}" data-tour-done="${leg.id}">${icon('check')}${done ? 'Пройден' : 'Отметить пройденным'}</button>
      </div>
    </div>`;
  hydratePhotos(el);
  drawLandmarks(leg.landmarks, (i) => showPlace(i));
}

function renderPlaces() {
  const el = $('tab-places');
  const leg = tourLeg();
  if (!leg) { el.innerHTML = ''; el.dataset.key = ''; return; }
  if (el.dataset.key === String(leg.id)) return;
  el.dataset.key = String(leg.id);
  el.innerHTML = `<p class="places-intro">Что посмотреть по пути ${leg.roundTrip ? `${CITY[leg.segments[0].dep]} ⇄ ${CITY[leg.segments[0].arr]}` : `${CITY[leg.segments[0].dep]} → ${CITY[leg.segments[0].arr]}`}. Сценарии: ${leg.scenery.map(esc).join(', ')}.</p>` +
    leg.landmarks.map((m, i) => `<article class="place" id="place-${i}">
      <div class="pl-img">${photoBox(m)}</div>
      <div class="pl-body"><h4>${esc(m.name)}</h4><p>${esc(m.text)}</p>
        <div class="pl-actions"><button class="btn" data-place-map="${i}">${icon('pin')}На карте</button>
        <a class="btn ghost" href="https://en.wikipedia.org/wiki/${encodeURIComponent(m.wiki)}" target="_blank" rel="noopener">Википедия</a></div></div>
    </article>`).join('');
  hydratePhotos(el);
}

function showPlace(i) {
  if ($('rightPanel').classList.contains('collapsed')) $('rightPanel').classList.remove('collapsed');
  document.querySelector('#tabs [data-tab="places"]').click();
  $('place-' + i)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function bindTour() {
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-start-leg], [data-nav], [data-tour-seg], [data-tour-ac], [data-tour-done], [data-tour-restore], [data-place-map]');
    if (!t) return;
    if (t.dataset.startLeg) { e.preventDefault(); startTourLeg(+t.dataset.startLeg); }
    else if (t.dataset.nav) { e.preventDefault(); setView(t.dataset.nav); }
    else if (t.dataset.tourSeg) startTourLeg(S.tour.leg, +t.dataset.tourSeg, S.tour.ac || 0);
    else if (t.dataset.tourAc) {
      const leg = tourLeg();
      const opt = leg.aircraft[+t.dataset.tourAc];
      S.tour.ac = +t.dataset.tourAc;
      S.livery = opt.livery;
      $('aircraft').value = opt.id;
      $('aircraft').dispatchEvent(new Event('change'));
    } else if (t.dataset.tourDone) { const v = toggleDone(+t.dataset.tourDone); toast(v ? 'Рейс отмечен пройденным' : 'Отметка снята'); renderTourCard(); }
    else if (t.dataset.tourRestore) startTourLeg(S.tour.leg, S.tour.seg || 0, S.tour.ac || 0);
    else if (t.dataset.placeMap) focusLandmark(+t.dataset.placeMap);
  });
  window.addEventListener('hashchange', () => routeFromHash());
}

function routeFromHash() {
  const h = location.hash;
  const m = h.match(/^#leg-(\d+)/);
  if (m && D.tour) {
    if (!S.tour || S.tour.leg !== +m[1] || S.view !== 'planner') { startTourLeg(+m[1]); return 'leg'; }
    setView('planner', { push: false });
    return true;
  }
  if (h === '#planner') { setView('planner', { push: false }); return true; }
  if (h === '#tour') { setView('tour', { push: false }); return true; }
  return false;
}

// ---------------- старт ----------------
async function start() {
  $('aircraft').innerHTML = ['J', 'T', 'P'].map((c) => `<optgroup label="${{ J: 'Реактивные', T: 'Турбовинтовые', P: 'Поршневые' }[c]}">${AIRCRAFT.filter((a) => a.cat === c).map((a) => `<option value="${a.id}">${a.icao} — ${a.name}</option>`).join('')}</optgroup>`).join('');
  $('aircraft').value = S.acId;
  $('callsign').value = S.callsign;
  if (!S.etd) { const n = new Date(Date.now() + 30 * 60000); S.etd = `${String(n.getUTCHours()).padStart(2, '0')}:${String(Math.floor(n.getUTCMinutes() / 5) * 5).padStart(2, '0')}`; }
  $('etd').value = S.etd;
  $('rules').value = S.rules;
  $('isaDev').value = S.isaDev;
  $('routeText').value = S.routeText;
  document.querySelectorAll('#levelSeg button').forEach((b) => b.classList.toggle('on', b.dataset.level === S.level));
  initMap({ onAirportClick: (icao) => {
    if (!S.dep) setAirport('dep', icao); else setAirport('arr', icao);
  } });
  bind();
  bindTour();
  hydrateIcons();
  if (innerWidth < 760) $('rightPanel').classList.add('collapsed');
  const [status, tour] = await Promise.all([api('/api/status').catch(() => null), loadTour().catch(() => null)]);
  D.status = status;
  D.tour = tour;
  if (S.tour && !tourLeg()) S.tour = null;
  if (S.routeMode === 'tour' && !S.tour) S.routeMode = 'auto';
  renderPlans();
  const routed = routeFromHash();
  if (!routed) setView(S.view === 'planner' ? 'planner' : 'tour');
  renderLeftInfo();
  if (routed !== 'leg') await loadFromState(false);
}

/** Загрузить аэропорты/процедуры/маршрут по текущему состоянию S */
async function loadFromState(fit) {
  const mode = S.routeMode;
  const text = S.routeText;
  $('aircraft').value = S.acId;
  $('callsign').value = S.callsign;
  $('etd').value = S.etd;
  $('rules').value = S.rules;
  $('isaDev').value = S.isaDev;
  $('routeText').value = S.routeText;
  document.querySelectorAll('#levelSeg button').forEach((b) => b.classList.toggle('on', b.dataset.level === S.level));
  D.route = null;
  try {
    await Promise.all([S.dep && loadAirport(S.dep), S.arr && loadAirport(S.arr), S.altn && loadAirport(S.altn)]);
    $('dep').value = S.dep; $('arr').value = S.arr; $('altn').value = S.altn;
    if (arrApt()) D.alternates = await api(`/api/alternates/${arrApt().icao}?minRwy=${findAircraft(S.acId).ldgRwy}`).catch(() => []);
    await refreshProcs();
    if (depApt() && arrApt()) { S.routeText = text; await buildRoute(mode, fit); }
  } catch (e) { toast(e.message); }
  updateAll(fit);
}

// ---------------- сохранённые планы ----------------
function planEntry() {
  const x = collectExport();
  const id = S.planId || `p${Date.now().toString(36)}`;
  const { metarOverride, ...state } = structuredClone(S);
  return {
    id,
    name: `${S.dep}–${S.arr}${S.callsign ? ' ' + S.callsign : ''}`,
    saved: new Date().toISOString(),
    summary: `${x.ac.icao} · ${Math.round(D.plan.dist)} nm · FL${x.fl} · ${fmtTime(D.plan.times.trip)} · ${fmtW(D.plan.fuel.block)} ${U()}`,
    state: { ...state, planId: id, routeMode: 'fixed', fixedRoute: D.route },
    pln: plnText(x),
  };
}

function downloadPln(entry) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([entry.pln], { type: 'application/xml' }));
  a.download = `${entry.state.dep}${entry.state.arr}.pln`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function doSavePlan(download) {
  if (!D.plan || !D.route) { toast('Сначала постройте маршрут'); return; }
  try {
    const e = planEntry();
    savePlan(e);
    S.planId = e.id;
    save();
    renderPlans();
    if (download) downloadPln(e);
    toast(download ? 'План сохранён, .pln скачан' : 'План сохранён');
  } catch (err) { toast(err.message); }
}

function renderPlans() {
  const list = listPlans();
  $('plansCount').textContent = list.length ? String(list.length) : '';
  $('plansList').innerHTML = list.length ? list.map((p) => `
    <div class="plan-item ${p.id === S.planId ? 'active' : ''}">
      <div class="pi-main" data-plan-open="${p.id}" title="Открыть"><b>${esc(p.name)}</b><small>${esc(p.summary)} · ${new Date(p.saved).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small></div>
      <button data-plan-pln="${p.id}" title="Скачать для MSFS">.pln</button>
      <button data-plan-del="${p.id}" title="Удалить">✕</button>
    </div>`).join('') : '<div class="msg" style="margin-bottom:6px">Сохранённых планов пока нет</div>';
}

async function openPlan(id) {
  const p = getPlan(id);
  if (!p) return;
  S = { ...structuredClone(DEFAULTS), ...structuredClone(p.state), metarOverride: S.metarOverride, units: S.units };
  D.alternates = [];
  D.charts = {};
  renderPlans();
  await loadFromState(true);
  toast(`Открыт план ${p.name}`);
}

async function importPln(file) {
  try {
    const f = parsePln(await file.text());
    const fixed = { points: f.points, route: routeString(f.points), sid: null, star: null, airac: D.status?.airac, note: 'Импортировано из MSFS .pln' };
    const sid = f.points.find((p) => p.stage === 'SID'), star = f.points.find((p) => p.stage === 'STAR');
    if (sid) fixed.sid = { name: sid.via };
    if (star) fixed.star = { name: star.via };
    Object.assign(S, {
      dep: f.dep, arr: f.arr, altn: '', rules: f.rules, depRwy: f.depRwy, arrRwy: f.arrRwy, sid: null, star: null, approach: null,
      routeMode: 'fixed', fixedRoute: fixed, routeText: fixed.route, planId: null,
      ovr: { ...S.ovr, cruiseFl: f.fl },
    });
    D.alternates = [];
    D.charts = {};
    await loadFromState(true);
    toast(`Импортирован план ${f.dep}–${f.arr} (${f.points.length} точек)`);
  } catch (e) { toast(e.message); }
}

start();
