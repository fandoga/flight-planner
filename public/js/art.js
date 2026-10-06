// SVG-иллюстрации: самолёты (вид сбоку, нос вправо) и постеры-«закаты» в стиле Vice City.
// Всё рисуется кодом — работает без сети и без сторонних картинок.

let uid = 0;
const id = (p) => `${p}${++uid}`;

// ---------- ливреи ----------
const LIVERIES = {
  house: { name: 'Vice Skies', body: '#f7f3ff', belly: '#e7defa', tail: ['#7c3aed', '#ec4899'], stripe: ['#ec4899', '#f97316'], title: 'VICE SKIES', titleColor: '#6d28d9', engine: '#2a1650' },
  southwest: { name: 'Southwest', body: '#304cb2', belly: '#c8102e', belly2: '#ffbf27', tail: ['#304cb2', '#1d3389'], tailStripes: ['#ffbf27', '#c8102e'], title: 'Southwest', titleColor: '#ffffff', engine: '#304cb2' },
  american: { name: 'American', body: '#d5d9e0', bodyHi: '#f1f3f6', belly: '#9aa1ac', tailFlag: true, title: 'American', titleColor: '#3a4150', engine: '#bfc5ce' },
  united: { name: 'United', body: '#ffffff', belly: '#0c2340', tail: ['#0c2340', '#1a3a6b'], tailGlobe: true, title: 'UNITED', titleColor: '#0c2340', engine: '#0c2340' },
  tour: { name: 'Vice Skies', body: '#f7f3ff', belly: '#e9e1fb', tail: ['#7c3aed', '#ec4899'], stripe: ['#ec4899', '#f97316'], engine: '#3b1d6e' },
};

function gradient(gid, c1, c2, vertical = true) {
  return `<linearGradient id="${gid}" x1="0" y1="0" x2="${vertical ? 0 : 1}" y2="${vertical ? 1 : 0}"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`;
}

