// Расчёт профиля, времени, топлива и масс
import { PAX_MASS, BAG_MASS } from './aircraft.js';

const R_NM = 3440.065;
const D2R = Math.PI / 180;

export function distNm(a, b) {
  const p1 = a.lat * D2R, p2 = b.lat * D2R, dp = p2 - p1, dl = (b.lon - a.lon) * D2R;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function bearing(a, b) {
  const p1 = a.lat * D2R, p2 = b.lat * D2R, dl = (b.lon - a.lon) * D2R;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) / D2R + 360) % 360;
}
export function interpolate(a, b, f) {
  const d = distNm(a, b) / R_NM;
  if (d === 0) return { lat: a.lat, lon: a.lon };
  const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
  const p1 = a.lat * D2R, l1 = a.lon * D2R, p2 = b.lat * D2R, l2 = b.lon * D2R;
  const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
  const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
  const z = A * Math.sin(p1) + B * Math.sin(p2);
  return { lat: Math.atan2(z, Math.hypot(x, y)) / D2R, lon: Math.atan2(y, x) / D2R };
}

/** Истинная воздушная скорость, уз */
export function cruiseTas(ac, fl, isaDev = 0, machOverride = null, tasOverride = null) {
  if (tasOverride) return tasOverride;
  const mach = machOverride ?? ac.mach;
  if (!mach) return ac.tas;
  const altFt = fl * 100;
  const tIsa = altFt < 36089 ? 15 - 1.98 * altFt / 1000 : -56.5;
  const tK = tIsa + isaDev + 273.15;
  return Math.round(mach * 38.967854 * Math.sqrt(tK));
}

/** Эшелоны по полукруговой системе (RVSM) */
export function levelsForDirection(track, rules = 'I') {
  const east = track < 180;
  const lv = [];
  if (rules === 'V') {
    for (let f = east ? 35 : 45; f <= 195; f += 20) lv.push(f);
    return lv;
  }
  for (let f = east ? 30 : 40; f <= 280; f += 20) lv.push(f);
  for (let f = east ? 290 : 300; f <= 410; f += 20) lv.push(f);
  for (let f = east ? 450 : 430; f <= 510; f += 40) lv.push(f);
  return lv.sort((a, b) => a - b);
}

function phaseGeom(ac, altFt, tas) {
  const jet = ac.cat === 'J';
  const climbMin = altFt / ac.climbRate * (jet ? 1.15 : 1.05);
  const climbGs = tas * (jet ? 0.68 : 0.72);
  const descDist = altFt / 1000 * (jet ? 3.2 : 3.0);
  const descGs = tas * (jet ? 0.74 : 0.85);
  return { climbMin, climbDist: climbMin / 60 * climbGs, climbGs, descDist, descMin: descDist / descGs * 60, descGs };
}

/** Автовыбор эшелона под дистанцию и направление */
export function autoCruiseFl(ac, dist, track, depElev = 0, arrElev = 0, rules = 'I') {
  const cands = levelsForDirection(track, rules).filter((f) => f <= Math.min(ac.ceil, ac.opt + 20)).reverse();
  for (const f of cands) {
    if (f > ac.opt + 10) continue;
    const tas = cruiseTas(ac, f);
    const g = phaseGeom(ac, f * 100 - depElev, tas);
    const gd = phaseGeom(ac, f * 100 - arrElev, tas);
    // хотя бы ~15% маршрута на эшелоне (или минимум 10 nm)
    if (g.climbDist + gd.descDist <= dist * 0.85 - 10) return f;
  }
  return cands[cands.length - 1] || (rules === 'V' ? 45 : 50);
}

/** Расход с учётом массы и высоты */
function ffAt(ac, weight, fl) {
  const wf = 0.7 + 0.3 * (weight / ac.mtow) / 0.85;
  const below = Math.max(0, ac.opt - fl) / 10;
  const af = 1 + below * (ac.cat === 'J' ? 0.022 : ac.cat === 'T' ? 0.012 : 0.004);
  return ac.ff * wf * af;
}

/**
 * Профиль одного перелёта: дистанция → время и топливо
 */
