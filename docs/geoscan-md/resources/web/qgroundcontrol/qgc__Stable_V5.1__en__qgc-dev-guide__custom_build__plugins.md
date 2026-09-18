---
title: "Custom Build Plugins | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/custom_build/plugins.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "95cd84aae4934dbdc73efa44370c65575cd001b716ebc5009d4acf7a7ae80ac6"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Custom Build Plugins | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/custom_build/plugins.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="custom-build-plugins"></a>

# Custom Build Plugins

The mechanisms for customizing QGC for a custom build is through the existing `FirmwarePlugin`, `AutoPilotPlugin` and `QGCCorePlugin` architectures. By creating subclasses of these plugins in your custom build you can change the behavior of QGC to suit your needs without needed to modify the upstream code.

<a id="qgccoreplugin"></a>

## QGCCorePlugin

This allows you to modify the parts of QGC which are not directly related to vehicle but are related to the QGC application itself. This includes things like application settings, color palettes, branding and so forth.
