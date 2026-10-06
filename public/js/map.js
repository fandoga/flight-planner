// Карта: монохромная подложка, маршрут, аэропорты, радиосредства, трассы
import { interpolate, distNm } from './calc.js';
import { icon } from './art.js';
import { photoBox, hydratePhotos } from './photos.js';

let map, routeLayer, aptLayer, navLayer, awyLayer, lmLayer;
let lmMarkers = [];
let wptMarkers = [];
let tourLayer;
/** Цвет из токенов дизайн-системы (public/css/tokens.css) */
const tok = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const layersOn = { airports: true, navaids: false, airways: false };
let onAirportClick = () => {};

export function initMap(opts = {}) {
  onAirportClick = opts.onAirportClick || onAirportClick;
  map = L.map('map', { zoomControl: true, worldCopyJump: true, minZoom: 2, preferCanvas: true, attributionControl: true })
    .setView([55, 50], 4);
  setupBasemaps();
  awyLayer = L.layerGroup().addTo(map);
  aptLayer = L.layerGroup().addTo(map);
  navLayer = L.layerGroup().addTo(map);
  routeLayer = L.layerGroup().addTo(map);
  lmLayer = L.layerGroup().addTo(map);
  tourLayer = L.layerGroup().addTo(map);
  map.on('moveend', refreshOverlays);
  map.on('zoomend', layoutLabels);
  document.querySelectorAll('#layerCtrl input').forEach((cb) => {
    cb.checked = layersOn[cb.dataset.layer];
    cb.addEventListener('change', () => { layersOn[cb.dataset.layer] = cb.checked; refreshOverlays(); });
  });
  refreshOverlays();
  return map;
}

let ovrTimer, ovrSeq = 0;
function refreshOverlays() {
  clearTimeout(ovrTimer);
  ovrTimer = setTimeout(loadOverlays, 250);
}

async function loadOverlays() {
  const seq = ++ovrSeq;
  const b = map.getBounds();
  const z = map.getZoom();
  const bbox = [b.getSouth(), Math.max(-180, b.getWest()), b.getNorth(), Math.min(180, b.getEast())].map((x) => x.toFixed(3)).join(',');
  const jobs = [];
  if (layersOn.airports && z >= 4) jobs.push(fetch(`/api/airports?bbox=${bbox}&z=${z}`).then((r) => r.json()).then((d) => ['apt', d]));
  if (layersOn.navaids && z >= 6) jobs.push(fetch(`/api/navaids?bbox=${bbox}&z=${z}`).then((r) => r.json()).then((d) => ['nav', d]));
  if (layersOn.airways && z >= 6) jobs.push(fetch(`/api/airways?bbox=${bbox}`).then((r) => r.json()).then((d) => ['awy', d]));
  const res = await Promise.all(jobs).catch(() => []);
  if (seq !== ovrSeq) return;
  aptLayer.clearLayers(); navLayer.clearLayers(); awyLayer.clearLayers();
  for (const [kind, data] of res) {
    if (kind === 'apt') {
      for (const [icao, lat, lon, rank] of data) {
        const m = L.circleMarker([lat, lon], {
          radius: rank >= 3 ? 4 : rank === 2 ? 3 : 2, color: tok('--color-neutral'), weight: 1, fillColor: rank >= 3 ? tok('--color-muted') : tok('--color-rule'), fillOpacity: 0.9,
        }).bindTooltip(icao, { className: 'nav-tip', direction: 'top', offset: [0, -4] });
        m.on('click', () => onAirportClick(icao));
        aptLayer.addLayer(m);
      }
    } else if (kind === 'nav') {
      for (const [id, lat, lon, type, freq] of data) {
        const isVor = type === 'VOR' || type === 'DME';
        const m = L.circleMarker([lat, lon], {
          radius: isVor ? 3.5 : type === 'NDB' ? 3 : 1.8,
          color: isVor ? tok('--color-sky') : type === 'NDB' ? tok('--color-warn') : tok('--color-neutral'), weight: 1, fillOpacity: 0.6,
        }).bindTooltip(`${id}${freq ? ' ' + freq : ''}`, { className: 'nav-tip', direction: 'top' });
        navLayer.addLayer(m);
      }
    } else if (kind === 'awy') {
      for (const [la1, lo1, la2, lo2, name, level] of data) {
        awyLayer.addLayer(L.polyline([[la1, lo1], [la2, lo2]], { color: level === 2 ? tok('--color-violet') : tok('--color-rule'), weight: 1, opacity: level === 2 ? 0.45 : 0.8 }).bindTooltip(name, { className: 'nav-tip', sticky: true }));
      }
    }
  }
}

