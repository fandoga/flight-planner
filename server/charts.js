// Бесплатные источники аэронавигационных карт (чартов).
//  - США: FAA d-TPP — официальные PDF, список подтягивается автоматически
//  - Весь мир: ChartFox (бесплатно, вход через VATSIM), официальные AIP стран
const AIP_LINKS = {
  RU: { name: 'АИП России (ЦАИ)', url: 'https://www.caica.ru/ANI_Official/Aip/html/menurus.htm' },
  BY: { name: 'AIP Беларуси', url: 'https://www.ban.by/ru/sbornik-aip/amdt' },
  KZ: { name: 'AIP Казахстана', url: 'https://www.ans.kz/ru/aip' },
  UA: { name: 'AIP Украины', url: 'https://www.aisukraine.net/titul_en.php' },
  UZ: { name: 'AIP Узбекистана', url: 'https://www.uzaeronavigation.com/ais/' },
  GE: { name: 'AIP Грузии', url: 'https://airnav.ge/eaip/history-en-GB.html' },
  AM: { name: 'AIP Армении', url: 'https://armats.am/activities/ais/eaip' },
  AZ: { name: 'AIP Азербайджана', url: 'https://www.azans.az/en/aeronautical-information-service' },
  GB: { name: 'UK AIP (NATS)', url: 'https://nats-uk.ead-it.com/cms-nats/opencms/en/Publications/AIP/' },
  DE: { name: 'AIP Germany (DFS)', url: 'https://aip.dfs.de/BasicIFR/' },
  FR: { name: 'SIA France eAIP', url: 'https://www.sia.aviation-civile.gouv.fr/' },
  NL: { name: 'eAIP Netherlands (LVNL)', url: 'https://eaip.lvnl.nl/' },
  BE: { name: 'skeyes eAIP', url: 'https://ops.skeyes.be/html/belgocontrol_static/eaip/eAIP_Main/html/index-en-GB.html' },
  CH: { name: 'skybriefing (Swiss AIP)', url: 'https://www.skybriefing.com/' },
  AT: { name: 'Austro Control eAIP', url: 'https://eaip.austrocontrol.at/' },
  IT: { name: 'ENAV AIP Italia', url: 'https://www.enav.it/en/what-we-do/aeronautical-information-service' },
  ES: { name: 'ENAIRE AIP España', url: 'https://aip.enaire.es/AIP/' },
  PT: { name: 'NAV Portugal AIS', url: 'https://ais.nav.pt/' },
  PL: { name: 'PANSA AIP Polska', url: 'https://www.ais.pansa.pl/en/publications/aip-poland/' },
  CZ: { name: 'ŘLP AIP Czech', url: 'https://aim.rlp.cz/' },
  FI: { name: 'Fintraffic AIP Finland', url: 'https://www.ais.fi/en/' },
  SE: { name: 'LFV AIP Sweden', url: 'https://aro.lfv.se/content/eaip/default_offline.html' },
  NO: { name: 'Avinor AIP Norway', url: 'https://ais.avinor.no/' },
  DK: { name: 'Naviair AIP Denmark', url: 'https://aim.naviair.dk/' },
  EE: { name: 'EANS eAIP Estonia', url: 'https://eaip.eans.ee/' },
  LV: { name: 'LGS AIP Latvia', url: 'https://ais.lgs.lv/' },
  LT: { name: 'Oro navigacija eAIP', url: 'https://www.ans.lt/en/ais' },
  IE: { name: 'IAA AIP Ireland', url: 'https://www.airnav.ie/air-traffic-management/aeronautical-information-management/aip-package' },
  TR: { name: 'DHMI AIP Türkiye', url: 'https://www.dhmi.gov.tr/Sayfalar/aipturkey.aspx' },
  GR: { name: 'HCAA AIP Greece', url: 'https://aisgr.hasp.gov.gr/' },
  CA: { name: 'NAV CANADA CAP', url: 'https://www.navcanada.ca/en/aeronautical-information/' },
  AU: { name: 'Airservices Australia DAP', url: 'https://www.airservicesaustralia.com/aip/aip.asp' },
  NZ: { name: 'AIP New Zealand', url: 'https://www.aip.net.nz/' },
  JP: { name: 'AIS Japan', url: 'https://aisjapan.mlit.go.jp/' },
  KR: { name: 'AIM Korea', url: 'https://aim.koca.go.kr/eaipPub/Package/history-en-GB.html' },
  IN: { name: 'AAI eAIP India', url: 'https://aim-india.aai.aero/' },
  AE: { name: 'GCAA eAIP UAE', url: 'https://www.gcaa.gov.ae/en/ais/AIPHtmlFiles/AIP/Current/AIP.aspx' },
  BR: { name: 'DECEA AISWEB', url: 'https://aisweb.decea.mil.br/' },
  ZA: { name: 'ATNS / CAA AIP', url: 'https://www.caa.co.za/industry-information/aeronautical-information/' },
};

