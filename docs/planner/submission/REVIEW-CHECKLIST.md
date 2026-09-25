# Как повторить проверки

Команды — из корня проекта, PowerShell 7, Node.js 24 после `npm ci`. Полные проверочные данные находятся в `evidence/` распакованного комплекта. Не запускать сценарии в пользовательском профиле с несохранёнными миссиями.

## Сборка и документация

```powershell
npm run typecheck
npm run test:planner
npm run build
node scripts/verify-submission.mjs --docs-only
node --test scripts/checks/review-package.test.mjs scripts/checks/documentation.test.mjs scripts/checks/submission-package.test.mjs
```

Или выполните Docker-сборку по корневому README. Она запускает TypeScript, тесты и production build. Проверьте `/api/planner/health`: версия ядра 0.4.0. Сборка образа без перезапуска контейнера не обновляет уже открытый стенд.

## Свежий браузерный набор 25 сентября

Нужен запущенный стенд на 3016 и отдельный профиль Playwright CLI:

```powershell
npm install --prefix tmp/acceptance-tools --no-save @playwright/cli@0.1.20
$env:PLAYWRIGHT_CLI_ENTRY = Join-Path (Get-Location) 'tmp/acceptance-tools/node_modules/@playwright/cli/playwright-cli.js'
node $env:PLAYWRIGHT_CLI_ENTRY -s=acceptance-20260925-camera open http://127.0.0.1:3016/planner
New-Item -ItemType Directory -Force output/playwright/acceptance-2026-09-25/engine
Copy-Item ../evidence/engine/dense-real-ui.input.json output/playwright/acceptance-2026-09-25/engine/dense-real-ui.input.json
node scripts/checks/run-acceptance-ui-20260925.mjs demo2-20260925-browser demo3-20260925-browser dense-20260925-browser camera-20260925-browser
node --experimental-transform-types scripts/checks/verify-acceptance-downloads-20260925.ts
```

При первом получении CLI нужен интернет и доступный браузер. Команда копирования рассчитана на запуск из `source/` распакованной поставки и берёт проверенный вход плотного района из соседнего `evidence/`. Результаты сохраняются в `output/playwright/acceptance-2026-09-25/`. Повторный запуск перезаписывает одноимённые результаты: предварительно сохраните нужный прошлый прогон.

Проверяйте JSON и вывод, а не только exit code CLI: все `checks[].pass` истинны, нет `### Error`, итоговый статус `pass`. В Демо 3 исходный отказ ожидается; положительный результат относится к явно исправленному входу. [Точное покрытие](VERIFICATION.md).

## Доказательства отдельной миссии

```powershell
node --experimental-transform-types scripts/verify-mission-archive.ts "путь/миссия.evidence.zip"
node --experimental-transform-types scripts/verify-mission-run-report.ts "путь/запуск.report.json"
python scripts/check-obstacle-archive-interop.py "путь/миссия.evidence.zip"
```

Первая команда — основной проверщик ZIP. Вторая нужна для отдельного JSON запуска; третья проверяет совместимость структуры. Положительная модель: код 0, `passes-declared-model`. Исходный Демо 3: код 1, `diagnostic-only-not-flight-approved`. Это не повреждение архива. [Состав файлов](EXPERT-FILES.md).

## Сравнительный корпус

```powershell
node --experimental-transform-types scripts/benchmark-missions.ts output/mission-benchmark/recheck 3
node --experimental-transform-types scripts/benchmark-missions.ts --verify output/mission-benchmark/recheck/report.json
```

Храните весь корпус, включая отказы, версии, бюджет и аппаратную среду. Числа времени и найденные планы могут отличаться при ограниченном по времени поиске. [Ручной лист](MANUAL-REVIEW.md).

## Целостность комплекта

Из корня распакованного ZIP:

```powershell
node source/scripts/build-submission-package.mjs --verify .
```

Это проверка хешей, структуры, обязательных артефактов и ссылок; не подмена повторного выполнения алгоритма.

Датированные инструменты 24 сентября и `verify-submission.mjs` без `--docs-only` относятся к историческим срезам. Не перезаписывайте старый реестр ради зелёного результата. Область lint отдельно описана в [инструкции](../lint-scope.md).
