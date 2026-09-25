# Проверка упрощённого интерфейса — 20.09.2026

Финальная локальная сборка: Docker `lct-planner-1`, запуск 16:01:56 UTC, состояние `healthy`, адрес `http://127.0.0.1:3016/planner`. Проверки выполнены на новой сборке, а не на старом открытом экране. Коммит и публикация в GitHub не выполнялись.

Что перенесено и как открыть функции: [карта изменений](history/2026-09-24/simple-interface-2026-09-20.md). Дополнительно она встроена в **Настройки → Справка → Что где находится**. Преимущество для презентации зарегистрировано как **ADV-16** в [реестре](PRESENTATION-ADVANTAGES.md).

## Результат

| Проверка | Результат | Свидетельство от корня проекта |
| --- | --- | --- |
| Проверка типов, производственная сборка и основной набор тестов | 364/364, ошибок нет | `output/simple-ui-build.txt` |
| Новые тесты представления, входят в 364 | 26/26: объединение только действительно одинаковых планов, сохранение выбранного ID, нарушений и неизвестных проверок | `tests/mission-presentation.test.ts` |
| Линтер изменённых компонентов и helper | Код завершения 0 | `output/simple-ui-lint.txt` |
| Новый путь оператора в Edge | 42/42, ошибок страницы нет | `output/playwright/simple-ui/browser-report.json` |
| Регрессия подробного анализа | 13/13 | `output/playwright/mission-analysis/browser-report.json` |
| Отрицательные сценарии анализа | 8/8 | `output/playwright/mission-analysis/negative-browser-report.json` |
| Возврат и отдельный черновик оставшихся работ | 7/7 | `output/playwright/mission-analysis/remaining-browser-report.json` |
| Приёмочные проверки | 8/8 | `output/simple-ui-acceptance.txt` |
| Сценарии работающего API и безопасности | 10/10 ожидаемых исходов | `output/simple-ui-safety/summary.json` |
| Повторная проверка комплекта, скачанного с нового «Итога» | `passes-declared-model`, 48 проверок, без нарушений; неизвестные сохранены | `output/playwright/simple-ui/mission.verification.json` |
| Повторная проверка альтернативного плана | `passes-declared-model`, без нарушений | `output/playwright/mission-analysis/counterfactual.simple-ui-verification.json` |
| Повтор стандартных четырёх стресс-сценариев | Отчёт воспроизведён; **не все случаи безопасны** | `output/playwright/mission-analysis/robustness.simple-ui-verification.json` |
| Актуальный benchmark с новым исходным helper в описи | 15 кейсов × 3 повтора; проверка отчёта без ошибок | [Методика и ограничения](benchmark-2026-09-20.md), `output/mission-benchmark/verification.json` |

Итого **70 браузерных утверждений** в четырёх сценариях. Это не число уникальных требований ТЗ, не оценка жюри и не гарантия безопасности реального полёта. В 10 API-сценариях успех означает также правильный отказ: сильный ветер, недостаток энергии и занятая площадка не получают допустимый план.

Стресс-повтор подтвердил два отрицательных случая: усиление ветра и снижение заряда. `allCasesSafeInModel: false` не скрывается за успешной проверкой целостности отчёта. Проверка экспорта использует общую библиотеку геометрии с решателем, а не независимую сертифицированную физическую модель.

## Что проверено в интерфейсе

- «Миссии»: три переключателя списка; сохранение не запускает миссию; пауза остаётся в работе, не в истории.
- Редактор: три основные группы, доступ ко всем старым полям, сохранение и повторное открытие задания, расчёт вариантов. Карта занимает около 55% на широком экране, разворачивается и возвращает панели без потери верхней навигации.
- «Результаты»: по умолчанию короткий итог, полный анализ не загружается в него; общий процент относится к исходной площади. Неподтверждённые ограничения видны. «Все проверки» сразу открывает и раскрывает их список. Прежние форматы доступны во вкладке «Файлы».
- «Выполнение»: модельное время движется; ускорение и отсутствие подключения реальных БВС обозначены. Приборы открываются по выбору аппарата, журнал — отдельным окном. Дополнительные действия доступны через меню.
- Неудачная миссия: анализ не предлагает выдавать ещё один аппарат за средство исправить недопустимый ветер.
- После защитного возврата: создаётся отдельный черновик остатка через просмотр и подтверждение данных, без немедленного запуска и подмены исходной операции.
- Ширины 1440 и 390 пикселей: навигация видна, горизонтального переполнения проверяемых экранов нет. Светлая тема проверена сценарием; тёмная — отдельно визуально.

