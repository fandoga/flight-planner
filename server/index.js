import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AirportDb } from './airports.js';
import { NavDb, procMatchesRunway } from './navdata.js';
import { Router } from './router.js';
import { getWeather, getWinds } from './weather.js';
import { getCharts } from './charts.js';
import { distNm } from './geo.js';
import { fetchData } from '../scripts/fetch-data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'data', 'raw');
const USER_NAV = path.join(ROOT, 'data', 'navdata');
const PORT = process.env.PORT || 3000;

await fetchData();
console.time('Загрузка баз');
const airports = new AirportDb().load(RAW);
const nav = new NavDb().load({ rawDir: RAW, userDir: USER_NAV });
const router = new Router(nav);
console.timeEnd('Загрузка баз');
console.log(`Аэропортов: ${airports.list.length}, точек: ${nav.nodes.length}, ILS: ${nav.ils.length}, AIRAC ${nav.cycle} (${nav.source}), CIFP: ${nav.cifpDir ? 'да' : 'нет'}`);

const app = express();
app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.join(ROOT, 'public')));
app.use('/vendor/leaflet', express.static(path.join(ROOT, 'node_modules', 'leaflet', 'dist')));

const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  console.error(e);
  res.status(500).json({ error: e.message });
});

const aptBrief = (a) => ({ icao: a.icao, iata: a.iata, name: a.name, city: a.city, country: a.country, lat: a.lat, lon: a.lon, elev: a.elev, type: a.type, maxRwy: a.maxRwy });

function aptFull(a) {
  const ils = nav.ilsForAirport(a);
  const procs = nav.procedures(a.icao);
  return {
    ...aptBrief(a),
    countryName: airports.countries.get(a.country) || a.country,
    runways: a.runways.map((rw) => ({
      length: rw.length, width: rw.width, surface: rw.surface, lighted: rw.lighted,
      ends: rw.ends.map((e) => ({ ...e, ils: ils.filter((l) => l.runway === e.ident).map((l) => ({ ident: l.ident, freq: l.freq, crs: l.crs, kind: l.kind, gs: l.gs, cat: (l.name.match(/cat-?([IV]+)/i) || [])[1] || '' })) })),
    })),
    freqs: a.freqs,
    procedures: procs ? { sid: [...procs.SID.keys()], star: [...procs.STAR.keys()], app: [...procs.APPCH.keys()] } : null,
  };
}

function needApt(code, res) {
  const a = airports.get(code);
  if (!a) res.status(404).json({ error: `Аэропорт ${code} не найден` });
  return a;
}

app.get('/api/status', (req, res) => res.json({
  airports: airports.list.length, navPoints: nav.nodes.length, ils: nav.ils.length,
  airac: nav.cycle, navSource: nav.source, cifp: !!nav.cifpDir,
}));

app.get('/api/airport/search', (req, res) => res.json(airports.search(String(req.query.q || '')).map(aptBrief)));

app.get('/api/airport/:code', (req, res) => {
  const a = needApt(req.params.code, res);
  if (a) res.json(aptFull(a));
});

app.get('/api/airports', (req, res) => {
  const [s, w, n, e] = String(req.query.bbox || '').split(',').map(Number);
  const z = Number(req.query.z) || 5;
  const minRank = z >= 8 ? 1 : z >= 6 ? 2 : 3;
  res.json(airports.inBounds(s, w, n, e, minRank, 1500).map((a) => [a.icao, a.lat, a.lon, a.rank]));
});

app.get('/api/navaids', (req, res) => {
  const [s, w, n, e] = String(req.query.bbox || '').split(',').map(Number);
  const z = Number(req.query.z) || 7;
  const filter = z >= 9 ? (i, nd) => nd.type !== 'TFIX' : (i, nd) => nd.type === 'VOR' || nd.type === 'NDB' || (z >= 8 && nav.adj[i]);
  res.json(nav.inBounds(s, w, n, e, filter, 2500).map((i) => {
    const nd = nav.nodes[i];
    return [nd.ident, nd.lat, nd.lon, nd.type, nd.freq || null];
  }));
});