export function flightProfile(ac, { dist, fl, tas, wind = 0, weight, depElev = 0, arrElev = 0 }) {
  const jet = ac.cat === 'J';
  const cruiseAlt = fl * 100;
  let g = phaseGeom(ac, Math.max(0, cruiseAlt - depElev), tas);
  const gd = phaseGeom(ac, Math.max(0, cruiseAlt - arrElev), tas);
  let climbDist = g.climbDist + g.climbMin / 60 * wind * 0.5;
  let descDist = gd.descDist;
  let climbMin = g.climbMin, descMin = gd.descMin;
  let scale = 1;
  if (climbDist + descDist > dist) {
    scale = dist / (climbDist + descDist);
    climbDist *= scale; descDist *= scale; climbMin *= scale; descMin *= scale;
  }
  const cruiseDist = Math.max(0, dist - climbDist - descDist);
  const gs = Math.max(60, tas + wind);
  const cruiseMin = cruiseDist / gs * 60;
  const ff = ffAt(ac, weight, fl);
  const climbFuel = climbMin / 60 * ff * (jet ? 1.9 : 1.35);
  const cruiseFuel = cruiseMin / 60 * ff;
  const descFuel = descMin / 60 * ff * (jet ? 0.32 : 0.6);
  const appMin = jet ? 6 : 4;                       // манёвр захода и посадка
  const appFuel = appMin / 60 * ff * 0.75;
  return {
    climbDist, descDist, cruiseDist, climbMin, descMin, cruiseMin, appMin,
    time: climbMin + cruiseMin + descMin + appMin,
    fuel: climbFuel + cruiseFuel + descFuel + appFuel,
    climbFuel, cruiseFuel, descFuel, appFuel, ff, gs, scale,
    climbGs: g.climbGs, descGs: gd.descGs,
  };
}

/**
 * Полный расчёт плана
 * p: { ac, points:[{lat,lon,ident,...}] (включая аэропорты), dep, arr, altn, fl, tas, wind, isaDev,
 *      pax, bagsPerPax, cargo, fuel: {contPct, extra, finalMin, taxi, altnFuel, block}, rules }
 */
