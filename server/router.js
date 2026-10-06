// Построение маршрута по реальной сети авиатрасс (A*), автоматический выбор
// SID/STAR (при наличии CIFP), разбор и развёртывание маршрута, введённого вручную.
import { distNm, bearing, angleDiff, MinHeap } from './geo.js';
import { procMatchesRunway } from './navdata.js';

const AWY_CHANGE_PENALTY = 8;   // nm "штрафа" за смену трассы — меньше зигзагов
const MAX_EXPAND = 400000;

export class Router {
  constructor(nav) { this.nav = nav; }

  // ---------- процедуры ----------

  /** Ноги процедуры с координатами */
  resolveLegs(legs, apt) {
    const out = [];
    let ref = { lat: apt.lat, lon: apt.lon };
    for (const l of legs) {
      if (!l.fix || /^RW/.test(l.fix)) continue;
      const i = this.nav.findIdent(l.fix, ref.lat, ref.lon);
      if (i == null) continue;
      const n = this.nav.nodes[i];
      if (distNm(n.lat, n.lon, apt.lat, apt.lon) > 250) continue;
      if (out.length && out[out.length - 1].i === i) continue;
      out.push({ i, alt: fmtAlt(l), spd: l.spd });
      ref = n;
    }
    return out;
  }

  sidCandidates(dep, rwy) {
    const procs = this.nav.procedures(dep.icao);
    if (!procs || !rwy) return [];
    const out = [];
    for (const p of procs.SID.values()) {
      if (!procMatchesRunway(p, rwy)) continue;
      const rwyKey = [...p.rwyTrans.keys()].find((k) => procMatchesRunway({ runways: new Set([k]) }, rwy));
      const base = [...(rwyKey ? p.rwyTrans.get(rwyKey) : []), ...p.common];
      const trans = p.enrTrans.size ? [...p.enrTrans.entries()] : [[null, []]];
      for (const [tn, tl] of trans) {
        const legs = this.resolveLegs([...base, ...tl], dep);
        if (!legs.length) continue;
        out.push({ name: p.name, trans: tn, legs, exit: legs[legs.length - 1].i });
      }
    }
    return out;
  }

  starCandidates(arr, rwy) {
    const procs = this.nav.procedures(arr.icao);
    if (!procs || !rwy) return [];
    const out = [];
    for (const p of procs.STAR.values()) {
      if (!procMatchesRunway(p, rwy)) continue;
      const rwyKey = [...p.rwyTrans.keys()].find((k) => procMatchesRunway({ runways: new Set([k]) }, rwy));
      const tail = [...p.common, ...(rwyKey ? p.rwyTrans.get(rwyKey) : [])];
      const trans = p.enrTrans.size ? [...p.enrTrans.entries()] : [[null, []]];
      for (const [tn, tl] of trans) {
        const legs = this.resolveLegs([...tl, ...tail], arr);
        if (!legs.length) continue;
        out.push({ name: p.name, trans: tn, legs, entry: legs[0].i });
      }
    }
    return out;
  }

  approaches(arr, rwy) {
    const procs = this.nav.procedures(arr.icao);
    if (!procs) return [];
    const out = [];
    for (const p of procs.APPCH.values()) {
      if (rwy && !procMatchesRunway(p, rwy)) continue;
      out.push({
        name: p.name, type: p.approachType, runways: [...p.runways].map((r) => r.slice(2)),
        transitions: [...p.appTrans.keys()],
        legs: this.resolveLegs(p.common, arr).map((l) => ({ ...this.nav.nodeInfo(l.i), alt: l.alt })),
      });
    }
    return out;
  }

  pathLen(legs, apt) {
    let d = 0, prev = apt;
    for (const l of legs) { const n = this.nav.nodes[l.i]; d += distNm(prev.lat, prev.lon, n.lat, n.lon); prev = n; }
    return d;
  }

  // ---------- автоматический маршрут ----------