function prop(cx, cy, r) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="5" ry="${r}" fill="#ffffff" opacity=".16"/>
    <ellipse cx="${cx}" cy="${cy}" rx="2" ry="${r}" fill="#ffffff" opacity=".12"/>
    <path d="M${cx - 9} ${cy - 6} Q${cx + 4} ${cy - 6} ${cx + 8} ${cy} Q${cx + 4} ${cy + 6} ${cx - 9} ${cy + 6} Z" fill="#2a1650"/>`;
}

function airliner(lv) {
  const fus = 'M70 60 L330 60 C356 60 378 70 384 80 C380 90 362 96 338 96 L122 96 L44 76 C36 74 34 66 42 63 C50 61 60 60 70 60 Z';
  const clip = id('c'), gT = id('t'), gS = id('s'), gB = id('b');
  let livery = '';
  if (lv.stripe) {
    livery += `<path d="M30 86 C140 80 230 94 400 74 L400 84 C240 104 140 92 30 98 Z" fill="url(#${gS})"/>`;
    livery += `<rect x="0" y="88" width="400" height="20" fill="${lv.belly}"/>`;
  } else if (lv === LIVERIES.southwest) {
    livery += `<rect x="0" y="88" width="400" height="20" fill="${lv.belly}"/><path d="M0 87 L400 87 L400 90 L0 90 Z" fill="${lv.belly2}"/>`;
  } else if (lv === LIVERIES.united) {
    livery += `<rect x="0" y="87" width="400" height="20" fill="${lv.belly}"/>`;
  } else if (lv === LIVERIES.american) {
    livery += `<rect x="0" y="56" width="400" height="14" fill="${lv.bodyHi}" opacity=".7"/><rect x="0" y="89" width="400" height="12" fill="${lv.belly}"/>`;
  }
  let tail;
  if (lv.tailFlag) {
    tail = `<g clip-path="url(#${clip}f)"><rect x="40" y="10" width="80" height="60" fill="#c8102e"/>
      <path d="M40 10 L74 10 L106 62 L72 62 Z" fill="#ffffff"/><path d="M40 10 L58 10 L90 62 L72 62 Z" fill="#c8102e"/>
      <path d="M74 10 L120 10 L120 62 L106 62 Z" fill="#0078d2"/></g>`;
  } else {
    tail = `<path d="M58 61 L106 61 L72 12 L52 12 Z" fill="url(#${gT})"/>`;
    if (lv.tailStripes) tail += `<g clip-path="url(#${clip}f)"><path d="M58 50 L106 34 L106 40 L58 56 Z" fill="${lv.tailStripes[0]}"/><path d="M58 42 L106 26 L106 31 L58 47 Z" fill="${lv.tailStripes[1]}"/></g>`;
    if (lv.tailGlobe) tail += `<g clip-path="url(#${clip}f)" fill="none" stroke="#ffffff" stroke-width="1.6" opacity=".9"><circle cx="76" cy="40" r="13"/><path d="M63 40 H89 M76 27 V53 M66 32 Q76 37 86 32 M66 48 Q76 43 86 48"/></g>`;
    if (lv.stripe && !lv.tailStripes) tail += `<circle cx="74" cy="38" r="10" fill="#fbbf24" opacity=".9" clip-path="url(#${clip}f)"/><g clip-path="url(#${clip}f)" fill="url(#${gT})"><rect x="50" y="38" width="60" height="2.5"/><rect x="50" y="42.5" width="60" height="2"/><rect x="50" y="46" width="60" height="1.6"/></g>`;
  }
  const windows = [];
  for (let x = 118; x < 322; x += 8.6) if (Math.abs(x - 228) > 6) windows.push(`<rect x="${x.toFixed(1)}" y="65" width="4" height="5" rx="2" fill="#20103d" opacity=".8"/>`);
  return `<svg viewBox="0 0 400 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Airbus A321neo — ${lv.name}">
  <defs>${gradient(gT, lv.tail?.[0] || '#7c3aed', lv.tail?.[1] || '#ec4899')}${gradient(gS, lv.stripe?.[0] || '#ec4899', lv.stripe?.[1] || '#f97316', false)}${gradient(gB, '#ffffff', '#000000')}
    <clipPath id="${clip}"><path d="${fus}"/></clipPath>
    <clipPath id="${clip}f"><path d="M58 61 L106 61 L72 12 L52 12 Z"/></clipPath></defs>
  <ellipse cx="210" cy="146" rx="150" ry="6" fill="#000" opacity=".25"/>
  ${tail}
  <path d="M40 70 L98 69 L64 77 L34 76 Z" fill="#3b2a5e"/>
  <path d="${fus}" fill="${lv.body}"/>
  <g clip-path="url(#${clip})">${livery}
    <path d="${fus}" fill="url(#${gB})" opacity=".07"/></g>
  ${lv.title ? `<text x="150" y="${lv === LIVERIES.southwest ? 83 : 84}" font-family="Outfit, sans-serif" font-weight="700" font-size="11.5" fill="${lv.titleColor}" letter-spacing=".6">${lv.title}</text>` : ''}
  ${windows.join('')}
  <path d="M349 65 L371 69 L375 74 L351 73 Z" fill="#1c0f36"/>
  <rect x="331" y="64" width="8" height="20" rx="2" fill="none" stroke="#000" stroke-opacity=".18"/>
  <rect x="100" y="64" width="8" height="20" rx="2" fill="none" stroke="#000" stroke-opacity=".18"/>
  <path d="M168 90 L252 90 L214 99 L150 101 Z" fill="#3b2a5e"/>
  <path d="M152 101 L148 92 L153 91 L158 100 Z" fill="${lv.tail?.[0] || '#c8102e'}"/>
  <rect x="216" y="92" width="26" height="8" fill="#5b4a80"/>
  <rect x="196" y="97" width="70" height="23" rx="11.5" fill="${lv.engine}"/>
  <ellipse cx="263" cy="108.5" rx="4" ry="11" fill="#140a26"/>
  <rect x="200" y="99" width="46" height="4" rx="2" fill="#ffffff" opacity=".15"/>