export function computePlan(p) {
  const { ac, pts, dep, arr, altn } = p;
  const legs = [];
  let dist = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = distNm(pts[i - 1], pts[i]);
    legs.push({ from: pts[i - 1], to: pts[i], dist: d, trk: bearing(pts[i - 1], pts[i]) });
    dist += d;
  }
  const payload = p.pax * (PAX_MASS + p.bagsPerPax) + p.cargo;
  const zfw = ac.oew + payload;
  const tas = p.tas;
  const taxi = p.fuel.taxi ?? ac.taxi;

  // итерации по массе
  let tow = zfw + ac.maxFuel * 0.5;
  let prof, altnProf = null, altnFuel = 0, altnDist = 0, altnFl = 0, cont = 0, finalRes = 0, block = 0, trip = 0;
  for (let k = 0; k < 4; k++) {
    prof = flightProfile(ac, { dist, fl: p.fl, tas, wind: p.wind, weight: (tow + zfw) / 2 + (tow - zfw) * 0.1, depElev: dep.elev, arrElev: arr.elev });
    trip = prof.fuel;
    cont = trip * p.fuel.contPct / 100;
    const lw = tow - trip;
    if (altn) {
      altnDist = distNm(arr, altn) * 1.08 + 10; // уход на второй круг и маршрут
      altnFl = autoCruiseFl(ac, altnDist, bearing(arr, altn), arr.elev, altn.elev, p.rules);
      altnFl = Math.min(altnFl, ac.cat === 'J' ? 250 : altnFl);
      altnProf = flightProfile(ac, { dist: altnDist, fl: altnFl, tas: cruiseTas(ac, altnFl, p.isaDev), wind: 0, weight: lw, depElev: arr.elev, arrElev: altn.elev });
      altnFuel = altnProf.fuel;
    }
    if (p.fuel.altnFuel != null) altnFuel = p.fuel.altnFuel;
    const holdFf = ffAt(ac, lw, Math.min(p.fl, 150)) * (ac.cat === 'J' ? 0.78 : 0.85);
    finalRes = holdFf * p.fuel.finalMin / 60;
    const minBlock = taxi + trip + cont + altnFuel + finalRes + (p.fuel.extra || 0);
    block = p.fuel.block != null ? Math.max(p.fuel.block, 0) : minBlock;
    tow = zfw + block - taxi;
  }
  const minBlock = taxi + trip + cont + altnFuel + finalRes;
  const extra = p.fuel.block != null ? block - minBlock : (p.fuel.extra || 0);
  const takeoffFuel = block - taxi;
  const ldgFuel = takeoffFuel - trip;
  const lw = tow - trip;

  // профиль по точкам: высота, время, топливо
  const toc = prof.climbDist, tod = dist - prof.descDist;
  const timeAt = (s) => {
    if (s <= toc) return s / Math.max(1, toc) * prof.climbMin;
    if (s <= tod) return prof.climbMin + (s - toc) / prof.gs * 60;
    return prof.climbMin + prof.cruiseMin + (s - tod) / Math.max(1, prof.descDist) * prof.descMin;
  };
  const altAt = (s) => {
    const cr = p.fl * 100;
    if (s <= toc) return dep.elev + (cr - dep.elev) * (toc ? s / toc : 1);
    if (s >= tod) return arr.elev + (cr - arr.elev) * (prof.descDist ? (dist - s) / prof.descDist : 0);
    return cr;
  };
  const fuelAt = (s) => {
    const t = timeAt(s);
    let used;
    if (t <= prof.climbMin) used = prof.climbFuel * (t / Math.max(0.01, prof.climbMin));
    else if (t <= prof.climbMin + prof.cruiseMin) used = prof.climbFuel + prof.cruiseFuel * ((t - prof.climbMin) / Math.max(0.01, prof.cruiseMin));
    else used = prof.climbFuel + prof.cruiseFuel + prof.descFuel * Math.min(1, (t - prof.climbMin - prof.cruiseMin) / Math.max(0.01, prof.descMin));
    return takeoffFuel - used;
  };

  const log = [];
  let s = 0;
  const addRow = (pt, leg, extraRow = {}) => {
    log.push({ ...pt, ...extraRow, dist: leg ? leg.dist : 0, trk: leg ? leg.trk : null, cum: s, remain: dist - s, alt: altAt(s), time: timeAt(s), fuel: fuelAt(s) });
  };
  addRow(pts[0], null);
  let tocDone = toc <= 0, todDone = false;
  for (const leg of legs) {
    const s0 = s;
    if (!tocDone && s0 + leg.dist >= toc) {
      const f = (toc - s0) / Math.max(0.001, leg.dist);
      s = toc;
      addRow({ ...interpolate(leg.from, leg.to, f), ident: 'T/C', type: 'TOC', via: leg.to.via }, { dist: toc - s0, trk: leg.trk });
      tocDone = true;
    }
    if (!todDone && tod > toc && s0 + leg.dist >= tod && tod >= s0) {
      const f = (tod - s0) / Math.max(0.001, leg.dist);
      const sPrev = s;
      s = tod;
      addRow({ ...interpolate(leg.from, leg.to, f), ident: 'T/D', type: 'TOD', via: leg.to.via }, { dist: tod - sPrev, trk: leg.trk });
      todDone = true;
    }
    const prevS = s;
    s = s0 + leg.dist;
    addRow(leg.to, { dist: s - prevS, trk: leg.trk });
  }

  // проверки
  const warnings = [];
  const lim = (name, val, max) => { if (val > max + 1) warnings.push({ level: 'bad', text: `${name} ${Math.round(val)} > max ${max}` }); };
  lim('ZFW', zfw, ac.mzfw);
  lim('TOW', tow, ac.mtow);
  lim('LW', lw, ac.mlw);
  lim('Топливо', block, ac.maxFuel);
  if (block < minBlock - 1) warnings.push({ level: 'bad', text: 'Топлива меньше минимально потребного' });
  if (p.pax > ac.maxPax) warnings.push({ level: 'bad', text: `Пассажиров больше, чем мест (${ac.maxPax})` });
  if (p.fl > ac.ceil) warnings.push({ level: 'bad', text: `FL${p.fl} выше потолка FL${ac.ceil}` });
  // максимальная коммерческая загрузка при данном топливе
  const maxPayload = Math.max(0, Math.min(ac.mzfw - ac.oew, ac.mtow - ac.oew - takeoffFuel, ac.mlw - ac.oew - ldgFuel));

  return {
    dist, legs, log, prof, toc, tod,
    weights: { oew: ac.oew, payload, zfw, tow, lw, maxPayload },
    fuel: { taxi, trip, cont, altn: altnFuel, final: finalRes, extra, block, minBlock, takeoff: takeoffFuel, landing: ldgFuel },
    times: { trip: prof.time, cont: cont / prof.ff * 60, altn: altnProf ? altnProf.time : 0, final: p.fuel.finalMin, extra: extra / prof.ff * 60, taxi: 15, endurance: takeoffFuel / prof.ff * 60 },
    altn: altn ? { dist: altnDist, fl: altnFl, time: altnProf?.time || 0 } : null,
    warnings,
  };
}

export const fmtTime = (min) => {
  if (!Number.isFinite(min)) return '—';
  const m = Math.round(min);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};
