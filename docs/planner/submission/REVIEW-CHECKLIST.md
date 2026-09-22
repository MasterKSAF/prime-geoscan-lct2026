# Чек-лист эксперта

Проверять в отдельном профиле браузера, без подключения реальных БВС. Изменения демо не должны затрагивать рабочую библиотеку пользователя.

## 1. Чистый запуск

```powershell
git clone https://github.com/MasterKSAF/prime-geoscan-lct2026.git
cd prime-geoscan-lct2026
docker compose -f compose.planner.yaml up -d --build
docker compose -f compose.planner.yaml ps
Invoke-RestMethod http://127.0.0.1:3016/api/planner/health
```

Для закрытого репозитория требуется предоставленный владельцем доступ. Альтернатива — распаковать переданный архив коммита. Если 3016 занят, согласовать остановку прежнего стенда. Успех: контейнер healthy, health `status=ok`, `flightReady=false`.

## 2. Типы и тесты

Для этих команд нужен Node 24 и npm. Docker-сборка уже выполняет типы и модульные тесты, но их можно повторить отдельно.

```powershell
npm ci
npm run typecheck
npm run test:planner
node --experimental-transform-types --test tests/acceptance/track5-readiness.test.ts
node scripts/verify-submission.mjs
```

Ожидаемый сохранённый срез: 509/509 модульных, 8/8 приёмочных. A8 обращается к API. Проверка комплекта сверяет хеши, состав и локальные ссылки; произвольная правка файла должна обнаруживаться.

## 3. HTTP и экспорт

```powershell
node --experimental-transform-types scripts/verify-missions.ts http://127.0.0.1:3016 output/expert-review/api
node --experimental-transform-types scripts/verify-mission-run-report.ts docs/planner/submission/evidence/browser/run.report.json
npm run verify:evidence -- output/expert-review/api/evidence-repeat-sorties.json output/expert-review/api/check.json
```

Ожидаются 11 проверок API и отсутствие fail в проверяемом положительном пакете. Статус 100 км² может оставаться not_found. Все unknown сохраняются.

## 4. Браузер

Нужен установленный Edge, CLI Playwright — отдельный инструмент проверки. Каждый сценарий запускается в новом именованном профиле.

```powershell
npx --yes --package @playwright/cli@0.1.20 playwright-cli -s=expert-main open http://127.0.0.1:3016/planner --browser=msedge
npx --yes --package @playwright/cli@0.1.20 playwright-cli -s=expert-main run-code --filename=scripts/verify-release-browser.js
```

Результат: output/playwright/release-obstacles/browser-report.json (20). CLI может вернуть управление на модальном событии до окончания сценария: проверять свежий JSON со status=pass, а не только exit code CLI. Закрыть только собственную сессию командой close. Старые verify-dispatcher/eight-points-browser описывают прежнюю структуру редактора и не входят в текущую браузерную приёмку.

Для KML и архива:

```powershell
node --experimental-transform-types scripts/verify-obstacle-integration.ts
node --experimental-transform-types scripts/verify-obstacle-http.ts
node --experimental-transform-types scripts/verify-mission-archive.ts docs/planner/submission/evidence/browser/mission.evidence.zip
python scripts/check-obstacle-archive-interop.py docs/planner/submission/evidence/browser/mission.evidence.zip
```

Последняя команда использует только стандартную библиотеку Python. Положительный статус ZIP-проверки: `passes-declared-model`. HTTP-тест может воспроизвести известный 503 после отказа по размеру, см. VERIFICATION.md. Не удалять неуспешный лог.

## 5. Сравнение алгоритмов

```powershell
node --experimental-transform-types scripts/benchmark-missions.ts output/mission-benchmark/expert-review 3
node --experimental-transform-types scripts/benchmark-missions.ts --verify output/mission-benchmark/expert-review/report.json
```

В наборе 21 задача, 3 повтора, два критерия. Сравнения только на полных парах, отрицательные случаи сохраняются. Папка вывода должна находиться под output/mission-benchmark. Тайминги могут отличаться по CPU и фоновой нагрузке. Не выдавать baseline за продукт конкурента или точный оптимум.

## 6. Ручная демонстрация и фиксация

Пройти [три сценария](DEMO-SCRIPT.md). Отметить сохранение миссии, смену сенсора, ошибочный импорт, независимость журналов, блокировку конфликтующего запуска и выгрузку отчёта. Сверить карту и выбранный ID запуска.

Сохранить входы, результаты, хеш коммита, Node/Docker, дату и все неизвестные/отказные проверки. Презентация не подменяет работающий стенд. Доступ эксперта и официальная подача требуют отдельного подтверждения владельца.