</svg>`;
}

function smallPlane(kind, lv) {
  const gS = id('s'), gT = id('t'), clip = id('c');
  const P = {
    caravan: {
      fus: 'M58 74 L292 66 C318 66 338 72 350 80 L352 94 C340 100 318 102 296 102 L112 102 L50 86 Z',
      fin: 'M58 76 L104 74 L80 26 L62 26 Z', hstab: 'M48 80 L102 79 L70 85 L44 85 Z',
      wing: 'M160 56 L272 53 L274 60 L162 63 Z', strut: [[206, 62, 236, 100]], pod: 'M138 102 L292 102 L286 112 L146 112 Z',
      gear: [[236, 124, 9, 236, 104], [326, 122, 7, 330, 100]], prop: [358, 87, 36], windows: [[200, 76], [222, 75], [244, 74], [266, 73]], glass: 'M286 68 L318 70 L322 79 L290 79 Z',
    },
    c172: {
      fus: 'M86 80 L248 70 C270 70 290 74 302 82 L304 94 C292 100 272 102 252 102 L150 102 L80 88 Z',
      fin: 'M86 82 L128 80 L106 38 L90 38 Z', hstab: 'M76 86 L126 85 L96 90 L72 90 Z',
      wing: 'M158 58 L268 56 L270 62 L160 64 Z', strut: [[204, 64, 226, 100]], pod: '',
      gear: [[222, 122, 8, 224, 102], [290, 120, 6, 292, 100]], prop: [310, 88, 30], windows: [[200, 76]], glass: 'M214 72 L252 70 L262 80 L216 82 Z',
    },
    pc12: {
      fus: 'M60 76 C72 68 92 66 112 66 L290 66 C320 66 345 72 358 84 C346 94 320 98 290 98 L122 98 L56 84 Z',
      fin: 'M64 72 L108 72 L90 22 L72 22 Z', hstab: 'M56 24 L116 21 L118 27 L58 30 Z',
      wing: 'M168 94 L254 94 L236 105 L156 105 Z', strut: [], pod: '',
      gear: [], prop: [364, 84, 34], windows: [[150, 74], [172, 74], [194, 74], [216, 74], [238, 74]], glass: 'M300 68 L330 72 L336 78 L302 78 Z',
    },
    da40: {
      fus: 'M70 86 L246 76 C274 76 300 80 314 88 C302 96 280 100 250 100 L160 100 L66 90 Z',
      fin: 'M74 86 L108 84 L98 36 L84 36 Z', hstab: 'M70 38 L118 36 L119 41 L72 43 Z',
      wing: 'M166 98 L252 98 L238 107 L156 107 Z', strut: [], pod: '',
      gear: [[226, 120, 7, 222, 104], [298, 120, 6, 300, 98]], prop: [320, 88, 30], windows: [], glass: 'M196 77 C206 58 254 56 270 77 Z',
    },
    draco: {
      fus: 'M78 88 L238 72 C268 68 300 72 322 82 L324 98 C302 104 270 106 240 104 L140 102 L72 94 Z',
      fin: 'M78 90 L122 88 L100 42 L84 42 Z', hstab: 'M70 94 L120 92 L90 98 L66 98 Z',
      wing: 'M146 56 L284 52 L286 60 L148 63 Z', strut: [[200, 62, 214, 100], [236, 61, 220, 100]], pod: '',
      gear: [[252, 126, 17, 244, 102], [86, 104, 5, 84, 96]], prop: [332, 90, 36], windows: [[200, 78]], glass: 'M226 74 L268 70 L280 82 L228 84 Z',
    },
  }[kind === 'twin' ? 'pc12' : kind] || null;
  if (!P) return airliner(lv);
  const gear = P.gear.map(([cx, cy, r, sx, sy]) => `<line x1="${sx}" y1="${sy}" x2="${cx}" y2="${cy}" stroke="#2a1650" stroke-width="3"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="#3a2766"/><circle cx="${cx}" cy="${cy}" r="${r * 0.42}" fill="#b4a3e0"/>`).join('');
  const struts = P.strut.map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#d9d0ee" stroke-width="2.5"/>`).join('');
  const win = P.windows.map(([x, y]) => `<rect x="${x}" y="${y}" width="14" height="8" rx="3" fill="#20103d" opacity=".85"/>`).join('');
  const [px, py, pr] = P.prop;
  return `<svg viewBox="0 0 400 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${kind}">
  <defs>${gradient(gS, lv.stripe?.[0] || '#ec4899', lv.stripe?.[1] || '#f97316', false)}${gradient(gT, lv.tail?.[0] || '#7c3aed', lv.tail?.[1] || '#ec4899')}${gradient(gS + 'g', '#a5f3fc', '#4c1d95')}
    <clipPath id="${clip}"><path d="${P.fus}"/></clipPath></defs>
  <ellipse cx="200" cy="148" rx="130" ry="5" fill="#000" opacity=".25"/>
  ${kind === 'pc12' || kind === 'da40' || kind === 'twin' ? '' : `<path d="${P.wing}" fill="${lv.body}" stroke="#cbbfe6" stroke-width="1"/>`}
  <path d="${P.fin}" fill="url(#${gT})"/>
  <path d="${P.hstab}" fill="#5b3d99"/>
  ${struts}
  ${gear}
  ${P.pod ? `<path d="${P.pod}" fill="#e3daf6"/>` : ''}
  <path d="${P.fus}" fill="${lv.body}"/>
  <g clip-path="url(#${clip})"><path d="M20 92 C140 84 240 98 400 80 L400 90 C240 108 140 96 20 102 Z" fill="url(#${gS})"/></g>
  ${win}
  <path d="${P.glass}" fill="url(#${gS}g)" stroke="#2a1650" stroke-width="1"/>
  ${kind === 'pc12' || kind === 'da40' || kind === 'twin' ? `<path d="${P.wing}" fill="#efe8fb" stroke="#cbbfe6" stroke-width="1"/>` : ''}
  ${kind === 'pc12' ? '<rect x="332" y="78" width="10" height="5" rx="2" fill="#3b2a5e"/>' : ''}
  ${prop(px, py, pr)}
</svg>`;
}

