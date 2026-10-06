// Описание тура «Vice Skies — USA»: рейсы, самолёты, сценарии и достопримечательности.
// Маршруты (SID / трассы / STAR) считает scripts/build-tour.js по данным FAA.
// wiki — заголовок статьи английской Википедии: фото подтягивается на сайте.

export const TOUR = {
  id: 'usa-2026',
  title: 'Vice Skies',
  subtitle: 'Большой тур по США: от дождливого Сиэтла до неоновых огней Майами',
};

export const LEGS = [
  {
    id: 1, dep: 'KSEA', arr: 'KSFO', level: 'high',
    aircraft: [{ id: 'A21N', livery: 'house', label: 'Airbus A321neo' }],
    scenery: ['WUX', 'CU10'],
    title: 'Из изумрудного города к Золотым воротам',
    blurb: 'Взлёт над заливом Пьюджет-Саунд, вулканы Каскадных гор по левому борту и заход над туманным заливом Сан-Франциско.',
    tip: 'В ясную погоду после взлёта Рейнир виден прямо по курсу — не спешите в облака.',
    landmarks: [
      { name: 'Спейс-Нидл', wiki: 'Space_Needle', art: 'city', lat: 47.6205, lon: -122.3493, text: 'Символ Сиэтла высотой 184 м: на вылете смотрите вправо, когда будете проходить центр города.' },
      { name: 'Гора Рейнир', wiki: 'Mount_Rainier', art: 'mountain', lat: 46.8523, lon: -121.7603, text: 'Спящий вулкан 4392 м в шапке ледников — один из самых узнаваемых силуэтов северо-запада.' },
      { name: 'Гора Шаста', wiki: 'Mount_Shasta', art: 'mountain', lat: 41.4092, lon: -122.1949, text: 'Одинокий конус над лесами Северной Калифорнии, середина пути.' },
      { name: 'Мост Золотые Ворота', wiki: 'Golden_Gate_Bridge', art: 'bridge', lat: 37.8199, lon: -122.4783, text: 'Красный мост над проливом — на прибытии с севера пролетаете почти над ним.' },
    ],
  },
  {
    id: 2, dep: 'KSFO', arr: 'KLAS', level: 'high',
    aircraft: [{ id: 'A21N', livery: 'southwest', label: 'Southwest A321neo' }],
    scenery: ['CU10', 'CU8', 'WU2'],
    title: 'Через Сьерра-Неваду в столицу неона',
    blurb: 'Короткий прыжок через гранитные стены Йосемити и пустыню Мохаве к ослепительному Стрипу.',
    tip: 'Лучше лететь на закате: заход в Вегас над огнями Стрипа выглядит как кадр из игры.',
    landmarks: [
      { name: 'Алькатрас', wiki: 'Alcatraz_Island', art: 'island', lat: 37.8267, lon: -122.4230, text: 'Остров-тюрьма посреди залива — хорошо видна при вылете с полос 01 и 28.' },
      { name: 'Хаф-Доум, Йосемити', wiki: 'Half_Dome', art: 'mountain', lat: 37.7459, lon: -119.5332, text: 'Гранитный купол, расколотый пополам ледником, — главный символ Йосемити.' },
      { name: 'Лас-Вегас-Стрип', wiki: 'Las_Vegas_Strip', art: 'city', lat: 36.1147, lon: -115.1728, text: '6 км казино, пирамида Луксора и фонтаны Белладжио прямо под глиссадой.' },
    ],
  },
  {
    id: 3, dep: 'KLAS', arr: 'KGCN', level: 'low',
    aircraft: [
      { id: 'C208', livery: 'tour', label: 'Cessna 208 Caravan' },
      { id: 'PC12', livery: 'tour', label: 'Pilatus PC-12' },
      { id: 'DRCX', livery: 'tour', label: 'Draco X' },
    ],
    scenery: ['WU22'],
    title: 'Плотина Гувера и край Большого каньона',
    blurb: 'Экскурсионный маршрут на малой высоте: озеро Мид, плотина Гувера и плато, обрывающееся в каньон.',
    tip: 'Над каньоном действует зона SFRA: держите высоту не ниже предложенной и не снижайтесь в каньон.',
    landmarks: [
      { name: 'Плотина Гувера', wiki: 'Hoover_Dam', art: 'canyon', lat: 36.0161, lon: -114.7377, text: 'Бетонная арка 221 м на реке Колорадо — через 15 минут после взлёта, справа.' },
      { name: 'Озеро Мид', wiki: 'Lake_Mead', art: 'canyon', lat: 36.1435, lon: -114.4144, text: 'Бирюзовое водохранилище среди красных скал пустыни.' },
      { name: 'Большой каньон', wiki: 'Grand_Canyon', art: 'canyon', lat: 36.0619, lon: -112.1076, text: 'Глубина до 1,8 км: на подходе к KGCN каньон открывается внезапно, слева по борту.' },
    ],
  },
  {
    id: 4, dep: 'KGCN', arr: 'KTUS', level: 'low',
    aircraft: [
      { id: 'PC12', livery: 'tour', label: 'Pilatus PC-12' },
      { id: 'C208', livery: 'tour', label: 'Cessna 208 Caravan' },
    ],
    scenery: ['WU22', 'Saguaro'],
    title: 'Красные скалы Седоны и страна сагуаро',
    blurb: 'С плато Колорадо вниз, мимо красных скал Седоны и Финикса, в пустыню Сонора с гигантскими кактусами.',
    tip: 'После Финикса держитесь высоты: на подходе к Тусону горы Санта-Каталина поднимаются до 2800 м.',
    landmarks: [
      { name: 'Седона', wiki: 'Sedona,_Arizona', art: 'canyon', lat: 34.8697, lon: -111.7610, text: 'Красные скалы-«соборы» и каньон Оук-Крик — красивее всего в лучах низкого солнца.' },
      { name: 'Финикс', wiki: 'Phoenix,_Arizona', art: 'desert', lat: 33.4484, lon: -112.0740, text: 'Огромная сетка пустынного мегаполиса — хорошо видна с крейсерской высоты.' },
      { name: 'Национальный парк Сагуаро', wiki: 'Saguaro_National_Park', art: 'desert', lat: 32.2967, lon: -111.1666, text: 'Леса кактусов-великанов высотой до 12 метров окружают Тусон с двух сторон.' },
    ],
  },
  {
    id: 5, dep: 'KTUS', arr: 'KORD', level: 'high',
    aircraft: [{ id: 'A21N', livery: 'american', label: 'American A321neo' }],
    scenery: ['WU2', 'CU15'],
    title: 'Через всю Америку в Город ветров',
    blurb: 'Пустыня, Скалистые горы на горизонте, бесконечные поля Великих равнин и небоскрёбы у озера Мичиган.',
    tip: 'Заход в O’Hare вечером — сетка огней пригородов Чикаго тянется до самого горизонта.',
    landmarks: [
      { name: 'Альбукерке', wiki: 'Albuquerque_International_Balloon_Fiesta', art: 'desert', lat: 35.196, lon: -106.597, text: 'Город фестиваля воздушных шаров у подножия гор Сандия — пролетаете севернее.' },
      { name: 'Великие равнины', wiki: 'Great_Plains', art: 'plains', lat: 38.5, lon: -98.0, text: 'Круги полей с поворотным поливом — словно пиксельная мозаика под крылом.' },
      { name: 'Уиллис-тауэр', wiki: 'Willis_Tower', art: 'city', lat: 41.8789, lon: -87.6359, text: '442 метра стекла и стали — главная доминанта силуэта Чикаго.' },
      { name: 'Облачные врата', wiki: 'Cloud_Gate', art: 'city', lat: 41.8827, lon: -87.6233, text: 'Зеркальная «Фасолина» в Миллениум-парке.' },
    ],
  },
  {
    id: 6, dep: 'KORD', arr: 'KLAX', level: 'high',
    aircraft: [
      { id: 'A21N', livery: 'american', label: 'American A321neo' },
      { id: 'A21N', livery: 'united', label: 'United A321neo' },
    ],
    scenery: ['CU15', 'CU13'],
    title: 'Из Чикаго к голливудским холмам',
    blurb: 'Перелёт через Скалистые горы и пустыни Юты к океану и огням Лос-Анджелеса.',
    tip: 'На прибытии в LAX с востока город проплывает под вами целиком — отличный момент для скриншотов.',
    landmarks: [
      { name: 'Скалистые горы', wiki: 'Rocky_Mountain_National_Park', art: 'mountain', lat: 40.3428, lon: -105.6836, text: 'Заснеженные четырнадцатитысячники Колорадо — главный горный хребет маршрута.' },
      { name: 'Надпись Hollywood', wiki: 'Hollywood_Sign', art: 'coast', lat: 34.1341, lon: -118.3215, text: 'Девять белых букв на склоне горы Ли — справа на заходе с востока.' },
      { name: 'Обсерватория Гриффит', wiki: 'Griffith_Observatory', art: 'city', lat: 34.1184, lon: -118.3004, text: 'Белые купола над городом, знакомые по десяткам фильмов.' },
      { name: 'Пирс Санта-Моники', wiki: 'Santa_Monica_Pier', art: 'coast', lat: 34.0092, lon: -118.4976, text: 'Колесо обозрения на краю океана — здесь заканчивается Route 66.' },
    ],
  },
  {
    id: 7, dep: 'KLAX', arr: 'KSBA', level: 'vfr', roundTrip: true,
    aircraft: [
      { id: 'C172', livery: 'tour', label: 'Cessna 172' },
      { id: 'DA40', livery: 'tour', label: 'Diamond DA40' },
    ],
    scenery: ['CU13'],
    title: 'Вдоль побережья Малибу в Санта-Барбару и обратно',
    blurb: 'Неспешный ПВП-полёт над пляжами Малибу и Ventura, обед в Санта-Барбаре и обратно вдоль Тихого океана.',
    tip: 'Держитесь береговой черты на 4500–5500 ft; Class B Лос-Анджелеса обходите через VOR Santa Monica.',
    landmarks: [
      { name: 'Малибу', wiki: 'Malibu,_California', art: 'coast', lat: 34.0259, lon: -118.7798, text: 'Виллы над обрывами и бесконечные пляжи — справа по борту на всём участке.' },
      { name: 'Острова Чаннел', wiki: 'Channel_Islands_National_Park', art: 'island', lat: 34.0069, lon: -119.7785, text: 'Дикие острова в дымке над океаном — видны слева на подходе к Санта-Барбаре.' },
      { name: 'Миссия Санта-Барбара', wiki: 'Mission_Santa_Barbara', art: 'coast', lat: 34.4383, lon: -119.7135, text: '«Королева миссий» 1786 года с розовыми башнями на фоне гор Санта-Инес.' },
      { name: 'Пристань Стернс', wiki: 'Stearns_Wharf', art: 'coast', lat: 34.4100, lon: -119.6853, text: 'Старейшая деревянная пристань Калифорнии в центре города.' },
    ],
    vfr: { out: ['SMO', 'VTU'], back: ['VTU', 'SMO'], outAlt: 4500, backAlt: 5500 },
  },
  {
    id: 8, dep: 'KLAX', arr: 'KMIA', level: 'high', finale: true,
    aircraft: [{ id: 'A21N', livery: 'american', label: 'American A321neo' }],
    scenery: ['CU13', 'Florida', 'WU22'],
    title: 'Финал: от Тихого океана до Вайс-Сити',
    blurb: 'Самый длинный рейс тура: пустыни, Техас, Мексиканский залив — и закат над Майами-Бич в стиле GTA.',
    tip: 'Подгадайте прилёт к закату: розово-фиолетовое небо над Ocean Drive и есть та самая «Вайс-Сити».',
    landmarks: [
      { name: 'Аламо', wiki: 'Alamo_Mission_in_San_Antonio', art: 'desert', lat: 29.4260, lon: -98.4861, text: 'Старая миссия в Сан-Антонио — символ Техаса.' },
      { name: 'Эверглейдс', wiki: 'Everglades_National_Park', art: 'plains', lat: 25.2866, lon: -80.8987, text: 'Мангровые лабиринты и «река травы» на подходе к Майами с запада.' },
      { name: 'Ocean Drive', wiki: 'Ocean_Drive', art: 'coast', lat: 25.7814, lon: -80.1300, text: 'Неон ар-деко, пальмы и пляж Саут-Бич — настоящая Вайс-Сити.' },
      { name: 'Майами-Бич', wiki: 'Miami_Beach,_Florida', art: 'coast', lat: 25.7907, lon: -80.1300, text: 'Остров-курорт между заливом Бискейн и Атлантикой — финальная точка тура.' },
    ],
  },
];
