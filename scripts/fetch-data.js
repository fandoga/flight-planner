// Обновляет бесплатные открытые базы в data/db (хранятся в репозитории в сжатом виде,
// чтобы сайт работал на Vercel без скачивания при старте):
//  - OurAirports (public domain): аэропорты, ВПП, частоты, страны — только нужные столбцы
//  - Навигационная база X-Plane/Robin Peel (GNU GPL) из репозитория FlightGear:
//    точки (fix), авиатрассы (awy), радиосредства и ILS (nav)
// Запуск: npm run update-data
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = path.join(ROOT, 'data', 'db');

const OA = 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main';
const FG = 'https://raw.githubusercontent.com/FGData/fgdata/master/Navaids';

// файл → нужные столбцы (null — файл как есть)
const SOURCES = [
  { file: 'airports.csv', url: `${OA}/airports.csv`, cols: ['ident', 'type', 'name', 'latitude_deg', 'longitude_deg', 'elevation_ft', 'iso_country', 'municipality', 'scheduled_service', 'icao_code', 'iata_code', 'gps_code'] },
  { file: 'runways.csv', url: `${OA}/runways.csv`, cols: ['airport_ident', 'length_ft', 'width_ft', 'surface', 'lighted', 'closed', 'le_ident', 'le_latitude_deg', 'le_longitude_deg', 'le_elevation_ft', 'le_heading_degT', 'le_displaced_threshold_ft', 'he_ident', 'he_latitude_deg', 'he_longitude_deg', 'he_elevation_ft', 'he_heading_degT', 'he_displaced_threshold_ft'] },
  { file: 'airport-frequencies.csv', url: `${OA}/airport-frequencies.csv`, cols: ['airport_ident', 'type', 'description', 'frequency_mhz'] },
  { file: 'countries.csv', url: `${OA}/countries.csv`, cols: ['code', 'name'] },
  { file: 'fix.dat.gz', url: `${FG}/fix.dat.gz` },
  { file: 'awy.dat.gz', url: `${FG}/awy.dat.gz` },
  { file: 'nav.dat.gz', url: `${FG}/nav.dat.gz` },
];

function splitCsv(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}
const csvCell = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function trimCsv(text, cols) {
  const lines = text.split(/\r?\n/);
  const head = splitCsv(lines[0]);
  const idx = cols.map((c) => head.indexOf(c));
  if (idx.includes(-1)) throw new Error('Нет столбца: ' + cols[idx.indexOf(-1)]);
  const out = [cols.join(',')];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const r = splitCsv(lines[i]);
    if (r[head.indexOf('type')] === 'heliport' || r[head.indexOf('type')] === 'closed') continue;
    out.push(idx.map((k) => csvCell(r[k] ?? '')).join(','));
  }
  return out.join('\n') + '\n';
}

export async function updateData({ log = console.log } = {}) {
  fs.mkdirSync(DB, { recursive: true });
  for (const { file, url, cols } of SOURCES) {
    log(`↓ ${file}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Не удалось скачать ${url}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const dest = path.join(DB, cols ? file + '.gz' : file);
    const data = cols ? zlib.gzipSync(trimCsv(buf.toString('utf8'), cols), { level: 9 }) : buf;
    fs.writeFileSync(dest, data);
    log(`  ${path.relative(ROOT, dest)} — ${(data.length / 1e6).toFixed(1)} МБ`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  updateData().then(() => console.log('Готово: data/db')).catch((e) => { console.error(e.message); process.exit(1); });
}
