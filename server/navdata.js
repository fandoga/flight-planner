// Навигационная база в формате X-Plane (fix/nav/awy.dat) + процедуры CIFP.
// Поддерживаются форматы 600/640/810 (база FlightGear/Robin Peel, GPL)
// и 1100/1150/1200 (X-Plane 11/12 earth_*.dat, в т.ч. актуальные AIRAC).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { distNm, bearing, angleDiff, crossTrackNm } from './geo.js';

function readMaybeGz(file) {
  const buf = fs.readFileSync(file);
  return (file.endsWith('.gz') ? zlib.gunzipSync(buf) : buf).toString('latin1');
}

function header(text) {
  const nl1 = text.indexOf('\n');
  const nl2 = text.indexOf('\n', nl1 + 1);
  const line = text.slice(nl1 + 1, nl2);
  return { version: parseInt(line, 10) || 0, cycle: (line.match(/cycle\s+([\d.]+)/i) || [])[1] || '', start: nl2 + 1, line };
}

const NAV_TYPES = { 2: 'NDB', 3: 'VOR', 12: 'DME', 13: 'DME' };

export class NavDb {
  constructor() {
    this.nodes = [];            // {id, ident, lat, lon, type, region}
    this.byIdent = new Map();   // ident -> [nodeIdx]
    this.keyIdx = new Map();    // уникальный ключ -> nodeIdx
    this.adj = [];              // nodeIdx -> [{to, awy, level, dist}]
    this.ils = [];              // {ident, lat, lon, freq, crs, apt, rwy, cat, gs}
    this.navaids = [];          // индексы nodes, являющихся радиосредствами
    this.cycle = '';
    this.source = '';
    this.cifpDir = null;
    this.cifpCache = new Map();
    this.awyNames = new Set();
  }

  addNode(key, ident, lat, lon, type, region = '') {
    let i = this.keyIdx.get(key);
    if (i !== undefined) {
      const n = this.nodes[i];
      if (type !== 'FIX' && n.type === 'FIX') n.type = type; // точка совпадает с маяком
      return i;
    }
    i = this.nodes.length;
    this.nodes.push({ ident, lat, lon, type, region });
    this.adj.push(null);
    this.keyIdx.set(key, i);
    let l = this.byIdent.get(ident);
    if (!l) this.byIdent.set(ident, (l = []));
    l.push(i);
    return i;
  }

  coordKey(ident, lat, lon) {
    return `${ident}@${lat.toFixed(3)},${lon.toFixed(3)}`;
  }

  load({ rawDir, userDir }) {
    const pick = (userNames, rawName) => {
      for (const n of userNames) {
        const p = path.join(userDir, n);
        if (fs.existsSync(p)) return p;
      }
      return path.join(rawDir, rawName);
    };
    const fixFile = pick(['earth_fix.dat', 'fix.dat', 'fix.dat.gz'], 'fix.dat.gz');
    const navFile = pick(['earth_nav.dat', 'nav.dat', 'nav.dat.gz'], 'nav.dat.gz');
    const awyFile = pick(['earth_awy.dat', 'awy.dat', 'awy.dat.gz'], 'awy.dat.gz');
    this.source = fixFile.startsWith(userDir) ? 'user' : 'default';
    this.loadNav(readMaybeGz(navFile));
    this.loadFix(readMaybeGz(fixFile));
    this.loadAwy(readMaybeGz(awyFile));
    const cifp = path.join(userDir, 'CIFP');
    if (fs.existsSync(cifp)) this.cifpDir = cifp;
    this.buildGrid();
    return this;
  }

  loadFix(text) {
    const h = header(text);
    for (const line of text.slice(h.start).split('\n')) {
      const p = line.trim().split(/\s+/);
      if (p.length < 3 || p[0] === '99') continue;
      const lat = +p[0], lon = +p[1], ident = p[2];
      if (!Number.isFinite(lat) || !ident) continue;
      if (h.version >= 1100) {
        const terminal = p[3] && p[3] !== 'ENRT' ? p[3] : '';
        this.addNode(`${ident}|${p[4]}|${terminal}`, ident, lat, lon, terminal ? 'TFIX' : 'FIX', p[4]);
      } else {
        this.addNode(this.coordKey(ident, lat, lon), ident, lat, lon, 'FIX');
      }
    }
    if (!this.cycle) this.cycle = h.cycle;
  }

