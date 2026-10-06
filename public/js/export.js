// Экспорт плана: строка маршрута, ICAO FPL, X-Plane .fms, MSFS .pln, OFP
import { fmtTime } from './calc.js';

function download(name, text, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

const pad = (n, l = 2) => String(Math.round(n)).padStart(l, '0');
const hhmm = (min) => pad(Math.floor(Math.round(min) / 60)) + pad(Math.round(min) % 60);

function speedField(x) {
  return x.ac.mach && x.fl >= 250 ? `M${pad(x.ac.mach * 100, 3)}` : `N${pad(x.tas, 4)}`;
}

function routeForFpl(x) {
  const r = (x.route?.route || 'DCT').trim();
  return r || 'DCT';
}

export function fplText(x) {
  const p = x.plan;
  const wake = x.ac.wake === 'J' ? 'J' : x.ac.wake;
  const dof = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const etd = x.S.etd ? x.S.etd.replace(':', '') : '0000';
  const lvl = x.fl >= 10 ? `F${pad(x.fl, 3)}` : `A${pad(x.fl, 3)}`;
  const endurance = hhmm(p.times.endurance);
  return [
    `(FPL-${x.S.callsign || 'N/A'}-${x.S.rules}S`,
    `-${x.ac.icao}/${wake}-${x.ac.equip}`,
    `-${x.dep.icao}${etd}`,
    `-${speedField(x)}${lvl} ${routeForFpl(x)}`,
    `-${x.arr.icao}${hhmm(p.times.trip)}${x.altn ? ' ' + x.altn.icao : ''}`,
    `-PBN/A1B1C1D1S1 DOF/${dof} RMK/SIMULATOR FLIGHT`,
    `-E/${endurance} P/${pad(x.S.load.pax + 2, 3)})`,
  ].join('\n');
}

const fmsType = (p) => p.type === 'NDB' ? 2 : p.type === 'VOR' || p.type === 'DME' ? 3 : p.type === 'APT' ? 1 : p.type === 'LL' ? 28 : 11;

export function fmsText(x) {
  const enr = (x.route?.points || []).filter((p) => p.stage !== 'SID' && p.stage !== 'STAR' || !x.route.sid && !x.route.star);
  const pts = x.route?.sid || x.route?.star ? (x.route.points || []).filter((p) => p.stage === 'ENR') : enr;
  const lines = ['I', '1100 Version', `CYCLE ${String(x.airac || '').replace('.', '').slice(-4)}`, `ADEP ${x.dep.icao}`];
  if (x.depRwy) lines.push(`DEPRWY RW${x.depRwy}`);
  if (x.route?.sid) { lines.push(`SID ${x.route.sid.name}`); if (x.route.sid.trans) lines.push(`SIDTRANS ${x.route.sid.trans}`); }
  lines.push(`ADES ${x.arr.icao}`);
  if (x.arrRwy) lines.push(`DESRWY RW${x.arrRwy}`);
  if (x.route?.star) { lines.push(`STAR ${x.route.star.name}`); if (x.route.star.trans) lines.push(`STARTRANS ${x.route.star.trans}`); }
  if (x.approach && x.route?.star) lines.push(`APP ${x.approach.id}`);
  lines.push(`NUMENR ${pts.length + 2}`);
  const alt = (i) => (i === 0 ? x.dep.elev : x.fl * 100).toFixed(6);
  lines.push(`1 ${x.dep.icao} ADEP ${Number(x.dep.elev).toFixed(6)} ${x.dep.lat.toFixed(6)} ${x.dep.lon.toFixed(6)}`);
  pts.forEach((p, i) => {
    const via = p.via && p.via !== 'DCT' && p.stage === 'ENR' && i > 0 ? p.via : 'DRCT';
    lines.push(`${fmsType(p)} ${p.type === 'LL' ? p.ident.replace(/[^A-Z0-9]/g, '') : p.ident} ${via} ${alt(i + 1)} ${p.lat.toFixed(6)} ${p.lon.toFixed(6)}`);
  });
  lines.push(`1 ${x.arr.icao} ADES ${Number(x.arr.elev).toFixed(6)} ${x.arr.lat.toFixed(6)} ${x.arr.lon.toFixed(6)}`);
  return lines.join('\n') + '\n';
}

function dms(v, pos, neg) {
  const h = v >= 0 ? pos : neg;
  v = Math.abs(v);
  const d = Math.floor(v), mf = (v - d) * 60, m = Math.floor(mf), s = (mf - m) * 60;
  return `${h}${d}° ${m}' ${s.toFixed(2)}"`;
}
const worldPos = (p, alt) => `${dms(p.lat, 'N', 'S')},${dms(p.lon, 'E', 'W')},${alt >= 0 ? '+' : '-'}${String(Math.abs(Math.round(alt))).padStart(6, '0')}.00`;
const xmlEsc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

function rwyTags(rwy) {
  const d = { L: 'LEFT', R: 'RIGHT', C: 'CENTER' }[rwy.slice(-1)];
  return `      <RunwayNumberFP>${parseInt(rwy, 10)}</RunwayNumberFP>\n${d ? `      <RunwayDesignatorFP>${d}</RunwayDesignatorFP>\n` : ''}`;
}

export function plnText(x) {
  const pts = (x.route?.points || []);
  const wpType = (p) => p.type === 'VOR' || p.type === 'DME' ? 'VOR' : p.type === 'NDB' ? 'NDB' : p.type === 'LL' ? 'User' : 'Intersection';
  const wps = [
    `    <ATCWaypoint id="${x.dep.icao}">\n      <ATCWaypointType>Airport</ATCWaypointType>\n      <WorldPosition>${worldPos(x.dep, x.dep.elev)}</WorldPosition>\n${x.depRwy ? `      <RunwayNumberFP>${parseInt(x.depRwy, 10)}</RunwayNumberFP>\n${/[LRC]$/.test(x.depRwy) ? `      <RunwayDesignatorFP>${{ L: 'LEFT', R: 'RIGHT', C: 'CENTER' }[x.depRwy.slice(-1)]}</RunwayDesignatorFP>\n` : ''}` : ''}      <ICAO><ICAOIdent>${x.dep.icao}</ICAOIdent></ICAO>\n    </ATCWaypoint>`,
    ...pts.map((p) => {
      const rwy = p.stage === 'SID' ? x.depRwy : p.stage === 'STAR' ? x.arrRwy : null;
      const proc = p.stage === 'SID' ? `      <DepartureFP>${xmlEsc(p.via)}</DepartureFP>\n` : p.stage === 'STAR' ? `      <ArrivalFP>${xmlEsc(p.via)}</ArrivalFP>\n` : '';
      return `    <ATCWaypoint id="${xmlEsc(p.ident)}">\n      <ATCWaypointType>${wpType(p)}</ATCWaypointType>\n      <WorldPosition>${worldPos(p, x.fl * 100)}</WorldPosition>\n` +
        (p.via && p.via !== 'DCT' && p.stage === 'ENR' ? `      <ATCAirway>${xmlEsc(p.via)}</ATCAirway>\n` : '') + proc +
        (proc && rwy ? rwyTags(rwy) : '') +
        (p.type !== 'LL' ? `      <ICAO>\n${p.region ? `        <ICAORegion>${xmlEsc(p.region)}</ICAORegion>\n` : ''}        <ICAOIdent>${xmlEsc(p.ident)}</ICAOIdent>\n      </ICAO>\n` : '') +
        '    </ATCWaypoint>';
    }),
    `    <ATCWaypoint id="${x.arr.icao}">\n      <ATCWaypointType>Airport</ATCWaypointType>\n      <WorldPosition>${worldPos(x.arr, x.arr.elev)}</WorldPosition>\n${x.arrRwy ? `      <RunwayNumberFP>${parseInt(x.arrRwy, 10)}</RunwayNumberFP>\n${/[LRC]$/.test(x.arrRwy) ? `      <RunwayDesignatorFP>${{ L: 'LEFT', R: 'RIGHT', C: 'CENTER' }[x.arrRwy.slice(-1)]}</RunwayDesignatorFP>\n` : ''}` : ''}      <ICAO><ICAOIdent>${x.arr.icao}</ICAOIdent></ICAO>\n    </ATCWaypoint>`,
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<SimBase.Document Type="AceXML" version="1,0">
  <Descr>AceXML Document</Descr>
  <FlightPlan.FlightPlan>
    <Title>${x.dep.icao} to ${x.arr.icao}</Title>
    <FPType>${x.S.rules === 'V' ? 'VFR' : 'IFR'}</FPType>
    <RouteType>${x.route?.points?.length ? 'HighAlt' : 'Direct'}</RouteType>
    <CruisingAlt>${x.fl * 100}</CruisingAlt>
    <DepartureID>${x.dep.icao}</DepartureID>
    <DepartureLLA>${worldPos(x.dep, x.dep.elev)}</DepartureLLA>
    <DestinationID>${x.arr.icao}</DestinationID>
    <DestinationLLA>${worldPos(x.arr, x.arr.elev)}</DestinationLLA>
    <Descr>${x.dep.icao}, ${x.arr.icao}</Descr>
    <DepartureName>${xmlEsc(x.dep.name)}</DepartureName>
    <DestinationName>${xmlEsc(x.arr.name)}</DestinationName>
    <AppVersion><AppVersionMajor>11</AppVersionMajor><AppVersionBuild>282174</AppVersionBuild></AppVersion>
${wps.join('\n')}
  </FlightPlan.FlightPlan>
</SimBase.Document>
`;
}

export function ofpText(x) {
  const p = x.plan;
  const u = x.units === 'lb' ? 'LB' : 'KG';
  const w = (kg) => String(Math.round(x.units === 'lb' ? kg * 2.20462 : kg)).padStart(7);
  const L = [];
  L.push(`OFP ${x.S.callsign || ''}  ${x.dep.icao}-${x.arr.icao}  ${x.ac.icao}  AIRAC ${x.airac || ''}`);
  L.push(`${x.dep.name} -> ${x.arr.name}`);
  L.push('='.repeat(72));
  L.push(`DIST ${Math.round(p.dist)} NM   FL${x.fl}   TAS ${x.tas} KT   AIR TIME ${fmtTime(p.times.trip)}   ALTN ${x.altn?.icao || '-'}`);
  L.push(`DEP RWY ${x.depRwy || '-'}  SID ${x.route?.sid?.name || '-'}    ARR RWY ${x.arrRwy || '-'}  STAR ${x.route?.star?.name || '-'}  APP ${x.approach?.name || '-'}`);
  L.push('');
  L.push(`ROUTE: ${routeForFpl(x)}`);
  L.push('');
  L.push(`FUEL (${u})            TIME`);
  L.push(`TRIP        ${w(p.fuel.trip)}  ${fmtTime(p.times.trip)}`);
  L.push(`CONT ${String(x.S.fuel.contPct).padStart(2)}%    ${w(p.fuel.cont)}`);
  L.push(`ALTN        ${w(p.fuel.altn)}  ${fmtTime(p.times.altn)}`);
  L.push(`FINAL       ${w(p.fuel.final)}  ${fmtTime(x.S.fuel.finalMin)}`);
  L.push(`EXTRA       ${w(p.fuel.extra)}`);
  L.push(`TAXI        ${w(p.fuel.taxi)}`);
  L.push(`BLOCK       ${w(p.fuel.block)}`);
  L.push('');
  L.push(`WEIGHTS (${u})  PAX ${x.S.load.pax}  PAYLOAD ${w(p.weights.payload)}`);
  L.push(`ZFW ${w(p.weights.zfw)} / ${w(x.ac.mzfw)}   TOW ${w(p.weights.tow)} / ${w(x.ac.mtow)}   LW ${w(p.weights.lw)} / ${w(x.ac.mlw)}`);
  L.push('');
  L.push('WPT      VIA        TRK  DIST  REM   ALT     TIME   FUEL');
  for (const r of p.log) {
    L.push(`${r.ident.padEnd(8)} ${String(r.via && r.trk != null ? r.via : '').slice(0, 10).padEnd(10)} ${r.trk == null ? '   ' : pad(r.trk % 360, 3)}  ${String(Math.round(r.dist || 0)).padStart(4)}  ${String(Math.round(r.remain)).padStart(4)}  ${(r.alt >= 10000 ? 'FL' + pad(r.alt / 100, 3) : String(Math.round(r.alt))).padStart(6)}  ${fmtTime(r.time).padStart(5)}  ${w(r.fuel)}`);
  }
  L.push('');
  L.push('WEATHER');
  if (x.metar.dep) L.push(x.metar.dep);
  if (x.metar.arr) L.push(x.metar.arr);
  if (x.metar.altn) L.push(x.metar.altn);
  L.push('');
  L.push('ТОЛЬКО ДЛЯ АВИАСИМУЛЯТОРОВ — НЕ ДЛЯ РЕАЛЬНЫХ ПОЛЁТОВ');
  return L.join('\n');
}

export function exportPlan(kind, x) {
  const base = `${x.dep.icao}${x.arr.icao}`;
  if (kind === 'copy') {
    navigator.clipboard?.writeText(routeForFpl(x));
    return 'Маршрут скопирован';
  }
  if (kind === 'fpl') download(`${base}_FPL.txt`, fplText(x));
  if (kind === 'fms') download(`${base}.fms`, fmsText(x));
  if (kind === 'pln') download(`${base}.pln`, plnText(x), 'application/xml');
  if (kind === 'ofp') download(`${base}_OFP.txt`, ofpText(x));
  return 'Файл сохранён';
}