/** SVG самолёта по типу (artType) и ливрее */
export function aircraftSvg(kind, livery = 'house') {
  const lv = LIVERIES[livery] || LIVERIES.house;
  return kind === 'airliner' ? airliner(lv) : smallPlane(kind, LIVERIES[livery] ? lv : LIVERIES.tour);
}

export function liveryName(livery) { return LIVERIES[livery]?.name || ''; }

// ---------- постеры-закаты ----------
function rng(seed) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}

function palm(x, y, s, fill) {
  const k = s / 40;
  return `<g transform="translate(${x} ${y}) scale(${k})" fill="${fill}">
    <path d="M-2 0 C0 -40 6 -70 14 -96 L18 -95 C10 -68 5 -40 4 0 Z"/>
    <path d="M16 -96 C0 -110 -24 -108 -38 -94 C-20 -100 -2 -98 16 -94 Z"/>
    <path d="M16 -96 C30 -114 54 -112 66 -98 C46 -104 30 -100 16 -94 Z"/>
    <path d="M16 -96 C4 -94 -14 -80 -20 -62 C-6 -78 6 -88 16 -92 Z"/>
    <path d="M16 -96 C28 -92 44 -80 48 -60 C36 -78 26 -88 16 -92 Z"/>
    <path d="M16 -96 C14 -116 26 -126 38 -128 C28 -118 22 -108 18 -96 Z"/></g>`;
}

function saguaro(x, y, h, fill) {
  const w = h * 0.16;
  return `<g fill="${fill}"><rect x="${x - w / 2}" y="${y - h}" width="${w}" height="${h}" rx="${w / 2}"/>
    <path d="M${x - w / 2} ${y - h * 0.45} h-${w * 1.2} a${w / 2} ${w / 2} 0 0 1 -${w / 2} -${w / 2} v-${h * 0.25} a${w / 2} ${w / 2} 0 0 1 ${w} 0 v${h * 0.15} h${w * 0.7} Z"/>
    <path d="M${x + w / 2} ${y - h * 0.6} h${w * 1.1} a${w / 2} ${w / 2} 0 0 0 ${w / 2} -${w / 2} v-${h * 0.18} a${w / 2} ${w / 2} 0 0 0 -${w} 0 v${h * 0.1} h-${w * 0.6} Z"/></g>`;
}