  loadNav(text) {
    const h = header(text);
    this.cycle = h.cycle;
    this.navVersion = h.version;
    for (const line of text.slice(h.start).split('\n')) {
      const p = line.trim().split(/\s+/);
      const t = parseInt(p[0], 10);
      if (!t || t === 99 || p.length < 8) continue;
      const lat = +p[1], lon = +p[2], freq = +p[4], ident = p[7];
      if (t === 2 || t === 3 || t === 12 || t === 13) {
        if ((t === 12 || t === 13) && /ILS|LOC|DME-ILS/.test(line)) continue;
        let region = '', name;
        if (h.version >= 1100) { region = p[9]; name = p.slice(10).join(' '); }
        else name = p.slice(8).join(' ');
        const type = NAV_TYPES[t];
        const key = h.version >= 1100 ? `${ident}|${region}|${type === 'NDB' ? 2 : 3}` : this.coordKey(ident, lat, lon);
        // DME, совмещённый с VOR, не дублируем
        if (type === 'DME' && (this.byIdent.get(ident) || []).some((i) => this.nodes[i].type === 'VOR' && distNm(lat, lon, this.nodes[i].lat, this.nodes[i].lon) < 1)) continue;
        const i = this.addNode(key, ident, lat, lon, type, region);
        const n = this.nodes[i];
        n.freq = t === 2 ? freq : freq / 100;
        n.name = name;
        if (h.version >= 1100 && type !== 'NDB') this.keyIdx.set(`${ident}|${region}|3`, i);
        this.navaids.push(i);
      } else if (t === 4 || t === 5) {
        let apt, rwy, name, region = '';
        if (h.version >= 1100) { apt = p[8]; region = p[9]; rwy = p[10]; name = p.slice(11).join(' '); }
        else { apt = p[8]; rwy = p[9]; name = p.slice(10).join(' '); }
        const crs = (+p[6]) % 360;
        this.ils.push({ ident, lat, lon, freq: freq / 100, crs, apt, rwy, region, kind: t === 4 ? 'ILS' : 'LOC', name, gs: null });
      } else if (t === 6) {
        // Глиссада: угол закодирован как угол*100000 + курс
        let apt, rwy;
        if (h.version >= 1100) { apt = p[8]; rwy = p[10]; } else { apt = p[8]; rwy = p[9]; }
        const ang = Math.floor(+p[6] / 1000) / 100;
        const l = this.ils.find((x) => x.apt === apt && x.rwy === rwy && x.ident === ident);
        if (l) l.gs = ang || 3;
      }
    }
    for (const l of this.ils) if (l.kind === 'ILS' && l.gs == null) l.gs = 3;
  }

  loadAwy(text) {
    const h = header(text);
    const link = (a, b, awy, level, dir) => {
      const d = distNm(this.nodes[a].lat, this.nodes[a].lon, this.nodes[b].lat, this.nodes[b].lon);
      for (const name of awy.split('-')) {
        this.awyNames.add(name);
        if (dir !== 'B') (this.adj[a] ||= []).push({ to: b, awy: name, level, dist: d });
        if (dir !== 'F') (this.adj[b] ||= []).push({ to: a, awy: name, level, dist: d });
      }
    };
    const resolve = (ident, region, type) => {
      // type: 11 fix, 2 NDB, 3 VHF
      const k = type === 11 ? `${ident}|${region}|` : `${ident}|${region}|${type}`;
      let i = this.keyIdx.get(k);
      if (i === undefined && type === 11) i = this.keyIdx.get(`${ident}|${region}|3`) ?? this.keyIdx.get(`${ident}|${region}|2`);
      return i;
    };
    for (const line of text.slice(h.start).split('\n')) {
      const p = line.trim().split(/\s+/);
      if (p.length < 10) continue;
      if (h.version >= 1100) {
        const a = resolve(p[0], p[1], +p[2]);
        const b = resolve(p[3], p[4], +p[5]);
        if (a === undefined || b === undefined) continue;
        link(a, b, p[10], +p[7], p[6]);
      } else {
        const a = this.addNode(this.coordKey(p[0], +p[1], +p[2]), p[0], +p[1], +p[2], 'FIX');
        const b = this.addNode(this.coordKey(p[3], +p[4], +p[5]), p[3], +p[4], +p[5], 'FIX');
        link(a, b, p[9], +p[6], 'N');
      }
    }
  }

  buildGrid() {
    this.grid = new Map();
    this.nodes.forEach((n, i) => {
      const k = `${Math.floor(n.lat)}:${Math.floor(n.lon)}`;
      let c = this.grid.get(k);
      if (!c) this.grid.set(k, (c = []));
      c.push(i);
    });
  }

