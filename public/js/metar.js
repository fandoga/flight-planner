// Разбор METAR и выбор ВПП по ветру

const WX = {
  MI: 'мелкий', BC: 'клочья', PR: 'частичный', DR: 'позёмок', BL: 'метель', SH: 'ливневый', TS: 'гроза', FZ: 'переохл.',
  DZ: 'морось', RA: 'дождь', SN: 'снег', SG: 'снежные зёрна', IC: 'ледяные иглы', PL: 'ледяная крупа', GR: 'град', GS: 'мелкий град', UP: 'осадки',
  BR: 'дымка', FG: 'туман', FU: 'дым', VA: 'вулк. пепел', DU: 'пыль', SA: 'песок', HZ: 'мгла', PY: 'брызги',
  PO: 'пыльный вихрь', SQ: 'шквал', FC: 'смерч', SS: 'песчаная буря', DS: 'пыльная буря',
};
const CLOUD = { FEW: 'незначит.', SCT: 'рассеян.', BKN: 'значит.', OVC: 'сплошная', VV: 'верт. видимость' };

export function parseMetar(raw) {
  if (!raw) return null;
  const s = raw.replace(/=+\s*$/, '').trim();
  const t = s.split(/\s+/);
  const m = { raw: s, wind: null, vis: null, rvr: [], wx: [], clouds: [], temp: null, dew: null, qnh: null, cavok: false };
  let i = 0;
  if (t[i] === 'METAR' || t[i] === 'SPECI') i++;
  if (/^[A-Z]{4}$/.test(t[i])) m.icao = t[i++];
  if (/^\d{6}Z$/.test(t[i])) m.time = t[i++];
  for (; i < t.length; i++) {
    const x = t[i];
    if (x === 'AUTO' || x === 'COR' || x === 'NIL') continue;
    if (x === 'TEMPO' || x === 'BECMG' || x === 'NOSIG' || x === 'RMK') break;
    let r;
    if ((r = x.match(/^(VRB|\d{3})(\d{2,3})(?:G(\d{2,3}))?(KT|MPS|KMH)$/))) {
      const k = r[4] === 'MPS' ? 1.944 : r[4] === 'KMH' ? 0.54 : 1;
      m.wind = { dir: r[1] === 'VRB' ? null : +r[1], spd: Math.round(+r[2] * k), gust: r[3] ? Math.round(+r[3] * k) : null, unit: r[4] };
      continue;
    }
    if ((r = x.match(/^(\d{3})V(\d{3})$/)) && m.wind) { m.wind.from = +r[1]; m.wind.to = +r[2]; continue; }
    if (x === 'CAVOK') { m.cavok = true; m.vis = 10000; continue; }
    if (/^\d{4}$/.test(x) && m.vis == null) { m.vis = +x === 9999 ? 10000 : +x; continue; }
    if (/^\d{4}[NSEW]{0,2}$/.test(x)) continue; // минимальная видимость по направлению
    if ((r = x.match(/^(M|P)?(\d+)(?:\/(\d+))?SM$/))) {
      m.vis = Math.round((r[3] ? +r[2] / +r[3] : +r[2]) * 1609); continue;
    }
    if (/^\d$/.test(x) && /^\d\/\dSM$/.test(t[i + 1] || '')) {
      const [a, b] = t[i + 1].replace('SM', '').split('/');
      m.vis = Math.round((+x + a / b) * 1609); i++; continue;
    }
    if ((r = x.match(/^R(\d{2}[LRC]?)\/([PM]?\d{4})/))) { m.rvr.push({ rwy: r[1], val: r[2] }); continue; }
    if ((r = x.match(/^(FEW|SCT|BKN|OVC|VV)(\d{3}|\/\/\/)(CB|TCU)?$/))) {
      m.clouds.push({ cover: r[1], base: r[2] === '///' ? null : +r[2] * 100, type: r[3] || '' }); continue;
    }
    if (/^(NSC|SKC|CLR|NCD)$/.test(x)) continue;
    if ((r = x.match(/^(M?\d{2})\/(M?\d{2})?$/))) {
      m.temp = +r[1].replace('M', '-'); m.dew = r[2] ? +r[2].replace('M', '-') : null; continue;
    }
    if ((r = x.match(/^Q(\d{4})$/))) { m.qnh = { hpa: +r[1], inhg: +(r[1] * 0.02953).toFixed(2) }; continue; }
    if ((r = x.match(/^A(\d{4})$/))) { m.qnh = { hpa: Math.round(r[1] / 100 / 0.02953), inhg: +r[1] / 100 }; continue; }
    if ((r = x.match(/^(\+|-|VC)?((?:MI|BC|PR|DR|BL|SH|TS|FZ)?)((?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)+)$/))) {
      const intensity = r[1] === '+' ? 'сильный ' : r[1] === '-' ? 'слабый ' : r[1] === 'VC' ? 'в окрестностях ' : '';
      const parts = (r[2] + r[3]).match(/.{2}/g).map((c) => WX[c] || c);
      m.wx.push({ code: x, text: intensity + parts.join(' ') });
    }
  }
  const ceil = m.clouds.find((c) => (c.cover === 'BKN' || c.cover === 'OVC' || c.cover === 'VV') && c.base != null);
  m.ceiling = m.cavok ? null : ceil ? ceil.base : null;
  m.category = flightCategory(m.vis, m.ceiling);
  return m;
}