/** Ломаная по большим кругам с «развёрткой» долготы через 180° */
function geodesicLatLngs(pts) {
  const out = [];
  let offset = 0;
  let prevLon = null;
  for (let i = 0; i < pts.length; i++) {
    const seg = [];
    if (i === 0) seg.push(pts[0]);
    else {
      const d = distNm(pts[i - 1], pts[i]);
      const n = Math.min(64, Math.ceil(d / 100));
      for (let k = 1; k <= n; k++) seg.push(interpolate(pts[i - 1], pts[i], k / n));
    }
    for (const p of seg) {
      let lon = p.lon + offset;
      if (prevLon != null) {
        while (lon - prevLon > 180) { lon -= 360; offset -= 360; }
        while (lon - prevLon < -180) { lon += 360; offset += 360; }
      }
      out.push([p.lat, lon]);
      prevLon = lon;
    }
  }
  return out;
}

export function drawRoute({ dep, arr, altn, points, log, depRwy, arrRwy }, fit = false) {
  routeLayer.clearLayers();
  if (!dep || !arr) return;
  const all = [dep, ...(points || []), arr];
  const latlngs = geodesicLatLngs(all);
  routeLayer.addLayer(L.polyline(latlngs, { color: tok('--color-accent'), weight: 6, opacity: 0.22, interactive: false }));
  routeLayer.addLayer(L.polyline(latlngs, { color: tok('--color-accent'), weight: 2.5, opacity: 1, interactive: false }));
  if (altn) {
    routeLayer.addLayer(L.polyline(geodesicLatLngs([arr, altn]), { color: tok('--color-violet'), weight: 1.6, dashArray: '6 6', opacity: 0.8, interactive: false }));
  }
  // точки маршрута
  const lonFix = (lat, lon) => {
    // взять долготу из развёрнутой линии, чтобы маркеры совпадали с линией
    let best = lon, bd = 1e9;
    for (const [la, lo] of latlngs) {
      const d = Math.abs(la - lat) + Math.abs(((lo - lon) % 360 + 540) % 360 - 180);
      if (d < bd) { bd = d; best = lo; }
    }
    return lon + Math.round((best - lon) / 360) * 360;
  };
  wptMarkers = [];
  (points || []).forEach((p, idx) => {
    const isProc = p.stage === 'SID' || p.stage === 'STAR';
    const m = L.circleMarker([p.lat, lonFix(p.lat, p.lon)], {
      radius: p.type === 'VOR' || p.type === 'NDB' ? 4 : 3, color: isProc ? tok('--color-sky') : tok('--color-accent'), weight: 1.5, fillColor: tok('--color-paper'), fillOpacity: 1,
    });
    m.bindPopup(`<b>${p.ident}</b> ${p.type || ''}${p.freq ? ' ' + p.freq : ''}<br>${p.via ? 'через ' + p.via + '<br>' : ''}${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`);
    m._label = p.ident;
    routeLayer.addLayer(m);
    wptMarkers.push(m);
  });
  // T/C, T/D
  for (const r of log || []) {
    if (r.type !== 'TOC' && r.type !== 'TOD') continue;
    routeLayer.addLayer(L.circleMarker([r.lat, lonFix(r.lat, r.lon)], { radius: 4, color: tok('--color-warn'), weight: 2, fillOpacity: 0 })
      .bindTooltip(r.ident, { permanent: true, direction: 'left', offset: [-5, 0], className: 'wpt-label' }));
  }
  const apt = (a, cls, rw) => {
    routeLayer.addLayer(L.circleMarker([a.lat, lonFix(a.lat, a.lon)], { radius: 6, color: cls === 'altn' ? tok('--color-violet') : tok('--color-accent'), weight: 2.5, fillColor: tok('--color-paper'), fillOpacity: 1 })
      .bindTooltip(a.icao + (rw ? ' ' + rw : ''), { permanent: true, direction: 'top', offset: [0, -8], className: 'apt-label ' + cls }));
  };
  apt(dep, '', depRwy);
  apt(arr, '', arrRwy);
  if (altn) apt(altn, 'altn');
  layoutLabels();
  if (fit) {
    const b = L.latLngBounds(latlngs);
    if (altn) b.extend([altn.lat, lonFix(altn.lat, altn.lon)]);
    const left = document.getElementById('leftPanel').classList.contains('collapsed') ? 40 : 400;
    const right = document.getElementById('rightPanel').classList.contains('collapsed') ? 40 : 440;
    map.fitBounds(b, { paddingTopLeft: [left, 90], paddingBottomRight: [right, 50], maxZoom: 9 });
  }
}

