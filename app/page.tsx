'use client';

import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  Search,
  ShieldAlert,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Track = 'Москва' | 'Бизнес';

type Task = {
  id: string;
  track: Track;
  number: number;
  title: string;
  sponsor: string;
  category: string;
  score: number;
  fit: string;
  task: string;
  resources: string;
  output: string;
  roles: string;
  risk: string;
  url: string;
  special?: string;
};

const tasks: Task[] = [
  {
    id: 'b8', track: 'Бизнес', number: 8, score: 91,
    title: 'Оценка здоровья репозиториев SourceCraft', sponsor: 'Yandex Cloud', category: 'Developer tools',
    fit: 'Лучший общий выбор: измеримый результат, богатые данные, сильный инженерный демо-сценарий.',
    task: 'Рассчитать Repo Health Score 0–100, объяснить оценку, дать рекомендации и построить публичный рейтинг.',
    resources: 'Git-история, CI, AppSec, README, issues, merge requests, contributors, релизы, лайки и тестовые репозитории.',
    output: 'Веб-сервис с аналитическим дашбордом, объяснимым score и рейтингом открытых репозиториев.',
    roles: 'Product/project, backend, frontend, data/ML, AppSec, UX.',
    risk: 'Нужно убедительно обосновать формулу и веса оценки.',
    url: 'https://i.moscow/cabinet/hackaton/lct/contest/67f958a876bc4beb8081c34bdf78745c',
  },
  {
    id: 'b3', track: 'Бизнес', number: 3, score: 89,
    title: 'Планирование маршрутов выездных инженеров', sponsor: 'билайн бизнес', category: 'Логистика',
    fit: 'Самый предсказуемый путь к качественному MVP: алгоритм, карта и понятные KPI.',
    task: 'Распределять заявки с учётом квалификации, окон, транспорта, оборудования и динамического перепланирования.',
    resources: 'Заявки, справочник инженеров, оборудование, матрица совместимости и координаты объектов.',
    output: 'Веб-сервис VRP/VRPTW с картой, SLA-аналитикой и объяснением выбранных маршрутов.',
    roles: 'Project, backend, frontend, data/ML, UX.',
    risk: 'Нужны сильный baseline и наглядное преимущество над ручным планом.',
    url: 'https://i.moscow/cabinet/hackaton/lct/contest/420731fd6e6b4b4c917428b62f125cdd',
  },
  {
    id: 'm8', track: 'Москва', number: 8, score: 87,
    title: 'Прогноз аварий инженерных коллекторов', sponsor: 'ДЖКХ · Москоллектор', category: 'Predictive ML',
    fit: 'Лучший выбор для сильной data-команды: реальные данные и формальные метрики.',
    task: 'Прогнозировать отказ датчика, пожарный риск, незаконный доступ или износ инфраструктуры минимум за 24 часа.',
    resources: '12+ лет логов, тревоги, ремонты, реестр оборудования, допуски, регламенты и журналы ОДС.',
    output: 'ML-модель + дашборд, карта, журнал прогнозов, заявки на обслуживание и REST API.',
    roles: 'Project, data/ML, backend, frontend.',
    risk: 'Тяжёлая очистка данных, дисбаланс классов и риск утечки будущего в признаки.',
    special: 'Precision > 0,7 · Recall > 0,5 · горизонт ≥24 ч · расчёт <5 мин',
    url: 'https://i.moscow/cabinet/hackaton/lct/contest/9e8a783b688746dea87f9813b366a293',
  },
  {
    id: 'b9', track: 'Бизнес', number: 9, score: 85,
    title: 'Симулятор переговоров «Арена переговоров»', sponsor: 'ОЭЗ Алабуга', category: 'EdTech / LLM',
    fit: 'Лучший продуктовый вариант: быстрый MVP, свобода механик и эффектный live-демо.',
    task: 'Создать интерактивные переговоры, где исход зависит от стратегии, аргументации и формулировок.',
    resources: 'Материалы по Гарвардскому методу, SPIN и BATNA.',
    output: 'Симулятор/тренажёр с вариативными сценариями, игровой логикой и оценкой поведения.',
    roles: 'Project/product, frontend, backend, UX, game design, business analysis.',
    risk: 'Оценка субъективна; легко сделать типовой чат и сложно — запоминающийся продукт.',
    url: 'https://i.moscow/cabinet/hackaton/lct/contest/101e7afa2d3946cfba4a77e57243058d',
  },
  {
    id: 'm7', track: 'Москва', number: 7, score: 84,
    title: 'Мониторинг строительной площадки', sponsor: 'Департамент градостроительной политики', category: 'Computer vision',
    fit: 'Хорошо ограничиваемый end-to-end CV-кейс с понятным визуальным результатом.',
    task: 'Детектировать и считать технику на снимках, сопоставлять наблюдения с календарным планом и показывать отклонения.',
    resources: 'Обезличенные, синтетические или открытые изображения, график работ и датасеты строительной техники.',
    output: 'Полный поток от видеоданных и детекции до аналитики хода работ.',
    roles: 'Project, CV, data, backend, frontend.',
    risk: 'Присутствие техники не всегда доказывает фактическое выполнение работ.',
    url: 'https://i.moscow/cabinet/hackaton/lct/contest/6c37b94ed4a14e9292aaa4a55ba80017',
  },
  {
    id: 'm2', track: 'Москва', number: 2, score: 83,
    title: 'Трассировка тепловых сетей', sponsor: 'ДИТ Москвы', category: 'Geo / optimization',
    fit: 'Ограниченная и понятная геозадача с наглядной картой.',
    task: 'Предложить оптимальные варианты подключения нового здания к тепловым сетям с учётом городской инфраструктуры.',
    resources: 'Массив геоданных и низкополигональные модели зданий.',
    output: 'Программный сервис моделирования и сравнения трасс.',
    roles: 'Project, backend, frontend, геоаналитик.',
    risk: 'Инженерные ограничения могут оказаться сложнее, чем следует из короткой карточки.',
    url: 'https://i.moscow/cabinet/hackaton/lct/contest/fcf616b84d0c482dab2e639f7631cfc6',
  },
  {
    id: 'm1', track: 'Москва', number: 1, score: 82,
    title: 'Подбор роботов и расчёт экономического эффекта', sponsor: 'ДПИИР · ФЦ БАС', category: 'Robotics / fintech',
    fit: 'Сильное клиентское демо: сравнение, ROI и визуализация в одном продукте.',
    task: 'Подбирать роботов под объект, сравнивать характеристики, считать CAPEX/OPEX/ROI и показывать имитацию работы.',
    resources: 'Таблица решений, эффективность, обезличенные параметры объектов и открытые источники.',
    output: 'Готовая к показу клиенту пошаговая веб-платформа.',
    roles: 'Product, frontend, backend, UX, моделирование, ML, data.',
    risk: 'Очень широкий объём; экономическая модель должна выглядеть достоверно.',
    url: 'https://i.moscow/cabinet/hackaton/lct/contest/0ba83f7136734fd9920b111e548d766c',
  },
  {
    id: 'm10', track: 'Москва', number: 10, score: 81,
    title: 'Анализ изменений строительной документации', sponsor: 'Мосгосстройнадзор', category: 'Document AI',
    fit: 'Современный PDF/LLM/CV-кейс с сильным интерфейсом инспектора.',
    task: 'Сопоставлять проектную, рабочую и исполнительную документацию и формировать протокол расхождений.',
    resources: 'Проектная, рабочая и исполнительная документация в PDF.',
    output: 'ИИ-сервис с привязкой ошибок к страницам и передачей результатов в ИАИС «РиН».',
    roles: 'Project, data/ML, backend, frontend, data engineering.',
    risk: 'Сложное совмещение OCR, таблиц, чертежей и версий документов.',
    url: 'https://i.moscow/cabinet/hackaton/lct/contest/195c53cadba6445093b7c01b58608d25',
  },
  {
    id: 'b1', track: 'Бизнес', number: 1, score: 80,
    title: 'Поиск слабых технологических сигналов', sponsor: 'Газпромбанк.Тех', category: 'Research AI',
    fit: 'Доступные открытые источники и хороший RAG/аналитический сценарий.',
    task: 'По теме выдавать 15 зарождающихся трендов, их пользу, пример, источник и методику обнаружения.',
    resources: 'Открытые сайты, аналитические отчёты, патенты и научные публикации.',
    output: 'ML-сервис раннего обнаружения трендов с детальной аналитикой.',
    roles: 'Project, backend, ML.',
    risk: 'Нет объективной разметки того, что действительно является новым трендом.',
    url: 'https://i.moscow/cabinet/hackaton/lct/contest/5d0dec1c0ec54fbba969da00b3b8ac60',
  },
  {
    id: 'm6', track: 'Москва', number: 6, score: 79,
    title: 'Финансовый питомец для детей', sponsor: 'Департамент финансов Москвы', category: 'Mobile / EdTech',
    fit: 'Реалистичный продукт; победу определят UX, персонаж и механика обучения.',
    task: 'Через виртуального питомца учить бюджету, приоритетам расходов и накоплениям.',
    resources: 'Рамка компетенций финансовой грамотности и брендбук.',
    output: 'Мобильное приложение для RuStore с заданиями, валютой и прогрессом питомца.',
    roles: 'Project, mobile/frontend, UX, game design, ML опционально.',
    risk: 'Технически легко повторить; нужна выдающаяся продуктовая упаковка.',
    url: 'https://i.moscow/cabinet/hackaton/lct/contest/1b46fdf5991144eea75d3c29769257a1',
  },
  {
    id: 'b5', track: 'Бизнес', number: 5, score: 78,
    title: 'Планирование беспилотных авиационных работ', sponsor: 'Геоскан', category: 'Optimization / UAV',
    fit: 'Хорошее математическое ядро, если команда умеет оптимизацию.',
    task: 'Распределить съёмку между БВС, минимизируя время выполнения либо суммарный износ.',
    resources: 'Характеристики БВС и камер, точки взлёта, область и виды съёмки.',
    output: 'Веб-сервис расчёта оптимального полётного задания.',
    roles: 'System analysis, математическое моделирование, ML, data.',
    risk: 'Часть авиационных ограничений придётся формализовать самостоятельно.',
    url: 'https://i.moscow/cabinet/hackaton/lct/contest/dcc56e863da346fc8fb668e48d569e9b',
  },
  {
    id: 'b10', track: 'Бизнес', number: 10, score: 76,
    title: 'Сканер российских вин', sponsor: 'РСХБ.Цифра', category: 'Computer vision',
    fit: 'Компактный CV-пайплайн, который реально довести до polished MVP.',
    task: 'По фотографии бутылки найти карточку вина на платформе «Своё Вино».',
    resources: 'Массив данных о российских винах с платформы.',
    output: 'Фото-сканер с поиском и карточкой продукта.',
    roles: 'Project, data, backend, ML/CV.',
    risk: 'Похожие этикетки, блики, ракурсы и неясное покрытие изображениями.',
    special: 'Только 18+',
    url: 'https://i.moscow/cabinet/hackaton/lct/contest/3a9c0c2e86184425bd73d4cedbf6565a',
  },
  {
    id: 'b6', track: 'Бизнес', number: 6, score: 74,
    title: 'CRM взаимодействия с учебными заведениями', sponsor: 'ИТ Школа Ростелеком', category: 'Enterprise SaaS',
    fit: 'Собрать MVP легко, но выделиться среди обычных CRM сложно.',
    task: 'Автоматизировать весь цикл работы с вузами: контакты, документы, лицензии, обучение и контроль программ.',
    resources: 'Массив статистических данных.',
    output: 'CRM с API к LMS и сайту, учётом 152-ФЗ и требований ФСТЭК №117.',
    roles: 'Project, data, backend, frontend/full-stack.',
    risk: 'Большой workflow, комплаенс и слабая уникальность базового решения.',
    url: 'https://i.moscow/cabinet/hackaton/lct/contest/179b401bb27649418735ecafbd037e1b',
  },
  {
    id: 'b4', track: 'Бизнес', number: 4, score: 72,
    title: 'Цифровой дизайнер презентаций', sponsor: 'VK Tech', category: 'Generative AI',
    fit: 'Очень эффектно, но заявленный масштаб слишком велик для двух недель.',
    task: 'Извлечь дизайн-систему произвольного шаблона и автоматически сверстать новую презентацию.',
    resources: 'Inference API, три шаблона, набор контента и CLI.',
    output: 'Open-source решение, адаптирующееся к стилю без зашитых макетов.',
    roles: 'Data, ML, document parsing, layout/CV.',
    risk: 'Нужно одновременно решить PPTX parsing, layout, типографику, CV и LLM-оркестрацию.',
    url: 'https://i.moscow/cabinet/hackaton/lct/contest/a964db5a6bd444a6bc5981770f55a080',
  },
  {
    id: 'm3', track: 'Москва', number: 3, score: 70,
    title: 'Автоматическое проектирование озеленения', sponsor: 'Департамент природопользования', category: 'GIS / CAD',
    fit: 'Ценный продукт, но сочетает слишком много редкой экспертизы.',
    task: 'Размещать посадки с учётом коммуникаций и нормативов, поддерживать правки и экспорт DXF.',
    resources: 'DXF, возможные DWG/SHP/GeoJSON, открытые геоданные, каталоги посадок и нормативы.',
    output: 'ИИ/GIS-веб-сервис генеративного дизайна с импортом и экспортом DXF.',
    roles: 'ML, Python/C++, CAD/GIS.',
    risk: 'Геометрия, нормативы, GIS и CAD-совместимость в одном MVP.',
    url: 'https://i.moscow/cabinet/hackaton/lct/contest/447cf0e02acd4f52b6f4a5fd7f7defd7',
  },
  {
    id: 'm9', track: 'Москва', number: 9, score: 68,
    title: 'Симулятор диспетчера системы 112', sponsor: 'Департамент ГОЧС и ПБ', category: 'Voice AI / training',
    fit: 'Сильное демо, но высокая зависимость от предметных регламентов и интеграций.',
    task: 'Эмулировать звонок на IP-гарнитуру, управлять сценариями обучения и оценивать действия оператора.',
    resources: 'Действующее ПО и база данных московской системы 112.',
    output: 'Учебный симулятор с AI-вызовами, уровнями сложности и контролем подготовки.',
    roles: 'Data, backend, frontend, voice AI.',
    risk: 'Доступ к закрытой системе, телефония и методика объективной оценки.',
    url: 'https://i.moscow/cabinet/hackaton/lct/contest/9852d41aacad40178aaa2c90c627b09a',
  },
  {
    id: 'm4', track: 'Москва', number: 4, score: 66,
    title: 'Контроль качества денситометрии', sponsor: 'Департамент здравоохранения', category: 'Medical CV',
    fit: 'Чёткая постановка и размеченные данные, но необходима медицинская экспертиза.',
    task: 'По DICOM оценивать качество снимка и разметки, классифицировать тип нарушения.',
    resources: 'Обезличенные изображения денситометрии и экспертная разметка.',
    output: 'ПО контроля качества исследований и анатомической разметки.',
    roles: 'Medical CV, ML, backend, frontend, врач-рентгенолог.',
    risk: 'Клиническая корректность, редкий формат данных и необходимость врача в команде.',
    url: 'https://i.moscow/cabinet/hackaton/lct/contest/83e933f3989940f5ae82346341d8f7bd',
  },
  {
    id: 'b7', track: 'Бизнес', number: 7, score: 64,
    title: 'Цифровой признак автомобиля без госномера', sponsor: 'Фалькон Тех', category: 'Vehicle re-ID',
    fit: 'Исследовательски интересно, но входные данные не описаны.',
    task: 'Сопоставлять автомобиль между камерами по кузову, цвету, геометрии, повреждениям и другим деталям.',
    resources: 'В карточке задачи раздел ресурсов пуст.',
    output: 'Сервис candidate matching на основе устойчивого визуального embedding.',
    roles: 'Project, backend, ML/CV, data.',
    risk: 'Нет заявленного датасета; cross-camera re-ID сложен и чувствителен к ложным совпадениям.',
    url: 'https://i.moscow/cabinet/hackaton/lct/contest/4e03d57b5c1d4ef987d8966258c03bd8',
  },
  {
    id: 'm5', track: 'Москва', number: 5, score: 62,
    title: 'Препятствия в метро по 3D-лидару', sponsor: 'Московский транспорт', category: '3D CV / ROS2',
    fit: 'Сильная инженерная задача только для готовой robotics-команды.',
    task: 'В реальном времени находить препятствия в габарите поезда на максимальной дальности и с минимумом false positive.',
    resources: 'Лидарные облака точек, записанные при движении поезда в тоннеле.',
    output: 'ROS2-ноды, фильтрация, сегментация, детектор и интеграционные сообщения.',
    roles: 'System analysis, 3D CV, ROS2, data, C++/Python.',
    risk: 'Редкий стек, real-time требования и сложная оценка качества без полигона.',
    url: 'https://i.moscow/cabinet/hackaton/lct/contest/1233bb5506bc455f86d534b3b40171f1',
  },
  {
    id: 'b2', track: 'Бизнес', number: 2, score: 58,
    title: 'Реверс-инжиниринг прошивки платы', sponsor: 'Positive Technologies', category: 'Hardware security',
    fit: 'Последнее место только для общей команды; для embedded/security экспертов — топ-3.',
    task: 'Получить доступ к прошивке физической платы минимум одной техникой реверс-инжиниринга.',
    resources: 'Плата каждой команде, дидактические материалы и инфраструктура центра «Созидатели».',
    output: 'Задокументированная методика доступа к прошивке.',
    roles: 'Reverse engineering, infosec, embedded, electronics, binary analysis.',
    risk: 'Нужна готовая low-level команда и обязательное очное участие в Москве.',
    special: 'Очный финал 16–20 октября · плату возвращать не нужно',
    url: 'https://i.moscow/cabinet/hackaton/lct/contest/08d142e7e9c74cdcbb217ab9cc54371f',
  },
];

