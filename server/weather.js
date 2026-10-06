// Погода: METAR/TAF (aviationweather.gov → VATSIM → NOAA), ветер на высотах (Open-Meteo).
// Все источники бесплатные и без ключей. Ответы кэшируются.
const cache = new Map();
const TTL = 5 * 60 * 1000;

async function cached(key, ttl, fn) {
  const c = cache.get(key);
  if (c && Date.now() - c.t < ttl) return c.v;
  const v = await fn();
  cache.set(key, { t: Date.now(), v });
  return v;
}

async function getText(url, timeout = 8000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'flight-planner-sim/0.1' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally { clearTimeout(timer); }
}

async function metarFromAwc(icao) {
  const t = await getText(`https://aviationweather.gov/api/data/metar?ids=${icao}&format=raw&hours=2`);
  return t.trim().split('\n')[0]?.trim() || null;
}
async function tafFromAwc(icao) {
  const t = await getText(`https://aviationweather.gov/api/data/taf?ids=${icao}&format=raw`);
  return t.trim().replace(/\s+/g, ' ') || null;
}
async function metarFromVatsim(icao) {
  const t = await getText(`https://metar.vatsim.net/metar.php?id=${icao}`);
  return t.trim() || null;
}
async function metarFromNoaa(icao) {
  const t = await getText(`https://tgftp.nws.noaa.gov/data/observations/metar/stations/${icao}.TXT`);
  return t.trim().split('\n').slice(1).join(' ').trim() || null;
}
async function tafFromNoaa(icao) {
  const t = await getText(`https://tgftp.nws.noaa.gov/data/forecasts/taf/stations/${icao}.TXT`);
  return t.trim().split('\n').slice(1).join(' ').replace(/\s+/g, ' ').trim() || null;
}

async function firstOk(fns) {
  const errors = [];
  for (const [name, fn] of fns) {
    try {
      const v = await fn();
      if (v) return { value: v, source: name };
    } catch (e) { errors.push(`${name}: ${e.message}`); }
  }
  return { value: null, source: null, errors };
}

export async function getWeather(icao) {
  icao = icao.toUpperCase();
  return cached('wx:' + icao, TTL, async () => {
    const [m, t] = await Promise.all([
      firstOk([['aviationweather.gov', () => metarFromAwc(icao)], ['VATSIM', () => metarFromVatsim(icao)], ['NOAA', () => metarFromNoaa(icao)]]),
      firstOk([['aviationweather.gov', () => tafFromAwc(icao)], ['NOAA', () => tafFromNoaa(icao)]]),
    ]);
    return { icao, metar: m.value, metarSource: m.source, taf: t.value, tafSource: t.source, errors: [...(m.errors || []), ...(t.errors || [])], time: new Date().toISOString() };
  });
}

/** Ветер/температура на уровне давления для набора точек (Open-Meteo) */
export async function getWinds(points, hPa) {
  const lv = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100].reduce((a, b) => Math.abs(b - hPa) < Math.abs(a - hPa) ? b : a);
  const lats = points.map((p) => p.lat.toFixed(2)).join(',');
  const lons = points.map((p) => p.lon.toFixed(2)).join(',');
  const key = `w:${lv}:${lats}:${lons}`;
  return cached(key, 30 * 60 * 1000, async () => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}` +
      `&hourly=wind_speed_${lv}hPa,wind_direction_${lv}hPa,temperature_${lv}hPa&wind_speed_unit=kn&forecast_days=2&timezone=GMT`;
    const data = JSON.parse(await getText(url, 12000));
    const arr = Array.isArray(data) ? data : [data];
    const hourIdx = new Date().getUTCHours();
    return {
      level: lv,
      points: arr.map((d) => ({
        lat: d.latitude, lon: d.longitude,
        dir: d.hourly[`wind_direction_${lv}hPa`][hourIdx],
        spd: d.hourly[`wind_speed_${lv}hPa`][hourIdx],
        temp: d.hourly[`temperature_${lv}hPa`][hourIdx],
      })),
    };
  });
}
