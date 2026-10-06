// Строит маршруты тура по актуальным данным FAA (public domain, пакеты @squawk/*):
//   NASR — трассы J/Q (верхние) и V/T (нижние), точки, радиосредства, ВПП и ILS;
//   CIFP — SID, STAR и схемы заходов.
// Для каждого рейса A* выбирает лучшую связку SID → трассы → STAR, затем для КАЖДОЙ ВПП
// подбирается подходящий SID/STAR (выбор ВПП делается на сайте по METAR) и список заходов.
// Результат: public/data/tour.json
// Запуск: npm run build-tour
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { TOUR, LEGS } from './tour-spec.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (pkg, file) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'node_modules', '@squawk', pkg, 'data', file))));

const R_NM = 3440.065, D2R = Math.PI / 180;
const dist = (a, b) => {
  const p1 = a.lat * D2R, p2 = b.lat * D2R, dp = p2 - p1, dl = (b.lon - a.lon) * D2R;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h)));
};
const brg = (a, b) => {
  const p1 = a.lat * D2R, p2 = b.lat * D2R, dl = (b.lon - a.lon) * D2R;
  return (Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / D2R + 360) % 360;
};
const angDiff = (a, b) => Math.abs(((a - b) % 360 + 540) % 360 - 180);

console.time('загрузка FAA');
const awyData = load('airway-data', 'airways.json.gz');
const fixData = load('fix-data', 'fixes.json.gz');
const navData = load('navaid-data', 'navaids.json.gz');
const procData = load('procedure-data', 'procedures.json.gz');
const aptData = load('airport-data', 'airports.json.gz');
console.timeEnd('загрузка FAA');

// ---------- регионы ICAO (K1…K7) для точек и радиосредств ----------
const fixGrid = new Map();
for (const f of fixData.records) {
  if (!f.icaoRegionCode) continue;
  const k = `${Math.floor(f.lat)}:${Math.floor(f.lon)}`;
  (fixGrid.get(k) || fixGrid.set(k, []).get(k)).push(f);
}
function regionNear(lat, lon) {
  let best = null, bd = Infinity;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    for (const f of fixGrid.get(`${Math.floor(lat) + a}:${Math.floor(lon) + b}`) || []) {
      const d = Math.abs(f.lat - lat) + Math.abs(f.lon - lon);
      if (d < bd) { bd = d; best = f.icaoRegionCode; }
    }
  }
  return best || 'K2';
}

const navType = (t) => (/NDB/.test(t || '') ? 'NDB' : /VOR|TACAN|DME/.test(t || '') ? 'VOR' : 'FIX');