function airacCycle(date = new Date()) {
  // Опорный цикл: 2401 начался 25.01.2024, длина цикла 28 дней
  const epoch = Date.UTC(2024, 0, 25);
  let n = Math.floor((date.getTime() - epoch) / (28 * 864e5));
  let year = 2024, start = epoch;
  // Найти год и номер цикла
  let idx = 1;
  let t = epoch;
  for (let k = 0; k < n; k++) {
    t += 28 * 864e5;
    const y = new Date(t).getUTCFullYear();
    if (y !== year) { year = y; idx = 1; } else idx++;
  }
  start = t;
  return { id: `${String(year).slice(2)}${String(idx).padStart(2, '0')}`, start: new Date(start) };
}

let faaIndex = null; // { cycle, airports: Map<icao, charts[]> }
let faaLoading = null;

async function loadFaa() {
  const { id } = airacCycle();
  if (faaIndex?.cycle === id) return faaIndex;
  if (faaLoading) return faaLoading;
  faaLoading = (async () => {
    const urls = [
      `https://aeronav.faa.gov/d-tpp/${id}/xml_data/d-tpp_Metafile.xml`,
      `https://aeronav.faa.gov/d-tpp/${id}/xml_data/d-TPP_Metafile.xml`,
    ];
    let xml = null;
    for (const u of urls) {
      try { const r = await fetch(u); if (r.ok) { xml = await r.text(); break; } } catch { /* следующий */ }
    }
    if (!xml) throw new Error('FAA d-TPP недоступен');
    const airports = new Map();
    const reApt = /<airport_name\b([^>]*)>([\s\S]*?)<\/airport_name>/g;
    const reRec = /<record>([\s\S]*?)<\/record>/g;
    const tag = (s, t) => (s.match(new RegExp(`<${t}>([^<]*)</${t}>`, 'i')) || [])[1] || '';
    let m;
    while ((m = reApt.exec(xml))) {
      const icao = (m[1].match(/icao_ident="([^"]*)"/) || [])[1];
      if (!icao) continue;
      const charts = [];
      let r;
      while ((r = reRec.exec(m[2]))) {
        const pdf = tag(r[1], 'pdf_name');
        if (!pdf || pdf === 'DELETED_JOB.PDF') continue;
        charts.push({ type: tag(r[1], 'chart_code'), name: tag(r[1], 'chart_name'), url: `https://aeronav.faa.gov/d-tpp/${id}/${pdf}` });
      }
      airports.set(icao, charts);
    }
    faaIndex = { cycle: id, airports };
    return faaIndex;
  })().finally(() => { faaLoading = null; });
  return faaLoading;
}

const TYPE_MAP = { APD: 'GND', DP: 'SID', ODP: 'SID', STAR: 'STAR', IAP: 'APP', MIN: 'INFO', HOT: 'INFO', LAH: 'INFO' };

export async function getCharts(apt) {
  const links = [
    { name: 'ChartFox — бесплатные карты со всего мира (вход через VATSIM)', url: `https://chartfox.org/${apt.icao}` },
  ];
  const aip = AIP_LINKS[apt.country];
  if (aip) links.push({ name: aip.name + ' — официальный сборник (бесплатно)', url: aip.url });
  links.push({ name: 'Eurocontrol EAD Basic — AIP Европы (бесплатная регистрация)', url: 'https://www.ead.eurocontrol.int/cms-eadbasic/opencms/en/login/ead-basic/' });

  let charts = [];
  let note = null;
  if (apt.country === 'US' || /^(K|PA|PH|PG|TJ|TI)/.test(apt.icao)) {
    try {
      const idx = await loadFaa();
      charts = (idx.airports.get(apt.icao) || []).map((c) => ({ ...c, group: TYPE_MAP[c.type] || 'INFO', source: 'FAA d-TPP' }));
    } catch (e) { note = 'FAA d-TPP: ' + e.message; }
    links.unshift({ name: 'FAA d-TPP — поиск карт', url: `https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dtpp/search/results/?cycle=${airacCycle().id}&ident=${apt.icao}` });
  }
  return { icao: apt.icao, charts, links, note, cycle: airacCycle().id };
}

export { airacCycle };
