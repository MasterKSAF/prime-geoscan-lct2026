# Сборка презентации Planner 0.4.0

Генератор [build-prime-pitch-20260925.mjs](../../../../scripts/presentation/build-prime-pitch-20260925.mjs) точечно редактирует одобренный 11-слайдовый pitch. Он не создаёт дизайн заново и не изменяет приложение.

## Замкнутые входы

Все непосредственные входы генератора находятся в [authoring/](authoring/README.md): одобренный PPTX, четыре исходных PNG, доказательства Демо 1, журнал 706 тестов и `evidence.json`. Полные архивы полётов не нужны для пересборки слайдов: их SHA-256 и происхождение записаны в паспорте. Библиотеки и Microsoft PowerPoint в исходный комплект не включаются.

Одобренный источник: `authoring/approved-source.pptx`, SHA-256 `69682c9f7f0e400d2f6b3d2d6252f11447ccb6154ff7a6fd81aad3cd0717f75a`. Это исторический вход генератора, не текущий файл для сдачи. Основа первых пяти страниц — обязательные слайды 7–11 [шаблона организаторов](../../../references/lct2026-presentation-template.pptx).

Тексты, контакты, логотипы и нативная таблица на слайде 11 сохранены редактируемыми; фактический UI представлен растровыми кадрами. Новые кадры обрезаются нативно и вписываются с сохранением пропорций. Области со сравнением критериев и результатами не дорисованы.

## Сборка

Из корня репозитория нужны Node.js, Python и авторское окружение с `@oai/artifact-tool`. Переменные:

| Переменная | Назначение |
|---|---|
| `RUNTIME_NODE_MODULES` | Каталог библиотек, содержащий `@oai/artifact-tool` |
| `RUNTIME_PYTHON` | Python для валидаторов |
| `PRESENTATIONS_SKILL_DIR` | Навык Presentations с `container_tools` |
| `DECK_DRAFT_ONLY` | `1` — черновик; удалить для финализации |
| `DECK_FILENAME` | Необязательное новое имя итогового PPTX |

```powershell
node scripts/presentation/build-prime-pitch-20260925.mjs
```

Финализация запрещена без свежих Демо 2/3 в паспорте. Проверяются версия Демо 1, завершённая запись без ошибок, модельный результат архива и 706/706 тестов. Затем проверяются целостность PPTX, 11 слайдов, размер 12192000 × 6858000 EMU, все 11 исходных страниц, Montserrat и нативная таблица на слайде 11. Существующий итог не перезаписывается: для новой итерации выбрать другое `DECK_FILENAME`.

Рабочие файлы: `output/presentation/prime-pitch-20260925/private/`. Итог: `output/presentation/prime-pitch-20260925/deliverables/prime-planner-0.4.0-pitch-20260925.pptx`.

## Экспорт и проверка

PowerShell 7 и установленный Microsoft PowerPoint:

```powershell
pwsh -NoLogo -NoProfile -File scripts/presentation/render-native.ps1 -PresentationPath output/presentation/prime-pitch-20260925/deliverables/prime-planner-0.4.0-pitch-20260925.pptx -OutputDirectory output/presentation/prime-pitch-20260925/private/final-slides -PdfOutputPath output/presentation/prime-pitch-20260925/deliverables/prime-planner-0.4.0-pitch-20260925.pdf
node scripts/presentation/check-native-bounds.mjs output/presentation/prime-pitch-20260925/private/final-slides/native-layout.json
node scripts/presentation/verify-native-layout.mjs output/presentation/prime-pitch-20260925/private/final-slides/native-layout.json
```

Скрипт открывает PPTX только для чтения; пользовательские презентации не закрывает. PDF растрируется Poppler отдельно. Все 11 нативных PNG и 11 страниц PDF проверяются визуально, включая подписи снизу слайда 7. Автоматическая геометрия не заменяет визуальный просмотр UI. Итоги и хеши — [QA.md](QA.md).

Публикация проверенной пары и превью выполняется [publish-prime-pitch-20260925.mjs](../../../../scripts/presentation/publish-prime-pitch-20260925.mjs). Исторические презентации этот скрипт не удаляет. Сборка презентации не запускает тесты приложения и не пересобирает общий ZIP решения.
