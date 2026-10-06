// Сохранённые планы (в браузере) и импорт планов MSFS (.pln)
const KEY = 'fp-plans';

export function listPlans() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

function store(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; }
}

export function savePlan(entry) {
  const list = listPlans().filter((p) => p.id !== entry.id);
  list.unshift(entry);
  if (!store(list.slice(0, 100))) throw new Error('Не удалось сохранить: хранилище браузера переполнено или запрещено');
  return entry;
}

export function deletePlan(id) { store(listPlans().filter((p) => p.id !== id)); }
export function getPlan(id) { return listPlans().find((p) => p.id === id) || null; }

/** "N55° 58' 38.95",E37° 23' 12.04",+000622.00" → {lat, lon, alt} */
export function parseWorldPosition(s) {
  const parts = String(s || '').split(',');
  if (parts.length < 2) return null;
  const one = (t) => {
    const m = t.trim().match(/^([NSEW])\s*(\d+)°\s*(\d+)'\s*([\d.]+)"?$/);
    if (!m) return NaN;
    const v = +m[2] + +m[3] / 60 + +m[4] / 3600;
    return m[1] === 'S' || m[1] === 'W' ? -v : v;
  };
  const lat = one(parts[0]), lon = one(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon, alt: parts[2] ? parseFloat(parts[2]) : 0 };
}

const TYPE_MAP = { VOR: 'VOR', NDB: 'NDB', Intersection: 'FIX', User: 'LL', Airport: 'APT' };

/** Разбор .pln MSFS 2020/2024 */
export function parsePln(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Файл .pln повреждён или это не XML');
  const fp = doc.querySelector('FlightPlan\\.FlightPlan') || doc.getElementsByTagName('FlightPlan.FlightPlan')[0];
  if (!fp) throw new Error('В файле нет FlightPlan.FlightPlan');
  const txt = (el, tag) => el.getElementsByTagName(tag)[0]?.textContent?.trim() || '';
  const rwy = (el) => {
    const n = txt(el, 'RunwayNumberFP');
    if (!n) return null;
    const d = txt(el, 'RunwayDesignatorFP');
    return n.padStart(2, '0') + ({ LEFT: 'L', RIGHT: 'R', CENTER: 'C' }[d] || '');
  };
  const wps = [...fp.getElementsByTagName('ATCWaypoint')];
  const dep = txt(fp, 'DepartureID').toUpperCase();
  const arr = txt(fp, 'DestinationID').toUpperCase();
  if (!dep || !arr) throw new Error('В плане нет аэропортов вылета/прилёта');
  const points = [];
  let depRwy = null, arrRwy = null;
  wps.forEach((w, i) => {
    const id = (w.getAttribute('id') || txt(w, 'ICAOIdent')).toUpperCase();
    const type = txt(w, 'ATCWaypointType');
    if (type === 'Airport' && (i === 0 || i === wps.length - 1)) {
      if (i === 0) depRwy = rwy(w); else arrRwy = rwy(w);
      return;
    }
    const pos = parseWorldPosition(txt(w, 'WorldPosition'));
    if (!pos) return;
    const sid = txt(w, 'DepartureFP'), star = txt(w, 'ArrivalFP'), awy = txt(w, 'ATCAirway');
    points.push({
      ident: id || `WP${i}`, lat: pos.lat, lon: pos.lon, type: TYPE_MAP[type] || 'FIX',
      via: sid || star || awy || 'DCT', stage: sid ? 'SID' : star ? 'STAR' : 'ENR',
    });
  });
  const cruise = parseInt(txt(fp, 'CruisingAlt'), 10);
  return {
    dep, arr, depRwy, arrRwy, points,
    rules: txt(fp, 'FPType') === 'VFR' ? 'V' : 'I',
    fl: Number.isFinite(cruise) && cruise > 0 ? Math.max(10, Math.round(cruise / 1000) * 10) : null,
    title: txt(fp, 'Title'),
  };
}

/** Строка маршрута по точкам: схлопываем промежуточные точки одной трассы */
export function routeString(points) {
  const enr = points.filter((p) => p.stage !== 'SID' && p.stage !== 'STAR');
  const sid = points.find((p) => p.stage === 'SID');
  const star = points.find((p) => p.stage === 'STAR');
  const t = [];
  if (sid) t.push(sid.via);
  enr.forEach((p, k) => {
    const next = enr[k + 1];
    if (k === 0) { if (p.via && p.via !== 'DCT' && sid) t.push(p.via); t.push(p.ident); return; }
    if (next && next.via === p.via && p.via !== 'DCT') return;
    t.push(p.via || 'DCT', p.ident);
  });
  if (star) t.push(star.via);
  return t.join(' ') || 'DCT';
}