  /** Узлы в радиусе (nm) */
  nearby(lat, lon, radiusNm, filter = () => true) {
    const dLat = Math.ceil(radiusNm / 60);
    const dLon = Math.ceil(radiusNm / (60 * Math.max(0.1, Math.cos(lat * Math.PI / 180))));
    const out = [];
    const la0 = Math.floor(lat), lo0 = Math.floor(lon);
    for (let la = la0 - dLat; la <= la0 + dLat; la++) {
      for (let lo = lo0 - dLon; lo <= lo0 + dLon; lo++) {
        const wrapped = ((lo + 180) % 360 + 360) % 360 - 180;
        const c = this.grid.get(`${la}:${wrapped}`);
        if (!c) continue;
        for (const i of c) {
          const n = this.nodes[i];
          const d = distNm(lat, lon, n.lat, n.lon);
          if (d <= radiusNm && filter(i, n)) out.push({ i, d });
        }
      }
    }
    return out.sort((a, b) => a.d - b.d);
  }

  inBounds(s, w, n, e, filter = () => true, limit = 3000) {
    const out = [];
    for (let la = Math.floor(s); la <= Math.floor(n); la++) {
      for (let lo = Math.floor(w); lo <= Math.floor(e); lo++) {
        const c = this.grid.get(`${la}:${lo}`);
        if (!c) continue;
        for (const i of c) {
          const nd = this.nodes[i];
          if (nd.lat < s || nd.lat > n || nd.lon < w || nd.lon > e || !filter(i, nd)) continue;
          out.push(i);
          if (out.length >= limit) return out;
        }
      }
    }
    return out;
  }

