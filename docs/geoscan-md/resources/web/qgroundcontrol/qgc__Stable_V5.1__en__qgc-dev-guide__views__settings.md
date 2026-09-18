---
title: "Settings View | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/views/settings.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "0f7f7fc80635b49019e7b3d20fa151125bb695a4fb8370fe513199b624c517b1"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Settings View | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/views/settings.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="settings-view"></a>

# Settings View

The QGC Application Settings UI is built from a mix of generated and hand-written QML.

- The settings container/sidebar is implemented in [src/QmlControls/AppSettings.qml](https://docs.qgroundcontrol.com/src/QmlControls/AppSettings.qml.html).
- Most settings content pages are generated from JSON definitions in [src/AppSettings/pages](https://docs.qgroundcontrol.com/src/AppSettings/pages.html).
- Some pages are still hand-written and referenced directly (for example Help/Logging/debug pages).

<a id="how-it-is-generated"></a>

## How It Is Generated

The generation pipeline is documented in: [Generated Settings Pages](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/views/settings_generation.html)

That page explains:

- Which JSON files define settings pages and controls
- How `*.SettingsGroup.json` Fact metadata drives labels/types/visibility
- How CMake runs the Python generator
- How to add a new setting to an existing page
- How to add an entirely new settings page
