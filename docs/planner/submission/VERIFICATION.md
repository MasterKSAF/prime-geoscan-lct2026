# Проверка поставки от 22.09.2026

Релиз **prime-geoscan-2026.09.22-r3** включает KML экспертов и ZIP доказательств. Проверяется инженерная модель, не допуск реального БВС и не оценка жюри.

| Проверка | Результат | Доказательство |
|---|---|---|
| TypeScript | Без ошибок | [typecheck.log](evidence/checks/typecheck.log) |
| Модульные и регрессионные | 509 / 509, без пропусков | [unit-tests.log](evidence/checks/unit-tests.log) |
| Приёмочные A1–A8 | 8 / 8 | [acceptance.log](evidence/checks/acceptance.log) |
| Текущий интерфейс | 20 / 20: три демо, выполнение, экспорт, reload, мобильный список | [browser-report.json](evidence/browser/browser-report.json) |
| Базовый HTTP API | 11 / 11 | [report.json](evidence/api/report.json) |
| Расширенный API KML | Повторный прогон 6 / 6. Первый воспроизвёл 503 после отказа по размеру | [результат](evidence/obstacles/http-verification.json), [первый лог](evidence/checks/obstacle-http.log), [повтор](evidence/checks/obstacle-http-repeat.log) |
| Оригинальный KML | 3 201 принято, 15 замыканий, 0 отклонений | [verification.json](evidence/obstacles/verification.json) |
| Уход Демо 2 | 56 / 56 интервалов, certified_model | [contingency.json](evidence/obstacles/contingency.json) |
| Браузерный ZIP | passes-declared-model, полный исходник | [архив](evidence/browser/mission.evidence.zip), [проверка](evidence/browser/archive-verification.json) |
| ZIP сторонним читателем | CRC и SHA-256 прошли Python stdlib без модулей планировщика | [zip-interop.json](evidence/browser/zip-interop.json) |
| Завершённый запуск | verified_model_snapshot | [run-verification.json](evidence/browser/run-verification.json), [JSON](evidence/browser/run.report.json) |
| Повторные вылеты | passes-declared-model | [independent-check.json](evidence/api/independent-check.json) |
| Benchmark | 21 задача × 3 повтора, повторная проверка без fail | [verification.json](evidence/benchmark/verification.json), [report.json](evidence/benchmark/report.json) |
| Docker production build | Типы, 509 тестов и сборка прошли | [docker-build.log](evidence/checks/docker-build.log) |
| Чистая копия Git index | Сборка, 509 тестов и 11 API-проверок на отдельном порту 3019 | [лог](evidence/checks/clean-index-build.log), [API](evidence/checks/clean-api.json) |
| Чистый runtime и исходники | 172 файла совпали по SHA-256, health ok | [clean-runtime.json](evidence/checks/clean-runtime.json) |
| npm audit production | 0 известных уязвимостей на момент запроса | [npm-audit.json](evidence/checks/npm-audit.json) |
| Выбранные файлы Git | Ограниченный поиск секретов и проверка размеров | [source-audit.json](evidence/checks/source-audit.json) |
| Презентация | 12 слайдов, экспорт PowerPoint и проверка геометрии | [PPTX](presentation/prime-geoscan-lct2026.pptx), [протокол](evidence/checks/presentation-native-check.json) |

Браузер проверял текущий Docker на localhost:3016 в отдельном профиле. Node 24.14.1. Библиотека пользователя не использовалась. `unknown` не превращён в `pass`.

## Новые данные

KML: SHA-256 `58b7fc12f8870ac434d2ae3f3a4dd0627878aa41e5afc862c5fd74da22f420a8`. В источнике 3 145 полигонов и 56 линий. Режимы высот и все вершины сохранены. Отдельная проверка маршрутов сверяется с полным источником, а не только с выборкой решателя.

Демо 2: RGB + MS, модельный участок 160 × 120 м около записи вышки UHHH103009. Два полных модельных плана, около 14:31 до завершения, 13:27 суммарного налёта, два вылета, минимальный расчётный остаток 77,5%. Работы, базы, погода и рабочие бюджеты созданы для демонстрации. Наличие препятствия в исходнике не является независимым обследованием местности.

[Проверка слоя](evidence/obstacles/browser-layer-qa.md) включает импорт полного файла, поиск, скрытие/показ, отказ DTD и сохранность старого источника. Новый [сценарий браузера](../../../scripts/verify-release-browser.js) проверяет три демо и скачивает завершённый ZIP. Старые 50 проверок не перенесены как результаты текущего интерфейса.

## Сравнение алгоритмов

Весь корпус сохранён: 21 задача, по 3 повтора, обе цели. Наш поиск нашёл полный план для 11 задач, два baseline для 10. На 10 сопоставимых задачах медианное сокращение:

| Показатель | Последовательный baseline | Простой параллельный |
|---|---:|---:|
| Время завершения | 37,34% | 0,95% |
| Суммарный налёт | 3,28% | 0,58% |

На критерий с повторами: 33 feasible_model, 15 partial, 9 not_found, 6 unsupported. Повторы не являются независимыми задачами. Глобальная оптимальность не доказана. CPU и время записаны в report.json, зависят от нагрузки и не являются SLA. Этот корпус не включает большой KML, для него приложен отдельный интеграционный прогон.

## Ограничения проверки

- Известный сбой Wrangler: после отклонения большого запроса тело ошибки иногда обрывается, следующий запрос может получить 503. Повтор прошёл, причина не исправлена. Стенд остаётся локальным.
- Старый браузерный тест остановился на перенесённом поле названия. Новый сценарий соответствует текущей навигации. Старые числа не смешаны с новыми.
- Общий lint всей рабочей папки не объявлен зелёным: есть прежние замечания и конфигурация другого трека. Типы, тесты и production build проверены отдельно.
- Нет аппаратной телеметрии, DEM, точности препятствий, калибровки батарей и допуска автопилота. Перелёт над KML-препятствиями не заявлен.
- PDF SourceCraft сохранён как полезный материал. Внешняя проверка его сервисом не проводилась, сертификат безопасности не заявлен.

## Воспроизведение

[Чек-лист](REVIEW-CHECKLIST.md) содержит команды. [Реестр](evidence/artifact-manifest.json) связывает выбранные исходники, документы и доказательства SHA-256, не хешируя себя. `node scripts/verify-submission.mjs` проверяет целостность и локальные ссылки, не достоверность физических измерений.

Презентация использует текущие скриншоты. PDF и HTML получены из той же редакции PPTX. Montserrat не встроен, для фиксированного вида использовать PDF/HTML. Доступ экспертам и фактическая подача организаторам остаются отдельными действиями владельца.