  /** Найти точку по идентификатору, ближайшую к опорной */
  findIdent(ident, nearLat, nearLon, preferAirway = false) {
    const l = this.byIdent.get(ident);
    if (!l || !l.length) return null;
    let best = null, bd = Infinity;
    for (const i of l) {
      const n = this.nodes[i];
      let d = nearLat == null ? 0 : distNm(nearLat, nearLon, n.lat, n.lon);
      if (preferAirway && !this.adj[i]) d += 500;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  nodeInfo(i) {
    const n = this.nodes[i];
    return { ident: n.ident, lat: n.lat, lon: n.lon, type: n.type, freq: n.freq, name: n.name };
  }

  /** ILS аэродрома, привязанные к реальным ВПП OurAirports по положению и курсу */
  ilsForAirport(apt) {
    const list = this.ils.filter((l) => l.apt === apt.ident || l.apt === apt.icao ||
      (distNm(l.lat, l.lon, apt.lat, apt.lon) < 6 && l.apt.length === 4 && l.apt[0] === apt.icao[0]));
    // Все пары ILS–конец ВПП с оценкой, затем жадное сопоставление один к одному
    const pairs = [];
    list.forEach((l, li) => {
      for (const rw of apt.runways) {
        for (const [k, e] of rw.ends.entries()) {
          const o = rw.ends[1 - k];
          if (e.hdg == null) continue;
          const dh = angleDiff(e.hdg, l.crs);
          if (dh > 20) continue;
          let off = 0;
          if (e.lat != null && o.lat != null) off = crossTrackNm(l.lat, l.lon, e.lat, e.lon, o.lat, o.lon);
          if (off > 1.2) continue;
          const sameName = e.ident.replace(/^0/, '') === l.rwy.replace(/^0/, '');
          pairs.push({ li, end: e.ident, score: dh + off * 20 - (sameName ? 5 : 0) });
        }
      }
    });
    pairs.sort((a, b) => a.score - b.score);
    const usedIls = new Set(), usedEnd = new Map();
    const out = [];
    for (const p of pairs) {
      if (usedIls.has(p.li)) continue;
      const kind = list[p.li].kind;
      const k = p.end + ':' + kind;
      if (usedEnd.has(k)) continue;
      usedIls.add(p.li); usedEnd.set(k, true);
      out.push({ ...list[p.li], runway: p.end });
    }
    return out;
  }

  // ---------------- CIFP (процедуры SID/STAR/APPCH) ----------------

  procedures(icao) {
    if (!this.cifpDir) return null;
    if (this.cifpCache.has(icao)) return this.cifpCache.get(icao);
    const file = path.join(this.cifpDir, `${icao}.dat`);
    let res = null;
    if (fs.existsSync(file)) res = parseCifp(fs.readFileSync(file, 'latin1'));
    this.cifpCache.set(icao, res);
    return res;
  }
}

// Типы маршрутов ARINC 424
const SID_RWY = new Set(['1', '4', 'F', 'T']);
const SID_COMMON = new Set(['2', '5', 'M']);
const SID_ENRT = new Set(['3', '6', 'S', 'V']);
const STAR_ENRT = new Set(['1', '4', '7', 'F']);
const STAR_COMMON = new Set(['2', '5', '8', 'M']);
const STAR_RWY = new Set(['3', '6', '9', 'S']);
const APP_KIND = { I: 'ILS', L: 'LOC', R: 'RNAV', H: 'RNP', D: 'VOR/DME', V: 'VOR', N: 'NDB', Q: 'NDB/DME', S: 'VOR', P: 'GPS', B: 'LOC BC', X: 'LDA', G: 'IGS', J: 'GLS', U: 'SDF', W: 'MLS' };

export function parseCifp(text) {
  const procs = { SID: new Map(), STAR: new Map(), APPCH: new Map(), runways: {} };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const m = line.match(/^(SID|STAR|APPCH|RWY):(.*)$/);
    if (!m) continue;
    const f = m[2].replace(/;$/, '').split(',').map((s) => s.trim());
    if (m[1] === 'RWY') continue;
    const [, rtype, name, trans, fix, region, sec, sub, desc, , , pt] = f;
    const kind = m[1];
    let p = procs[kind].get(name);
    if (!p) procs[kind].set(name, (p = { name, kind, runways: new Set(), common: [], rwyTrans: new Map(), enrTrans: new Map(), appTrans: new Map(), approachType: null }));
    // Высоты/скорость ищем эвристически: первое поле вида 05000/FL250 после курса/дистанции
    let alt1 = '', alt2 = '', altDesc = '', spd = '';
    for (let k = 18; k < f.length; k++) {
      if (/^(\d{5}|FL\d{3})$/.test(f[k])) {
        alt1 = f[k];
        for (let b = k - 1; b >= k - 2; b--) if (/^[+\-B@CGHIJVXY]$/.test(f[b])) { altDesc = f[b]; break; }
        if (/^(\d{5}|FL\d{3})$/.test(f[k + 1] || '')) alt2 = f[k + 1];
        for (let q = k + 1; q < Math.min(f.length, k + 6); q++) if (/^\d{3}$/.test(f[q])) { spd = f[q]; break; }
        break;
      }
    }
    const leg = { fix: fix || null, region, sec, sub, desc, pt, alt1, altDesc, alt2, spd };
    const push = (map, key) => { let l = map.get(key); if (!l) map.set(key, (l = [])); l.push(leg); };
    if (kind === 'SID') {
      if (SID_RWY.has(rtype)) { push(p.rwyTrans, trans); p.runways.add(trans); }
      else if (SID_COMMON.has(rtype)) { p.common.push(leg); if (trans && trans !== 'ALL') p.runways.add(trans); }
      else if (SID_ENRT.has(rtype)) push(p.enrTrans, trans);
    } else if (kind === 'STAR') {
      if (STAR_ENRT.has(rtype)) push(p.enrTrans, trans);
      else if (STAR_COMMON.has(rtype)) { p.common.push(leg); if (trans && trans !== 'ALL') p.runways.add(trans); }
      else if (STAR_RWY.has(rtype)) { push(p.rwyTrans, trans); p.runways.add(trans); }
    } else {
      if (rtype === 'A') push(p.appTrans, trans);
      else {
        p.common.push(leg);
        p.approachType = APP_KIND[rtype] || APP_KIND[name[0]] || rtype;
        const rw = name.match(/^[A-Z](\d{2}[LRC]?)/);
        if (rw) p.runways.add('RW' + rw[1]);
      }
    }
  }
  return procs;
}

/** Подходит ли процедура к ВПП (учёт RW06B = обе 06L/06R, ALL) */
export function procMatchesRunway(proc, rwyIdent) {
  if (!proc.runways.size || proc.runways.has('ALL')) return true;
  const want = 'RW' + rwyIdent.replace(/^(\d)$/, '0$1').padStart(2, '0');
  for (const r of proc.runways) {
    if (r === want) return true;
    if (r.endsWith('B') && want.startsWith(r.slice(0, 4))) return true;
    if (r.length === 4 && want.startsWith(r)) return true;
  }
  return false;
}

export { bearing };