  /**
   * @param {object} o {dep, arr, depRwy, arrRwy, level: 'high'|'low', useProcedures}
   */
  build(o) {
    const { dep, arr } = o;
    const nav = this.nav;
    const gc = distNm(dep.lat, dep.lon, arr.lat, arr.lon);
    const crs = bearing(dep.lat, dep.lon, arr.lat, arr.lon);
    const crsBack = bearing(arr.lat, arr.lon, dep.lat, dep.lon);
    const high = o.level !== 'low';

    // Короткие перелёты — прямо
    if (gc < 40) return this.finish(o, [], null, null, 'Короткий перелёт — маршрут напрямую');

    // Стартовые узлы
    const starts = new Map(); // node -> {cost, sid}
    const sids = o.useProcedures !== false ? this.sidCandidates(dep, o.depRwy).filter((x) => !o.sid || x.name === o.sid) : [];
    for (const s of sids) {
      if (!nav.adj[s.exit]) continue;
      const n = nav.nodes[s.exit];
      // SID в сторону от маршрута штрафуем
      const off = angleDiff(bearing(dep.lat, dep.lon, n.lat, n.lon), crs);
      const cost = this.pathLen(s.legs, dep) + (off > 90 ? 60 : off > 60 ? 20 : 0);
      const prev = starts.get(s.exit);
      if (!prev || prev.cost > cost) starts.set(s.exit, { cost, sid: s });
    }
    if (!starts.size) this.connectAirport(dep, crs, starts, gc);

    const ends = new Map();
    const stars = o.useProcedures !== false ? this.starCandidates(arr, o.arrRwy).filter((x) => !o.star || x.name === o.star) : [];
    for (const s of stars) {
      if (!nav.adj[s.entry]) continue;
      const n = nav.nodes[s.entry];
      const off = angleDiff(bearing(arr.lat, arr.lon, n.lat, n.lon), crsBack);
      const cost = this.pathLen([...s.legs].reverse(), arr) + (off > 90 ? 60 : off > 60 ? 20 : 0);
      const prev = ends.get(s.entry);
      if (!prev || prev.cost > cost) ends.set(s.entry, { cost, star: s });
    }
    if (!ends.size) this.connectAirport(arr, crsBack, ends, gc);

    let res = this.astar(starts, ends, arr, high, false);
    let note = null;
    if (!res || res.cost > gc * 1.15 + 60) {
      const res2 = this.astar(starts, ends, arr, high, true);
      if (res2 && (!res || res2.cost < res.cost)) { res = res2; note = 'Часть маршрута проложена DCT (разрыв сети трасс)'; }
    }
    if (!res) return this.finish(o, [], null, null, 'Сеть трасс не найдена — маршрут напрямую (DCT)');
    const sid = starts.get(res.path[0].node)?.sid || null;
    const star = ends.get(res.path[res.path.length - 1].node)?.star || null;
    return this.finish(o, res.path, sid, star, note);
  }

  connectAirport(apt, crs, map, gc) {
    const nav = this.nav;
    for (const radius of [40, 80, 150, 300]) {
      const near = nav.nearby(apt.lat, apt.lon, Math.min(radius, Math.max(25, gc * 0.45)), (i) => !!nav.adj[i]);
      for (const { i, d } of near.slice(0, 40)) {
        const n = nav.nodes[i];
        const off = angleDiff(bearing(apt.lat, apt.lon, n.lat, n.lon), crs);
        if (off > 100 && d > 15) continue;
        map.set(i, { cost: d * 1.15 + (off > 60 ? d * 0.5 : 0) });
      }
      if (map.size >= 4) break;
    }
  }

