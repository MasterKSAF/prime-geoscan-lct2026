# Презентация

Редакция r3 от 22.09.2026 с KML экспертов и свежими доказательствами: [PPTX](prime-geoscan-lct2026.pptx), 12 слайдов, 16:9. [PDF](prime-geoscan-lct2026.pdf) и [автономный HTML](index.html) сохраняют вёрстку без зависимости от шрифтов. В HTML: стрелки переключают слайды, текст выступления раскрывается снизу, есть полноэкранный режим.

[Текст выступления](SPEAKER-NOTES.md). Текст и три таблицы внутри PPTX редактируются; скриншоты и фон — изображения. Сохранены фон, логотипы и Montserrat из [шаблона ЛЦТ 2026](../../../references/lct2026-presentation-template.pptx). Удалены пустые объекты шаблона, рамка обложки и линии таблиц. Текст сокращён, блоки выровнены, скриншоты увеличены.

## Проверка и воспроизведение

Итоговый PPTX экспортирован через **Microsoft PowerPoint 16.0**. Все 12 родных PNG просмотрены после экспорта. Проверены границы 86 текстовых объектов и размеры текста в 27 ячейках. На первом прогоне найдено наложение длинной подписи на слайде 8, подпись сокращена перед повторным экспортом. Проверка размеров ячеек не заменяет визуальный просмотр.

Итоговый PDF также открыт, текст проверен на актуальные 509 тестов и KML, все 12 страниц повторно отрендерены и просмотрены. Наложений или потерянных символов не обнаружено.

[Структурная проверка](../evidence/checks/presentation-validation.json), [проверка PowerPoint и визуального просмотра](../evidence/checks/presentation-native-check.json).

Шрифт Montserrat не встроен в PPTX. На другом компьютере без него вёрстка может измениться; для стабильного показа используйте PDF или HTML. После любой правки PPTX повторите экспорт и просмотр всех страниц.

Авторская сборка: [build-expert-deck.mjs](../../../../scripts/presentation/build-expert-deck.mjs). Нужны Node, @oai/artifact-tool, Python и утилиты навыка Presentations; они не требуются для работы стенда. Переменные: RUNTIME_NODE_MODULES, PRESENTATIONS_SKILL_DIR, PRESENTATIONS_PYTHON. Из корня проекта: `node scripts/presentation/build-expert-deck.mjs`. По умолчанию создаётся отдельный corrected.pptx; каталог и имя задаются DECK_OUTPUT_DIR и DECK_FILENAME.

Проверка в установленном Microsoft PowerPoint на Windows, из корня проекта:

```powershell
pwsh -NoProfile -File scripts/presentation/render-native.ps1 -PresentationPath docs/planner/submission/presentation/prime-geoscan-lct2026.pptx -OutputDirectory tmp/deck-native -PdfOutputPath docs/planner/submission/presentation/prime-geoscan-lct2026.pdf
node scripts/presentation/verify-native-layout.mjs tmp/deck-native/native-layout.json
node scripts/presentation/build-native-preview.mjs tmp/deck-native
```

Экспорт открывает только собственный файл в режиме чтения, без окна; чужие открытые презентации не закрывает. PDF и HTML обновляются отдельно от PPTX. После проверки обновите контрольные суммы комплекта.

## Состав

- prime-geoscan-lct2026.pptx — основной редактируемый файл.
- prime-geoscan-lct2026.pdf — экспорт из Microsoft PowerPoint.
- index.html — автономный показ с текстом выступления.
- slides/01.png…12.png — изображения из Microsoft PowerPoint.
- SPEAKER-NOTES.md — речь и доказательные источники.

Источники чисел — сохранённый benchmark, изображений — assets инструкции. Генератор не обещает побайтовую идентичность экспорта в иной версии среды.
