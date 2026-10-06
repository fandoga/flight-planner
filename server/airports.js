// База аэропортов OurAirports (public domain): аэропорты, ВПП, частоты
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function parseCsvLine(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function readCsv(file, onRow) {
  if (!fs.existsSync(file) && fs.existsSync(file + '.gz')) file += '.gz';
  const buf = fs.readFileSync(file);
  const text = (file.endsWith('.gz') ? zlib.gunzipSync(buf) : buf).toString('utf8');
  const lines = text.split(/\r?\n/);
  const head = parseCsvLine(lines[0]);
  const idx = Object.fromEntries(head.map((h, i) => [h, i]));
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    onRow(parseCsvLine(lines[i]), idx);
  }
}

const num = (s) => (s === '' || s == null ? null : Number(s));
const SKIP_TYPES = new Set(['heliport', 'closed', 'balloonport']);
const TYPE_RANK = { large_airport: 3, medium_airport: 2, small_airport: 1, seaplane_base: 0 };

export class AirportDb {
  constructor() {
    this.byIdent = new Map();   // ident -> airport
    this.alias = new Map();     // icao/gps/iata -> ident
    this.list = [];
    this.countries = new Map();
  }

  load(rawDir) {
    readCsv(path.join(rawDir, 'countries.csv'), (r, i) => {
      this.countries.set(r[i.code], r[i.name]);
    });
    readCsv(path.join(rawDir, 'airports.csv'), (r, i) => {
      const type = r[i.type];
      if (SKIP_TYPES.has(type)) return;
      const a = {
        ident: r[i.ident],
        icao: r[i.icao_code] || r[i.gps_code] || r[i.ident],
        iata: r[i.iata_code] || '',
        type,
        rank: TYPE_RANK[type] ?? 0,
        name: r[i.name],
        lat: Number(r[i.latitude_deg]),
        lon: Number(r[i.longitude_deg]),
        elev: num(r[i.elevation_ft]) ?? 0,
        country: r[i.iso_country],
        city: r[i.municipality],
        scheduled: r[i.scheduled_service] === 'yes',
        runways: [],
        freqs: [],
      };
      this.byIdent.set(a.ident, a);
      this.list.push(a);
    });
    // Псевдонимы: ICAO и GPS-код важнее локальных идентов
    for (const a of this.list) {
      for (const code of [a.icao, a.ident]) {
        if (!code) continue;
        const prev = this.alias.get(code);
        if (!prev || this.byIdent.get(prev).rank < a.rank) this.alias.set(code, a.ident);
      }
    }
    for (const a of this.list) {
      if (a.iata && !this.alias.has('IATA:' + a.iata)) this.alias.set('IATA:' + a.iata, a.ident);
    }
    readCsv(path.join(rawDir, 'runways.csv'), (r, i) => {
      const a = this.byIdent.get(r[i.airport_ident]);
      if (!a || r[i.closed] === '1') return;
      const len = num(r[i.length_ft]);
      const ends = [];
      for (const p of ['le', 'he']) {
        ends.push({
          ident: r[i[p + '_ident']],
          lat: num(r[i[p + '_latitude_deg']]),
          lon: num(r[i[p + '_longitude_deg']]),
          elev: num(r[i[p + '_elevation_ft']]),
          hdg: num(r[i[p + '_heading_degT']]),
          displaced: num(r[i[p + '_displaced_threshold_ft']]) || 0,
        });
      }
      const [le, he] = ends;
      if (!le.ident || /^H/i.test(le.ident)) return; // вертолётные площадки
      const surface = (r[i.surface] || '').toUpperCase();
      const rw = { length: len, width: num(r[i.width_ft]), surface, lighted: r[i.lighted] === '1', ends };
      // Курс по номеру ВПП, если нет координат/курса
      for (const [e, o] of [[le, he], [he, le]]) {
        if (e.hdg == null) {
          const n = parseInt(e.ident, 10);
          e.hdg = Number.isFinite(n) ? (n * 10) % 360 : (o.hdg != null ? (o.hdg + 180) % 360 : null);
        }
      }
      a.runways.push(rw);
    });
    readCsv(path.join(rawDir, 'airport-frequencies.csv'), (r, i) => {
      const a = this.byIdent.get(r[i.airport_ident]);
      if (a) a.freqs.push({ type: r[i.type], desc: r[i.description], mhz: num(r[i.frequency_mhz]) });
    });
    // Аэропорт без ВПП с твёрдым покрытием всё равно доступен, но ранжируется ниже
    for (const a of this.list) {
      a.maxRwy = a.runways.reduce((m, rw) => Math.max(m, rw.length || 0), 0);
      a.hard = a.runways.some((rw) => /ASP|CON|PEM|BIT|TAR|ASPH|CONC/.test(rw.surface));
    }
    this.buildGrid();
    return this;
  }

  buildGrid() {
    this.grid = new Map();
    for (const a of this.list) {
      const k = `${Math.floor(a.lat)}:${Math.floor(a.lon)}`;
      let c = this.grid.get(k);
      if (!c) this.grid.set(k, (c = []));
      c.push(a);
    }
  }

  get(code) {
    if (!code) return null;
    const c = code.trim().toUpperCase();
    const id = this.alias.get(c) || (c.length === 3 ? this.alias.get('IATA:' + c) : null);
    return id ? this.byIdent.get(id) : null;
  }

  search(q, limit = 12) {
    const s = q.trim().toUpperCase();
    if (!s) return [];
    const res = [];
    const exact = this.get(s);
    if (exact) res.push(exact);
    for (const a of this.list) {
      if (res.length >= limit * 4) break;
      if (a === exact) continue;
      if (a.icao.startsWith(s) || a.iata === s ||
          (s.length >= 3 && (a.name.toUpperCase().includes(s) || (a.city || '').toUpperCase().includes(s)))) {
        res.push(a);
      }
    }
    return res.sort((x, y) => (y === exact) - (x === exact) || y.rank - x.rank).slice(0, limit);
  }

  /** Аэропорты внутри прямоугольника (для карты) */
  inBounds(s, w, n, e, minRank = 0, limit = 1500) {
    const out = [];
    for (let la = Math.floor(s); la <= Math.floor(n); la++) {
      for (let lo = Math.floor(w); lo <= Math.floor(e); lo++) {
        const c = this.grid.get(`${la}:${lo}`);
        if (!c) continue;
        for (const a of c) {
          if (a.rank < minRank || a.lat < s || a.lat > n || a.lon < w || a.lon > e) continue;
          out.push(a);
          if (out.length >= limit) return out;
        }
      }
    }
    return out;
  }

  nearby(lat, lon, radiusNm, filter = () => true) {
    const dLat = radiusNm / 60;
    const dLon = radiusNm / (60 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
    return this.inBounds(lat - dLat, lon - dLon, lat + dLat, lon + dLon, 0, 100000).filter(filter);
  }
}