  astar(starts, ends, arr, high, allowDct) {
    const nav = this.nav;
    const N = nav.nodes.length;
    const GOAL = N;
    const g = new Float64Array(N + 1).fill(Infinity);
    const from = new Int32Array(N + 1).fill(-1);
    const via = new Array(N + 1);
    const h = (i) => distNm(nav.nodes[i].lat, nav.nodes[i].lon, arr.lat, arr.lon);
    const heap = new MinHeap();
    for (const [i, s] of starts) {
      if (s.cost < g[i]) { g[i] = s.cost; via[i] = 'DCT'; heap.push(s.cost + h(i), i); }
    }
    let expanded = 0;
    const closed = new Uint8Array(N + 1);
    while (heap.size) {
      const u = heap.pop();
      if (u === GOAL) break;
      if (closed[u]) continue;
      closed[u] = 1;
      if (++expanded > MAX_EXPAND) break;
      const e = ends.get(u);
      if (e) {
        const c = g[u] + e.cost;
        if (c < g[GOAL]) { g[GOAL] = c; from[GOAL] = u; via[GOAL] = 'DCT'; heap.push(c, GOAL); }
      }
      const edges = nav.adj[u];
      if (edges) {
        for (const ed of edges) {
          let w = ed.dist;
          if (high && ed.level === 1) w *= 1.12;
          if (!high && ed.level === 2) w *= 1.5;
          if (via[u] !== ed.awy) w += AWY_CHANGE_PENALTY;
          const c = g[u] + w;
          if (c < g[ed.to]) { g[ed.to] = c; from[ed.to] = u; via[ed.to] = ed.awy; heap.push(c + h(ed.to), ed.to); }
        }
      }
      if (allowDct) {
        const nu = nav.nodes[u];
        const hu = h(u);
        // Прямо на конец сети, если рядом
        for (const [ei, es] of ends) {
          const ne = nav.nodes[ei];
          const d = distNm(nu.lat, nu.lon, ne.lat, ne.lon);
          if (d < 2500) {
            const c = g[u] + d * 1.3 + 30;
            if (c < g[ei]) { g[ei] = c; from[ei] = u; via[ei] = 'DCT'; heap.push(c + h(ei), ei); }
          }
        }
        for (const { i, d } of nav.nearby(nu.lat, nu.lon, 250, (i) => !!nav.adj[i]).slice(0, 60)) {
          if (h(i) >= hu) continue;
          const c = g[u] + d * 1.3 + 30;
          if (c < g[i]) { g[i] = c; from[i] = u; via[i] = 'DCT'; heap.push(c + h(i), i); }
        }
      }
    }
    if (g[GOAL] === Infinity) return null;
    const path = [];
    let cur = from[GOAL];
    while (cur !== -1) { path.push({ node: cur, via: via[cur] }); cur = from[cur]; }
    path.reverse();
    if (path.length) path[0].via = 'DCT';
    return { path, cost: g[GOAL] };
  }

  /** Собрать итоговый список точек и строку маршрута */
  finish(o, path, sid, star, note) {
    const nav = this.nav;
    const { dep, arr } = o;
    const pts = [];
    const add = (i, via, stage, extra = {}) => {
      const last = pts[pts.length - 1];
      if (last && last.ident === nav.nodes[i].ident && distNm(last.lat, last.lon, nav.nodes[i].lat, nav.nodes[i].lon) < 1) return;
      pts.push({ ...nav.nodeInfo(i), via, stage, ...extra });
    };
    if (sid) for (const l of sid.legs) add(l.i, sid.name, 'SID', { alt: l.alt });
    for (const s of path) add(s.node, s.via, 'ENR');
    if (star) for (const l of star.legs) add(l.i, star.name, 'STAR', { alt: l.alt });
    // через какую трассу идём к точке → строка маршрута
    const tokens = [];
    if (sid) tokens.push(sid.name + (sid.trans ? '' : ''));
    let i = sid ? pts.findIndex((p) => p.stage === 'ENR') - 1 : -1;
    if (sid && i >= 0) tokens.push(pts[i].ident);
    const enr = pts.filter((p) => p.stage === 'ENR');
    for (let k = 0; k < enr.length; k++) {
      const p = enr[k];
      const next = enr[k + 1];
      if (k === 0) {
        if (tokens[tokens.length - 1] === p.ident) continue;
        if (sid) tokens.push(p.via && p.via !== 'DCT' ? p.via : 'DCT');
        tokens.push(p.ident);
        continue;
      }
      if (next && next.via === p.via && p.via !== 'DCT') continue; // промежуточная точка той же трассы
      tokens.push(p.via, p.ident);
    }
    if (star) {
      const entry = pts.find((p) => p.stage === 'STAR');
      if (entry && tokens[tokens.length - 1] !== entry.ident) tokens.push('DCT', entry.ident);
      tokens.push(star.name);
    }
    const routeString = tokens.join(' ').replace(/^DCT /, '');
    return {
      points: pts,
      route: routeString || 'DCT',
      sid: sid ? { name: sid.name, trans: sid.trans } : null,
      star: star ? { name: star.name, trans: star.trans } : null,
      note,
      airac: nav.cycle,
    };
  }

