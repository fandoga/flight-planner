import { AIRCRAFT, findAircraft, PAX_MASS, BAG_MASS } from './aircraft.js';
import { parseMetar, describeMetar, rankRunways } from './metar.js';
import { computePlan, autoCruiseFl, cruiseTas, bearing, distNm, interpolate, fmtTime } from './calc.js';
import { initMap, drawRoute } from './map.js';
import { exportPlan } from './export.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------- состояние ----------------
const DEFAULTS = {
  dep: 'UUEE', arr: 'ULLI', altn: '', callsign: 'AFL001', etd: '', rules: 'I',
  acId: 'A20N', level: 'high',
  depRwy: null, arrRwy: null, sid: null, star: null, approach: null,
  routeText: '', routeMode: 'auto',
  ovr: { cruiseFl: null, cruiseSpd: null, windComp: null },
  isaDev: 0,
  load: { pax: null, bagsPerPax: BAG_MASS, cargo: 0 },
  fuel: { contPct: 5, extra: 0, finalMin: 30, taxi: null, altnFuel: null, block: null },
  units: 'kg',
  metarOverride: {},
};
let S = load();
const D = { apt: {}, wx: {}, procs: {}, alternates: [], route: null, plan: null, windAuto: null, windInfo: '', charts: {}, status: null };

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

// ---------------- выбор ВПП и заходов ----------------
function routeBearing() {
  const d = depApt(), a = arrApt();
  if (!d || !a) return null;
  const pts = D.route?.points || [];
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
    else {
      r = await api('/api/route', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dep: d.icao, arr: a.icao, depRwy, arrRwy, level: S.level, sid: S.sid, star: S.star, text: mode === 'text' ? S.routeText : '' }),
      });
    }
    if (seq !== routeSeq) return;
    D.route = r;
    if (mode !== 'text') S.routeText = r.route;
    $('routeText').value = S.routeText;
    const msgs = [];
    if (r.note) msgs.push(`<span class="warn">${esc(r.note)}</span>`);
    for (const w of r.warnings || []) msgs.push(`<span class="warn">${esc(w)}</span>`);
    msgs.push(`${r.points.length} точек${r.sid ? ` · SID ${r.sid.name}` : ''}${r.star ? ` · STAR ${r.star.name}` : ''}`);
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
function updateAll(fit) {
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
  const sidList = dp?.sid || [], starList = ap?.star || [];
  setOptions($('sid'), [
    { value: '', label: D.route?.sid ? `Авто: ${D.route.sid.name}` : dp?.cifp ? 'Авто' : 'Нет CIFP — вектора/DCT' },
    ...sidList.map((p) => ({ value: p.name, label: p.name })),
  ], S.sid || '');
  setOptions($('star'), [
    { value: '', label: D.route?.star ? `Авто: ${D.route.star.name}` : ap?.cifp ? 'Авто' : 'Нет CIFP — вектора/DCT' },
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
  if (!dp?.cifp) msgs.push('SID/STAR: в базе нет CIFP — положите данные X-Plane в data/navdata (см. README)');
  $('procMsg').innerHTML = msgs.join('<br>');
}

function renderLeftInfo() {
  const ac = findAircraft(S.acId);
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
  if (D.status) $('airacBadge').textContent = `AIRAC ${D.status.airac}${D.status.cifp ? ' + CIFP' : ''}`;
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
    ['Эшелон', `FL${currentFl()}`],
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
    return `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(a)}" y2="${y(a)}" stroke="#1d2a47" stroke-dasharray="2 3"/><text x="${pad.l - 4}" y="${y(a) + 3}" fill="#5a6a8c" font-size="9" text-anchor="end">${a >= 10000 ? 'FL' + a / 100 : a}</text>`;
  }).join('');
  const labels = p.log.filter((r, i) => i === 0 || i === p.log.length - 1 || r.type === 'TOC' || r.type === 'TOD')
    .map((r) => `<circle cx="${x(r.cum)}" cy="${y(r.alt)}" r="3" fill="${r.type === 'TOC' || r.type === 'TOD' ? '#fbbf24' : '#60a5fa'}"/><text x="${Math.min(w - 30, Math.max(pad.l + 10, x(r.cum)))}" y="${h - 6}" fill="#8796b5" font-size="9" text-anchor="middle">${esc(r.ident)}</text>`).join('');
  return `<svg class="profile" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <defs><linearGradient id="pg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3b82f6" stop-opacity=".35"/><stop offset="1" stop-color="#3b82f6" stop-opacity="0"/></linearGradient></defs>
    ${grid}<polygon points="${x(0)},${y(0)} ${pts} ${x(p.dist)},${y(0)}" fill="url(#pg)"/><polyline points="${pts}" fill="none" stroke="#60a5fa" stroke-width="2"/>${labels}</svg>`;
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
      S.routeMode = 'auto';
      await buildRoute('auto');
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
    if (!k || !D.plan) return;
    const msg = exportPlan(k, collectExport());
    if (msg) toast(msg);
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
    approach: app, airac: D.status?.airac, metar: { dep: metarOf(S.dep)?.raw, arr: metarOf(S.arr)?.raw, altn: altnApt() ? metarOf(altnApt().icao)?.raw : null },
    units: S.units,
  };
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
  if (innerWidth < 760) $('rightPanel').classList.add('collapsed');
  D.status = await api('/api/status').catch(() => null);
  renderLeftInfo();
  const mode = S.routeMode;
  const text = S.routeText;
  try {
    await Promise.all([S.dep && loadAirport(S.dep), S.arr && loadAirport(S.arr), S.altn && loadAirport(S.altn)]);
    $('dep').value = S.dep; $('arr').value = S.arr; $('altn').value = S.altn;
    if (arrApt()) D.alternates = await api(`/api/alternates/${arrApt().icao}?minRwy=${findAircraft(S.acId).ldgRwy}`).catch(() => []);
    await refreshProcs();
    if (depApt() && arrApt()) { S.routeText = text; await buildRoute(mode); }
  } catch (e) { toast(e.message); }
  updateAll(false);
}

start();