При визуальной проверке исправлены слишком бледные вкладки «Итог / Анализ / Файлы». Добавлено постоянное измерение контраста в браузерном сценарии: в светлой теме активная вкладка 5,75:1, остальные 15,56:1. Это проверка этих трёх надписей, не полный аудит доступности приложения.

Снимки: [миссии](../../output/playwright/simple-ui/missions.png), [редактор](../../output/playwright/simple-ui/editor.png), [итог](../../output/playwright/simple-ui/summary.png), [выполнение](../../output/playwright/simple-ui/execution.png), [мобильный итог](../../output/playwright/simple-ui/mobile.png), [тёмная тема](../../output/playwright/simple-ui/dark.png). Онлайн-тайлы карты могут догружаться; их доступность зависит от внешнего сервиса. Исходные материалы и проверки не подменяются этими снимками.

## Как повторить

PowerShell 7, из корня проекта, при установленных зависимостях и Playwright CLI в кэше npm:

```powershell
docker compose -p lct -f compose.planner.yaml up --build -d
docker compose -p lct -f compose.planner.yaml ps
node --experimental-transform-types --experimental-test-isolation=none --test tests/acceptance/track5-readiness.test.ts
node --experimental-transform-types scripts/verify-collision-safety.ts http://127.0.0.1:3016 output/simple-ui-safety

npx --offline --package @playwright/cli playwright-cli -s=simple-ui open http://127.0.0.1:3016/planner --browser msedge
npx --offline --package @playwright/cli playwright-cli -s=simple-ui run-code --filename scripts/verify-simple-mission-ui.js
npx --offline --package @playwright/cli playwright-cli -s=simple-ui close

npx --offline --package @playwright/cli playwright-cli -s=simple-ui open http://127.0.0.1:3016/planner --browser msedge
npx --offline --package @playwright/cli playwright-cli -s=simple-ui run-code --filename scripts/verify-mission-analysis-browser.js
npx --offline --package @playwright/cli playwright-cli -s=simple-ui run-code --filename scripts/verify-mission-analysis-negative-browser.js
npx --offline --package @playwright/cli playwright-cli -s=simple-ui run-code --filename scripts/verify-mission-remaining-browser.js
npx --offline --package @playwright/cli playwright-cli -s=simple-ui close

node --experimental-transform-types scripts/verify-mission-evidence.ts output/playwright/simple-ui/mission.evidence.json output/playwright/simple-ui/mission.verification.json
```

Использовать отдельную временную сессию, не пользовательский браузер: сценарии создают тестовые задания и выполнения. Перед повтором первого сценария нужен чистый профиль без прежних сохранений. Проверять JSON-отчёты и все `checks[].pass`: успешный выход CLI сам по себе недостаточен. Файлы в `output` — локальные артефакты, не автоматически опубликованные материалы.

Повтор стресс-пакета требует **нового** имени выходного файла:

```powershell
node --experimental-transform-types scripts/verify-mission-robustness.ts output/playwright/mission-analysis/robustness.json output/playwright/mission-analysis/robustness.recheck-2.json
```

## Границы изменения

Упрощено представление, а не модель безопасности. Реальные полётные логи, физическая калибровка батарей, аппаратная интеграция, допуск воздушного пространства и полная самолётная модель 201 этим изменением не появились. `flightReady` остаётся `false`. Эффект на скорость работы человека или количество его ошибок отдельно не измерялся.