/** Постер в стиле synthwave: kind = city | mountain | bridge | canyon | desert | coast | island | plains */
export function sceneSvg(kind = 'city', seed = 'x') {
  const r = rng(seed + kind);
  const sky = id('sky'), sun = id('sun'), mask = id('m'), sea = id('sea');
  const dark = '#1a0933', mid = '#3b1466';
  const hz = 158;
  let sil = '';
  if (kind === 'city') {
    let x = -4;
    while (x < 404) {
      const w = 14 + r() * 26, h = 30 + r() * 80;
      sil += `<rect x="${x.toFixed(1)}" y="${(hz - h).toFixed(1)}" width="${w.toFixed(1)}" height="${(h + 90).toFixed(1)}" fill="${r() > 0.5 ? dark : '#24104a'}"/>`;
      for (let wy = hz - h + 8; wy < hz - 6; wy += 9) if (r() > 0.55) sil += `<rect x="${(x + 4).toFixed(1)}" y="${wy.toFixed(1)}" width="${(w - 8).toFixed(1)}" height="2" fill="#ff7ad9" opacity="${(0.3 + r() * 0.5).toFixed(2)}"/>`;
      x += w + 2;
    }
    sil += `<rect x="296" y="${hz - 128}" width="5" height="128" fill="${dark}"/><ellipse cx="298.5" cy="${hz - 126}" rx="16" ry="5" fill="${dark}"/>`;
  } else if (kind === 'mountain') {
    sil += `<path d="M-10 ${hz} L60 ${hz - 50} L110 ${hz - 20} L200 ${hz - 104} L290 ${hz - 30} L340 ${hz - 60} L410 ${hz} Z" fill="${mid}"/>`;
    sil += `<path d="M178 ${hz - 82} L200 ${hz - 104} L224 ${hz - 80} L212 ${hz - 84} L200 ${hz - 76} L190 ${hz - 84} Z" fill="#fde7ff" opacity=".9"/>`;
    sil += `<path d="M-10 ${hz + 10} L80 ${hz - 26} L150 ${hz + 4} L250 ${hz - 34} L330 ${hz + 2} L410 ${hz - 20} L410 ${hz + 90} L-10 ${hz + 90} Z" fill="${dark}"/>`;
  } else if (kind === 'bridge') {
    sil += `<rect x="0" y="${hz}" width="400" height="90" fill="url(#${sea})"/>`;
    for (const tx of [110, 290]) sil += `<rect x="${tx - 6}" y="${hz - 110}" width="12" height="120" fill="#c2185b"/><rect x="${tx - 9}" y="${hz - 80}" width="18" height="4" fill="#c2185b"/><rect x="${tx - 9}" y="${hz - 50}" width="18" height="4" fill="#c2185b"/>`;
    sil += `<path d="M-10 ${hz - 18} Q110 ${hz - 112} 110 ${hz - 108} Q200 ${hz - 10} 290 ${hz - 108} Q290 ${hz - 112} 410 ${hz - 18}" fill="none" stroke="#c2185b" stroke-width="3"/>`;
    sil += `<rect x="-10" y="${hz - 18}" width="420" height="7" fill="#9d174d"/>`;
    sil += `<path d="M300 ${hz} L340 ${hz - 34} L380 ${hz - 20} L410 ${hz - 30} L410 ${hz + 4} Z" fill="${dark}"/>`;
  } else if (kind === 'canyon') {
    sil += `<path d="M-10 ${hz - 30} L70 ${hz - 30} L80 ${hz - 18} L150 ${hz - 18} L160 ${hz - 44} L230 ${hz - 44} L240 ${hz - 26} L320 ${hz - 26} L330 ${hz - 50} L410 ${hz - 50} L410 ${hz + 90} L-10 ${hz + 90} Z" fill="${mid}"/>`;
    sil += `<path d="M-10 ${hz} L40 ${hz} L60 ${hz + 20} L140 ${hz + 20} L170 ${hz - 4} L250 ${hz - 4} L270 ${hz + 24} L360 ${hz + 24} L380 ${hz + 4} L410 ${hz + 4} L410 ${hz + 90} L-10 ${hz + 90} Z" fill="${dark}"/>`;
    sil += `<path d="M0 ${hz + 10} L400 ${hz - 4}" stroke="#f97316" stroke-opacity=".35" stroke-width="1"/>`;
  } else if (kind === 'desert' || kind === 'plains') {
    sil += `<rect x="0" y="${hz}" width="400" height="90" fill="${dark}"/>`;
    for (let k = 0; k <= 12; k++) { const x = -200 + k * 66.7; sil += `<line x1="200" y1="${hz}" x2="${x}" y2="240" stroke="#ff4fd8" stroke-opacity=".45" stroke-width="1"/>`; }
    for (let k = 1; k <= 6; k++) { const y = hz + (k * k) * 2.4; sil += `<line x1="0" y1="${y}" x2="400" y2="${y}" stroke="#ff4fd8" stroke-opacity=".4" stroke-width="1"/>`; }
    if (kind === 'desert') {
      sil += `<path d="M-10 ${hz} L40 ${hz - 34} L90 ${hz - 34} L120 ${hz} Z" fill="${mid}"/><path d="M280 ${hz} L320 ${hz - 22} L360 ${hz - 24} L400 ${hz} Z" fill="${mid}"/>`;
      sil += saguaro(70, hz + 30, 78, '#12061f') + saguaro(338, hz + 40, 96, '#12061f') + saguaro(250, hz + 8, 40, '#12061f');
    }
  } else if (kind === 'coast' || kind === 'island') {
    sil += `<rect x="0" y="${hz}" width="400" height="90" fill="url(#${sea})"/>`;
    for (let k = 0; k < 5; k++) sil += `<rect x="${150 + k * 6 - k * k * 3}" y="${hz + 6 + k * 9}" width="${100 - k * 12 + k * k * 6}" height="2" fill="#ffd27a" opacity="${0.55 - k * 0.08}"/>`;
    if (kind === 'island') {
      sil += `<path d="M20 ${hz + 2} Q80 ${hz - 30} 140 ${hz + 2} Z" fill="${dark}"/><path d="M250 ${hz + 2} Q300 ${hz - 18} 380 ${hz + 2} Z" fill="${mid}"/>`;
    } else {
      sil += `<path d="M-10 ${hz + 90} L-10 ${hz + 20} Q60 ${hz + 4} 120 ${hz + 40} L140 ${hz + 90} Z" fill="${dark}"/>`;
      sil += palm(40, hz + 50, 110, '#12061f') + palm(92, hz + 64, 80, '#12061f') + palm(358, hz + 70, 120, '#12061f');
      sil += `<path d="M300 ${hz + 90} L310 ${hz + 46} Q360 ${hz + 30} 410 ${hz + 40} L410 ${hz + 90} Z" fill="${dark}"/>`;
    }
  }
  return `<svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#140528"/><stop offset=".45" stop-color="#5b1fa6"/><stop offset=".72" stop-color="#e0418f"/><stop offset="1" stop-color="#ff9a4a"/></linearGradient>
    <linearGradient id="${sun}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset=".6" stop-color="#ff7a59"/><stop offset="1" stop-color="#ff3d9a"/></linearGradient>
    <linearGradient id="${sea}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b1466"/><stop offset="1" stop-color="#12061f"/></linearGradient>
    <mask id="${mask}"><rect width="400" height="240" fill="#fff"/>${[0, 1, 2, 3, 4, 5].map((k) => `<rect x="0" y="${118 + k * 7 + k * k * 0.8}" width="400" height="${1.5 + k * 0.9}" fill="#000"/>`).join('')}</mask>
  </defs>
  <rect width="400" height="240" fill="url(#${sky})"/>
  ${[...Array(18)].map(() => `<circle cx="${(r() * 400).toFixed(0)}" cy="${(r() * 80).toFixed(0)}" r="${(0.5 + r()).toFixed(1)}" fill="#fff" opacity="${(0.3 + r() * 0.6).toFixed(2)}"/>`).join('')}
  <circle cx="200" cy="${hz - 18}" r="62" fill="url(#${sun})" mask="url(#${mask})"/>
  ${sil}
</svg>`;
}