  // ---------- маршрут, введённый пользователем ----------

  parse(o) {
    const { dep, arr, text } = o;
    const nav = this.nav;
    const toks = text.toUpperCase().replace(/[^A-Z0-9/.\s-]/g, ' ').split(/\s+/).filter(Boolean)
      .filter((t, k, a) => !((k === 0 && (t === dep.icao || t === dep.ident)) || (k === a.length - 1 && (t === arr.icao || t === arr.ident))));
    const pts = [];
    const warnings = [];
    let ref = { lat: dep.lat, lon: dep.lon };
    let pendingAwy = null;
    let sidName = null, starName = null;
    const procs = { dep: nav.procedures(dep.icao), arr: nav.procedures(arr.icao) };

    for (let k = 0; k < toks.length; k++) {
      let t = toks[k].replace(/\/.*$/, ''); // FL/скорость после "/"
      if (!t || t === 'DCT') { pendingAwy = null; continue; }
      if (/^(N\d{4,6}|[A-Z]?\d)/.test(t) && parseLatLon(t)) {
        const ll = parseLatLon(t);
        pts.push({ ident: t, lat: ll.lat, lon: ll.lon, type: 'LL', via: 'DCT', stage: 'ENR' });
        ref = ll; pendingAwy = null; continue;
      }
      // SID/STAR из CIFP
      if (procs.dep?.SID.has(t) && !pts.length) { sidName = t; continue; }
      if (procs.arr?.STAR.has(t)) { starName = t; continue; }
      const isAwy = pts.length > 0 && nav.awyNames.has(t) && (!nav.byIdent.has(t) || /\d/.test(t) && k + 1 < toks.length);
      if (isAwy) { pendingAwy = t; continue; }
      // SID/STAR в стиле "ABC1A" без CIFP — пропускаем с предупреждением
      if (/^[A-Z]{2,5}\d[A-Z]$/.test(t) && !nav.byIdent.has(t)) { warnings.push(`Процедура ${t} пропущена (нет CIFP)`); continue; }
      const idx = nav.findIdent(t, ref.lat, ref.lon, !!pendingAwy);
      if (idx == null) {
        const apt = o.airports?.get(t);
        if (apt) { pts.push({ ident: apt.icao, lat: apt.lat, lon: apt.lon, type: 'APT', via: 'DCT', stage: 'ENR' }); ref = apt; continue; }
        warnings.push(`Точка ${t} не найдена`);
        pendingAwy = null; continue;
      }
      if (pendingAwy && pts.length) {
        const prevIdx = pts[pts.length - 1]._i;
        const seg = prevIdx != null ? this.walkAirway(prevIdx, idx, pendingAwy) : null;
        if (seg) {
          for (const s of seg.slice(1)) pts.push({ ...nav.nodeInfo(s), via: pendingAwy, stage: 'ENR', _i: s });
          ref = nav.nodes[idx]; pendingAwy = null; continue;
        }
        warnings.push(`Трасса ${pendingAwy} между ${pts[pts.length - 1].ident} и ${t} не найдена — DCT`);
      }
      pts.push({ ...nav.nodeInfo(idx), via: pendingAwy || 'DCT', stage: 'ENR', _i: idx });
      ref = nav.nodes[idx]; pendingAwy = null;
    }
    // процедуры
    let sid = null, star = null;
    if (sidName) {
      const c = this.sidCandidates(dep, o.depRwy).filter((s) => s.name === sidName);
      const firstEnr = pts[0];
      sid = c.find((s) => firstEnr && nav.nodes[s.exit].ident === firstEnr.ident) || c[0] || null;
      if (!sid) warnings.push(`${sidName} не подходит к ВПП ${o.depRwy || '—'}`);
    }
    if (starName) {
      const c = this.starCandidates(arr, o.arrRwy).filter((s) => s.name === starName);
      const lastEnr = pts[pts.length - 1];
      star = c.find((s) => lastEnr && nav.nodes[s.entry].ident === lastEnr.ident) || c[0] || null;
      if (!star) warnings.push(`${starName} не подходит к ВПП ${o.arrRwy || '—'}`);
    }
    const out = [];
    if (sid) for (const l of sid.legs) out.push({ ...nav.nodeInfo(l.i), via: sid.name, stage: 'SID', alt: l.alt });
    for (const p of pts) {
      const { _i, ...rest } = p;
      const last = out[out.length - 1];
      if (last && last.ident === rest.ident) continue;
      out.push(rest);
    }
    if (star) for (const l of star.legs) {
      const n = nav.nodeInfo(l.i);
      if (out.length && out[out.length - 1].ident === n.ident) { out[out.length - 1].stage = 'STAR'; continue; }
      out.push({ ...n, via: star.name, stage: 'STAR', alt: l.alt });
    }
    return {
      points: out,
      route: text.toUpperCase().trim(),
      sid: sid ? { name: sid.name, trans: sid.trans } : null,
      star: star ? { name: star.name, trans: star.trans } : null,
      warnings,
      airac: nav.cycle,
    };
  }