// ---------- граф трасс ----------
const nodes = [];
const keyIdx = new Map();
const adj = [];
function node(w) {
  const k = `${w.identifier}@${w.lat.toFixed(2)},${w.lon.toFixed(2)}`;
  let i = keyIdx.get(k);
  if (i !== undefined) return i;
  i = nodes.length;
  const type = w.waypointType === 'NAVAID' ? navType(w.navaidFacilityType) : 'FIX';
  nodes.push({ ident: w.identifier, lat: w.lat, lon: w.lon, type, region: w.icaoRegionCode || regionNear(w.lat, w.lon), name: w.name });
  adj.push([]);
  keyIdx.set(k, i);
  return i;
}
const HIGH = new Set(['JET', 'RNAV_Q']);
const LOW = new Set(['VICTOR', 'RNAV_T']);
for (const a of awyData.records) {
  if (!HIGH.has(a.type) && !LOW.has(a.type)) continue;
  const level = HIGH.has(a.type) ? 'high' : 'low';
  for (let k = 1; k < a.waypoints.length; k++) {
    const w1 = a.waypoints[k - 1], w2 = a.waypoints[k];
    if (w1.lat == null || w2.lat == null) continue;
    const i = node(w1), j = node(w2);
    const d = dist(w1, w2);
    const mea = Math.max(w1.minimumEnrouteAltitudeFt || 0, w1.gnssMinimumEnrouteAltitudeFt || 0);
    adj[i].push({ to: j, awy: a.designation, level, d, mea });
    adj[j].push({ to: i, awy: a.designation, level, d, mea });
  }
}
const nodeGrid = new Map();
nodes.forEach((n, i) => { const k = `${Math.floor(n.lat)}:${Math.floor(n.lon)}`; (nodeGrid.get(k) || nodeGrid.set(k, []).get(k)).push(i); });
function nearNodes(p, radius, filter = () => true) {
  const out = [];
  const r = Math.ceil(radius / 50);
  for (let a = -r; a <= r; a++) for (let b = -r - 1; b <= r + 1; b++) {
    for (const i of nodeGrid.get(`${Math.floor(p.lat) + a}:${Math.floor(p.lon) + b}`) || []) {
      const d = dist(p, nodes[i]);
      if (d <= radius && filter(i)) out.push({ i, d });
    }
  }
  return out.sort((x, y) => x.d - y.d);
}
function findNode(ident, near, level) {
  let best = null, bd = 8;
  for (const { i, d } of nearNodes(near, 8)) {
    if (nodes[i].ident !== ident) continue;
    if (!adj[i].some((e) => e.level === level)) continue;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// ---------- аэропорты (NASR) ----------
const airports = new Map();
for (const a of aptData.records) if (a.icao) airports.set(a.icao, a);

function airportInfo(icao) {
  const a = airports.get(icao);
  if (!a) throw new Error('Нет аэропорта ' + icao);
  return {
    icao, name: a.name, city: a.city, lat: a.lat, lon: a.lon, elev: Math.round(a.elevationFt || 0),
    runways: (a.runways || []).filter((r) => !/^H/.test(r.id) && !/X/.test(r.id)).map((r) => ({
      length: r.lengthFt, width: r.widthFt, surface: r.surfaceType || '', lighted: !!r.lighting,
      ends: r.ends.map((e) => ({
        ident: e.id, hdg: e.trueHeadingDeg ?? null, lat: e.lat ?? null, lon: e.lon ?? null, elev: e.elevationFt ?? null,
        ils: e.ils && /ILS|LOC/.test(e.ils.systemType || '') ? [{
          ident: e.ils.identifier || '', freq: e.ils.localizerFrequencyMhz,
          crs: e.ils.localizerMagneticCourseDeg, kind: /GS|ILS/.test(e.ils.systemType) ? 'ILS' : 'LOC',
          cat: (e.ils.category || 'I').replace(/^(III|II|I).*/, '$1'), gs: e.ils.glideSlopeAngleDeg || null, magnetic: true,
        }] : [],
      })),
    })),
    freqs: (a.frequencies || []).filter((f) => /ATIS|TWR|GND|LCL|CLNC|CD|APCH|DEP|CTAF|UNICOM/i.test(f.use || '')).slice(0, 12).map((f) => ({ type: f.use, mhz: f.frequencyMhz })),
  };
}

// ---------- процедуры ----------
const procsByApt = new Map();
for (const p of procData.records) for (const a of p.airports) (procsByApt.get(a) || procsByApt.set(a, []).get(a)).push(p);

function fmtAlt(c) {
  if (!c || !c.primaryFt) return '';
  const a = c.primaryFt >= 18000 ? 'FL' + Math.round(c.primaryFt / 100) : String(c.primaryFt);
  if (c.descriptor === '+') return a + '+';
  if (c.descriptor === '-') return a + '-';
  if (c.descriptor === 'B' && c.secondaryFt) return `${c.secondaryFt}–${c.primaryFt}`;
  return a;
}
function legPoints(legs) {
  const out = [];
  for (const l of legs) {
    if (!l.fixIdentifier || l.lat == null || l.category === 'RUNWAY' || l.category === 'AIRPORT') continue;
    if (out.length && out[out.length - 1].ident === l.fixIdentifier) {
      if (l.altitudeConstraint) out[out.length - 1].alt = fmtAlt(l.altitudeConstraint);
      continue;
    }
    out.push({
      ident: l.fixIdentifier, lat: +l.lat.toFixed(6), lon: +l.lon.toFixed(6),
      type: l.category === 'NAVAID' ? 'VOR' : 'FIX', region: l.icaoRegionCode || regionNear(l.lat, l.lon),
      alt: fmtAlt(l.altitudeConstraint), spd: l.speedConstraint?.speedKt || null,
    });
  }
  return out;
}
const isRwyTrans = (t) => /^RW\d/.test(t.name);
function rwyMatches(transName, rwy) {
  const t = transName.replace(/^RW/, '');
  const r = rwy.replace(/^0?(\d)$/, '0$1');
  if (t === r) return true;
  if (t.endsWith('B') && r.startsWith(t.slice(0, -1)) && r.length === t.length) return true;
  if (/^\d\d$/.test(t) && r.startsWith(t)) return true;
  return false;
}
function procServes(p, rwy) {
  const rt = p.transitions.filter(isRwyTrans);
  if (!rt.length) return true; // без привязки к ВПП
  return rt.some((t) => rwyMatches(t.name, rwy));
}
function commonLegs(p, icao) {
  const c = p.commonRoutes.find((r) => !r.airports || r.airports.includes(icao)) || p.commonRoutes[0];
  return c ? c.legs : [];
}
function enrTransitions(p) {
  const t = p.transitions.filter((x) => !isRwyTrans(x) && x.name);
  return t.length ? t : [null];
}
function rwyTransFor(p, rwy) {
  return p.transitions.find((t) => isRwyTrans(t) && rwyMatches(t.name, rwy)) || null;
}
function sidLegs(p, icao, rwy, enr) {
  const rt = rwy ? rwyTransFor(p, rwy) : p.transitions.find(isRwyTrans);
  return legPoints([...(rt ? rt.legs : []), ...commonLegs(p, icao), ...(enr ? enr.legs : [])]);
}
function starLegs(p, icao, rwy, enr) {
  const rt = rwy ? rwyTransFor(p, rwy) : p.transitions.find(isRwyTrans);
  return legPoints([...(enr ? enr.legs : []), ...commonLegs(p, icao), ...(rt ? rt.legs : [])]);
}
const pathLen = (from, pts, to) => {
  let d = 0, prev = from;
  for (const p of pts) { d += dist(prev, p); prev = p; }
  return d + (to ? dist(prev, to) : 0);
};

// ---------- A* ----------
class Heap {
  constructor() { this.a = []; }
  push(k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a; const top = a[0]; const last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { let c = 2 * i + 1; if (c >= a.length) break; if (c + 1 < a.length && a[c + 1][0] < a[c][0]) c++; if (a[c][0] >= a[i][0]) break; [a[c], a[i]] = [a[i], a[c]]; i = c; } } return top[1]; }
  get size() { return this.a.length; }
}

function astar(starts, ends, goal, level) {
  const N = nodes.length;
  const g = new Float64Array(N).fill(Infinity), from = new Int32Array(N).fill(-1);
  const via = new Array(N);
  const h = (i) => dist(nodes[i], goal);
  const heap = new Heap();
  for (const [i, s] of starts) if (s.cost < g[i]) { g[i] = s.cost; via[i] = 'DCT'; heap.push(s.cost + h(i), i); }
  let best = Infinity, bestEnd = -1;
  const closed = new Uint8Array(N);
  while (heap.size) {
    const u = heap.pop();
    if (closed[u]) continue;
    closed[u] = 1;
    if (g[u] + h(u) >= best) break;
    const e = ends.get(u);
    if (e && g[u] + e.cost < best) { best = g[u] + e.cost; bestEnd = u; }
    for (const ed of adj[u]) {
      if (ed.level !== level) continue;
      let w = ed.d * (ed.awy[0] === 'Q' || ed.awy[0] === 'T' ? 0.99 : 1);
      if (via[u] !== ed.awy) w += 6;
      const c = g[u] + w;
      if (c < g[ed.to]) { g[ed.to] = c; from[ed.to] = u; via[ed.to] = ed.awy; heap.push(c + h(ed.to), ed.to); }
    }
  }
  if (bestEnd < 0) return null;
  const path = [];
  for (let c = bestEnd; c !== -1; c = from[c]) path.push({ i: c, via: via[c] });
  path.reverse();
  path[0].via = 'DCT';
  return { path, cost: best };
}

// ---------- расчёт рейса ----------
function connectFree(apt, crs, level, reverse) {
  const m = new Map();
  for (const r of [40, 80, 140]) {
    for (const { i, d } of nearNodes(apt, r, (i) => adj[i].some((e) => e.level === level)).slice(0, 30)) {
      const off = angDiff(reverse ? brg(nodes[i], apt) : brg(apt, nodes[i]), crs);
      if (off > 75 && d > 12) continue;
      m.set(i, { cost: d * 1.25 + 8 });
    }
    if (m.size >= 4) break;
  }
  return m;
}

function planLeg(leg) {
  const dep = airportInfo(leg.dep), arr = airportInfo(leg.arr);
  const level = leg.level === 'high' ? 'high' : 'low';
  const crs = brg(dep, arr);
  const depProcs = (procsByApt.get(leg.dep) || []).filter((p) => p.type === 'SID');
  const arrProcs = (procsByApt.get(leg.arr) || []).filter((p) => p.type === 'STAR');

  // кандидаты SID: выход на трассу
  const starts = new Map();
  for (const p of depProcs) {
    for (const enr of enrTransitions(p)) {
      const pts = sidLegs(p, leg.dep, null, enr);
      if (!pts.length) continue;
      const exit = pts[pts.length - 1];
      const ni = findNode(exit.ident, exit, level);
      const off = angDiff(brg(dep, exit), crs);
      const cost = pathLen(dep, pts) + (off > 100 ? 150 : off > 60 ? 40 : 0);
      const cand = { proc: p, enr, exit, pts };
      if (ni != null) {
        if (!starts.has(ni) || starts.get(ni).cost > cost) starts.set(ni, { cost, sid: cand });
      } else {
        // выход SID не на трассе — DCT к ближайшим узлам по курсу
        for (const { i, d } of nearNodes(exit, 60, (i) => adj[i].some((e) => e.level === level)).slice(0, 8)) {
          if (angDiff(brg(exit, nodes[i]), crs) > 70) continue;
          const c = cost + d * 1.2 + 10;
          if (!starts.has(i) || starts.get(i).cost > c) starts.set(i, { cost: c, sid: cand, dctFrom: exit });
        }
      }
    }
  }
  const free = connectFree(dep, crs, level, false);
  for (const [i, s] of free) {
    const c = s.cost + (depProcs.length && level === 'high' ? 60 : 0); // для лайнеров предпочитаем SID
    if (!starts.has(i) || starts.get(i).cost > c) starts.set(i, { cost: c, sid: null });
  }

  const ends = new Map();
  const crsBack = brg(arr, dep);
  for (const p of arrProcs) {
    for (const enr of enrTransitions(p)) {
      const pts = starLegs(p, leg.arr, null, enr);
      if (!pts.length) continue;
      const entry = pts[0];
      const ni = findNode(entry.ident, entry, level);
      const off = angDiff(brg(arr, entry), crsBack);
      const cost = pathLen(entry, pts.slice(1), arr) + (off > 100 ? 150 : off > 60 ? 40 : 0);
      const cand = { proc: p, enr, entry, pts };
      if (ni != null) {
        if (!ends.has(ni) || ends.get(ni).cost > cost) ends.set(ni, { cost, star: cand });
      } else {
        for (const { i, d } of nearNodes(entry, 60, (i) => adj[i].some((e) => e.level === level)).slice(0, 8)) {
          if (angDiff(brg(entry, nodes[i]), crsBack) > 70) continue;
          const c = cost + d * 1.2 + 10;
          if (!ends.has(i) || ends.get(i).cost > c) ends.set(i, { cost: c, star: cand, dctTo: entry });
        }
      }
    }
  }
  for (const [i, s] of connectFree(arr, crs, level, true)) {
    const c = s.cost + (arrProcs.length && level === 'high' ? 60 : 0);
    if (!ends.has(i) || ends.get(i).cost > c) ends.set(i, { cost: c, star: null });
  }

  const res = astar(starts, ends, arr, level);
  if (!res) throw new Error(`Нет маршрута ${leg.dep}-${leg.arr}`);
  const st = starts.get(res.path[0].i);
  const en = ends.get(res.path[res.path.length - 1].i);
  const sid = st.sid, star = en.star;

  // трассовая часть (без точек SID/STAR)
  let enroute = res.path.map((s) => ({ ...nodes[s.i], via: s.via, name: undefined }));
  enroute.forEach((p) => { p.lat = +p.lat.toFixed(6); p.lon = +p.lon.toFixed(6); });
  if (sid && enroute.length && enroute[0].ident === sid.exit.ident) enroute[0].via = 'SID';
  // минимальная высота по MEA (для нижних трасс)
  let mea = 0;
  for (let k = 1; k < res.path.length; k++) {
    const e = adj[res.path[k - 1].i].find((x) => x.to === res.path[k].i && x.awy === res.path[k].via);
    if (e) mea = Math.max(mea, e.mea || 0);
  }

  // --- варианты по ВПП вылета ---
  const enrIdents = enroute.map((p) => p.ident);
  const depRunways = {};
  for (const rw of dep.runways.flatMap((r) => r.ends.map((e) => e.ident))) {
    let opt = null;
    if (sid && procServes(sid.proc, rw)) {
      opt = { sid: sid.proc.identifier, trans: sid.enr?.name || null, legs: sidLegs(sid.proc, leg.dep, rw, sid.enr), join: 0 };
    } else {
      // другой SID, выходящий на одну из первых точек маршрута
      let best = null;
      for (const p of depProcs) {
        if (!procServes(p, rw)) continue;
        for (const enr of enrTransitions(p)) {
          const pts = sidLegs(p, leg.dep, rw, enr);
          if (!pts.length) continue;
          const j = enrIdents.indexOf(pts[pts.length - 1].ident);
          if (j < 0 || j > 4) continue;
          if (!best || j < best.j) best = { p, enr, pts, j };
        }
      }
      if (best) opt = { sid: best.p.identifier, trans: best.enr?.name || null, legs: best.pts, join: best.j };
    }
    depRunways[rw] = opt || { sid: null, trans: null, legs: [], join: 0, vectors: true };
    depRunways[rw].others = depProcs.filter((p) => procServes(p, rw)).map((p) => p.identifier);
  }

  // --- варианты по ВПП прилёта ---
  const arrRunways = {};
  for (const rw of arr.runways.flatMap((r) => r.ends.map((e) => e.ident))) {
    let opt = null;
    if (star && procServes(star.proc, rw)) {
      opt = { star: star.proc.identifier, trans: star.enr?.name || null, legs: starLegs(star.proc, leg.arr, rw, star.enr), cut: enroute.length };
    } else {
      let best = null;
      for (const p of arrProcs) {
        if (!procServes(p, rw)) continue;
        for (const enr of enrTransitions(p)) {
          const pts = starLegs(p, leg.arr, rw, enr);
          if (!pts.length) continue;
          const j = enrIdents.lastIndexOf(pts[0].ident);
          if (j < 0 || j < enroute.length - 5) continue;
          if (!best || j > best.j) best = { p, enr, pts, j };
        }
      }
      if (best) opt = { star: best.p.identifier, trans: best.enr?.name || null, legs: best.pts, cut: best.j + 1 };
    }
    const apps = (procsByApt.get(leg.arr) || []).filter((p) => p.type === 'IAP' && p.runway && rwyMatches(p.runway.replace(/^RW/, ''), rw) && p.runway.replace(/^RW/, '') === rw.replace(/^0?(\d)$/, '0$1'))
      .map((p) => ({
        id: p.identifier, name: p.name, type: p.approachType,
        transitions: p.transitions.map((t) => t.name).filter(Boolean),
        legs: legPoints(commonLegs(p, leg.arr)),
      }))
      .sort((a, b) => order(a.type) - order(b.type));
    arrRunways[rw] = { ...(opt || { star: null, trans: null, legs: [], cut: enroute.length, vectors: true }), approaches: apps };
    arrRunways[rw].others = arrProcs.filter((p) => procServes(p, rw)).map((p) => p.identifier);
  }

  // строка маршрута (как в SimBrief/MSFS): SID TRANS AWY FIX … ENTRY STAR
  const tokens = [];
  if (sid) tokens.push(sid.proc.identifier, sid.exit.ident);
  enroute.forEach((p, k) => {
    if (k === 0) { if (!sid || p.ident !== sid.exit.ident) tokens.push(...(sid ? ['DCT'] : []), p.ident); return; }
    const next = enroute[k + 1];
    if (next && next.via === p.via && p.via !== 'DCT') return;
    tokens.push(p.via, p.ident);
  });
  if (star) {
    if (tokens[tokens.length - 1] !== star.entry.ident) tokens.push('DCT', star.entry.ident);
    tokens.push(star.proc.identifier);
  }

  return {
    dep, arr, level, enroute, mea,
    sid: sid ? { name: sid.proc.identifier, trans: sid.enr?.name || null, exit: sid.exit.ident } : null,
    star: star ? { name: star.proc.identifier, trans: star.enr?.name || null, entry: star.entry.ident } : null,
    depRunways, arrRunways,
    route: tokens.join(' '),
    distance: Math.round(pathLen(dep, [...(sid ? sid.pts : []), ...enroute, ...(star ? star.pts : [])], arr)),
    gc: Math.round(dist(dep, arr)),
  };
}

function order(t) {
  return ['ILS', 'RNAV_RNP', 'RNAV', 'GLS', 'LOC', 'LDA', 'VOR_DME', 'VOR', 'NDB', 'LOC_BC'].indexOf(t) + 1 || 50;
}

// ПВП-маршрут по радиосредствам
function vfrLeg(leg, depIcao, arrIcao, idents, alt) {
  const dep = airportInfo(depIcao), arr = airportInfo(arrIcao);
  const enroute = idents.map((id) => {
    const cand = navData.records.filter((n) => n.identifier === id && /VOR/.test(n.type)).sort((a, b) => dist(a, dep) - dist(b, dep))[0];
    if (!cand) throw new Error('Нет VOR ' + id);
    return { ident: id, lat: +cand.lat.toFixed(6), lon: +cand.lon.toFixed(6), type: 'VOR', region: regionNear(cand.lat, cand.lon), via: 'DCT', freq: cand.frequencyMhz, name: cand.name };
  });
  const runwaysAny = (a) => Object.fromEntries(a.runways.flatMap((r) => r.ends.map((e) => [e.ident, { sid: null, legs: [], join: 0, vectors: true, others: [] }])));
  const arrRw = Object.fromEntries(arr.runways.flatMap((r) => r.ends.map((e) => [e.ident, {
    star: null, legs: [], cut: enroute.length, vectors: true, others: [],
    approaches: [{ id: 'VFR' + e.ident, name: `Визуальный заход ВПП ${e.ident}`, type: 'VISUAL', transitions: [], legs: [] },
      ...(procsByApt.get(arrIcao) || []).filter((p) => p.type === 'IAP' && p.runway === 'RW' + e.ident).map((p) => ({ id: p.identifier, name: p.name, type: p.approachType, transitions: [], legs: legPoints(commonLegs(p, arrIcao)) }))],
  }])));
  return {
    dep, arr, level: 'vfr', enroute, mea: 0, sid: null, star: null,
    depRunways: runwaysAny(dep), arrRunways: arrRw,
    route: idents.join(' DCT '), fl: alt / 100, rules: 'V',
    distance: Math.round(pathLen(dep, enroute, arr)), gc: Math.round(dist(dep, arr)),
  };
}

// эшелон по полукруговой системе не ниже MEA
function suggestAlt(leg, plan) {
  if (plan.rules === 'V') return plan.fl;
  if (plan.level === 'high') return null; // лайнерам — авторасчёт на сайте
  const east = brg(plan.dep, plan.arr) < 180;
  const floor = Math.max(plan.mea || 0, Math.max(plan.dep.elev, plan.arr.elev) + 3000);
  let a = east ? 3000 : 4000;
  while (a < floor) a += 2000;
  return Math.min(a, 17000) / 100;
}

const out = { ...TOUR, airac: procData.meta?.cifpCycleDate || '', nasr: awyData.meta?.nasrCycleDate || '', generatedAt: new Date().toISOString(), airports: {}, legs: [] };
for (const spec of LEGS) {
  const segs = [];
  if (spec.level === 'vfr') {
    segs.push(vfrLeg(spec, spec.dep, spec.arr, spec.vfr.out, spec.vfr.outAlt));
    if (spec.roundTrip) segs.push(vfrLeg(spec, spec.arr, spec.dep, spec.vfr.back, spec.vfr.backAlt));
  } else {
    segs.push(planLeg(spec));
  }
  for (const s of segs) {
    for (const a of [s.dep, s.arr]) out.airports[a.icao] = a;
    s.fl = s.fl ?? suggestAlt(spec, s);
    console.log(`${spec.id}: ${s.dep.icao}-${s.arr.icao} ${s.distance} nm (ортодромия ${s.gc}) | ${s.route}${s.fl ? ' | FL' + s.fl : ''}`);
  }
  const { vfr, ...rest } = spec;
  out.legs.push({
    ...rest,
    segments: segs.map((s) => ({
      dep: s.dep.icao, arr: s.arr.icao, level: s.level, rules: s.rules || 'I', fl: s.fl, route: s.route,
      distance: s.distance, sid: s.sid, star: s.star, enroute: s.enroute.map(({ name, ...p }) => p),
      depRunways: s.depRunways, arrRunways: s.arrRunways,
    })),
  });
}
const dest = path.join(ROOT, 'public', 'data', 'tour.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out));
console.log(`→ ${path.relative(ROOT, dest)} (${(fs.statSync(dest).size / 1024).toFixed(0)} КБ), CIFP ${out.airac}, NASR ${out.nasr}`);