// Подложки без API-ключа. Esri Dark Gray — тёмно-серая «из коробки»,
// OSM — стандартная, затемняется и обесцвечивается CSS-фильтром.
const NAV_ATTR = ' | Навданные: OurAirports, X-Plane/FlightGear (GPL)';
const BASEMAPS = {
  esri: {
    name: 'Тёмная (Esri)', cls: 'bm-esri',
    layers: () => [
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        maxNativeZoom: 16, maxZoom: 18, attribution: 'Tiles &copy; Esri — Esri, DeLorme, NAVTEQ' + NAV_ATTR,
      }),
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
        maxNativeZoom: 16, maxZoom: 18, opacity: 0.8,
      }),
    ],
  },
  osm: {
    name: 'OpenStreetMap (тёмная)', cls: 'bm-osm',
    layers: () => [
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' + NAV_ATTR,
      }),
    ],
  },
};
let baseGroup = null;
let baseKey = null;

function setBasemap(key, auto = false) {
  if (!BASEMAPS[key]) key = 'esri';
  if (baseGroup) map.removeLayer(baseGroup);
  baseKey = key;
  const bm = BASEMAPS[key];
  const layers = bm.layers();
  baseGroup = L.layerGroup(layers).addTo(map);
  baseGroup.eachLayer((l) => l.bringToBack && l.bringToBack());
  const c = map.getContainer();
  Object.values(BASEMAPS).forEach((b) => c.classList.remove(b.cls));
  c.classList.add(bm.cls);
  const sel = document.getElementById('basemapSel');
  if (sel) sel.value = key;
  try { if (!auto) localStorage.setItem('fp-basemap', key); } catch { /* пусто */ }
  // автопереключение, если подложка не грузится
  let ok = 0, fail = 0;
  layers[0].on('tileload', () => { ok++; });
  layers[0].on('tileerror', () => {
    fail++;
    if (fail >= 6 && ok === 0 && baseKey === key && !auto) {
      const other = key === 'esri' ? 'osm' : 'esri';
      setBasemap(other, true);
    }
  });
}

function setupBasemaps() {
  let saved = 'esri';
  try { saved = localStorage.getItem('fp-basemap') || 'esri'; } catch { /* пусто */ }
  const ctrl = document.getElementById('layerCtrl');
  if (ctrl && !document.getElementById('basemapSel')) {
    const sel = document.createElement('select');
    sel.id = 'basemapSel';
    sel.className = 'select-sm';
    sel.innerHTML = Object.entries(BASEMAPS).map(([k, b]) => `<option value="${k}">${b.name}</option>`).join('');
    sel.addEventListener('change', () => setBasemap(sel.value));
    ctrl.prepend(sel);
  }
  setBasemap(saved);
}

/** Достопримечательности рейса тура */
export function drawLandmarks(list, onOpen = () => {}) {
  if (!lmLayer) return;
  const key = list.map((l) => l.wiki).join('|');
  if (lmLayer._key === key) return;
  lmLayer._key = key;
  lmLayer.clearLayers();
  lmMarkers = list.map((lm, i) => {
    const m = L.marker([lm.lat, lm.lon], {
      icon: L.divIcon({ className: 'lm-icon', html: `<div class="lm-pin">${icon('camera')}</div>`, iconSize: [32, 32], iconAnchor: [4, 30], popupAnchor: [12, -28] }),
      title: lm.name, keyboard: true,
    });
    m.bindPopup(`<div class="lm-pop"><div class="ph-wrap">${photoBox(lm, { credit: false })}</div><h5>${lm.name}</h5><p>${lm.text}</p></div>`, { maxWidth: 260 });
    m.on('popupopen', (e) => hydratePhotos(e.popup.getElement()));
    m.on('click', () => onOpen(i));
    lmLayer.addLayer(m);
    return m;
  });
}

