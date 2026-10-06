# Flight Planner — планировщик полётов для авиасимуляторов

Веб-приложение для планирования полётов в MSFS / X-Plane / P3D: маршрут по реальным
точкам и трассам, METAR/TAF, автовыбор ВПП и захода, расчёт топлива и загрузки, чарты,
экспорт в симулятор. Тёмный интерфейс, монохромная карта мира.

> Только для авиасимуляторов. Не использовать для реальной навигации.

## Запуск локально

```bash
npm install
npm start          # http://localhost:3000  (порт: PORT=8080 npm start)
```

Базы лежат в репозитории в сжатом виде (`data/db`, ≈6.5 МБ). Обновить их из источников:
`npm run update-data` и закоммитить `data/db`.

## Деплой на Vercel

1. vercel.com → Add New → Project → импортировать репозиторий `fandoga/flight-planner`.
2. Framework Preset: **Other**, Build Command — пусто, Output Directory — `public` (уже задано в `vercel.json`).
3. Deploy. Статика раздаётся из `public/`, API — serverless-функция `api/index.js` (Express),
   базы `data/db` подключаются к функции через `includeFiles`. Переменные окружения не нужны.

## Планы и MSFS

- **Сохранить** (кнопка вверху) — план записывается в «Мои планы» (хранится в браузере) и сразу скачивается `.pln`.
- В «Моих планах»: открыть план (маршрут восстанавливается точно), скачать `.pln`, удалить.
- **Импорт .pln** — загрузить план из MSFS 2020/2024 (или Little Navmap/SimBrief в формате MSFS) и пересчитать топливо/погоду.
- В MSFS: World Map → Load/Save → Load → выбрать `.pln`. SID/STAR/заход выберите в EFB/МФД самолёта
  под ВПП, которую предложил планнер (в бесплатной базе процедур нет).

## Возможности

- **Карта** — Leaflet + CARTO Dark (в оттенках серого), слои аэропортов, VOR/NDB/точек и трасс,
  маршрут по ортодромии, T/C и T/D на карте.
- **Рейс** — ICAO вылета/прилёта/запасного с автодополнением (ICAO, IATA, название, город),
  позывной, время вылета UTC, IFR/VFR.
- **Маршрут** — A* по графу авиатрасс (верхние/нижние), автоматический переход DCT при разрывах сети;
  ручное редактирование строки маршрута (точки, трассы, координаты `5530N03730E`, DCT, SID/STAR).
- **Погода** — METAR и TAF (aviationweather.gov → VATSIM → NOAA), расшифровка, категория VFR/MVFR/IFR/LIFR,
  ручной ввод METAR (например, погода из симулятора); ветер и температура на эшелоне по маршруту (Open-Meteo).
- **ВПП и заходы** — ранжирование ВПП по встречному/боковому ветру, длине и наличию ILS;
  автовыбор захода (ILS CAT I/II/III, LOC, RNAV, визуальный) с проверкой минимумов по погоде;
  SID/STAR/заходы из CIFP при подключённой базе X-Plane (см. `data/navdata/README.md`).
- **ВС** — 30+ типов (Airbus, Boeing, Embraer, CRJ, SSJ100, МС-21, Ту-154/204, Ил-96, Як-42, ATR, Q400, GA).
- **Топливо и массы** — trip, непредвиденное %, до запасного, финальный резерв, extra, руление, block;
  ZFW/TOW/LW против MZFW/MTOW/MLW, предупреждения о превышениях. Любой параметр (эшелон, скорость,
  ветер, ISA, пассажиры, груз, топливо) можно поменять — всё пересчитывается.
- **Навлог** — путевые углы, дистанции, высоты, время/ETA, остаток топлива, вертикальный профиль.
- **Чарты** — США: официальные PDF FAA d-TPP прямо в окне; весь мир: ChartFox, официальные AIP стран
  (в т.ч. АИП России ЦАИ), Eurocontrol EAD Basic — всё бесплатно.
- **Экспорт** — строка маршрута, ICAO FPL, X-Plane `.fms`, MSFS `.pln`, текстовый OFP; импорт `.pln`.

## Источники данных (бесплатные)

| Данные | Источник | Лицензия |
|---|---|---|
| Аэропорты, ВПП, частоты | [OurAirports](https://ourairports.com/data/) | Public domain |
| Точки, трассы, VOR/NDB, ILS | X-Plane nav data (Robin A. Peel) из [FlightGear fgdata](https://github.com/FGData/fgdata) | GNU GPL v2 |
| Актуальный AIRAC + SID/STAR/APP | ваша копия X-Plane 11/12 (`earth_*.dat`, `CIFP/`) | только локально |
| METAR/TAF | aviationweather.gov, VATSIM, NOAA | открытые |
| Ветер на высотах | [Open-Meteo](https://open-meteo.com/) | CC BY 4.0, некоммерческое |
| Чарты | FAA d-TPP, ChartFox, AIP стран | бесплатно |
| Подложка | © OpenStreetMap, © CARTO | ODbL / CARTO |

## Структура

```
api/      index.js — вход serverless-функции Vercel
server/   app.js (API), index.js (локальный запуск), airports.js, navdata.js (fix/nav/awy/CIFP), router.js (A*), weather.js, charts.js
public/   index.html, css/style.css, js/app.js, map.js, calc.js (профиль/топливо), metar.js, aircraft.js, export.js, plans.js
scripts/  fetch-data.js — обновление открытых баз в data/db
data/db/  сжатые базы (OurAirports, X-Plane navdata GPL)
```