// ---------- иконки (Lucide, MIT) ----------
const ICONS = {
  plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  map: '<path d="M14.1 6.2 9.9 4.1a2 2 0 0 0-1.8 0L3.6 6.4A1 1 0 0 0 3 7.3v12.1a1 1 0 0 0 1.4.9l4.1-2.1a2 2 0 0 1 1.8 0l4.2 2.1a2 2 0 0 0 1.8 0l4.5-2.3a1 1 0 0 0 .6-.9V5a1 1 0 0 0-1.4-.9l-4.1 2.1a2 2 0 0 1-1.8 0Z"/><path d="M15 6.8v14.4M9 3.8v14.4"/>',
  pin: '<path d="M20 10c0 4.99-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  flag: '<path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.33 2q2 0 3.07-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.53"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  fuel: '<path d="M3 22h12M4 9h10M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2 2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/>',
  arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7M7 3v4a1 1 0 0 0 1 1h7"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  sparkle: '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.13-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.13a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.13 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.13a.5.5 0 0 1-.96 0z"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  list: '<path d="M3 12h.01M3 18h.01M3 6h.01M8 12h13M8 18h13M8 6h13"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65M22 12.65l-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  wind: '<path d="M12.8 19.6A2 2 0 1 0 14 16H2M17.5 8a2.5 2.5 0 1 1 2 4H2M9.8 4.4A2 2 0 1 1 11 8H2"/>',
};

export function icon(name, cls = '') {
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

/** Заменяет <i data-icon="name"></i> в DOM на SVG */
export function hydrateIcons(root = document) {
  root.querySelectorAll('i[data-icon]').forEach((el) => { el.outerHTML = icon(el.dataset.icon, el.className); });
}
