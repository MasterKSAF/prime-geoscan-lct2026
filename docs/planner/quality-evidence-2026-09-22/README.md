# Доказательства проверки исправлений 1–3

Дата: 22.09.2026. Стенд: `http://127.0.0.1:3016`. Это результаты текущей рабочей версии, не новый комплект официальной сдачи и не проверка реального полёта.

| Файл | Содержание |
|---|---|
| [build-and-518-tests.log](build-and-518-tests.log) | Production-сборка, TypeScript, 518 тестов |
| [acceptance-8.log](acceptance-8.log) | Восемь приёмочных сценариев |
| [browser-summary.json](browser-summary.json) | Свежий итог четырёх браузерных наборов: 71 проверка |
| `browser-dispatcher.json`, `browser-eight-points.json`, `browser-parallel.json`, `browser-release.json` | Подробные утверждения по каждому браузерному набору |
| `http-recovery-1.json`, `http-recovery-2.json`, `http-recovery-3.json` | Три независимых прогона по 21 проверке восстановления, без retry |
| [http-obstacles.json](http-obstacles.json) | Шесть HTTP-проверок с полным слоем препятствий |
| [http-api.json](http-api.json) | 11 проверок основного API |
| [runtime.json](runtime.json) | Идентификатор образа, health и SHA-256 237 файлов запущенной версии |
| `lint.log`, `typecheck.log` | Успешные проверки исходников |
| [run-verification.json](run-verification.json) | Повторная проверка скачанного отчёта завершённой миссии |
| [archive-verification.json](archive-verification.json) | Повторная модельная проверка ZIP, включая сохранённые unknown |
| [archive-interop.json](archive-interop.json) | Независимая проверка 22 файлов ZIP и хешей стандартной библиотекой Python |
| `linked-settings.png`, `execution.png`, `mobile.png` | Просмотренные контрольные скриншоты интерфейса |

Скачанные исходные артефакты для повторной проверки: `output/playwright/release-obstacles/run.report.json` и `output/playwright/release-obstacles/mission.evidence.zip`. Они не дублируются в этой компактной папке; их снова создаёт браузерный набор `scripts/verify-release-browser.js`. Команды полного браузерного прогона и объяснение изменений — в [отчёте исправлений](../quality-closure-2026-09-22.md).

Это обычные локальные журналы и контрольные суммы, а не заверенный внешний аудит. Промежуточные неуспешные результаты сохранены отдельно и описаны в отчёте; они не выдаются за финальные успешные.
