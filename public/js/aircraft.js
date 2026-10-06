// Справочник ВС (приближённые публичные характеристики, массы в кг).
// cat: J — реактивный, T — турбовинтовой, P — поршневой
// ff — расход на крейсерском режиме, кг/ч; mach/tas — крейсерская скорость;
// ceil/opt — потолок и типичный оптимальный эшелон (FL); toRwy/ldgRwy — потребная ВПП, ft
const A = (o) => ({ climbRate: 2200, descRate: 2200, taxi: 200, wake: 'M', appCat: 'C', equip: 'SDE2E3FGHIJ1RWXY/LB1', ...o });

export const AIRCRAFT = [
  // --- Airbus ---
  A({ id: 'A319', name: 'Airbus A319', icao: 'A319', cat: 'J', oew: 40800, mzfw: 58500, mtow: 75500, mlw: 62500, maxFuel: 18700, maxPax: 144, maxCargo: 4500, mach: 0.78, ceil: 390, opt: 370, ff: 2350, toRwy: 6200, ldgRwy: 4700 }),
  A({ id: 'A320', name: 'Airbus A320ceo', icao: 'A320', cat: 'J', oew: 42600, mzfw: 62500, mtow: 78000, mlw: 66000, maxFuel: 18700, maxPax: 180, maxCargo: 5000, mach: 0.78, ceil: 390, opt: 360, ff: 2500, toRwy: 6900, ldgRwy: 4900 }),
  A({ id: 'A20N', name: 'Airbus A320neo', icao: 'A20N', cat: 'J', oew: 44300, mzfw: 64300, mtow: 79000, mlw: 67400, maxFuel: 18500, maxPax: 180, maxCargo: 5000, mach: 0.78, ceil: 398, opt: 370, ff: 2200, toRwy: 6900, ldgRwy: 4900 }),
  A({ id: 'A321', name: 'Airbus A321ceo', icao: 'A321', cat: 'J', oew: 48500, mzfw: 73800, mtow: 93500, mlw: 77800, maxFuel: 18600, maxPax: 220, maxCargo: 6000, mach: 0.78, ceil: 390, opt: 350, ff: 2900, toRwy: 7300, ldgRwy: 5300 }),
  A({ id: 'A21N', name: 'Airbus A321neo', icao: 'A21N', cat: 'J', oew: 50500, mzfw: 75600, mtow: 97000, mlw: 79200, maxFuel: 25800, maxPax: 220, maxCargo: 6000, mach: 0.78, ceil: 398, opt: 360, ff: 2600, toRwy: 7400, ldgRwy: 5300 }),
  A({ id: 'A333', name: 'Airbus A330-300', icao: 'A333', cat: 'J', wake: 'H', appCat: 'D', taxi: 500, oew: 129000, mzfw: 175000, mtow: 242000, mlw: 187000, maxFuel: 109000, maxPax: 300, maxCargo: 20000, mach: 0.82, ceil: 410, opt: 380, ff: 5800, toRwy: 8900, ldgRwy: 6000 }),
  A({ id: 'A339', name: 'Airbus A330-900neo', icao: 'A339', cat: 'J', wake: 'H', appCat: 'D', taxi: 500, oew: 135000, mzfw: 181000, mtow: 251000, mlw: 191000, maxFuel: 111000, maxPax: 300, maxCargo: 20000, mach: 0.82, ceil: 410, opt: 380, ff: 5300, toRwy: 9000, ldgRwy: 6000 }),
  A({ id: 'A359', name: 'Airbus A350-900', icao: 'A359', cat: 'J', wake: 'H', appCat: 'D', taxi: 600, oew: 142400, mzfw: 195700, mtow: 283000, mlw: 207000, maxFuel: 110500, maxPax: 325, maxCargo: 22000, mach: 0.85, ceil: 431, opt: 390, ff: 5800, toRwy: 8800, ldgRwy: 6000 }),
  A({ id: 'A388', name: 'Airbus A380-800', icao: 'A388', cat: 'J', wake: 'J', appCat: 'D', taxi: 900, oew: 277000, mzfw: 373000, mtow: 575000, mlw: 394000, maxFuel: 254000, maxPax: 525, maxCargo: 30000, mach: 0.85, ceil: 431, opt: 380, ff: 11500, toRwy: 9800, ldgRwy: 6900 }),
  // --- Boeing ---
  A({ id: 'B737', name: 'Boeing 737-700', icao: 'B737', cat: 'J', oew: 38150, mzfw: 55200, mtow: 70080, mlw: 58600, maxFuel: 20890, maxPax: 140, maxCargo: 4500, mach: 0.785, ceil: 410, opt: 370, ff: 2300, toRwy: 6500, ldgRwy: 4600 }),
  A({ id: 'B738', name: 'Boeing 737-800', icao: 'B738', cat: 'J', oew: 41400, mzfw: 62700, mtow: 79000, mlw: 66360, maxFuel: 20890, maxPax: 186, maxCargo: 5000, mach: 0.785, ceil: 410, opt: 360, ff: 2500, toRwy: 7600, ldgRwy: 5400 }),
  A({ id: 'B38M', name: 'Boeing 737 MAX 8', icao: 'B38M', cat: 'J', oew: 45070, mzfw: 65200, mtow: 82200, mlw: 69300, maxFuel: 20730, maxPax: 189, maxCargo: 5000, mach: 0.79, ceil: 410, opt: 370, ff: 2150, toRwy: 7500, ldgRwy: 5400 }),
  A({ id: 'B752', name: 'Boeing 757-200', icao: 'B752', cat: 'J', taxi: 300, oew: 58000, mzfw: 83500, mtow: 115680, mlw: 89800, maxFuel: 33800, maxPax: 200, maxCargo: 8000, mach: 0.80, ceil: 420, opt: 370, ff: 3300, toRwy: 7000, ldgRwy: 5000 }),
  A({ id: 'B763', name: 'Boeing 767-300ER', icao: 'B763', cat: 'J', wake: 'H', appCat: 'D', taxi: 400, oew: 90000, mzfw: 133800, mtow: 186900, mlw: 145100, maxFuel: 73400, maxPax: 260, maxCargo: 15000, mach: 0.80, ceil: 431, opt: 370, ff: 4800, toRwy: 8800, ldgRwy: 5800 }),
  A({ id: 'B744', name: 'Boeing 747-400', icao: 'B744', cat: 'J', wake: 'H', appCat: 'D', taxi: 800, oew: 180000, mzfw: 246000, mtow: 396900, mlw: 285800, maxFuel: 174000, maxPax: 416, maxCargo: 25000, mach: 0.85, ceil: 450, opt: 350, ff: 10500, toRwy: 10500, ldgRwy: 7000 }),
  A({ id: 'B748', name: 'Boeing 747-8', icao: 'B748', cat: 'J', wake: 'H', appCat: 'D', taxi: 800, oew: 220000, mzfw: 295000, mtow: 447700, mlw: 312000, maxFuel: 193000, maxPax: 410, maxCargo: 30000, mach: 0.855, ceil: 431, opt: 360, ff: 10000, toRwy: 10200, ldgRwy: 7000 }),
  A({ id: 'B77W', name: 'Boeing 777-300ER', icao: 'B77W', cat: 'J', wake: 'H', appCat: 'D', taxi: 700, oew: 167800, mzfw: 237700, mtow: 351500, mlw: 251300, maxFuel: 145500, maxPax: 396, maxCargo: 25000, mach: 0.84, ceil: 431, opt: 350, ff: 7500, toRwy: 10000, ldgRwy: 6600 }),
  A({ id: 'B789', name: 'Boeing 787-9', icao: 'B789', cat: 'J', wake: 'H', appCat: 'D', taxi: 500, oew: 128800, mzfw: 181400, mtow: 254000, mlw: 192800, maxFuel: 101300, maxPax: 290, maxCargo: 20000, mach: 0.85, ceil: 431, opt: 400, ff: 5400, toRwy: 9300, ldgRwy: 5800 }),
  // --- Региональные ---
  A({ id: 'E175', name: 'Embraer E175', icao: 'E175', cat: 'J', taxi: 120, oew: 21900, mzfw: 31700, mtow: 38790, mlw: 34000, maxFuel: 9300, maxPax: 76, maxCargo: 1500, mach: 0.78, ceil: 410, opt: 350, ff: 1600, toRwy: 6600, ldgRwy: 4200 }),
  A({ id: 'E190', name: 'Embraer E190', icao: 'E190', cat: 'J', taxi: 150, oew: 27900, mzfw: 40800, mtow: 51800, mlw: 44000, maxFuel: 12970, maxPax: 100, maxCargo: 2000, mach: 0.78, ceil: 410, opt: 360, ff: 1950, toRwy: 6800, ldgRwy: 4300 }),
  A({ id: 'CRJ9', name: 'Bombardier CRJ900', icao: 'CRJ9', cat: 'J', taxi: 120, oew: 21800, mzfw: 32000, mtow: 38330, mlw: 33300, maxFuel: 8800, maxPax: 90, maxCargo: 1500, mach: 0.78, ceil: 410, opt: 350, ff: 1500, toRwy: 6600, ldgRwy: 5300 }),
  A({ id: 'SU95', name: 'Sukhoi Superjet 100', icao: 'SU95', cat: 'J', taxi: 150, oew: 25100, mzfw: 40000, mtow: 49450, mlw: 41000, maxFuel: 12690, maxPax: 98, maxCargo: 2000, mach: 0.78, ceil: 400, opt: 350, ff: 1700, toRwy: 6700, ldgRwy: 5000 }),
  A({ id: 'MC23', name: 'Яковлев МС-21-300', icao: 'MC23', cat: 'J', oew: 46000, mzfw: 63600, mtow: 79250, mlw: 69100, maxFuel: 20400, maxPax: 211, maxCargo: 5000, mach: 0.78, ceil: 398, opt: 360, ff: 2300, toRwy: 6900, ldgRwy: 5000 }),
  // --- Советские / российские ---
  A({ id: 'T154', name: 'Туполев Ту-154М', icao: 'T154', cat: 'J', taxi: 400, oew: 55300, mzfw: 74000, mtow: 102000, mlw: 80000, maxFuel: 39750, maxPax: 164, maxCargo: 5000, mach: 0.80, ceil: 390, opt: 350, ff: 5300, toRwy: 8200, ldgRwy: 6500, climbRate: 1800, equip: 'SDFGRY/C' }),
  A({ id: 'T204', name: 'Туполев Ту-204-100', icao: 'T204', cat: 'J', taxi: 300, oew: 58300, mzfw: 81000, mtow: 103000, mlw: 88000, maxFuel: 32700, maxPax: 210, maxCargo: 6000, mach: 0.78, ceil: 400, opt: 360, ff: 3300, toRwy: 7500, ldgRwy: 6000 }),
  A({ id: 'IL96', name: 'Ильюшин Ил-96-300', icao: 'IL96', cat: 'J', wake: 'H', appCat: 'D', taxi: 600, oew: 117000, mzfw: 157000, mtow: 250000, mlw: 175000, maxFuel: 122000, maxPax: 300, maxCargo: 20000, mach: 0.80, ceil: 390, opt: 350, ff: 7500, toRwy: 9000, ldgRwy: 6600, climbRate: 1800 }),
  A({ id: 'YK42', name: 'Яковлев Як-42Д', icao: 'YK42', cat: 'J', taxi: 200, oew: 34500, mzfw: 47000, mtow: 57500, mlw: 51000, maxFuel: 18500, maxPax: 120, maxCargo: 2500, mach: 0.74, ceil: 310, opt: 290, ff: 2900, toRwy: 7000, ldgRwy: 5300, climbRate: 1800, equip: 'SDFGRY/C' }),
  // --- Турбовинтовые ---
  A({ id: 'AT76', name: 'ATR 72-600', icao: 'AT76', cat: 'T', appCat: 'B', taxi: 50, oew: 13500, mzfw: 21000, mtow: 23000, mlw: 22350, maxFuel: 5000, maxPax: 70, maxCargo: 1000, tas: 275, ceil: 250, opt: 170, ff: 600, toRwy: 4300, ldgRwy: 3500, climbRate: 1300, descRate: 1500, equip: 'SDFGRY/S' }),
  A({ id: 'DH8D', name: 'De Havilland Dash 8 Q400', icao: 'DH8D', cat: 'T', appCat: 'B', taxi: 60, oew: 17100, mzfw: 25900, mtow: 29260, mlw: 28010, maxFuel: 5300, maxPax: 78, maxCargo: 1200, tas: 350, ceil: 270, opt: 250, ff: 900, toRwy: 4800, ldgRwy: 4200, climbRate: 1800, descRate: 1800, equip: 'SDFGRY/S' }),
  A({ id: 'B350', name: 'Beechcraft King Air 350', icao: 'B350', cat: 'T', wake: 'L', appCat: 'B', taxi: 20, oew: 4100, mzfw: 5670, mtow: 6800, mlw: 6800, maxFuel: 1640, maxPax: 9, maxCargo: 250, tas: 300, ceil: 350, opt: 270, ff: 300, toRwy: 3300, ldgRwy: 2700, climbRate: 1800, descRate: 1500, equip: 'SDFGRY/S' }),
  A({ id: 'PC12', name: 'Pilatus PC-12', icao: 'PC12', cat: 'T', wake: 'L', appCat: 'A', taxi: 10, oew: 2800, mzfw: 4100, mtow: 4740, mlw: 4500, maxFuel: 1220, maxPax: 9, maxCargo: 200, tas: 280, ceil: 300, opt: 250, ff: 190, toRwy: 2500, ldgRwy: 2200, climbRate: 1500, descRate: 1500, equip: 'SDFGRY/S' }),
  A({ id: 'TBM9', name: 'Daher TBM 930', icao: 'TBM9', cat: 'T', wake: 'L', appCat: 'A', taxi: 8, oew: 2100, mzfw: 2730, mtow: 3354, mlw: 3186, maxFuel: 870, maxPax: 5, maxCargo: 100, tas: 320, ceil: 310, opt: 280, ff: 170, toRwy: 2400, ldgRwy: 2200, climbRate: 1800, descRate: 1500, equip: 'SDFGRY/S' }),
  // --- Бизнес / GA ---
  A({ id: 'C25C', name: 'Cessna Citation CJ4', icao: 'C25C', cat: 'J', wake: 'L', appCat: 'B', taxi: 30, oew: 4900, mzfw: 5800, mtow: 7761, mlw: 7103, maxFuel: 2640, maxPax: 9, maxCargo: 200, tas: 450, ceil: 450, opt: 430, ff: 450, toRwy: 3400, ldgRwy: 3000, climbRate: 2500, descRate: 2500, equip: 'SDFGRY/S' }),
  A({ id: 'C172', name: 'Cessna 172 Skyhawk', icao: 'C172', cat: 'P', wake: 'L', appCat: 'A', taxi: 2, oew: 770, mzfw: 1111, mtow: 1111, mlw: 1111, maxFuel: 145, maxPax: 3, maxCargo: 50, tas: 120, ceil: 140, opt: 65, ff: 28, toRwy: 1700, ldgRwy: 1400, climbRate: 600, descRate: 500, equip: 'SDFGRY/S' }),
];

export const PAX_MASS = 84;  // кг, пассажир с ручной кладью
export const BAG_MASS = 20;  // кг, багаж на пассажира

export function findAircraft(id) {
  return AIRCRAFT.find((a) => a.id === id) || AIRCRAFT[2];
}