  /** Пройти по трассе от точки a до точки b (BFS по рёбрам с этим именем) */
  walkAirway(a, b, awy) {
    const nav = this.nav;
    const prev = new Map([[a, -1]]);
    const q = [a];
    while (q.length) {
      const u = q.shift();
      if (u === b || nav.nodes[u].ident === nav.nodes[b].ident) {
        const path = [];
        for (let c = u; c !== -1; c = prev.get(c)) path.push(c);
        return path.reverse();
      }
      for (const e of nav.adj[u] || []) {
        if (e.awy !== awy || prev.has(e.to)) continue;
        prev.set(e.to, u);
        q.push(e.to);
      }
    }
    return null;
  }
}

function fmtAlt(l) {
  if (!l.alt1) return '';
  const a = l.alt1.startsWith('FL') ? l.alt1 : String(+l.alt1);
  if (l.altDesc === 'B' && l.alt2) return `${a}-/${+l.alt2 || l.alt2}+`;
  return a + (l.altDesc === '+' ? '+' : l.altDesc === '-' ? '-' : '');
}

/** Координаты в форматах 5530N03730E, 55N037E, N55E037, 5530N */
export function parseLatLon(t) {
  let m = t.match(/^(\d{2})(\d{2})?([NS])(\d{3})(\d{2})?([EW])$/);
  if (m) {
    const lat = (+m[1] + (+m[2] || 0) / 60) * (m[3] === 'S' ? -1 : 1);
    const lon = (+m[4] + (+m[5] || 0) / 60) * (m[6] === 'W' ? -1 : 1);
    return { lat, lon };
  }
  m = t.match(/^([NS])(\d{2})(\d{2})?([EW])(\d{3})(\d{2})?$/);
  if (m) {
    const lat = (+m[2] + (+m[3] || 0) / 60) * (m[1] === 'S' ? -1 : 1);
    const lon = (+m[5] + (+m[6] || 0) / 60) * (m[4] === 'W' ? -1 : 1);
    return { lat, lon };
  }
  return null;
}