app.get('/api/airways', (req, res) => {
  const [s, w, n, e] = String(req.query.bbox || '').split(',').map(Number);
  const out = [];
  const seen = new Set();
  for (const i of nav.inBounds(s, w, n, e, (i) => !!nav.adj[i], 6000)) {
    for (const ed of nav.adj[i]) {
      const k = i < ed.to ? `${i}-${ed.to}` : `${ed.to}-${i}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const a = nav.nodes[i], b = nav.nodes[ed.to];
      out.push([a.lat, a.lon, b.lat, b.lon, ed.awy, ed.level]);
      if (out.length > 8000) return res.json(out);
    }
  }
  res.json(out);
});

app.get('/api/procedures/:code', (req, res) => {
  const a = needApt(req.params.code, res);
  if (!a) return;
  const rwy = req.query.rwy ? String(req.query.rwy) : null;
  const procs = nav.procedures(a.icao);
  const list = (m) => procs ? [...m.values()].filter((p) => !rwy || procMatchesRunway(p, rwy)).map((p) => ({ name: p.name, type: p.approachType, transitions: [...p.enrTrans.keys(), ...p.appTrans.keys()] })) : [];
  res.json({
    cifp: !!procs,
    sid: procs ? list(procs.SID) : [],
    star: procs ? list(procs.STAR) : [],
    approaches: procs ? router.approaches(a, rwy) : [],
  });
});

app.post('/api/route', (req, res) => {
  const { dep: d, arr: r, depRwy, arrRwy, level, text, useProcedures, sid, star } = req.body || {};
  const dep = needApt(d, res); if (!dep) return;
  const arr = airports.get(r);
  if (!arr) return res.status(404).json({ error: `Аэропорт ${r} не найден` });
  const opts = { dep, arr, depRwy, arrRwy, level, useProcedures, sid, star, airports };
  const t0 = Date.now();
  const result = text && text.trim() ? router.parse({ ...opts, text }) : router.build(opts);
  result.ms = Date.now() - t0;
  result.dep = aptBrief(dep);
  result.arr = aptBrief(arr);
  res.json(result);
});

app.get('/api/alternates/:code', (req, res) => {
  const a = needApt(req.params.code, res);
  if (!a) return;
  const minRwy = Number(req.query.minRwy) || 6000;
  const list = airports.nearby(a.lat, a.lon, 250, (x) => x !== a && /^[A-Z]{4}$/.test(x.icao) && x.rank >= 2 && x.maxRwy >= minRwy && x.hard)
    .map((x) => ({ ...aptBrief(x), dist: Math.round(distNm(a.lat, a.lon, x.lat, x.lon)), scheduled: x.scheduled }))
    .filter((x) => x.dist >= 15 && !/air base|airbase|military|авиабаза/i.test(x.name))
    .map((x) => ({ ...x, _s: x.dist - (x.scheduled ? 90 : 0) - (x.type === 'large_airport' ? 15 : 0) - (x.country === a.country ? 60 : 0) }))
    .sort((x, y) => x._s - y._s)
    .map(({ _s, ...x }) => x)
    .slice(0, 8);
  res.json(list);
});

app.get('/api/weather/:code', wrap(async (req, res) => {
  const a = airports.get(req.params.code);
  res.json(await getWeather(a ? a.icao : req.params.code));
}));

app.get('/api/winds', wrap(async (req, res) => {
  const pts = String(req.query.pts || '').split(';').map((s) => s.split(',').map(Number)).filter((p) => p.length === 2 && p.every(Number.isFinite)).slice(0, 20).map(([lat, lon]) => ({ lat, lon }));
  if (!pts.length) return res.status(400).json({ error: 'pts' });
  res.json(await getWinds(pts, Number(req.query.hpa) || 250));
}));

app.get('/api/charts/:code', wrap(async (req, res) => {
  const a = needApt(req.params.code, res);
  if (a) res.json(await getCharts(a));
}));

if (fs.existsSync(path.join(ROOT, 'public', 'index.html'))) {
  app.get('*', (req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));
}

app.listen(PORT, () => console.log(`Flight Planner: http://localhost:${PORT}`));
