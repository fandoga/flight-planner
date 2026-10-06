// Скачивает бесплатные открытые базы данных в data/raw:
//  - OurAirports (public domain): аэропорты, ВПП, частоты, страны
//  - Навигационная база X-Plane/Robin Peel (GNU GPL) из репозитория FlightGear:
//    точки (fix), авиатрассы (awy), радиосредства и ILS (nav)
// Актуальную базу (earth_fix.dat, earth_awy.dat, earth_nav.dat, CIFP/) можно
// положить в data/navdata — она будет использована вместо базовой.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'data', 'raw');

const OA = 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main';
const FG = 'https://raw.githubusercontent.com/FGData/fgdata/master/Navaids';

export const SOURCES = [
  { file: 'airports.csv', url: `${OA}/airports.csv` },
  { file: 'runways.csv', url: `${OA}/runways.csv` },
  { file: 'airport-frequencies.csv', url: `${OA}/airport-frequencies.csv` },
  { file: 'countries.csv', url: `${OA}/countries.csv` },
  { file: 'fix.dat.gz', url: `${FG}/fix.dat.gz` },
  { file: 'awy.dat.gz', url: `${FG}/awy.dat.gz` },
  { file: 'nav.dat.gz', url: `${FG}/nav.dat.gz` },
];

export async function fetchData({ force = false, log = console.log } = {}) {
  fs.mkdirSync(RAW, { recursive: true });
  for (const { file, url } of SOURCES) {
    const dest = path.join(RAW, file);
    if (!force && fs.existsSync(dest) && fs.statSync(dest).size > 0) continue;
    log(`↓ ${file}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Не удалось скачать ${url}: HTTP ${res.status}`);
    fs.writeFileSync(dest + '.tmp', Buffer.from(await res.arrayBuffer()));
    fs.renameSync(dest + '.tmp', dest);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fetchData({ force: process.argv.includes('--force') })
    .then(() => console.log('Данные загружены в data/raw'))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