const filters = ['Все', 'Москва', 'Бизнес', 'Топ-5'] as const;
const stats = [
  { value: '2 млн ₽', label: 'на задачу', Icon: CircleDollarSign },
  { value: '40 млн ₽', label: 'расчётно всего', Icon: Trophy },
  { value: '20', label: 'задач', Icon: Users },
  { value: '15 дней', label: 'на разработку', Icon: CalendarDays },
];

function Score({ value }: { value: number }) {
  const tone = value >= 85 ? 'bg-lime-300' : value >= 75 ? 'bg-cyan-300' : value >= 65 ? 'bg-amber-300' : 'bg-rose-300';
  return (
    <div className="flex items-center gap-2" aria-label={`Оценка ${value} из 100`}>
      <span className="font-mono text-lg font-bold tabular-nums text-white">{value}</span>
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-white/10">
        <span className={`block h-full ${tone}`} style={{ width: `${value}%` }} />
      </span>
    </div>
  );
}

export default function Home() {
  const [filter, setFilter] = useState<(typeof filters)[number]>('Все');
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return tasks.filter((item, index) => {
      const byTrack = filter === 'Все' || filter === item.track || (filter === 'Топ-5' && index < 5);
      const haystack = `${item.title} ${item.sponsor} ${item.category} ${item.fit} ${item.roles}`.toLowerCase();
      return byTrack && (!normalized || haystack.includes(normalized));
    });
  }, [filter, query]);

  return (
    <main className="min-h-screen bg-[#07110f] text-[#eaf4ef] selection:bg-lime-300 selection:text-[#07110f]">
      <div className="mx-auto max-w-[1500px] px-3 pb-12 sm:px-5 lg:px-7">
        <header className="sticky top-0 z-40 -mx-3 border-b border-white/10 bg-[#07110f]/92 px-3 py-2 backdrop-blur-xl sm:-mx-5 sm:px-5 lg:-mx-7 lg:px-7">
          <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-lime-300 text-[#07110f]"><Trophy className="size-5" /></div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold tracking-tight">ЛЦТ 2026 · выбор задачи</p>
                <p className="text-[11px] text-emerald-100/50">20 задач · рейтинг для full-stack + ML команды</p>
              </div>
            </div>
            <a href="#rating" className="hidden text-xs font-medium text-lime-300 hover:text-lime-200 sm:inline">К рейтингу ↓</a>
          </div>
        </header>

        <section className="grid gap-3 pt-4 lg:grid-cols-[1.45fr_.55fr]">
          <div className="rounded-2xl border border-lime-300/30 bg-[linear-gradient(135deg,rgba(190,242,100,.13),rgba(34,211,238,.04)_55%,transparent)] p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-lime-300"><Sparkles className="size-3.5" /> Основная рекомендация</div>
            <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-end">
              <div>
                <p className="mb-1 font-mono text-xs text-emerald-100/55">БИЗНЕС · №08 · YANDEX CLOUD</p>
                <h1 className="max-w-4xl text-balance text-2xl font-semibold leading-[1.08] tracking-[-0.035em] sm:text-4xl">SourceCraft Repo Health — лучший баланс шанса, данных и сильного демо</h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-emerald-50/66">Объяснимый score, рекомендации, AppSec/CI/git-сигналы и публичный рейтинг. Реально показать работающий end-to-end продукт за 15 дней.</p>
              </div>
              <div className="flex items-center gap-3 md:flex-col md:items-end">
                <span className="font-mono text-4xl font-bold text-lime-300">91</span>
                <a href={tasks[0].url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-lime-300 px-3 text-xs font-semibold text-[#07110f] hover:bg-lime-200">Открыть задачу <ArrowUpRight className="size-3.5" /></a>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
            {stats.map(({ value, label, Icon }) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/[.035] p-3">
                <Icon className="mb-2 size-4 text-cyan-300" />
                <p className="font-mono text-lg font-bold text-white">{value}</p>
                <p className="text-[11px] text-emerald-100/45">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-3 grid gap-3 xl:grid-cols-[1fr_1.45fr]">
          <div className="rounded-xl border border-white/10 bg-white/[.025] p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.14em] text-emerald-100/45">Призы в каждой задаче</p>
            <div className="grid grid-cols-3 gap-2">
              {[['1', '1 000 000 ₽'], ['2', '600 000 ₽'], ['3', '400 000 ₽']].map(([place, prize]) => (
                <div key={place} className="rounded-lg bg-black/20 px-3 py-2"><span className="font-mono text-[10px] text-lime-300">{place} МЕСТО</span><p className="mt-0.5 whitespace-nowrap text-sm font-semibold">{prize}</p></div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[.025] p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.14em] text-emerald-100/45">Календарь</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
              <p><span className="block text-emerald-100/45">Заявки</span>до 14.09</p>
              <p><span className="block text-emerald-100/45">Разработка</span>15–29.09</p>
              <p><span className="block text-emerald-100/45">Финалисты / питч</span>15.10 / 23.10</p>
              <p><span className="block text-emerald-100/45">Результаты</span>30.10 · офлайн</p>
            </div>
          </div>
        </section>

        <section id="rating" className="scroll-mt-16 pt-6">
          <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-lime-300">Рейтинг</p>
              <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Все задачи — от безопасного MVP к узкой специализации</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-emerald-100/50">Оценка для команды 4–6 человек без готовой аппаратной лаборатории или медицинского эксперта.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative sm:w-72">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-emerald-100/35" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск: CV, GIS, backend…" aria-label="Поиск по задачам" className="h-8 border-white/10 bg-white/[.035] pl-8 text-xs text-white placeholder:text-emerald-100/30" />
              </div>
              <div className="flex gap-1" aria-label="Фильтр рейтинга">
                {filters.map((item) => (
                  <Button key={item} size="sm" variant={filter === item ? 'default' : 'outline'} onClick={() => setFilter(item)} className={filter === item ? 'bg-lime-300 text-[#07110f] hover:bg-lime-200' : 'border-white/10 bg-transparent text-emerald-100/60 hover:bg-white/10 hover:text-white'}>{item}</Button>
                ))}
              </div>
            </div>
          </div>

          <div className="mb-2 grid grid-cols-[44px_1fr_auto] gap-3 px-3 text-[10px] font-semibold uppercase tracking-[.12em] text-emerald-100/35 sm:grid-cols-[44px_88px_1fr_150px_auto]">
            <span>Rank</span><span className="hidden sm:block">Пул</span><span>Задача</span><span className="hidden sm:block">Профиль</span><span>Score</span>
          </div>

          <div className="space-y-2">
            {visible.map((item) => {
              const rank = tasks.findIndex((task) => task.id === item.id) + 1;
              return (
                <article key={item.id} className="rounded-xl border border-white/10 bg-white/[.026] transition-colors hover:border-lime-300/25 hover:bg-white/[.04]">
                  <div className="grid grid-cols-[44px_1fr_auto] items-center gap-3 p-3 sm:grid-cols-[44px_88px_1fr_150px_auto]">
                    <span className={`font-mono text-lg font-bold ${rank <= 3 ? 'text-lime-300' : 'text-emerald-100/45'}`}>{String(rank).padStart(2, '0')}</span>
                    <span className={`hidden w-fit rounded-md px-2 py-1 font-mono text-[10px] font-bold sm:inline-flex ${item.track === 'Москва' ? 'bg-cyan-300/10 text-cyan-200' : 'bg-violet-300/10 text-violet-200'}`}>{item.track.toUpperCase()} {String(item.number).padStart(2, '0')}</span>
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5 sm:hidden"><span className="font-mono text-[10px] text-cyan-200">{item.track} {item.number}</span><span className="text-emerald-100/30">·</span><span className="text-[10px] text-emerald-100/45">{item.category}</span></div>
                      <h3 className="text-sm font-semibold leading-tight text-white sm:text-[15px]">{item.title}</h3>
                      <p className="mt-1 line-clamp-1 text-[11px] text-emerald-100/45">{item.sponsor} · {item.fit}</p>
                    </div>
                    <span className="hidden truncate text-xs text-emerald-100/45 sm:block">{item.category}</span>
                    <Score value={item.score} />
                  </div>

                  <details className="group border-t border-white/0 open:border-white/10">
                    <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[11px] font-medium text-emerald-100/45 hover:text-lime-300 [&::-webkit-details-marker]:hidden"><span>Условия, ресурсы и риск</span><ChevronDown className="size-3.5 transition-transform group-open:rotate-180" /></summary>
                    <div className="grid gap-3 border-t border-white/10 px-3 py-3 text-xs leading-5 md:grid-cols-2 xl:grid-cols-4">
                      <div><p className="label">Что делать</p><p className="text-emerald-50/70">{item.task}</p></div>
                      <div><p className="label">Ресурсы</p><p className="text-emerald-50/70">{item.resources}</p></div>
                      <div><p className="label">Результат / команда</p><p className="text-emerald-50/70">{item.output}</p><p className="mt-1 text-emerald-100/40">{item.roles}</p></div>
                      <div>
                        <p className="label flex items-center gap-1"><ShieldAlert className="size-3" /> Главный риск</p>
                        <p className="text-emerald-50/70">{item.risk}</p>
                        {item.special && <p className="mt-2 rounded-md bg-amber-300/10 px-2 py-1 text-[11px] text-amber-200">{item.special}</p>}
                        <a href={item.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 font-semibold text-lime-300 hover:text-lime-200">Открыть полную карточку <ArrowUpRight className="size-3" /></a>
                      </div>
                    </div>
                  </details>
                </article>
              );
            })}
          </div>

          {visible.length === 0 && <div className="rounded-xl border border-dashed border-white/15 py-12 text-center text-sm text-emerald-100/45">Ничего не найдено. Попробуйте другой запрос.</div>}
        </section>

        <section className="mt-6 grid gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-lime-300/25 bg-lime-300/[.055] p-4"><p className="label text-lime-300">Если команда универсальная</p><p className="mt-1 font-semibold">Берите Бизнес №8 — SourceCraft</p><p className="mt-2 text-xs leading-5 text-emerald-50/60">Соберите шесть подоценок: документация, активность, CI, безопасность, релизы и устойчивость команды. Добавьте what-if и сравнение с похожими репозиториями.</p></div>
          <div className="rounded-xl border border-white/10 bg-white/[.025] p-4"><p className="label">Если сильны в алгоритмах / ML</p><p className="mt-1 font-semibold">Бизнес №3 или Москва №8</p><p className="mt-2 text-xs leading-5 text-emerald-50/60">Маршруты — безопаснее и визуальнее. Коллекторы — сложнее, зато дают настоящую data science глубину и формальные метрики.</p></div>
          <div className="rounded-xl border border-white/10 bg-white/[.025] p-4"><p className="label">Выбирать только со специалистом</p><p className="mt-1 font-semibold">Reverse, ROS2, медицина, vehicle re-ID</p><p className="mt-2 text-xs leading-5 text-emerald-50/60">Бизнес №2, Москва №5, Москва №4 и Бизнес №7 имеют высокий порог входа или критическую неопределённость данных.</p></div>
        </section>

        <footer className="mt-8 flex flex-col gap-2 border-t border-white/10 pt-4 text-[11px] text-emerald-100/35 sm:flex-row sm:items-center sm:justify-between"><p>Сводка по карточкам Международного хакатона ЛЦТ 2026 · актуально на 31.08.2026</p><p>Все карточки помечены как задачи с низким уровнем популярности.</p></footer>
      </div>
    </main>
  );
}