export function focusLandmark(i) {
  const m = lmMarkers[i];
  if (!m) return;
  map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 8), { duration: 0.8 });
  setTimeout(() => m.openPopup(), 850);
}

/** Весь тур на карте: линии рейсов + пронумерованные узлы. onPick(legId) — выбор рейса */
export function drawTour(tour, selectedId, onPick = () => {}, fit = true) {
  if (!tourLayer) return;
  tourLayer.clearLayers();
  routeLayer.clearLayers();
  lmLayer.clearLayers(); lmLayer._key = '';
  const bounds = L.latLngBounds([]);
  const apt = (icao) => tour.airports[icao];
  const sel = [];
  for (const leg of tour.legs) {
    const on = leg.id === selectedId;
    leg.segments.forEach((seg, k) => {
      if (k > 0) return; // обратный сегмент кругового рейса повторяет прямой
      const pts = [apt(seg.dep), ...seg.enroute, apt(seg.arr)];
      const ll = geodesicLatLngs(pts);
      ll.forEach((p) => bounds.extend(p));
      const line = L.polyline(ll, { color: on ? tok('--color-accent') : tok('--color-violet'), weight: on ? 3.5 : 2, opacity: on ? 1 : 0.55, dashArray: seg.rules === 'V' ? '4 6' : null });
      line.on('click', () => onPick(leg.id));
      line.bindTooltip(`Рейс ${leg.id}: ${seg.dep} → ${seg.arr}`, { className: 'nav-tip', sticky: true });
      if (on) sel.push(line); else tourLayer.addLayer(line);
    });
  }
  sel.forEach((l) => tourLayer.addLayer(l));
  // узлы: номер рейса у аэропорта вылета; финиш — у последнего прилёта
  const nodes = new Map();
  for (const leg of tour.legs) {
    const dep = leg.segments[0].dep;
    if (!nodes.has(dep)) nodes.set(dep, []);
    nodes.get(dep).push(leg.id);
  }
  const last = tour.legs[tour.legs.length - 1].segments[0].arr;
  for (const [icao, ids] of nodes) {
    const a = apt(icao);
    const on = ids.includes(selectedId);
    const m = L.marker([a.lat, a.lon], {
      icon: L.divIcon({ className: 'tour-node-wrap', html: `<span class="tour-node ${on ? 'is-on' : ''}">${ids.join('·')}</span><span class="tour-node__code">${icao}</span>`, iconSize: [0, 0] }),
      keyboard: false,
    });
    m.on('click', () => onPick(ids[0]));
    tourLayer.addLayer(m);
  }
  const f = apt(last);
  tourLayer.addLayer(L.marker([f.lat, f.lon], { icon: L.divIcon({ className: 'tour-node-wrap', html: `<span class="tour-node is-finish">${icon('flag')}</span><span class="tour-node__code">${last}</span>`, iconSize: [0, 0] }), keyboard: false }));
  const wide = innerWidth > 900;
  if (fit) map.fitBounds(bounds, { paddingTopLeft: [wide ? 470 : 16, wide ? 90 : 76], paddingBottomRight: [wide ? 400 : 16, wide ? 40 : Math.round(innerHeight * 0.56)], maxZoom: 6 });
}

export function clearTour() { tourLayer && tourLayer.clearLayers(); }

export function invalidate() { map && map.invalidateSize(); }

/** Подписи точек маршрута без наложений: показываем только те, что не ближе 46 px к уже показанным */
function layoutLabels() {
  const shown = [];
  for (const m of wptMarkers) {
    const pt = map.latLngToContainerPoint(m.getLatLng());
    const free = shown.every((q) => Math.abs(q.x - pt.x) > 46 || Math.abs(q.y - pt.y) > 16);
    if (free) {
      shown.push(pt);
      if (!m.getTooltip()) m.bindTooltip(m._label, { permanent: true, direction: 'right', offset: [5, 0], className: 'wpt-label' });
      m.openTooltip();
    } else if (m.getTooltip()) {
      m.unbindTooltip();
    }
  }
}