export function flightCategory(vis, ceiling) {
  const v = vis ?? 10000, c = ceiling ?? 99999;
  if (c < 500 || v < 1600) return 'LIFR';
  if (c < 1000 || v < 4800) return 'IFR';
  if (c <= 3000 || v <= 8000) return 'MVFR';
  return 'VFR';
}

export function describeMetar(m) {
  if (!m) return [];
  const out = [];
  if (m.time) out.push(['Время', `${m.time.slice(0, 2)} число, ${m.time.slice(2, 4)}:${m.time.slice(4, 6)} UTC`]);
  if (m.wind) {
    const w = m.wind;
    let s = w.dir == null ? `перем. ${w.spd} уз` : `${String(w.dir).padStart(3, '0')}° ${w.spd} уз`;
    if (w.gust) s += `, порывы ${w.gust}`;
    if (w.from != null) s += ` (${w.from}°–${w.to}°)`;
    out.push(['Ветер', s]);
  }
  if (m.vis != null) out.push(['Видимость', m.cavok ? 'CAVOK' : m.vis >= 10000 ? '10 км и более' : `${m.vis} м`]);
  for (const r of m.rvr) out.push([`RVR ${r.rwy}`, r.val.replace('P', '>').replace('M', '<') + ' м']);
  if (m.wx.length) out.push(['Явления', m.wx.map((w) => w.text).join(', ')]);
  if (m.clouds.length) out.push(['Облачность', m.clouds.map((c) => `${CLOUD[c.cover]} ${c.base ?? '—'} ft${c.type ? ' ' + c.type : ''}`).join('; ')]);
  if (m.temp != null) out.push(['Темп./точка росы', `${m.temp}° / ${m.dew ?? '—'}°`]);
  if (m.qnh) out.push(['QNH', `${m.qnh.hpa} гПа / ${m.qnh.inhg.toFixed(2)} inHg`]);
  return out;
}

/** Компоненты ветра для ВПП (курс истинный, ветер METAR — истинный) */
export function windComponents(rwyHdg, wind) {
  if (!wind || wind.dir == null || rwyHdg == null) return { head: 0, cross: wind ? (wind.dir == null ? wind.spd : 0) : 0, vrb: !!wind && wind.dir == null };
  const spd = wind.gust ? (wind.spd + wind.gust) / 2 : wind.spd;
  const a = ((wind.dir - rwyHdg) * Math.PI) / 180;
  return { head: Math.round(spd * Math.cos(a)), cross: Math.round(spd * Math.sin(a)) };
}

/**
 * Ранжирование концов ВПП: ветер (встречный), наличие ILS при плохой погоде, длина.
 * @returns [{ident, hdg, length, ils, head, cross, score, ok, reason}]
 */
export function rankRunways(airport, metar, opts = {}) {
  const { minLength = 0, mode = 'dep', prefBearing = null } = opts;
  const wind = metar?.wind;
  const lowVis = metar && (metar.category === 'IFR' || metar.category === 'LIFR');
  const out = [];
  for (const rw of airport.runways || []) {
    for (const e of rw.ends) {
      if (!e.ident) continue;
      const c = windComponents(e.hdg, wind);
      let score = 0;
      const reasons = [];
      score += c.head * 3;
      if (c.head < -5) { score -= 200; reasons.push('попутный > 5 уз'); }
      else if (c.head < 0) score -= 10;
      if (Math.abs(c.cross) > 30) { score -= 150; reasons.push('боковой > 30 уз'); }
      score += Math.min(rw.length || 0, 13000) / 500;
      const hasIls = e.ils && e.ils.length > 0;
      if (mode === 'arr' && hasIls) score += lowVis ? 60 : 12;
      if (mode === 'arr' && lowVis && !hasIls) reasons.push('нет ILS при IFR');
      if ((rw.length || 0) < minLength) { score -= 300; reasons.push('ВПП коротка для ВС'); }
      if (!/ASP|CON|PEM|BIT|TAR|PAV/.test(rw.surface || '')) score -= 20;
      // при штиле — по направлению маршрута
      if ((!wind || wind.spd < 4) && prefBearing != null && e.hdg != null) {
        const d = Math.abs(((prefBearing - e.hdg) % 360 + 540) % 360 - 180);
        score += (180 - d) / 15;
      }
      out.push({ ident: e.ident, hdg: e.hdg, length: rw.length, width: rw.width, surface: rw.surface, ils: e.ils || [], lat: e.lat, lon: e.lon, elev: e.elev, head: c.head, cross: c.cross, score, ok: score > -100, reason: reasons.join(', ') });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
